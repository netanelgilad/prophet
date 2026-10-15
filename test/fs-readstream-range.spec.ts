import { createCommonJSLoader, createFileSystemModel, fileSystemDirectory, fileSystemFile,
  evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ExecutionContext, setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { ESObject } from "../src/Object";
import { isThrownValue } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

// Pinned Node 24.21.0 controls (host, 2026-10-15): {start,end} slice the
// delivered bytes inclusively; start-only reads to EOF and end-only reads
// from 0; end past the size clamps without error; end: Infinity is an
// explicit exception treated as absent (reads to EOF) while start: Infinity
// fails the safe-integer check; start at or past the size delivers no data
// event, only end and close, with bytesRead 0; a negative, fractional or
// greater-than-end start/end throws a RangeError with code ERR_OUT_OF_RANGE
// synchronously at construction. The path validates before the range
// fields: createReadStream("/a\0b", {start:-1}) throws the path TypeError
// with code ERR_INVALID_ARG_VALUE, not the range RangeError.

function setup(source: string, root = fileSystemDirectory({
  app: fileSystemDirectory({ "hello.txt": fileSystemFile("hello from sirv\n") })
})) {
  const model = createFileSystemModel({ root, cwd: "/app" });
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties }) });
  const loadedPair = createCommonJSLoader({ "/app/entry.cjs": source },
    { builtins: { fs: model.module } }).load("/app/entry.cjs", initial);
  const exportsValue = loadedPair[0];
  expect(isThrownValue(exportsValue)).toBe(false);
  expect(isForkedCompletion(exportsValue)).toBe(false);
  return { model, exports: exportsValue, context: loadedPair[1] };
}

function run(source: string, context: TExecutionContext, inputs: { [name: string]: import("../src/types").Any } = {}) {
  const pair = evaluateCode(source, setVariablesInScope(context, inputs));
  expect(isThrownValue(pair[0])).toBe(false);
  expect(isForkedCompletion(pair[0])).toBe(false);
  return pair[1];
}

test("a start/end range delivers the inclusive byte slice as one chunk", () => {
  const { model, exports, context } = setup("module.exports = require('node:fs');");
  const after = run(`const stream = exports.createReadStream("/app/hello.txt", { start: 2, end: 5 });
    const calls = [];
    stream.on("data", function(chunk) { calls.push("data:" + chunk.length + ":" + chunk[0] + ":" + chunk[3]); });
    stream.on("end", function() { calls.push("end"); });
    stream.on("close", function() { calls.push("close"); });`,
    context, { exports });
  const delivered = model.deliverReadStream(model.createdReadStreams[0], after);
  expect(isThrownValue(delivered[0])).toBe(false);
  const observed = run("const observation = calls.join(\",\");", delivered[1]);
  expect(observed.value.scope.observation).toMatchObject({ value: "data:4:108:32,end,close" });
  const flags = run("const flags = [stream.bytesRead, stream.closed].join(\",\");", observed, { stream: model.createdReadStreams[0] });
  expect(flags.value.scope.flags).toMatchObject({ value: "4,true" });
});

test("start-only reads to end of file and end-only reads from zero", () => {
  const { model, exports, context } = setup("module.exports = require('node:fs');");
  const after = run(`const a = exports.createReadStream("/app/hello.txt", { start: 10 });
    const b = exports.createReadStream("/app/hello.txt", { end: 3 });
    const seen = [];
    a.on("data", function(chunk) { seen.push("a:" + chunk.length); });
    b.on("data", function(chunk) { seen.push("b:" + chunk.length); });`,
    context, { exports });
  let current = after;
  for (const stream of model.createdReadStreams) {
    const delivered = model.deliverReadStream(stream, current);
    expect(isThrownValue(delivered[0])).toBe(false);
    current = delivered[1];
  }
  const observed = run("const observation = seen.join(\",\");", current);
  expect(observed.value.scope.observation).toMatchObject({ value: "a:6,b:4" });
});

test("end past the file size clamps without error", () => {
  const { model, exports, context } = setup("module.exports = require('node:fs');");
  const after = run(`const stream = exports.createReadStream("/app/hello.txt", { start: 0, end: 100 });
    const seen = [];
    stream.on("data", function(chunk) { seen.push("data:" + chunk.length); });
    stream.on("end", function() { seen.push("end"); });`,
    context, { exports });
  const delivered = model.deliverReadStream(model.createdReadStreams[0], after);
  expect(isThrownValue(delivered[0])).toBe(false);
  const observed = run("const observation = seen.join(\",\");", delivered[1]);
  expect(observed.value.scope.observation).toMatchObject({ value: "data:16,end" });
});

