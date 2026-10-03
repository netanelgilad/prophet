import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { analysisFailureContext } from "../src/execution-context/analysis-failure";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { createConsoleModel } from "../src/node/console";
import { ESString } from "../src/string/String";
import { Any, ESNumber, isThrownValue, TESNumber } from "../src/types";

function run(source: string, input: { [name: string]: Any } = {}) {
  return evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, input));
}

test("Number retains its existing numeric passthrough including special and symbolic values", () => {
  for (const value of [0, -0, 1, NaN, Infinity, -Infinity, undefined]) {
    const input = ESNumber(value);
    const [completion, context] = run(`
      const alias = Number;
      const direct = Number(input);
      const indirect = alias.call(null, input);
      const fromPrototype = Number.prototype.constructor(input);
    `, { input });
    expect(isThrownValue(completion)).toBe(false);
    for (const name of ["direct", "indirect", "fromPrototype"]) {
      expect(context.value.scope[name]).toBe(input);
      expect(Object.is((context.value.scope[name] as TESNumber).value, value)).toBe(true);
    }
  }
});

test.each([
  "Number()", "Number(undefined)", "Number(null)", "Number(true)", "Number('1')",
  "Number({ valueOf: function() { return 1; } })",
  "Number.prototype.constructor('1')", "Number.call(null, '1')",
  "const alias = Number; alias('1')"
])("Number stops unsupported conversion instead of returning the input unchanged: %s", source => {
  expect(() => run(source)).toThrow("Number conversion is not yet supported");
});

test.each([
  "Number.MAX_VALUE", "Number.isFinite", "Number.prototype.valueOf",
  "Boolean.prototype.valueOf", "const alias = Number; alias.MAX_VALUE"
])("partial intrinsic API members do not become fabricated absent properties: %s", source => {
  expect(() => run(source)).toThrow(/not yet supported|unmodeled/i);
});

test.each([
  "new Number(1)", "new Boolean(false)",
  "const alias = Number; new alias(1)", "const alias = Boolean; new alias(false)",
  "const alias = Number.prototype.constructor; new alias(1)",
  "const alias = Boolean.prototype.constructor; new alias(false)"
])("boxed primitive construction remains an explicit boundary through aliases: %s", source => {
  expect(() => run(source)).toThrow("wrapper construction is not yet supported");
});

test("callable Boolean keeps its existing conversion behavior", () => {
  const [, context] = run(`
    const empty = Boolean();
    const absent = Boolean(undefined);
    const no = Boolean(0);
    const yes = Boolean("text");
    const fromPrototype = Boolean.prototype.constructor({});
  `);
  for (const name of ["empty", "absent", "no"]) expect(context.value.scope[name]).toMatchObject({ value: false });
  for (const name of ["yes", "fromPrototype"]) expect(context.value.scope[name]).toMatchObject({ value: true });
});

test("one concrete Function body remains supported through call and constructor aliases", () => {
  const [, context] = run(`
    const first = Function("return 7;")();
    const second = (new Function("return 8;"))();
    const third = Function.prototype.constructor("return 9;")();
    const fourth = String.constructor("return 10;")();
    const alias = function() {};
    const fifth = alias.constructor("return 11;")();
  `);
  ["first", "second", "third", "fourth", "fifth"].forEach((name, index) =>
    expect(context.value.scope[name]).toMatchObject({ value: index + 7 }));
});

test("concrete Function parameter lists use the final argument as the body and bind parameters", () => {
  const [, context] = run(`
    const first = Function("left", "right", "return left + right;")(2, 3);
    const second = (new Function("left, right", "return left * right;"))(4, 5);
    const third = Function.prototype.constructor("value", "return value;")(6);
    const fourth = String.constructor("value", "return value;")(7);
    const alias = function() {};
    const fifth = alias.constructor("value", "return value;")(8);
  `);
  expect(context.value.scope.first).toMatchObject({ value: 5 });
  expect(context.value.scope.second).toMatchObject({ value: 20 });
  expect(context.value.scope.third).toMatchObject({ value: 6 });
  expect(context.value.scope.fourth).toMatchObject({ value: 7 });
  expect(context.value.scope.fifth).toMatchObject({ value: 8 });
});

test.each([
  "Function()", "Function(1)", "Function(undefined)", "Function('a', 1)",
  "new Function('a', 1)", "Function.prototype.constructor('a', 1)",
  "String.constructor('a', 1)", "const alias = function() {}; alias.constructor('a', 1)"
])("dynamic Function rejects unmodeled argument forms without compiling the wrong body: %s", source => {
  expect(() => run(source)).toThrow("Function constructor requires concrete string arguments");
});

test("an unknown Function body remains unsupported rather than compiling the word undefined", () => {
  expect(() => run("Function(body)", { body: ESString() }))
    .toThrow("Function constructor requires concrete string arguments");
});

test.each(["Function('/*', '*/ return 7;')", "Function('a) { return 7; } //', 'return 1;')"])(
  "Function arguments cannot escape their separate parameter/body grammar boundaries: %s", source => {
    expect(() => run(source)).toThrow();
  });

test("constructor and conversion boundaries retain completed argument effects without running a catch", () => {
  for (const source of [
    'Number(console.log("argument"))',
    'new Number(console.log("argument"))',
    'new Boolean(console.log("argument"))',
    'Function("first", console.log("argument"))'
  ]) {
    const console = createConsoleModel();
    let failure: Error | undefined;
    try {
      run(`try { ${source}; } catch (error) { console.log("caught"); }`, { console: console.module });
    } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    const checkpoint = analysisFailureContext(failure)!;
    expect(checkpoint).toBeDefined();
    expect(console.inspectOutput(checkpoint)[0].chunks.map(chunk => chunk.value)).toEqual(["argument\n"]);
  }
});

test("ignored extra Number arguments still execute before the supported numeric passthrough", () => {
  const console = createConsoleModel();
  const [, context] = run('const result = Number(3, console.log("extra"));', { console: console.module });
  expect(context.value.scope.result).toMatchObject({ value: 3 });
  expect(console.inspectOutput(context)[0].chunks.map(chunk => chunk.value)).toEqual(["extra\n"]);
});
