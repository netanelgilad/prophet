import { createCommonJSLoader, evaluateCode, evaluateCommonJS, isForkedCompletion,
  nodeInitialExecutionContext } from "../src";
import { invoke } from "../src/ASTResolvers";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { createHostFunction } from "../src/effects";
import { ExecutionContext, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { BranchResult } from "../src/execution-context/branches";
import { ESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { Any, isThrownValue, Undefined } from "../src/types";

const locate = createHostFunction("source.location", (_call, context) => {
  const filename = context.value.sourceFile;
  return [filename === undefined ? Undefined : ESString(filename), context];
});

function initial(sourceFile?: string, inputs: { [name: string]: Any } = {}) {
  return ExecutionContext({ ...nodeInitialExecutionContext.value, sourceFile,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, locate, ...inputs }) });
}

function expectSource(context: TExecutionContext, sourceFile?: string) {
  expect(context.value.sourceFile).toBe(sourceFile);
}

function leaves(result: BranchResult): BranchResult[] {
  const [value] = result;
  return isForkedCompletion(value)
    ? leaves(value.consequent).concat(leaves(value.alternate)) : [result];
}

test("CommonJS top-level execution uses its normalized file and restores the embedding caller", () => {
  const [value, context] = evaluateCommonJS("module.exports = locate();",
    "/app/unused/../entry.cjs", initial("/embedding/driver.cjs"));
  expect(value).toMatchObject({ type: "string", value: "/app/entry.cjs" });
  expectSource(context, "/embedding/driver.cjs");
});

test("nested modules and cross-module function calls restore the enclosing module's source", () => {
  const loader = createCommonJSLoader({
    "/app/entry.cjs": `
      const before = locate();
      const fromDependency = require("./node_modules/pkg/index.cjs");
      const after = locate();
      const callbackSource = fromDependency();
      module.exports = before + "|" + after + "|" + callbackSource + "|" + locate();
    `,
    "/app/node_modules/pkg/index.cjs": `
      const loadedFrom = locate();
      module.exports = function() { return loadedFrom + ":" + locate(); };
    `
  });
  const [value, context] = loader.load("/app/entry.cjs", initial("/embedding/driver.cjs"));
  expect(value).toMatchObject({ value:
    "/app/entry.cjs|/app/entry.cjs|/app/node_modules/pkg/index.cjs:/app/node_modules/pkg/index.cjs|/app/entry.cjs" });
  expectSource(context, "/embedding/driver.cjs");
});

test("escaped closures and parameter initializers retain their defining source when the host invokes them later", () => {
  const [factory, loaded] = evaluateCommonJS(`
    module.exports = function() { return (location = locate()) => location + ":" + locate(); };
  `, "/app/node_modules/pkg/callback.cjs", initial());
  expectSource(loaded);
  const caller = ExecutionContext({ ...loaded.value, sourceFile: "/different/request.cjs" });
  const [callback, created] = invoke(factory, [], caller);
  expectSource(created, "/different/request.cjs");
  const [value, called] = invoke(callback, [], created);
  expect(value).toMatchObject({ value:
    "/app/node_modules/pkg/callback.cjs:/app/node_modules/pkg/callback.cjs" });
  expectSource(called, "/different/request.cjs");
});

test("throwing dependency calls restore the catching module's source", () => {
  const loader = createCommonJSLoader({
    "/app/entry.cjs": `
      let thrown;
      try { require("./failure.cjs"); } catch (error) { thrown = error; }
      module.exports = thrown + "|" + locate();
    `,
    "/app/failure.cjs": "throw locate();"
  });
  const [value, context] = loader.load("/app/entry.cjs", initial("/embedding/driver.cjs"));
  expect(value).toMatchObject({ value: "/app/failure.cjs|/app/entry.cjs" });
  expectSource(context, "/embedding/driver.cjs");
});

test("function and CommonJS mixed completions restore source on every normal and throwing leaf", () => {
  const selected = ESBoolean();
  const source = "/app/node_modules/pkg/mixed.cjs";
  const caller = initial("/embedding/driver.cjs", { selected });
  const [callback, loaded] = evaluateCommonJS(`
    module.exports = function() { if (selected) throw locate(); return locate(); };
  `, source, caller);
  const called = invoke(callback, [], loaded);
  expect(isForkedCompletion(called[0])).toBe(true);
  expectSource(called[1], "/embedding/driver.cjs");
  for (const [completion, context] of leaves(called)) {
    expect(isThrownValue(completion) ? completion.value : completion).toMatchObject({ value: source });
    expectSource(context, "/embedding/driver.cjs");
  }

  const moduleResult = evaluateCommonJS(`
    if (selected) throw locate();
    module.exports = locate();
  `, source, caller);
  expect(isForkedCompletion(moduleResult[0])).toBe(true);
  expectSource(moduleResult[1], "/embedding/driver.cjs");
  for (const [completion, context] of leaves(moduleResult)) {
    expect(isThrownValue(completion) ? completion.value : completion).toMatchObject({ value: source });
    expectSource(context, "/embedding/driver.cjs");
  }
});

test("functions created without source metadata never borrow a later caller's filename", () => {
  const [, created] = evaluateCode("const callback = function() { return locate(); };", initial());
  const [value, context] = invoke(created.value.scope.callback, [],
    ExecutionContext({ ...created.value, sourceFile: "/app/invoker.cjs" }));
  expect(value).toBe(Undefined);
  expectSource(context, "/app/invoker.cjs");
});

test("Function-generated source remains unknown instead of inheriting its creator's module filename", () => {
  const [callback, loaded] = evaluateCommonJS('module.exports = Function("return locate();");',
    "/app/node_modules/pkg/generated.cjs", initial("/embedding/driver.cjs"));
  const [value, context] = invoke(callback, [], loaded);
  expect(value).toBe(Undefined);
  expectSource(context, "/embedding/driver.cjs");
});

for (const expression of ['eval("locate()")', 'indirect("locate()")']) {
  test(`eval source is unknown during execution and restores its caller: ${expression}`, () => {
    const [value, context] = evaluateCommonJS(`
      const indirect = eval;
      const source = ${expression};
      module.exports = source === undefined && locate() === __filename;
    `, "/app/eval.cjs", initial("/embedding/driver.cjs"));
    expect(value).toMatchObject({ value: true });
    expectSource(context, "/embedding/driver.cjs");
  });
}

test("eval-created closures retain unknown source and mixed eval completions restore the enclosing module", () => {
  const [callback, loaded] = evaluateCommonJS(`
    module.exports = eval("(function() { return locate(); })");
  `, "/app/eval.cjs", initial("/embedding/driver.cjs"));
  const [value, context] = invoke(callback, [], loaded);
  expect(value).toBe(Undefined);
  expectSource(context, "/embedding/driver.cjs");

  const selected = ESBoolean();
  const [result, after] = evaluateCommonJS(`
    try { eval("if (selected) throw locate();"); } catch (error) {}
    module.exports = locate();
  `, "/app/eval.cjs", initial("/embedding/driver.cjs", { selected }));
  expect(result).toMatchObject({ value: "/app/eval.cjs" });
  expectSource(after, "/embedding/driver.cjs");
});
