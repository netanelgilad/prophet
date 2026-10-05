import { mkdtempSync, realpathSync, writeFileSync } from "fs";
import { removeSync } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { runFile } from "../src/cli/runtime";
import { effectPaths } from "../src/effects";
import { BranchResult } from "../src/execution-context/branches";
import { isExecutionBoundary, isForkedCompletion } from "../src/execution-context/Completion";
import { getProperties } from "../src/execution-context/Heap";
import { WithProperties, isThrownValue } from "../src/types";

let directory: string;
beforeEach(() => { directory = realpathSync(mkdtempSync(join(tmpdir(), "prophet-node-env-"))); });
afterEach(() => { removeSync(directory); });
function run(source: string) {
  writeFileSync(join(directory, "entry.cjs"), source);
  return runFile({ script: "entry.cjs", args: [], maxSteps: 100000, runtime: "node@24.21.0" }, directory);
}
function leaves(result: BranchResult): BranchResult[] {
  return isForkedCompletion(result[0]) ? leaves(result[0].consequent).concat(leaves(result[0].alternate)) : [result];
}

test("the default environment shares process, path and URL identities and captured cwd", () => {
  const result = run(`const path = require('node:path'); module.exports = {
    same: process === require('process') && process === require('node:process') &&
      path === require('path') && path.posix === require('node:path/posix') &&
      require('url') === require('node:url'),
    cwd: process.cwd(), resolved: path.resolve('site', '..', 'public'), url: require('url')
  };`);
  expect(result.status).toBe("evaluated");
  expect(getProperties(result.completion as WithProperties, result.current)).toMatchObject({
    same: { value: true }, cwd: { value: directory }, resolved: { value: join(directory, "public") }
  });
  const process = getProperties(result.initial.value.global, result.initial).process as WithProperties;
  const state = (process as any).hostSlots["node.process.environment"];
  expect(getProperties(state, result.initial).cwd).toMatchObject({ value: directory });
  expect((process as any).hostSlots["node.nextTick"]).toBe(result.initial.value.global.hostSlots!["node.nextTick"]);
  expect((process as any).hostSlots["node.process.warnings"]).toBeDefined();
  const url = getProperties(result.completion as WithProperties, result.current).url as WithProperties;
  const urlState = (url as any).hostSlots["node.url.deprecation"];
  expect(result.initial.value.global.hostSlots!["node.url.deprecation"]).toBe(urlState);
  expect(getProperties(urlState, result.initial).warned).toMatchObject({ value: false });
});

test("path.resolve reads the current method on its captured process identity", () => {
  const result = run(`const path = require('path'); const original = process;
    original.cwd = function() { console.log('cwd called'); return '/virtual'; };
    global.process = {}; module.exports = path.resolve('child');`);
  expect(result.status).toBe("evaluated");
  expect(result.completion).toMatchObject({ value: "/virtual/child" });
  expect(effectPaths(result.current.value.effects)[0].events.filter(event =>
    event.kind === "return" && event.call.operation === "console.stdout.write")
    .map(event => event.call.args[0])).toMatchObject([{ value: "cwd called\n" }]);
});

test("URL warnings and HTTP notifications use one queue and retain warning state", () => {
  const result = run(`const url = require('url');
    url.parse('/first');
    require('http').createServer().listen(8080, function() { console.log('ready'); });
    url.parse('/second'); console.log('top');`);
  expect(result.status).toBe("evaluated");
  const urlState = result.initial.value.global.hostSlots!["node.url.deprecation"] as WithProperties;
  expect(getProperties(urlState, result.initial).warned).toMatchObject({ value: false });
  const outcomes = leaves([result.completion!, result.current]);
  expect(outcomes.some(([value]) => isThrownValue(value))).toBe(true);
  for (const [, context] of outcomes) {
    expect(getProperties(urlState, context).warned).toMatchObject({ value: true });
    for (const path of effectPaths(context.value.effects, context.value.knowledge)) {
      const events = path.events.filter(event => event.kind === "call");
      expect(events.filter(event => event.call.operation === "process.emitWarning")).toHaveLength(1);
      const warning = events.findIndex(event => event.call.operation === "process.warning.stderr.write");
      const listen = events.findIndex(event => event.call.operation === "http.server.listening");
      expect(warning).toBeGreaterThan(-1);
      if (listen >= 0) expect(warning).toBeLessThan(listen);
    }
  }
});

test("the unchanged pico CLI entry keeps completed method paths beside open-URL boundaries", () => {
  const result = runFile({ script: join(__dirname, "fixtures/pico-static-server-3.0.3/package/examples/pico-http-server.js"),
    args: [], maxSteps: 100000, maxEvents: 1, runtime: "node@24.21.0" }, directory);
  expect(result.status).toBe("analysis-stop");
  const outcomes = leaves([result.completion!, result.current]);
  const stopped = outcomes.filter(([value]) => isExecutionBoundary(value));
  expect(stopped.length).toBeGreaterThan(0);
  for (const [value, context] of stopped) {
    expect(value).toMatchObject({ kind: "unsupported", message: expect.stringMatching(/open symbolic URL/) });
    expect(effectPaths(context.value.effects, context.value.knowledge).every(path =>
      path.events.some(event => event.kind === "call" && event.call.operation === "url.parse"))).toBe(true);
  }
  const completed = outcomes.filter(([value]) => !isExecutionBoundary(value) && !isThrownValue(value));
  const statuses: number[] = [];
  let waiting = false;
  for (const [, context] of completed) for (const path of effectPaths(context.value.effects, context.value.knowledge)) {
    const events = path.events.filter(event => event.kind === "call");
    if (!events.some(event => event.call.operation === "http.server.request")) waiting = true;
    for (const event of events.filter(event => event.call.operation === "http.response.writeHead")) {
      statuses.push((event.call.args[0] as any).value);
      expect(events.some(item => item.call.operation === "http.response.end")).toBe(true);
    }
  }
  expect(waiting).toBe(true);
  expect(statuses).toEqual(expect.arrayContaining([200, 405]));
});
