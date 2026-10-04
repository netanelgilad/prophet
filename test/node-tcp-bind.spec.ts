import { createCommonJSLoader, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { readMember } from "../src/ASTResolvers";
import { effectPaths, HostModel } from "../src/effects";
import { TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties, ownPropertyPresence } from "../src/execution-context/Heap";
import { symbolicTCPBind } from "../src/node/bind";
import { createHTTPModel } from "../src/node/http";
import { ESString } from "../src/string/String";
import { choiceOf, resolveBoolean, strictEquality } from "../src/symbolic";
import { Any, ESNumber, isThrownValue, WithProperties } from "../src/types";

function start(source: string, bind: HostModel = symbolicTCPBind) {
  const model = createHTTPModel(undefined, { bind });
  const filename = "/app/symbolic-tcp-bind.cjs";
  const [exports, context] = createCommonJSLoader({ [filename]: source },
    { builtins: { http: model.module } }).load(filename, nodeInitialExecutionContext);
  expect(isThrownValue(exports)).toBe(false);
  expect(isForkedCompletion(exports)).toBe(false);
  return { model, exports: exports as WithProperties, context };
}

function outcome(server: Any, context: TExecutionContext) {
  const state = (server as { hostSlots: { [name: string]: WithProperties } }).hostSlots["node.http.server"];
  return getProperties(getProperties(state, context).pending as WithProperties, context).outcome;
}

// The default policy deliberately overapproximates binding failures. These
// checks preserve unknowns; they do not claim each field combination or outcome
// corresponds to a feasible operating-system failure.
test.each([
  [0, ""], [8080, ""], [8080, ', "127.0.0.1"']
] as Array<[number, string]>)("the symbolic bind policy retains unknown Error fields for listen(%s%s)", (port, host) => {
  const { model, exports, context } = start(`
    const server = require("http").createServer();
    const same = server.listen(${port}${host}) === server;
    module.exports = { server: server, same: same };
  `);
  const properties = getProperties(exports, context);
  const server = properties.server;
  expect(properties.same).toMatchObject({ value: true });
  const before = effectPaths(context.value.effects);
  expect(before).toHaveLength(1);
  expect(before[0].events.some(event => event.call.operation === "http.server.listening" ||
    event.call.operation === "http.server.error")).toBe(false);
  expect(before[0].events.filter(event => event.kind === "call" && event.call.operation === "http.server.bind"))
    .toHaveLength(host ? 0 : 1);
  const [completion] = model.completeListen(server, context);
  expect(isForkedCompletion(completion)).toBe(true);
  if (!isForkedCompletion(completion)) throw new Error("Expected success and unhandled-failure alternatives");
  expect(completion.consequent[0]).toBe(server);
  const failure = completion.alternate;
  expect(isThrownValue(failure[0])).toBe(true);
  if (!isThrownValue(failure[0])) throw new Error("Expected an unhandled Error on the failure branch");
  const error = failure[0].value as WithProperties;
  expect(error).toMatchObject({ type: "object", errorData: true });
  expect(readMember(error, "name", failure[1])[0]).toMatchObject({ type: "string", value: "Error" });
  const fields = getProperties(error, failure[1]);
  for (const name of ["code", "message"]) {
    expect(fields[name]).toMatchObject({ type: "string" });
    expect((fields[name] as { value?: string }).value).toBeUndefined();
  }
  expect(fields.errno).toMatchObject({ type: "number" });
  expect((fields.errno as { value?: number }).value).toBeUndefined();
  expect(fields.syscall).toMatchObject({ value: "listen" });
  expect(fields.address).toMatchObject({ type: "string" });
  expect((fields.address as { value?: string }).value).toBe(host ? "127.0.0.1" : undefined);
  expect(ownPropertyPresence(error, "port", failure[1])).toMatchObject({ value: port !== 0 });
  if (port !== 0) expect(fields.port).toMatchObject({ value: port });
  expect(resolveBoolean(strictEquality(fields.code, ESString("EADDRINUSE"), failure[1].value.knowledge),
    failure[1].value.knowledge)).toBeUndefined();
});

test("separate default-policy attempts receive independent unknown outcomes and errors before notification", () => {
  const { exports, context } = start(`
    const http = require("http"); const first = http.createServer(); const second = http.createServer();
    first.listen(8080); second.listen(8080);
    module.exports = { first: first, second: second };
  `);
  const properties = getProperties(exports, context);
  const first = choiceOf(outcome(properties.first, context));
  const second = choiceOf(outcome(properties.second, context));
  expect(first).toBeDefined();
  expect(second).toBeDefined();
  if (!first || !second) throw new Error("Expected two pending symbolic choices");
  expect(first.condition).not.toBe(second.condition);
  expect(first.alternate).not.toBe(second.alternate);
  expect(getProperties(first.alternate as WithProperties, context).code)
    .not.toBe(getProperties(second.alternate as WithProperties, context).code);
  const firstListening = getProperties(properties.first as WithProperties, context).listening;
  const secondListening = getProperties(properties.second as WithProperties, context).listening;
  expect(resolveBoolean(strictEquality(firstListening, secondListening, context.value.knowledge),
    context.value.knowledge)).toBeUndefined();
  expect(effectPaths(context.value.effects)).toHaveLength(1);
});

test("an invalid bind-model return stops analysis outside the application's try/catch", () => {
  expect(() => start(`
    const server = require("http").createServer();
    try { server.listen(8080); } catch (error) { module.exports = "caught"; }
  `, (_call, context) => [ESNumber(1), context])).toThrow(/bind environment must return null or an Error/);
});
test.each([null, false, 0, {}])("invalid explicit bind configuration cannot select assumed success: %p", bind => {
  expect(() => createHTTPModel(undefined, { bind: bind as any })).toThrow(/bind environment/);
});
