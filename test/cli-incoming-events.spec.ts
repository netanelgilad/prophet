import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { removeSync } from "fs-extra";
import { runFile } from "../src/cli/runtime";
import { effectPaths } from "../src/effects";
import { isExecutionBoundary, isForkedCompletion } from "../src/execution-context/Completion";
import { BranchResult } from "../src/execution-context/branches";
import { getProperties } from "../src/execution-context/Heap";
import { ESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { strictEquality, resolveBoolean } from "../src/symbolic";
import { isThrownValue, isESString, Undefined } from "../src/types";

let directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "prophet-incoming-")); });
afterEach(() => { removeSync(directory); });
function run(source: string, maxEvents = 1) {
  writeFileSync(join(directory, "entry.cjs"), source);
  return runFile({ script: "entry.cjs", args: [], maxSteps: 100000, maxEvents, runtime: "node@24.21.0" }, directory);
}
function leaves(result: BranchResult): BranchResult[] {
  const value = result[0];
  return isForkedCompletion(value) ? leaves(value.consequent).concat(leaves(value.alternate)) : [result];
}
function calls(result: ReturnType<typeof run>) {
  return effectPaths(result.current.value.effects).map(path => path.events.filter(event => event.kind === "call"));
}

test("one automatic incoming event retains crash, normal response, waiting, and failed bind paths", () => {
  const result = run(`const server = require('http').createServer(function(req, res) {
    if (req.url === '/crash') throw 'crashed';
    res.end('ok');
  }); server.listen(8080); module.exports = server;`);
  expect(result.status).toBe("evaluated");
  const paths = calls(result);
  expect(paths.some(path => path.some(event => event.call.operation === 'http.response.end'))).toBe(true);
  expect(paths.some(path => path.some(event => event.call.operation === 'http.server.listening') &&
    !path.some(event => event.call.operation === 'http.server.request'))).toBe(true);
  const outcomes = leaves([result.completion!, result.current]);
  expect(outcomes.some(([value]) => isThrownValue(value) && isESString(value.value) && value.value.value === 'crashed')).toBe(true);
  for (const [value, context] of outcomes) {
    if (isThrownValue(value) && !isESString(value.value)) {
      expect(effectPaths(context.value.effects, context.value.knowledge).every(path => !path.events.some(event => event.call.operation === 'http.server.request'))).toBe(true);
    }
  }
  expect(paths.every(path => path.filter(event => event.call.operation === 'http.server.request').length <= 1)).toBe(true);
});

test("zero event budget preserves startup without handler execution", () => {
  const result = run(`require('http').createServer(function() { throw 'unexpected'; }).listen(8080);`, 0);
  expect(result.status).toBe('evaluated');
  expect(calls(result).every(path => !path.some(event => event.call.operation === 'http.server.request'))).toBe(true);
});

test("delivery uses current lexical state, current listeners, server receiver and request identity", () => {
  const result = run(`let message = 'old'; const server = require('http').createServer();
    function removed() { throw 'removed'; }
    server.on('request', removed); server.off('request', removed);
    server.on('request', function(req, res) {
      if (this !== server) throw 'receiver';
      console.log(message); res.end('ok');
    });
    server.listen(8080, function() { message = 'current'; });
    module.exports = server;`);
  expect(result.status).toBe('evaluated');
  const requestPaths = calls(result).filter(path => path.some(event => event.call.operation === 'http.server.request'));
  expect(requestPaths.length).toBeGreaterThan(0);
  for (const path of requestPaths) {
    const request = path.find(event => event.call.operation === 'http.server.request')!;
    const end = path.find(event => event.call.operation === 'http.response.end')!;
    expect(end.call.receiver).toBe(request.call.args[2]);
    expect(path.filter(event => event.call.operation === 'console.log').map(event => event.call.args[0])).toMatchObject([{ type: 'string', value: 'current' }]);
  }
});

