import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { isThrownValue } from "../src/types";

const unsupportedKinds = [
  { syntax: "async function", method: "async callback", message: "Async functions are not yet supported" },
  { syntax: "function*", method: "*callback", message: "Generator functions are not yet supported" },
  { syntax: "async function*", method: "async *callback", message: "Async generator functions are not yet supported" }
];

for (const kind of unsupportedKinds) {
  // No await or yield is needed for these function kinds to have different
  // call/return behavior from an ordinary synchronous JavaScript function.
  test(`${kind.syntax} declarations never become ordinary synchronous functions`, () => {
    expect(() => evaluateCode(`
      ${kind.syntax} callback() { return 7; }
      const result = callback();
    `, nodeInitialExecutionContext)).toThrow(kind.message);
  });

  test(`${kind.syntax} anonymous expressions report their unsupported function kind`, () => {
    expect(() => evaluateCode(`
      const callback = ${kind.syntax}() { return 7; };
      const result = callback();
    `, nodeInitialExecutionContext)).toThrow(kind.message);
  });

  test(`${kind.syntax} named expressions report their unsupported function kind`, () => {
    expect(() => evaluateCode(`
      const callback = ${kind.syntax} named() { return 7; };
      const result = callback();
    `, nodeInitialExecutionContext)).toThrow(kind.message);
  });

  test(`${kind.syntax} object methods report their unsupported function kind`, () => {
    expect(() => evaluateCode(`
      const object = { ${kind.method}() { return 7; } };
      const result = object.callback();
    `, nodeInitialExecutionContext)).toThrow(kind.message);
  });
}

test("unsupported async function construction is an analysis gap, not a caught program exception", () => {
  expect(() => evaluateCode(`
    let caught = false;
    try {
      const callback = async function() { throw "failure"; };
      callback();
    } catch (error) { caught = true; }
  `, nodeInitialExecutionContext)).toThrow("Async functions are not yet supported");
});

test("ordinary declarations, expressions, named functions, and methods still execute", () => {
  const [completion, context] = evaluateCode(`
    function declared(value) { return value + 1; }
    const anonymous = function(value) { return value + 1; };
    const named = function named(value) { return value + 1; };
    const object = { method(value) { return value + 1; } };
    const result = object.method(named(anonymous(declared(3))));
  `, nodeInitialExecutionContext);
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(context.value.scope.result).toMatchObject({ value: 7 });
});

test("unreachable function expressions do not require their runtime behavior", () => {
  const [completion, context] = evaluateCode(`
    if (false) {
      const asyncCallback = async function() { return 1; };
      const generatorCallback = function*() { return 2; };
    }
    const result = 3;
  `, nodeInitialExecutionContext);
  expect(isThrownValue(completion)).toBe(false);
  expect(context.value.scope.result).toMatchObject({ value: 3 });
});

for (const syntax of ["async function", "function*", "async function*"]) {
  test(`${syntax} syntax errors are still detected before runtime function-kind support`, () => {
    expect(() => evaluateCode(`
      ${syntax} invalid(value) { let value; }
    `, nodeInitialExecutionContext)).toThrow(SyntaxError);
  });
}
