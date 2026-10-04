import { createCommonJSLoader, evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { TArray } from "../src/array/Array";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { effectPaths, HostModel } from "../src/effects";
import { createError } from "../src/error/Error";
import { ExecutionContext, setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { BranchResult } from "../src/execution-context/branches";
import { getArrayElements, getProperties } from "../src/execution-context/Heap";
import { createJobQueue } from "../src/jobs";
import { createConsoleModel } from "../src/node/console";
import { createHTTPModel, HTTPModelOptions } from "../src/node/http";
import { ESObject, isESObject, TESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { resolveBoolean, selectValue } from "../src/symbolic";
import { Any, ESNull, isArray, isThrownValue, TESBoolean, Undefined } from "../src/types";

// The first five timelines have independent pinned Node references in
// node-startup-reference.spec.ts. Ports here are model input, never native binds.
const successfulBind: HostModel = (_call, context) => [ESNull, context];

function addressInUse() {
  const error = createError("Error", ESString("listen EADDRINUSE"));
  error.properties.code = ESString("EADDRINUSE");
  return error;
}

function start(source: string, bind: HostModel = successfulBind, inputs: { [name: string]: Any } = {}) {
  const queue = createJobQueue();
  const console = createConsoleModel();
  const model = createHTTPModel(undefined, { bind, nextTick: queue });
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, console: console.module, ...inputs }, "unmodeled") });
  const filename = "/app/startup.cjs";
  const [exports, context] = createCommonJSLoader({ [filename]: source },
    { builtins: { http: model.module } }).load(filename, initial);
  expect(isThrownValue(exports)).toBe(false);
  expect(isForkedCompletion(exports)).toBe(false);
  if (!isESObject(exports)) throw new Error("Expected object exports");
  return { queue, console, model, exports, context };
}

