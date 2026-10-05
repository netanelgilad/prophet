import { spawnSync } from "child_process";
import { createCommonJSLoader, createLegacyURLModel, createWarningModel, isExecutionBoundary, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { encodeGraph } from "../src/cli/graph";
import { effectPaths } from "../src/effects";
import { analysisFailureContext } from "../src/execution-context/analysis-failure";
import { BranchResult } from "../src/execution-context/branches";
import { ExecutionContext, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getArrayElements, getProperties } from "../src/execution-context/Heap";
import { createJobQueue } from "../src/jobs";
import { createConsoleModel } from "../src/node/console";
import { createHTTPModel } from "../src/node/http";
import { createOpaqueBuiltinModule } from "../src/node/opaque";
import { ESObject } from "../src/Object";
import { Any, ESNull, isThrownValue, Undefined } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

function setup(source: string, inputs: { [key: string]: Any } = {}, sources: { [name: string]: string } = {}) {
  const queue = createJobQueue();
  const warnings = createWarningModel({ pid: 123, nextTick: queue });
  const url = createLegacyURLModel(warnings);
  const console = createConsoleModel();
  const http = createHTTPModel(undefined, { nextTick: queue, bind: (_call, context) => [ESNull, context] });
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, process: warnings.process,
      console: console.module, ...inputs }) });
  const [completion, context] = createCommonJSLoader({ "/app/startup.cjs": source, ...sources }, {
    builtins: { process: warnings.process, http: http.module, url: url.module, fs: createOpaqueBuiltinModule("fs") }
  }).load("/app/startup.cjs", initial);
  expect(isThrownValue(completion)).toBe(false);
  expect(isExecutionBoundary(completion)).toBe(false);
  return { queue, warnings, url, console, initial, context };
}

function timeline(context: TExecutionContext) {
  return effectPaths(context.value.effects).map(path => path.events.filter(event => event.kind === "return" &&
    ["console.stdout.write", "process.warning.stderr.write"].includes(event.call.operation)).map(event => {
      const text = (event.call.args[0] as { value: string }).value;
      return event.call.operation === "console.stdout.write" ? text.trim() : "warning:" + /\[([^\]]+)\]/.exec(text)![1];
    }));
}

