import { createCommonJSLoader, createFileSystemModel, fileSystemDirectory, fileSystemFile,
  evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ExecutionContext, setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { ESObject } from "../src/Object";
import { isThrownValue } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

// Pinned Node 24.21.0 controls (host, 2026-10-15): listener registration is
// synchronous and delivery is asynchronous; events arrive open -> data -> end
// -> close; a file under the default 64 KiB highWaterMark arrives as ONE
// Buffer chunk; pipe(dest) returns dest, wires data -> dest.write(chunk) and
// end -> dest.end(), and throws "TypeError: dest.on is not a function"
// synchronously for destinations without an 'on' method; a missing path does
// not throw at construction - the stream emits an 'error' event with code
// ENOENT, and an 'error' event without a listener throws. The model's events
// are delivered synchronously inside the explicit deliverReadStream embedding
// operation, the same convention as http.completeResponse; the async 'open'
// event carries an unmodeled file descriptor, so 'open' registration is a
// declared analysis gap instead of a delivered fake.

function setup(source: string, root = fileSystemDirectory({
  app: fileSystemDirectory({ "hello.txt": fileSystemFile("hello\n"),
    "big.txt": fileSystemFile("x".repeat(70000)),
    empty: fileSystemDirectory({}) })
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

test("construction resolves the path without throwing and the stream exposes pinned defaults", () => {
  const { model, exports, context } = setup("module.exports = require('node:fs');");
  const after = run(`const missing = exports.createReadStream("/app/nope.txt");
    const ready = exports.createReadStream("/app/hello.txt");
    const observation = [missing.bytesRead, ready.bytesRead, ready.closed, ready.path, typeof ready.pipe, typeof ready.on].join("|");`,
    context, { exports });
  expect(after.value.scope.observation).toMatchObject({ value: "0|0|false|/app/hello.txt|function|function" });
  expect(model.createdReadStreams.length).toBe(2);
});

test("deliverReadStream emits data, end and close in order with the file bytes as one Buffer chunk", () => {
  const { model, exports, context } = setup("module.exports = require('node:fs');");
  const after = run(`const stream = exports.createReadStream("/app/hello.txt");
    const calls = [];
    stream.on("data", function(chunk) { calls.push("data:" + chunk.length + ":" + chunk[0]); });
    stream.on("end", function() { calls.push("end"); });
    stream.on("close", function() { calls.push("close"); });`,
    context, { exports });
  const stream = model.createdReadStreams[0];
  const delivered = model.deliverReadStream(stream, after);
  expect(isThrownValue(delivered[0])).toBe(false);
  const observed = run("const observation = calls.join(\",\");", delivered[1]);
  expect(observed.value.scope.observation).toMatchObject({ value: "data:6:104,end,close" });
  const closed = run("const flags = [stream.bytesRead, stream.closed].join(\",\");", observed, { stream });
  expect(closed.value.scope.flags).toMatchObject({ value: "6,true" });
});

test("pipe returns the destination and wires data to write and end to end", () => {
  const { model, exports, context } = setup("module.exports = require('node:fs');");
  const after = run(`const stream = exports.createReadStream("/app/hello.txt");
    const calls = [];
    const dest = { on: function() {}, write: function(chunk) { calls.push("write:" + chunk.length); }, end: function() { calls.push("end"); } };
    const returned = stream.pipe(dest);
    const observation = returned === dest;`,
    context, { exports });
  expect(after.value.scope.observation).toMatchObject({ value: true });
  const delivered = model.deliverReadStream(model.createdReadStreams[0], after);
  const observed = run("const wired = calls.join(\",\");", delivered[1]);
  expect(observed.value.scope.wired).toMatchObject({ value: "write:6,end" });
});

test("pipe throws the pinned TypeError for destinations without an on method", () => {
  const { exports, context } = setup("module.exports = require('node:fs');");
  const pair = evaluateCode(
    `const stream = exports.createReadStream("/app/hello.txt");
     let message = "none";
     try { stream.pipe({ write: function() {}, end: function() {} }); }
     catch (failure) { message = failure.message; }`,
    setVariablesInScope(context, { exports }));
  expect(isThrownValue(pair[0])).toBe(false);
  expect(pair[1].value.scope.message).toMatchObject({ value: "dest.on is not a function" });
});

test("a missing path emits the pinned ENOENT error event instead of throwing at construction", () => {
  const { model, exports, context } = setup("module.exports = require('node:fs');");
  const after = run(`const stream = exports.createReadStream("/app/nope.txt");
    const seen = [];
    stream.on("error", function(error) { seen.push(error.code + ":" + (error instanceof Error)); });`,
    context, { exports });
  const delivered = model.deliverReadStream(model.createdReadStreams[0], after);
  expect(isThrownValue(delivered[0])).toBe(false);
  const observed = run("const observation = seen.join(\",\");", delivered[1]);
  expect(observed.value.scope.observation).toMatchObject({ value: "ENOENT:true" });
});

test("an error event without a listener throws, matching pinned Node", () => {
  const { model, exports, context } = setup("module.exports = require('node:fs');");
  const after = run(`exports.createReadStream("/app/nope.txt");`, context, { exports });
  const delivered = model.deliverReadStream(model.createdReadStreams[0], after);
  expect(isThrownValue(delivered[0])).toBe(true);
});

test("option fields beyond an empty object are declared gaps, and repeat delivery is rejected", () => {
  const { model, exports, context } = setup("module.exports = require('node:fs');");
  const after = run(`exports.createReadStream("/app/hello.txt", {});`, context, { exports });
  expect(model.createdReadStreams.length).toBe(1);
  expect(() => run(`exports.createReadStream("/app/hello.txt", { start: 0 });`, after, { exports }))
    .toThrow("fs createReadStream option 'start'");
  const delivered = model.deliverReadStream(model.createdReadStreams[0], after);
  expect(() => model.deliverReadStream(model.createdReadStreams[0], delivered[1]))
    .toThrow("repeat fs ReadStream delivery");
});

test("open registration and multi-chunk files are declared gaps", () => {
  const { model, exports, context } = setup("module.exports = require('node:fs');");
  expect(() => run(`exports.createReadStream("/app/hello.txt").on("open", function() {});`, context, { exports }))
    .toThrow("host event 'open' delivery");
  const after = run(`exports.createReadStream("/app/big.txt");`, context, { exports });
  expect(() => model.deliverReadStream(model.createdReadStreams[model.createdReadStreams.length - 1], after))
    .toThrow("multi-chunk fs ReadStream delivery");
});