test("all eligible servers are choices, including conditionally created servers; unbound servers never receive", () => {
  const result = run(`const http = require('http');
    const unused = http.createServer(function() { throw 'unbound'; });
    if (Math.random() < 0.5) http.createServer(function(req, res) { console.log('first'); res.end('1'); }).listen(8080);
    http.createServer(function(req, res) { console.log('second'); res.end('2'); }).listen(8081);`);
  expect(result.status).toBe('evaluated');
  const paths = calls(result);
  const messages = paths.map(path => path.filter(event => event.call.operation === 'console.log')
    .map(event => (event.call.args[0] as { value: string }).value));
  expect(messages.some(value => value.join() === 'first')).toBe(true);
  expect(messages.some(value => value.join() === 'second')).toBe(true);
  expect(messages.every(value => value.length <= 1)).toBe(true);
  expect(leaves([result.completion!, result.current]).some(([value]) =>
    isThrownValue(value) && isESString(value.value))).toBe(false);
});

test("handled bind failure remains ineligible and a throwing entry cannot deliver requests", () => {
  const result = run(`const server = require('http').createServer(function() { throw 'request'; });
    server.on('error', function() { console.log('failed'); }); server.listen(8080);`);
  expect(result.status).toBe('evaluated');
  for (const path of calls(result)) {
    if (path.some(event => event.call.operation === 'http.server.error')) {
      expect(path.some(event => event.call.operation === 'http.server.request')).toBe(false);
    }
  }
  const thrown = run(`require('http').createServer(function() { throw 'request'; }).listen(8080); throw 'entry';`);
  expect(calls(thrown).every(path => !path.some(event => event.call.operation === 'http.server.request'))).toBe(true);
});

test("first-event exploration cannot fabricate a prior arming request", () => {
  const result = run(`let armed = false; require('http').createServer(function(req, res) {
    if (req.url === '/fire' && armed) throw 'armed failure';
    if (req.url === '/arm') armed = true;
    res.end('ok');
  }).listen(8080);`);
  expect(result.status).toBe('evaluated');
  expect(leaves([result.completion!, result.current]).some(([value]) => isThrownValue(value) && isESString(value.value))).toBe(false);
});

test.each([-1, 3, 1.5, Infinity, NaN])('unsupported event bounds reject explicitly: %s', maxEvents => {
  expect(() => run('module.exports = true;', maxEvents)).toThrow(/event/i);
});


test("two incoming events can arm then fire while shorter and reverse-order histories remain distinct", () => {
  const source = `let armed = false; require('http').createServer(function(req, res) {
    if (req.url === '/fire' && armed) throw 'armed failure';
    if (req.url === '/arm') armed = true;
    res.end('ok');
  }).listen(8080);`;
  const one = run(source, 1), two = run(source, 2);
  expect(one.status).toBe('evaluated');
  expect(two.status).toBe('evaluated');
  expect(leaves([one.completion!, one.current]).some(([value]) => isThrownValue(value) && isESString(value.value))).toBe(false);
  const outcomes = leaves([two.completion!, two.current]);
  const fired = outcomes.filter(([value]) => isThrownValue(value) && isESString(value.value) && value.value.value === 'armed failure');
  expect(fired.length).toBeGreaterThan(0);
  for (const [, context] of fired) for (const path of effectPaths(context.value.effects, context.value.knowledge)) {
    const requests = path.events.filter(event => event.kind === 'call' && event.call.operation === 'http.server.request');
    expect(requests).toHaveLength(2);
    for (const [index, url] of ['/arm', '/fire'].entries()) {
      const request = requests[index].call.args[1] as ReturnType<typeof ESObject>;
      expect(resolveBoolean(strictEquality(getProperties(request, context).url, ESString(url), path.knowledge), path.knowledge)).toBe(true);
    }
  }
  const paths = calls(two);
  const counts = paths.map(path => path.filter(event => event.call.operation === 'http.server.request').length);
  expect(counts).toEqual(expect.arrayContaining([0, 1, 2]));
  expect(counts.every(count => count <= 2)).toBe(true);
  // Each arrival owns new inputs and responses; no prior arrival is replayed.
  for (const path of paths) {
    const requests = path.filter(event => event.call.operation === 'http.server.request');
    if (requests.length === 2) {
      expect(requests[0].call.args[1]).not.toBe(requests[1].call.args[1]);
      expect(requests[0].call.args[2]).not.toBe(requests[1].call.args[2]);
    }
  }
});