function observe(exports: TESObject, expression: string, context: TExecutionContext) {
  const [completion, current] = evaluateCode(`var observation = (${expression});`,
    setVariablesInScope(context, { loaded: exports }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  return current.value.scope.observation;
}

function output(console: ReturnType<typeof createConsoleModel>, context: TExecutionContext) {
  return console.inspectOutput(context).map(path => path.chunks.map(chunk => chunk.value).join(""));
}

function pending(queue: ReturnType<typeof createJobQueue>, context: TExecutionContext) {
  const jobs = getProperties(queue.state, context).pending;
  expect(isArray(jobs)).toBe(true);
  if (!isArray(jobs)) throw new Error("Expected a selected queue array");
  const elements = getArrayElements(jobs as TArray<Any>, context);
  expect(elements).toBeDefined();
  return elements!.length;
}

function leaves(result: BranchResult): BranchResult[] {
  const [completion] = result;
  return isForkedCompletion(completion)
    ? leaves(completion.consequent).concat(leaves(completion.alternate)) : [result];
}

test("hostless startup drains listening callbacks after top-level output in listen-call order", () => {
  const { queue, console, exports, context } = start(`
    const http = require("http"), first = http.createServer(), second = http.createServer();
    first.listen(8080, function() { console.log("first"); });
    second.listen(8081, function() { console.log("second"); });
    console.log("top");
    module.exports = { first: first, second: second };
  `);
  expect(output(console, context)).toEqual(["top\n"]);
  expect(pending(queue, context)).toBe(2);
  expect(observe(exports, "loaded.first.listening && loaded.second.listening", context)).toMatchObject({ value: true });
  const [completion, ready] = queue.drain(context, 10);
  expect(completion).toBe(Undefined);
  expect(output(console, ready)).toEqual(["top\nfirst\nsecond\n"]);
  expect(pending(queue, ready)).toBe(0);
  expect(getProperties(queue.state, ready).active).toBe(Undefined);
  expect(pending(queue, context)).toBe(2);
  expect(output(console, context)).toEqual(["top\n"]);
  const [, again] = queue.drain(ready, 10);
  expect(output(console, again)).toEqual(["top\nfirst\nsecond\n"]);
});

test("explicit IPv4 lookup queues its notification behind a later hostless listen", () => {
  const { queue, console, exports, context } = start(`
    const http = require("http"), first = http.createServer(), second = http.createServer();
    first.listen(8080, "127.0.0.1", function() { console.log("first"); });
    second.listen(8081, function() { console.log("second"); });
    console.log("top");
    module.exports = { first: first, second: second };
  `);
  expect(observe(exports, "!loaded.first.listening && loaded.second.listening", context)).toMatchObject({ value: true });
  const bindPorts = (current: TExecutionContext) => effectPaths(current.value.effects)[0].events
    .filter(event => event.kind === "call" && event.call.operation === "http.server.bind")
    .map(event => (event.call.args[0] as { value: number }).value);
  expect(bindPorts(context)).toEqual([8081]);
  const [completion, ready] = queue.drain(context, 10);
  expect(completion).toBe(Undefined);
  expect(output(console, ready)).toEqual(["top\nsecond\nfirst\n"]);
  expect(bindPorts(ready)).toEqual([8081, 8080]);
  expect(observe(exports, "loaded.first.listening && loaded.second.listening", ready)).toMatchObject({ value: true });
});

test("a failed bind's handler appends retry after queued siblings and retains the original callback", () => {
  const error = addressInUse();
  const { queue, console, exports, context } = start(`
    const http = require("http"), first = http.createServer(), second = http.createServer();
    first.once("error", function() {
      console.log("error");
      first.listen(0, function() { console.log("retry-callback"); });
    });
    first.listen(8080, function() { console.log("original-callback"); });
    second.listen(8081, function() { console.log("second"); });
    console.log("top");
    module.exports = { first: first, second: second };
  `, (call, current) => [(call.args[0] as { value: number }).value === 8080 ? error : ESNull, current]);
  const [completion, ready] = queue.drain(context, 10);
  expect(completion).toBe(Undefined);
  expect(output(console, ready)).toEqual(["top\nerror\nsecond\noriginal-callback\nretry-callback\n"]);
  expect(observe(exports, "loaded.first.listening && loaded.second.listening", ready)).toMatchObject({ value: true });
  expect(pending(queue, ready)).toBe(0);
  const ports = effectPaths(ready.value.effects)[0].events
    .filter(event => event.kind === "call" && event.call.operation === "http.server.bind")
    .map(event => (event.call.args[0] as { value: number }).value);
  expect(ports).toEqual([8080, 8081, 0]);
});

test.each(["bind", "callback"])("an unhandled %s error stops before later queued callbacks", failure => {
  const error = addressInUse();
  const { queue, console, exports, context } = start(`
    const http = require("http"), first = http.createServer(), second = http.createServer();
    first.listen(8080, function() { console.log("first"); throw failure; });
    second.listen(8081, function() { console.log("second"); });
    console.log("top");
    module.exports = { first: first, second: second };
  `, (call, current) => [failure === "bind" && (call.args[0] as { value: number }).value === 8080
    ? error : ESNull, current], { failure: error });
  const [completion, stopped] = queue.drain(context, 10);
  expect(isThrownValue(completion)).toBe(true);
  if (!isThrownValue(completion)) throw new Error("Expected unhandled startup error");
  expect(completion.value).toBe(error);
  expect(output(console, stopped)).toEqual([failure === "bind" ? "top\n" : "top\nfirst\n"]);
  expect(observe(exports, "loaded.second.listening", stopped)).toMatchObject({ value: true });
  expect(pending(queue, stopped)).toBe(1);
  expect(output(console, context)).toEqual(["top\n"]);
  expect(pending(queue, context)).toBe(2);
});

test("conditional listen registration preserves callback order and proves only the guarded callback ran", () => {
  const enabled = ESBoolean();
  const { queue, console, exports, context } = start(`
    const http = require("http"), first = http.createServer(), second = http.createServer();
    let firstRan = false, secondRan = false;
    if (enabled) first.listen(8080, function() { firstRan = true; console.log("first"); });
    second.listen(8081, function() { secondRan = true; console.log("second"); });
    console.log("top");
    module.exports = { first: first, second: second,
      proof: function() { return firstRan === enabled && secondRan; },
      firstRan: function() { return firstRan; } };
  `, successfulBind, { enabled });
  const [completion, ready] = queue.drain(context, 10);
  expect(completion).toBe(Undefined);
  expect(output(console, ready).sort()).toEqual(["top\nfirst\nsecond\n", "top\nsecond\n"].sort());
  expect(observe(exports, "loaded.proof()", ready)).toMatchObject({ value: true });
  expect(resolveBoolean(observe(exports, "loaded.firstRan()", ready) as TESBoolean, ready.value.knowledge)).toBeUndefined();
  expect(observe(exports, "loaded.firstRan()", context)).toMatchObject({ value: false });
});

test("a symbolic bind drains later notifications only on its normal branch", () => {
  const succeeds = ESBoolean(), error = addressInUse();
  const { queue, console, context } = start(`
    const http = require("http"), first = http.createServer(), second = http.createServer();
    first.listen(8080, function() { console.log("first"); });
    second.listen(8081, function() { console.log("second"); });
    console.log("top"); module.exports = {};
  `, (call, current) => [(call.args[0] as { value: number }).value === 8080
    ? selectValue(succeeds, ESNull, error) : ESNull, current]);
  const results = leaves(queue.drain(context, 10));
  expect(results).toHaveLength(2);
  for (const [completion, current] of results) {
    const success = resolveBoolean(succeeds, current.value.knowledge);
    expect(success).toBeDefined();
    if (success) {
      expect(completion).toBe(Undefined);
      expect(output(console, current)).toEqual(["top\nfirst\nsecond\n"]);
      expect(pending(queue, current)).toBe(0);
    } else {
      expect(isThrownValue(completion)).toBe(true);
      if (!isThrownValue(completion)) throw new Error("Expected failed bind");
      expect(completion.value).toBe(error);
      expect(output(console, current)).toEqual(["top\n"]);
      expect(pending(queue, current)).toBe(1);
    }
  }
  expect(resolveBoolean(succeeds, context.value.knowledge)).toBeUndefined();
});

test("retry binding has a fresh symbolic outcome and can fail after the sibling notification", () => {
  const retrySucceeds = ESBoolean(), firstError = addressInUse(), retryError = addressInUse();
  const { queue, console, context } = start(`
    const http = require("http"), first = http.createServer(), second = http.createServer();
    first.once("error", function() {
      console.log("error"); first.listen(0, function() { console.log("retry"); });
    });
    first.listen(8080, function() { console.log("original"); });
    second.listen(8081, function() { console.log("second"); });
    console.log("top"); module.exports = {};
  `, (call, current) => {
    const port = (call.args[0] as { value: number }).value;
    return [port === 8080 ? firstError : port === 0 ? selectValue(retrySucceeds, ESNull, retryError) : ESNull, current];
  });
  const results = leaves(queue.drain(context, 10));
  expect(results).toHaveLength(2);
  for (const [completion, current] of results) {
    const success = resolveBoolean(retrySucceeds, current.value.knowledge);
    expect(success).toBeDefined();
    if (success) {
      expect(completion).toBe(Undefined);
      expect(output(console, current)).toEqual(["top\nerror\nsecond\noriginal\nretry\n"]);
    } else {
      expect(isThrownValue(completion)).toBe(true);
      if (!isThrownValue(completion)) throw new Error("Expected retry failure");
      expect(completion.value).toBe(retryError);
      expect(output(console, current)).toEqual(["top\nerror\nsecond\n"]);
    }
  }
  expect(resolveBoolean(retrySucceeds, context.value.knowledge)).toBeUndefined();
});

test("startup delivery reads current lexical state and the listeners present after top-level code", () => {
  const { queue, console, context } = start(`
    const server = require("http").createServer();
    let message = "registered";
    function removed() { console.log("removed"); }
    server.on("listening", removed);
    server.listen(8080, function() { console.log(message); });
    server.off("listening", removed);
    server.on("listening", function() { console.log("late"); });
    message = "latest";
    console.log("top"); module.exports = {};
  `);
  const [completion, ready] = queue.drain(context, 10);
  expect(completion).toBe(Undefined);
  expect(output(console, ready)).toEqual(["top\nlatest\nlate\n"]);
});

test("an error listener installed after a failed listen handles its queued error", () => {
  const error = addressInUse();
  const { queue, console, context } = start(`
    const server = require("http").createServer();
    let message = "registered";
    server.listen(8080, function() { console.log("unexpected success"); });
    server.on("error", function(error) { if (error === bindingError) console.log(message); });
    message = "latest error";
    console.log("top"); module.exports = {};
  `, (_call, current) => [error, current], { bindingError: error });
  const [completion, ready] = queue.drain(context, 10);
  expect(completion).toBe(Undefined);
  expect(output(console, ready)).toEqual(["top\nlatest error\n"]);
});

test("a scheduled HTTP model rejects manual listen delivery before or after draining", () => {
  const { model, queue, console, exports, context } = start(`
    const server = require("http").createServer();
    server.listen(8080, function() { console.log("ready"); });
    module.exports = { server: server };
  `);
  const server = getProperties(exports, context).server;
  expect(() => model.completeListen(server, context)).toThrow(/scheduled|queue|manual/i);
  const [completion, ready] = queue.drain(context, 10);
  expect(completion).toBe(Undefined);
  expect(output(console, ready)).toEqual(["ready\n"]);
  expect(() => model.completeListen(server, ready)).toThrow(/scheduled|queue|manual/i);
});

test.each(["replace", "remove"])("%s of the caller's queue option cannot redirect pending IPv4 startup", mutation => {
  const firstQueue = createJobQueue(), otherQueue = createJobQueue();
  const console = createConsoleModel();
  const options: HTTPModelOptions = { bind: successfulBind, nextTick: firstQueue };
  const model = createHTTPModel(undefined, options);
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, console: console.module }, "unmodeled") });
  const filename = "/app/startup-queue-identity.cjs";
  const [exports, context] = createCommonJSLoader({ [filename]: `
    const http = require("http"), first = http.createServer(), second = http.createServer();
    first.listen(8080, "127.0.0.1", function() { console.log("first"); });
    second.listen(8081, function() { console.log("second"); });
    console.log("top"); module.exports = { first: first };
  ` }, { builtins: { http: model.module } }).load(filename, initial);
  expect(isESObject(exports)).toBe(true);
  if (!isESObject(exports)) throw new Error("Expected object exports");
  const first = getProperties(exports, context).first;
  expect(pending(firstQueue, context)).toBe(2);
  expect(pending(otherQueue, context)).toBe(0);

  options.nextTick = mutation === "replace" ? otherQueue : undefined;
  expect(() => model.completeListen(first, context)).toThrow(/scheduled|queue|manual/i);
  const [completion, ready] = firstQueue.drain(context, 10);
  expect(completion).toBe(Undefined);
  expect(output(console, ready)).toEqual(["top\nsecond\nfirst\n"]);
  expect(pending(firstQueue, ready)).toBe(0);
  expect(pending(otherQueue, ready)).toBe(0);
  expect(() => model.completeListen(first, ready)).toThrow(/scheduled|queue|manual/i);
  const [otherCompletion, unchanged] = otherQueue.drain(ready, 10);
  expect(otherCompletion).toBe(Undefined);
  expect(output(console, unchanged)).toEqual(["top\nsecond\nfirst\n"]);
});

test.each([null, false, {}])("an invalid explicit startup queue cannot select manual delivery: %p", nextTick => {
  expect(() => createHTTPModel(undefined, { nextTick: nextTick as any })).toThrow(/next-tick.*job queue/i);
});
