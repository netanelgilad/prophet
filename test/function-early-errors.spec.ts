import { evaluateCode, evaluateCodeAsExpression, nodeInitialExecutionContext } from "../src";
import { parseECMACompliant } from "../src/parseECMACompliant";
import { ESFunction } from "../src/Function/Function";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { Undefined } from "../src/types";
import { tuple } from "@deaven/tuple";

describe("function parameter and lexical declaration early errors", () => {
  test.each([
    "function inspect(value) { let value; }",
    "function inspect(value) { const value = 1; }",
    "function inspect(value) { class value {} }",
    "(function(value) { let value; });",
    'function inspect(value) { "use strict"; let value; }',
    "function inspect({ key: value }) { const value = 1; }",
    "function inspect([value]) { let value; }",
    "function inspect(value = 1) { let value; }",
    "function inspect(...value) { let value; }",
    "function inspect(value) { const { key: value } = {}; }",
    "function inspect(value) { let [value] = []; }",
    "function outer() { return function(value) { let value; }; }",
    "(value) => { let value; };",
    "({ method(value) { let value; } });"
  ])("rejects a collision before evaluation: %s", source => {
    expect(() => parseECMACompliant(source)).toThrow(SyntaxError);
    // Independent ordinary JavaScript compilation checks this is an early
    // error, without executing either function body.
    expect(() => Function(source)).toThrow(SyntaxError);
  });

  test("a collision in an uncalled function prevents all source effects", () => {
    let calls = 0;
    const initial = setVariablesInScope(nodeInitialExecutionContext, {
      mark: ESFunction(function*(_self, _args, context) {
        calls++;
        return tuple(Undefined, context);
      })
    });
    expect(() => evaluateCode(`
      mark();
      function neverCalled(value) { const value = 1; }
    `, initial)).toThrow(SyntaxError);
    expect(calls).toBe(0);
  });

  test("the expression entry point also uses shared early-error validation", () => {
    expect(() => evaluateCodeAsExpression("(function(value) { let value; });",
      nodeInitialExecutionContext)).toThrow(SyntaxError);
  });

  test("direct eval receives a catchable SyntaxError before its source effects", () => {
    const [, context] = evaluateCode(`
      let effect = 0;
      let errorName;
      try { eval("effect = 1; function invalid(value) { let value; }"); }
      catch (error) { errorName = error.name; }
    `, nodeInitialExecutionContext);
    expect(context.value.uncaught).toBeUndefined();
    expect(context.value.scope.effect).toMatchObject({ value: 0 });
    expect(context.value.scope.errorName).toMatchObject({ value: "SyntaxError" });
  });

  test("allows nested block shadowing without replacing the parameter", () => {
    const [, context] = evaluateCode(`
      function inspect(value) {
        let inner;
        { const value = 7; inner = value; }
        return inner + value;
      }
      const result = inspect(3);
    `, nodeInitialExecutionContext);
    expect(context.value.uncaught).toBeUndefined();
    expect(context.value.scope.result).toMatchObject({ value: 10 });
  });

  test.each([
    "function inspect(value) { var value; return value; }",
    "function inspect(value) { function value() {} }",
    "function inspect(value) { function nested() { let value; } }",
    "function inspect({ value: renamed }) { let value; }",
    "function inspect(value = other) { let other; }",
    "function inspect(value) { class Nested { method() { let value; } } }"
  ])("does not mistake other declarations or expression names for collisions: %s", source => {
    expect(() => parseECMACompliant(source)).not.toThrow();
    expect(() => Function(source)).not.toThrow();
  });
});
