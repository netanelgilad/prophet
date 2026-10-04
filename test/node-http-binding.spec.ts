import { createCommonJSLoader, evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { effectPaths, HostModel } from "../src/effects";
import { createError } from "../src/error/Error";
import { ExecutionContext, setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { createHTTPModel } from "../src/node/http";
import { ESObject, isESObject, TESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { resolveBoolean, selectValue } from "../src/symbolic";
import { Any, ESNull, ESNumber, isThrownValue, TESBoolean, Undefined, WithProperties } from "../src/types";

// Explicit model input, not a real socket or a claim that port 8080 is occupied.
// The independent pinned-Node observations live in node-http-bind-reference.spec.ts.
function addressInUse() {
  const error = createError("Error", ESString("listen EADDRINUSE"));
  Object.assign(error.properties, { code: ESString("EADDRINUSE"), syscall: ESString("listen"),
    address: ESString("::"), port: ESNumber(8080) });
  return error;
}

function load(source: string, bind: HostModel, inputs: { [name: string]: Any } = {}) {
  const model = createHTTPModel(undefined, { bind });
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...inputs }, "unmodeled") });
  const filename = "/app/binding.cjs";
  const [exports, context] = createCommonJSLoader({ [filename]: source },
    { builtins: { http: model.module, events: model.eventsModule } }).load(filename, initial);
  expect(isThrownValue(exports)).toBe(false);
  expect(isForkedCompletion(exports)).toBe(false);
  if (!isESObject(exports)) throw new Error("Expected object exports");
  return { model, exports, server: getProperties(exports, context).server, context };
}