test("start at or past the file size delivers end and close with no data event", () => {
  const { model, exports, context } = setup("module.exports = require('node:fs');");
  const after = run(`const at = exports.createReadStream("/app/hello.txt", { start: 16 });
    const past = exports.createReadStream("/app/hello.txt", { start: 100 });
    const seen = [];
    at.on("data", function() { seen.push("data"); });
    at.on("end", function() { seen.push("end"); });
    at.on("close", function() { seen.push("close"); });
    past.on("data", function() { seen.push("data"); });
    past.on("end", function() { seen.push("end"); });
    past.on("close", function() { seen.push("close"); });`,
    context, { exports });
  let current = after;
  for (const stream of model.createdReadStreams) {
    const delivered = model.deliverReadStream(stream, current);
    expect(isThrownValue(delivered[0])).toBe(false);
    current = delivered[1];
  }
  const observed = run("const observation = seen.join(\",\") + \"|\" + at.bytesRead + \"|\" + past.bytesRead;", current);
  expect(observed.value.scope.observation).toMatchObject({ value: "end,close,end,close|0|0" });
});

test("negative, fractional and greater-than-end ranges throw a RangeError at construction", () => {
  const { exports, context } = setup("module.exports = require('node:fs');");
  const after = run(`const seen = [];
    try { exports.createReadStream("/app/hello.txt", { start: -1 }); seen.push("no"); }
    catch (failure) { seen.push(failure instanceof RangeError && failure.code === "ERR_OUT_OF_RANGE" ? "range" : "other"); }
    try { exports.createReadStream("/app/hello.txt", { start: 1.5 }); seen.push("no"); }
    catch (failure) { seen.push(failure instanceof RangeError && failure.code === "ERR_OUT_OF_RANGE" ? "range" : "other"); }
    try { exports.createReadStream("/app/hello.txt", { start: 5, end: 2 }); seen.push("no"); }
    catch (failure) { seen.push(failure instanceof RangeError && failure.code === "ERR_OUT_OF_RANGE" ? "range" : "other"); }
    try { exports.createReadStream("/app/hello.txt", { start: Infinity }); seen.push("no"); }
    catch (failure) { seen.push(failure instanceof RangeError && failure.code === "ERR_OUT_OF_RANGE" ? "range" : "other"); }
    const observation = seen.join(",");`,
    context, { exports });
  expect(after.value.scope.observation).toMatchObject({ value: "range,range,range,range" });
});

test("end Infinity is an explicit exception read as absent", () => {
  const { model, exports, context } = setup("module.exports = require('node:fs');");
  const after = run(`const a = exports.createReadStream("/app/hello.txt", { end: Infinity });
    const b = exports.createReadStream("/app/hello.txt", { start: 2, end: Infinity });
    const seen = [];
    a.on("data", function(chunk) { seen.push("a:" + chunk.length); });
    b.on("data", function(chunk) { seen.push("b:" + chunk.length); });
    a.on("end", function() { seen.push("aend"); });
    b.on("end", function() { seen.push("bend"); });`,
    context, { exports });
  const deliveredA = model.deliverReadStream(model.createdReadStreams[0], after);
  expect(isThrownValue(deliveredA[0])).toBe(false);
  const deliveredB = model.deliverReadStream(model.createdReadStreams[1], deliveredA[1]);
  expect(isThrownValue(deliveredB[0])).toBe(false);
  const observed = run("const observation = seen.join(\",\");", deliveredB[1]);
  expect(observed.value.scope.observation).toMatchObject({ value: "a:16,aend,b:14,bend" });
});

test("the path validates before the range fields", () => {
  const { exports, context } = setup("module.exports = require('node:fs');");
  const after = run(`const seen = [];
    try { exports.createReadStream("/a\u0000b", { start: -1 }); seen.push("no"); }
    catch (failure) { seen.push(failure instanceof TypeError && failure.code === "ERR_INVALID_ARG_VALUE" ? "path" : "other"); }
    try { exports.createReadStream("/a\u0000b", { end: 2 }); seen.push("no"); }
    catch (failure) { seen.push(failure instanceof TypeError && failure.code === "ERR_INVALID_ARG_VALUE" ? "path" : "other"); }
    const observation = seen.join(",");`,
    context, { exports });
  expect(after.value.scope.observation).toMatchObject({ value: "path,path" });
});

test("undefined range fields behave as absent", () => {
  const { model, exports, context } = setup("module.exports = require('node:fs');");
  const after = run(`const stream = exports.createReadStream("/app/hello.txt", { start: undefined, end: undefined });
    const seen = [];
    stream.on("data", function(chunk) { seen.push("data:" + chunk.length); });`,
    context, { exports });
  const delivered = model.deliverReadStream(model.createdReadStreams[0], after);
  expect(isThrownValue(delivered[0])).toBe(false);
  const observed = run("const observation = seen.join(\",\");", delivered[1]);
  expect(observed.value.scope.observation).toMatchObject({ value: "data:16" });
});

test("non-number range fields remain an explicit gap", () => {
  const { exports, context } = setup("module.exports = require('node:fs');");
  expect(() => evaluateCode("exports.createReadStream(\"/app/hello.txt\", { start: \"2\" });",
    setVariablesInScope(context, { exports })))
    .toThrow(/fs createReadStream non-number range options are not yet supported/);
});