test("second arrivals use listener mutations made by the preceding callback", () => {
  const result = run(`const server = require('http').createServer(function first(req, res) {
    console.log('first'); server.off('request', first);
    server.on('request', function(req, res) { console.log('second'); res.end(); }); res.end();
  }); server.listen(8080);`, 2);
  expect(result.status).toBe('evaluated');
  const logs = calls(result).map(path => path.filter(event => event.call.operation === 'console.log')
    .map(event => (event.call.args[0] as {value: string}).value));
  expect(logs).toEqual(expect.arrayContaining([[], ['first'], ['first', 'second']]));
  expect(logs.some(path => path.join(',') === 'first,first')).toBe(false);
});

test("a server created in the first arrival receives only after its queued listening notification", () => {
  const result = run(`const http = require('http'); let created = false;
    http.createServer(function(req, res) {
      console.log('first request');
      if (!created) { created = true;
        const second = http.createServer(function(req, res) { console.log('second request'); res.end(); });
        second.on('error', function() { console.log('second failed'); });
        second.listen(8081, '127.0.0.1', function() { console.log('second ready'); });
      } res.end();
    }).listen(8080);`, 2);
  expect(result.status).toBe('evaluated');
  const logs = calls(result).map(path => path.filter(event => event.call.operation === 'console.log')
    .map(event => (event.call.args[0] as {value: string}).value));
  expect(logs).toEqual(expect.arrayContaining([
    ['first request', 'second ready', 'second request'],
    ['first request', 'second ready'],
    ['first request', 'second failed']
  ]));
  for (const path of logs) {
    if (path.includes('second request')) expect(path.indexOf('second ready')).toBeLessThan(path.indexOf('second request'));
    if (path.includes('second failed')) expect(path.includes('second request')).toBe(false);
  }
});

test("an unsupported request retains its active source and siblings without a subsequent arrival", () => {
  const result = run(`require('http').createServer(function(req, res) {
    if (req.url === '/stop') require('https').request('x'); res.end();
  }).listen(8080);`, 2);
  expect(result.status).toBe('analysis-stop');
  const outcomes = leaves([result.completion!, result.current]);
  const stopped = outcomes.filter(([value]) => isExecutionBoundary(value));
  expect(stopped.length).toBeGreaterThan(0);
  for (const [, context] of stopped) {
    const registry = context.value.global.hostSlots!.externalEvents as ReturnType<typeof ESObject>;
    expect(getProperties(registry, context).active).not.toBe(Undefined);
    for (const path of effectPaths(context.value.effects, context.value.knowledge)) {
      const events = path.events.filter(event => event.kind === 'call');
      const requests = events.filter(event => event.call.operation === 'http.server.request');
      expect(requests.length).toBeGreaterThan(0);
      expect(requests.length).toBeLessThanOrEqual(2);
      const lastRequest = events.lastIndexOf(requests[requests.length - 1]);
      expect(events.slice(lastRequest + 1).some(event => event.call.operation === 'http.response.end')).toBe(false);
    }
  }
  const completed = outcomes.filter(([value]) => !isExecutionBoundary(value));
  expect(completed.some(([, context]) => effectPaths(context.value.effects, context.value.knowledge).some(path =>
    path.events.filter(event => event.kind === 'call' && event.call.operation === 'http.server.request').length === 2))).toBe(true);
});
