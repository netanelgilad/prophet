import { readFileSync } from "fs";
import { join } from "path";
import { createCommonJSLoader, createHTTPModel, evaluateCode, isForkedCompletion,
  nodeInitialExecutionContext } from "../src";
import { isESFunction } from "../src/Function/Function";
import { ESObject } from "../src/Object";
import { effectPaths } from "../src/effects";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { isThrownValue, WithProperties } from "../src/types";

const packageDirectory = join(__dirname, "fixtures/pico-static-server-3.0.3/package");

function packageLoader() {
  const http = createHTTPModel();
  // These modules promise identity only. Any attempted member access stops
  // analysis. Loading an unused import does not establish API compatibility.
  const opaque = (name: string) => Object.assign(ESObject(), {
    unknownProperties: `Unimplemented Node ${name} API`,
    unmodeledOwnPropertyInspection: `Unimplemented Node ${name} descriptors`
  });
  const context = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties,
      console: opaque("console") }, "unmodeled") });
  const loader = createCommonJSLoader({
    "/app/entry.cjs": 'module.exports = require("pico-static-server");',
    "/app/node_modules/pico-static-server/package.json": readFileSync(join(packageDirectory, "package.json"), "utf8"),
    "/app/node_modules/pico-static-server/index.js": readFileSync(join(packageDirectory, "index.js"), "utf8")
  }, { builtins: { http: http.module, https: opaque("https"), url: opaque("url"),
    fs: opaque("fs"), path: opaque("path") } });
  return { http, loader, context };
}

test("the unmodified published static-server module loads its actual arrow factory", () => {
  const setup = packageLoader();
  const [factory, context] = setup.loader.load("/app/entry.cjs", setup.context);
  expect(isThrownValue(factory)).toBe(false);
  expect(isForkedCompletion(factory)).toBe(false);
  expect(isESFunction(factory)).toBe(true);
  // Importing the factory must not create/listen to a server or read files.
  expect(context.value.effects ? effectPaths(context.value.effects).some(path => path.events.length > 0) : false).toBe(false);
  const [completion, result] = evaluateCode(`
    const callable = typeof factory === "function";
    const noPrototype = !Object.prototype.hasOwnProperty.call(factory, "prototype");
  `, setVariablesInScope(context, { factory }));
  expect(isThrownValue(completion)).toBe(false);
  expect(result.value.scope.callable).toMatchObject({ value: true });
  expect(result.value.scope.noPrototype).toMatchObject({ value: true });
});

for (const [argument, port] of [
  ["", 8080], ["undefined", 8080], ['{ port: 0, protocol: "http", staticPath: "/site" }', 0]
] as Array<[string, number]>) {
  test(`the unchanged HTTP factory returns its server before its deferred console boundary: (${argument})`, () => {
    const setup = packageLoader();
    const [factory, context] = setup.loader.load("/app/entry.cjs", setup.context);
    // Assume successful wildcard binding in the model's primary process; no
    // real socket is opened. Address allocation and bind failures are not proved.
    // No source rewriting or extracted handler: defaults, spreads, the real
    // listener registration, and listen(port, callback) execute in the VM.
    const [completion, result] = evaluateCode(`const server = factory(${argument});`,
      setVariablesInScope(context, { factory }));
    expect(isThrownValue(completion)).toBe(false);
    expect(isForkedCompletion(completion)).toBe(false);
    const server = result.value.scope.server;
    expect(server).toMatchObject({ type: "object" });
    expect(getProperties(server as WithProperties, result).listening).toMatchObject({ value: true });

    const paths = effectPaths(result.value.effects!);
    expect(paths).toHaveLength(1);
    const events = paths[0].events;
    expect(events.map(event => `${event.kind}:${event.call.operation}`)).toEqual([
      "call:http.createServer", "return:http.createServer",
      "call:http.server.listen", "return:http.server.listen"
    ]);
    const created = events[1], listened = events[3];
    expect(created.kind === "return" && created.value).toBe(server);
    expect(listened.kind === "return" && listened.value).toBe(server);
    expect(events[0].call.args).toHaveLength(1);
    expect(isESFunction(events[0].call.args[0])).toBe(true);
    expect(events[2].call.receiver).toBe(server);
    expect(events[2].call.args).toHaveLength(2);
    expect(events[2].call.args[0]).toMatchObject({ value: port });
    expect(isESFunction(events[2].call.args[1])).toBe(true);

    // Deliver the registered callback through the HTTP lifecycle. Its console
    // member lookup precedes the template argument, and remains an analysis gap.
    // Returning from the factory is not successful callback/request analysis.
    expect(() => setup.http.completeListen(server, result))
      .toThrow("Unmodeled host property 'log': Unimplemented Node console API");
  });
}

test("overriding the real factory's protocol reaches the explicitly unmodeled HTTPS API", () => {
  const setup = packageLoader();
  const [factory, context] = setup.loader.load("/app/entry.cjs", setup.context);
  // A later spread overrides DEFAULT_OPTIONS.protocol. Preserve the actual
  // HTTPS import/branch; an opaque module identity is not an API model.
  expect(() => evaluateCode('factory({ protocol: "https" });', setVariablesInScope(context, { factory })))
    .toThrow("Unmodeled host property 'createServer': Unimplemented Node https API");
});
