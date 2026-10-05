import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { removeSync } from "fs-extra";
import { runFile } from "../src/cli/runtime";
import { effectPaths } from "../src/effects";
import { isForkedCompletion } from "../src/execution-context/Completion";
import { BranchResult } from "../src/execution-context/branches";
import { isThrownValue, isESString } from "../src/types";

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
      expect(effectPaths(context.value.effects).every(path => !path.events.some(event => event.call.operation === 'http.server.request'))).toBe(true);
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

test.each([-1, 2, 1.5, Infinity, NaN])('unsupported event bounds reject explicitly: %s', maxEvents => {
  expect(() => run('module.exports = true;', maxEvents)).toThrow(/event/i);
});