function observe(exports: TESObject, expression: string, context: TExecutionContext) {
  const [completion, current] = evaluateCode(`var observation = (${expression});`,
    setVariablesInScope(context, { loaded: exports }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  return { value: current.value.scope.observation, context: current };
}

function attempt(server: Any, context: TExecutionContext): WithProperties {
  const slots = (server as { hostSlots: { [name: string]: WithProperties } }).hostSlots;
  return getProperties(slots["node.http.server"], context).pending as WithProperties;
}

test("symbolic inline binding correlates listening with its outcome and defers callbacks until delivery", () => {
  const succeeds = ESBoolean();
  const error = addressInUse();
  const { model, exports, server, context } = load(`
    const server = require("http").createServer();
    let calls = 0, failed = false, received, seen = "", receiver = false, message = "registered";
    server.on("error", function(error) { failed = true; received = error; seen = message; receiver = this === server; });
    const same = server.listen(8080, function() { calls = calls + 1; seen = message; receiver = this === server; }) === server;
    module.exports = { server: server, same: same, initialListening: server.listening,
      update: function() { message = "latest"; }, calls: function() { return calls; },
      before: function() { return calls === 0 && !failed && seen === ""; },
      verify: function() { return same && receiver && seen === "latest" && server.listening === succeeds &&
        (succeeds ? calls === 1 && !failed : calls === 0 && failed && received === bindingError); } };
  `, (_call, branch) => [selectValue(succeeds, ESNull, error), branch], { succeeds, bindingError: error });
  expect(getProperties(exports, context).same).toMatchObject({ value: true });
  expect(resolveBoolean(getProperties(exports, context).initialListening as TESBoolean, context.value.knowledge)).toBeUndefined();
  expect(observe(exports, "loaded.before()", context).value).toMatchObject({ value: true });
  const pending = attempt(server, context);
  expect(getProperties(pending, context)).toMatchObject({ port: { value: 8080 }, delivered: { value: false } });
  expect(getProperties(pending, context).host).toBe(Undefined);
  const updated = observe(exports, "loaded.update()", context).context;
  const [completed, delivered] = model.completeListen(server, updated);
  expect(completed).toBe(server);
  expect(observe(exports, "loaded.verify()", delivered).value).toMatchObject({ value: true });
  expect((observe(exports, "loaded.calls()", delivered).value as { value?: number }).value).toBeUndefined();
  expect(resolveBoolean(getProperties(server as WithProperties, delivered).listening as TESBoolean,
    delivered.value.knowledge)).toBeUndefined();
  expect(getProperties(pending, delivered).delivered).toMatchObject({ value: true });
  expect(getProperties(pending, context).delivered).toMatchObject({ value: false });
  expect(observe(exports, "loaded.before()", context).value).toMatchObject({ value: true });
  for (const path of effectPaths(context.value.effects)) {
    const calls = path.events.filter(event => event.kind === "call" && event.call.operation === "http.server.bind");
    expect(calls).toHaveLength(1);
    expect(calls[0].call.receiver).toBe(server);
    expect(calls[0].call.args[0]).toMatchObject({ value: 8080 });
    expect(calls[0].call.args[1]).toBe(Undefined);
  }
});

test.each([true, false])("explicit-host binding waits for delivery before resolving its %s outcome", succeeds => {
  const error = addressInUse();
  const { model, exports, server, context } = load(`
    const server = require("http").createServer();
    let calls = 0, failed = false;
    server.on("error", function(error) { failed = error === bindingError; });
    const same = server.listen(8080, "127.0.0.1", function() { calls = calls + 1; }) === server;
    module.exports = { server: server, same: same,
      read: function() { return calls + ":" + failed + ":" + server.listening; } };
  `, (_call, branch) => [succeeds ? ESNull : error, branch], { bindingError: error });
  expect(getProperties(exports, context).same).toMatchObject({ value: true });
  expect(observe(exports, "loaded.read()", context).value).toMatchObject({ value: "0:false:false" });
  const pending = attempt(server, context);
  expect(getProperties(pending, context).outcome).toBe(Undefined);
  expect(effectPaths(context.value.effects)[0].events.some(event => event.call.operation === "http.server.bind")).toBe(false);
  const [completed, delivered] = model.completeListen(server, context);
  expect(completed).toBe(server);
  expect(observe(exports, "loaded.read()", delivered).value).toMatchObject({
    value: succeeds ? "1:false:true" : "0:true:false"
  });
  expect(getProperties(pending, delivered).outcome).toBe(succeeds ? ESNull : error);
  expect(getProperties(pending, context).outcome).toBe(Undefined);
  const bind = effectPaths(delivered.value.effects)[0].events.filter(event =>
    event.kind === "call" && event.call.operation === "http.server.bind");
  expect(bind).toHaveLength(1);
  expect(bind[0].call.receiver).toBe(server);
  expect(bind[0].call.args).toMatchObject([{ value: 8080 }, { value: "127.0.0.1" }]);
});

test("error listeners added or removed after listen affect delivery while an unhandled error keeps its identity", () => {
  const error = addressInUse();
  const { model, exports, server, context } = load(`
    const server = require("http").createServer();
    let caught = false;
    function handler(error) { caught = error === bindingError && this === server; }
    server.listen(8080);
    module.exports = { server: server, caught: function() { return caught; },
      add: function() { server.on("error", handler); }, remove: function() { server.off("error", handler); } };
  `, (_call, branch) => [error, branch], { bindingError: error });
  const pending = attempt(server, context);
  const [unhandled, failed] = model.completeListen(server, context);
  expect(isThrownValue(unhandled)).toBe(true);
  if (!isThrownValue(unhandled)) throw new Error("Expected unhandled bind error");
  expect(unhandled.value).toBe(error);
  expect(getProperties(pending, failed).delivered).toMatchObject({ value: true });
  expect(getProperties(pending, context).delivered).toMatchObject({ value: false });
  const added = observe(exports, "loaded.add()", context).context;
  const [handled, delivered] = model.completeListen(server, added);
  expect(handled).toBe(server);
  expect(observe(exports, "loaded.caught()", delivered).value).toMatchObject({ value: true });
  const removed = observe(exports, "loaded.remove()", added).context;
  const [removedResult] = model.completeListen(server, removed);
  expect(isThrownValue(removedResult)).toBe(true);
  if (!isThrownValue(removedResult)) throw new Error("Expected removed listener to leave error unhandled");
  expect(removedResult.value).toBe(error);
  expect(observe(exports, "loaded.caught()", added).value).toMatchObject({ value: false });
  expect(() => model.completeListen(server, failed)).toThrow(/HTTP|pending|deliver/i);
});

test("a consumed bind failure permits retry and retains the original once-listening callback", () => {
  const error = addressInUse();
  const { model, exports, server, context } = load(`
    const server = require("http").createServer();
    let calls = 0, failures = 0;
    server.on("error", function() { failures = failures + 1; });
    server.listen(8080, function() { calls = calls + 1; });
    module.exports = { server: server,
      retry: function() { return server.listen(0, function() { calls = calls + 10; }) === server; },
      read: function() { return calls + ":" + failures + ":" + server.listening; } };
  `, (call, branch) => [(call.args[0] as { value: number }).value === 8080 ? error : ESNull, branch]);
  const firstAttempt = attempt(server, context);
  const [completedFailure, failed] = model.completeListen(server, context);
  expect(completedFailure).toBe(server);
  expect(observe(exports, "loaded.read()", failed).value).toMatchObject({ value: "0:1:false" });
  const retried = observe(exports, "loaded.retry()", failed);
  expect(retried.value).toMatchObject({ value: true });
  const secondAttempt = attempt(server, retried.context);
  expect(secondAttempt).not.toBe(firstAttempt);
  expect(observe(exports, "loaded.read()", retried.context).value).toMatchObject({ value: "0:1:true" });
  const [, ready] = model.completeListen(server, retried.context);
  expect(observe(exports, "loaded.read()", ready).value).toMatchObject({ value: "11:1:true" });
  expect(getProperties(firstAttempt, context).delivered).toMatchObject({ value: false });
  expect(getProperties(firstAttempt, ready).delivered).toMatchObject({ value: true });
  expect(getProperties(secondAttempt, retried.context).delivered).toMatchObject({ value: false });
  expect(getProperties(secondAttempt, ready).delivered).toMatchObject({ value: true });
  const ports = effectPaths(ready.value.effects)[0].events.filter(event =>
    event.kind === "call" && event.call.operation === "http.server.bind").map(event => (event.call.args[0] as { value: number }).value);
  expect(ports).toEqual([8080, 0]);
});

test("retry before consuming a queued bind failure remains an explicit unsupported scheduling case", () => {
  const error = addressInUse();
  const { exports, server, context } = load(`
    const server = require("http").createServer(); server.listen(8080);
    module.exports = { server: server, retry: function() { return server.listen(0); } };
  `, (_call, branch) => [error, branch]);
  expect(() => observe(exports, "loaded.retry()", context)).toThrow(/HTTP|pending|deliver/i);
  expect(getProperties(attempt(server, context), context).delivered).toMatchObject({ value: false });
});

test("separate symbolic binds preserve independent outcomes instead of sharing one success flag", () => {
  const firstAllowed = ESBoolean(), secondAllowed = ESBoolean();
  const error = addressInUse();
  const { model, exports, server: first, context } = load(`
    const http = require("http"); const first = http.createServer(); const second = http.createServer();
    first.on("error", function() {}); second.on("error", function() {});
    first.listen(8080); second.listen(8081);
    module.exports = { server: first, second: second,
      proof: function() { return first.listening === firstAllowed && second.listening === secondAllowed; },
      same: function() { return first.listening === second.listening; } };
  `, (call, branch) => [selectValue((call.args[0] as { value: number }).value === 8080 ? firstAllowed : secondAllowed,
    ESNull, error), branch], { firstAllowed, secondAllowed });
  expect(observe(exports, "loaded.proof()", context).value).toMatchObject({ value: true });
  expect(resolveBoolean(observe(exports, "loaded.same()", context).value as TESBoolean, context.value.knowledge)).toBeUndefined();
  const second = getProperties(exports, context).second;
  const [, firstDelivered] = model.completeListen(first, context);
  const [, bothDelivered] = model.completeListen(second, firstDelivered);
  expect(observe(exports, "loaded.proof()", bothDelivered).value).toMatchObject({ value: true });
  expect(resolveBoolean(observe(exports, "loaded.same()", bothDelivered).value as TESBoolean,
    bothDelivered.value.knowledge)).toBeUndefined();
  expect(effectPaths(bothDelivered.value.effects)).toHaveLength(4);
});

test("an unhandled symbolic bind failure stays a possible throw rather than being merged into successful startup", () => {
  const succeeds = ESBoolean(), error = addressInUse();
  const { model, exports, server, context } = load(`
    const server = require("http").createServer(); let calls = 0;
    server.listen(8080, function() { calls = calls + 1; });
    module.exports = { server: server, calls: function() { return calls; } };
  `, (_call, branch) => [selectValue(succeeds, ESNull, error), branch]);
  const [completion] = model.completeListen(server, context);
  expect(isForkedCompletion(completion)).toBe(true);
  if (!isForkedCompletion(completion)) throw new Error("Expected conditional normal and throw completions");
  expect(completion.consequent[0]).toBe(server);
  expect(isThrownValue(completion.alternate[0])).toBe(true);
  if (!isThrownValue(completion.alternate[0])) throw new Error("Expected bind failure on alternate path");
  expect(completion.alternate[0].value).toBe(error);
  expect(observe(exports, "loaded.calls()", completion.consequent[1]).value).toMatchObject({ value: 1 });
  expect(observe(exports, "loaded.calls()", completion.alternate[1]).value).toMatchObject({ value: 0 });
  expect(observe(exports, "loaded.calls()", context).value).toMatchObject({ value: 0 });
});

test("retry started by the error listener retains its new pending attempt after the old error delivery returns", () => {
  const error = addressInUse();
  const { model, exports, server, context } = load(`
    const server = require("http").createServer(); let calls = 0;
    server.on("error", function() { server.listen(0, function() { calls = calls + 10; }); });
    server.listen(8080, function() { calls = calls + 1; });
    module.exports = { server: server, calls: function() { return calls; } };
  `, (call, branch) => [(call.args[0] as { value: number }).value === 8080 ? error : ESNull, branch]);
  const failedAttempt = attempt(server, context);
  const [returned, retried] = model.completeListen(server, context);
  expect(returned).toBe(server);
  const retryAttempt = attempt(server, retried);
  expect(retryAttempt).not.toBe(failedAttempt);
  expect(getProperties(failedAttempt, retried).delivered).toMatchObject({ value: true });
  expect(getProperties(retryAttempt, retried).delivered).toMatchObject({ value: false });
  expect(observe(exports, "loaded.calls()", retried).value).toMatchObject({ value: 0 });
  const [, ready] = model.completeListen(server, retried);
  expect(observe(exports, "loaded.calls()", ready).value).toMatchObject({ value: 11 });
  expect(getProperties(retryAttempt, ready).delivered).toMatchObject({ value: true });
});
