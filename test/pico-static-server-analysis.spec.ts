import { readFileSync } from "fs";
import { join } from "path";
import { createCommonJSLoader, createHTTPModel, evaluateCode, isForkedCompletion,
  nodeInitialExecutionContext } from "../src";
import { isESFunction } from "../src/Function/Function";
import { ESObject } from "../src/Object";
import { effectPaths } from "../src/effects";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { isThrownValue } from "../src/types";

const packageDirectory = join(__dirname, "fixtures/pico-static-server-3.0.3/package");

function packageLoader() {
  const http = createHTTPModel();
  // These modules promise identity only. Any attempted member access stops
  // analysis. Loading an unused import does not establish API compatibility.
  const opaque = (name: string) => Object.assign(ESObject(), {
    unknownProperties: `Unimplemented Node ${name} API`,
    unmodeledOwnPropertyInspection: `Unimplemented Node ${name} descriptors`
  });
  return createCommonJSLoader({
    "/app/entry.cjs": 'module.exports = require("pico-static-server");',
    "/app/node_modules/pico-static-server/package.json": readFileSync(join(packageDirectory, "package.json"), "utf8"),
    "/app/node_modules/pico-static-server/index.js": readFileSync(join(packageDirectory, "index.js"), "utf8")
  }, { builtins: { http: http.module, https: opaque("https"), url: opaque("url"),
    fs: opaque("fs"), path: opaque("path") } });
}

test("the unmodified published static-server module loads its actual arrow factory", () => {
  const [factory, context] = packageLoader().load("/app/entry.cjs", nodeInitialExecutionContext);
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

for (const argument of ["", "undefined", '{ port: 0, protocol: "http", staticPath: "/site" }']) {
  test(`the real HTTP factory merges options and reaches the listen-overload gap: (${argument})`, () => {
    const [factory, context] = packageLoader().load("/app/entry.cjs", nodeInitialExecutionContext);
    // Evaluate the original default parameter and both object spreads. The
    // factory creates its server and registers its actual request callback, then
    // reaches listen(port, callback), whose omitted-host overload is unmodeled.
    // The template literal inside that deferred callback must not run yet.
    // This boundary is not successful startup or a caught program exception.
    expect(() => evaluateCode(`factory(${argument});`, setVariablesInScope(context, { factory })))
      .toThrow("HTTP analysis is not yet supported: listen requires (0, '127.0.0.1'[, callback])");
  });
}

test("overriding the real factory's protocol reaches the explicitly unmodeled HTTPS API", () => {
  const [factory, context] = packageLoader().load("/app/entry.cjs", nodeInitialExecutionContext);
  // A later spread overrides DEFAULT_OPTIONS.protocol. Preserve the actual
  // HTTPS import/branch; an opaque module identity is not an API model.
  expect(() => evaluateCode('factory({ protocol: "https" });', setVariablesInScope(context, { factory })))
    .toThrow("Unmodeled host property 'createServer': Unimplemented Node https API");
});