// This observation listener only records delivery time; it does not suppress,
// replace or recover Node's default warning handling. The target snippets stay
// ordinary JavaScript, with real isolated loopback listeners in the child only.
function nativeTimeline(source: string, fatal = false) {
  assertPinnedNode();
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath, ["-e", `
    process.on("warning", warning => console.log("warning:" + warning.code));
    ${fatal ? 'process.once("uncaughtExceptionMonitor", error => console.log("fatal:" + error.message));' : ''}
    ${source}
    setImmediate(() => { ${fatal ? '' : 'first.close(); if (typeof second !== "undefined") second.close();'} });
  `], { encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(fatal ? 1 : 0);
  return child.stdout.trim().split("\n");
}

const cases = [
  ['hostless', `
    const http = require("http");
    process.emitWarning("before", "Notice", "A");
    const first = http.createServer(); first.listen(0, function() { console.log("first"); });
    process.emitWarning("after", "Notice", "B");
    const second = http.createServer(); second.listen(0, function() { console.log("second"); });
    console.log("top");
  `, ["top", "warning:A", "first", "warning:B", "second"]],
  ['explicit IPv4', `
    const http = require("http");
    const first = http.createServer(); first.listen(0, "127.0.0.1", function() { console.log("first"); });
    process.emitWarning("before", "Notice", "A");
    const second = http.createServer(); second.listen(0, function() { console.log("second"); });
    process.emitWarning("after", "Notice", "B"); console.log("top");
  `, ["top", "warning:A", "second", "warning:B", "first"]],
  ['nested warning', `
    const http = require("http");
    Error.prototype.toString = function() {
      if (this.code === "A") process.emitWarning("nested", "Notice", "C");
      return this.name + ": " + this.message;
    };
    process.emitWarning("before", "Notice", "A");
    const first = http.createServer(); first.listen(0, function() { console.log("first"); });
    process.emitWarning("after", "Notice", "B"); console.log("top");
  `, ["top", "warning:A", "first", "warning:B", "warning:C"]]
] as Array<[string, string, string[]]>;

for (const [label, source, expected] of cases) test(`shared FIFO matches pinned Node ${label} warning/listening order`, () => {
  expect(nativeTimeline(source)).toEqual(expected);
  const { queue, warnings, context } = setup(source);
  expect(warnings.inspectOutput(context)[0].chunks).toEqual([]);
  const [completion, after] = queue.drain(context, 20);
  expect(completion).toBe(Undefined);
  expect(timeline(after)).toEqual([expected]);
  expect(warnings.inspectPending(after)[0].warnings).toEqual([]);
  expect(warnings.inspectPending(context)[0].warnings).toHaveLength(2);
});

function leaves(result: BranchResult): BranchResult[] {
  const value = result[0];
  return isForkedCompletion(value) ? leaves(value.consequent).concat(leaves(value.alternate)) : [result];
}

test("presentation sees current warning fields and state at delivery, not at scheduling", () => {
  const { queue, warnings, context } = setup(`
    process.emitWarning("message", "Notice", "A");
    Error.prototype.toString = function() { this.code = "CHANGED"; Object.prototype.detail = "late detail"; return "late"; };
  `);
  const [, after] = queue.drain(context, 10);
  expect(warnings.inspectOutput(after)[0].chunks[0].value).toContain("[A] late\nlate detail\n");
  expect(getProperties(warnings.state, after).helperShown).toMatchObject({ value: true });
});

test("a throwing warning formatter stops its branch and retains the queued tail", () => {
  const source = `
    const http = require("http");
    Error.prototype.toString = function() { if (flag) throw new Error("format failed"); return "formatted"; };
    process.emitWarning("before", "Notice", "A");
    const first = http.createServer(); first.listen(0, function() { console.log("first"); });
    process.emitWarning("after", "Notice", "B"); console.log("top");
  `;
  expect(nativeTimeline('const flag = true;' + source, true)).toEqual(["top", "fatal:format failed"]);
  const { queue, warnings, context } = setup(source, { flag: ESBoolean() });
  const outcomes = leaves(queue.drain(context, 10));
  expect(outcomes).toHaveLength(2);
  const failed = outcomes.find(([value]) => isThrownValue(value))!;
  const finished = outcomes.find(([value]) => !isThrownValue(value))!;
  expect(warnings.inspectPending(failed[1])[0].warnings).toHaveLength(1);
  expect(getProperties(queue.state, failed[1]).active).toBe(Undefined);
  expect(getArrayElements(getProperties(queue.state, failed[1]).pending as any, failed[1])).toHaveLength(2);
  expect(timeline(failed[1])).toEqual([["top"]]);
  expect(timeline(finished[1])).toEqual([["top", "warning:A", "first", "warning:B"]]);
});

test("an unsupported warning formatter retains its active job and already-dequeued warning identity", () => {
  const { queue, warnings, context } = setup(`
    const fs = require("fs");
    Error.prototype.toString = function() { if (flag) fs.readFileSync("x"); return "formatted"; };
    process.emitWarning("before", "Notice", "A"); process.emitWarning("after", "Notice", "B");
  `, { flag: ESBoolean() });
  const outcomes = leaves(queue.drain(context, 10));
  const stopped = outcomes.find(([value]) => isExecutionBoundary(value))!;
  const finished = outcomes.find(([value]) => !isExecutionBoundary(value))!;
  const active = getProperties(queue.state, stopped[1]).active;
  expect(active).not.toBe(Undefined);
  const args = getArrayElements(getProperties(active as any, stopped[1]).args as any, stopped[1])!;
  expect(getProperties(args[0] as any, stopped[1]).code).toMatchObject({ value: "A" });
  expect(warnings.inspectPending(stopped[1])[0].warnings).toHaveLength(1);
  expect(getArrayElements(getProperties(queue.state, stopped[1]).pending as any, stopped[1])).toHaveLength(1);
  expect(warnings.inspectOutput(stopped[1])[0].chunks).toEqual([]);
  expect(warnings.inspectOutput(finished[1])[0].chunks).toHaveLength(2);
});

test("queue-owned warning delivery rejects manual duplication and validates its queue option", () => {
  const { queue, warnings, context } = setup('process.emitWarning("one");');
  expect(() => warnings.deliverNext(context)).toThrow(/queue|manual/i);
  const [, after] = queue.drain(context, 10);
  expect(() => warnings.deliverNext(after)).toThrow(/queue|manual/i);
  expect(warnings.inspectOutput(after)[0].chunks).toHaveLength(1);
  for (const nextTick of [null, {}, { enqueue: 1 }]) {
    expect(() => createWarningModel({ nextTick: nextTick as any })).toThrow(/queue/i);
  }
});

test("URL once-state and warning queue are graph-linked with source eligibility preserved", () => {
  const { queue, warnings, url, context, initial } = setup(`
    const url = require("url");
    require("./node_modules/pkg/index.cjs");
    url.parse("/eligible"); url.parse("/again");
  `, {}, { "/app/node_modules/pkg/index.cjs": 'require("url").parse("/suppressed");' });
  expect(warnings.inspectPending(context)[0].warnings).toHaveLength(1);
  expect(getProperties(url.state, initial).warned).toMatchObject({ value: false });
  expect(getProperties(url.state, context).warned).toMatchObject({ value: true });
  expect((url.module as any).hostSlots["node.url.deprecation"]).toBe(url.state);
  expect((warnings.process as any).hostSlots["node.process.warnings"]).toBe(warnings.state);
  expect((warnings.process as any).hostSlots["node.nextTick"]).toBe(queue.state);
  const graph = encodeGraph({ process: warnings.process, url: url.module, state: context });
  expect(graph.nodes.some(node => node.kind === "record" && node.entries.some(([name]) => name === "helperShown"))).toBe(true);
  const [, after] = queue.drain(context, 10);
  expect(timeline(after)).toEqual([["warning:DEP0169"]]);
});

test("warning model snapshots queue ownership and shares live emitWarning with URL parsing", () => {
  const queue = createJobQueue(), other = createJobQueue();
  const options = { nextTick: queue };
  const warnings = createWarningModel(options), url = createLegacyURLModel(warnings);
  options.nextTick = other;
  const [value, context] = createCommonJSLoader({ "/app/entry.cjs": `
    const process = require("process"); const url = require("url");
    const original = process.emitWarning;
    let called = false;
    process.emitWarning = function(message, type, code) {
      called = this === process && code === "DEP0169";
      original.call(this, message, type, code);
    };
    url.parse("/first");
    process.emitWarning = function() { throw "must not call a replacement after the once flag"; };
    url.parse("/second");
    module.exports = called;
  ` }, { builtins: { process: warnings.process, url: url.module } }).load("/app/entry.cjs", nodeInitialExecutionContext);
  expect(value).toMatchObject({ value: true });
  expect(getArrayElements(getProperties(queue.state, context).pending as any, context)).toHaveLength(1);
  expect(getArrayElements(getProperties(other.state, context).pending as any, context)).toHaveLength(0);
  const [completion, after] = queue.drain(context, 10);
  expect(completion).toBe(Undefined);
  expect(warnings.inspectOutput(after)[0].chunks).toHaveLength(1);
  expect(warnings.inspectPending(after)[0].warnings).toEqual([]);
});

test("a reached default-configuration guard retains dequeued active work without warning success", () => {
  const { queue, warnings, context } = setup(`
    process.emitWarning("pending", "Notice", "A");
    Object.prototype.traceProcessWarnings = true;
  `);
  let failure: Error | undefined;
  try { queue.drain(context, 10); } catch (error) { failure = error; }
  expect(failure).toBeDefined();
  expect(failure!.message).toContain("warning process configuration");
  const checkpoint = analysisFailureContext(failure)!;
  expect(checkpoint).toBeDefined();
  expect(warnings.inspectPending(checkpoint)[0].warnings).toEqual([]);
  expect(warnings.inspectOutput(checkpoint)[0].chunks).toEqual([]);
  expect(getProperties(queue.state, checkpoint).active).not.toBe(Undefined);
});

test("an unrecovered listening callback throw leaves earlier and callback-enqueued warnings pending", () => {
  const source = `
    const http = require("http");
    const first = http.createServer();
    first.listen(0, function() {
      process.emitWarning("inside callback", "Notice", "I");
      throw new Error("callback failed");
    });
    process.emitWarning("after listen", "Notice", "A"); console.log("top");
  `;
  expect(nativeTimeline(source, true)).toEqual(["top", "fatal:callback failed"]);
  const { queue, warnings, context } = setup(source);
  const [completion, after] = queue.drain(context, 10);
  expect(isThrownValue(completion)).toBe(true);
  expect(timeline(after)).toEqual([["top"]]);
  expect(warnings.inspectPending(after)[0].warnings.map(warning => (warning.code as { value: string }).value)).toEqual(["A", "I"]);
  expect(getProperties(queue.state, after).active).toBe(Undefined);
  expect(getArrayElements(getProperties(queue.state, after).pending as any, after)).toHaveLength(2);
});
