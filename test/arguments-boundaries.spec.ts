import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESNumber, TESNumber } from "../src/types";

const unsupportedArguments = /Implicit arguments objects are not yet supported/;

describe("implicit arguments boundaries", () => {
  test.each([
    "return arguments;",
    "return typeof arguments;",
    "return arguments[0];",
    "var arguments; return arguments;",
    'return eval("arguments");',
    'return eval("typeof arguments");',
    'try { return arguments; } catch (error) { return "caught"; }'
  ])("reports the unmodeled object when it is actually read: %s", body => {
    // The wrapper receives a real argument, but modeling its arguments object
    // (including sloppy parameter aliases) remains an explicit language gap.
    expect(() => evaluateCode(`function inspect(value) { ${body} } inspect(17);`,
      nodeInitialExecutionContext)).toThrow(unsupportedArguments);
  });

  test("does not accidentally read a host-supplied or enclosing arguments binding", () => {
    const initial = setVariablesInScope(nodeInitialExecutionContext, { arguments: ESNumber(99) });
    expect(() => evaluateCode("function inspect() { return arguments; } inspect();", initial))
      .toThrow(unsupportedArguments);
    expect(() => evaluateCode(`
      function outer(arguments) {
        function inner() { return arguments; }
        return inner();
      }
      outer(99);
    `, nodeInitialExecutionContext)).toThrow(unsupportedArguments);
  });

  test("keeps the unsupported boundary in returned functions and dynamic eval", () => {
    const [, prepared] = evaluateCode(`
      function factory() {
        return function() { return eval("arguments"); };
      }
      const escaped = factory();
    `, nodeInitialExecutionContext);
    expect(() => evaluateCode("escaped(17);", prepared)).toThrow(unsupportedArguments);
  });

  test.each([
    "function inspect(arguments) { return arguments; }",
    "function inspect() { let arguments = 17; return arguments; }",
    "function inspect() { const arguments = 17; return arguments; }",
    "function inspect() { var arguments = 17; return arguments; }",
    "function inspect() { arguments = 17; return arguments; }",
    "function inspect() { return arguments(); function arguments() { return 17; } }",
    'function inspect() { eval("var arguments = 17"); return arguments; }',
    'function inspect() { eval("function arguments() { return 17; }"); return arguments(); }',
    "function inspect() { { let arguments = 17; return arguments; } }"
  ])("allows explicit bindings and replacements: %s", source => {
    const [, context] = evaluateCode(`${source} const result = inspect(17);`, nodeInitialExecutionContext);
    expect(context.value.uncaught).toBeUndefined();
    expect(context.value.scope.result).toMatchObject({ type: "number", value: 17 });
  });

  test.each([
    "if (guard) arguments = 17;",
    "if (!guard) arguments = 17;"
  ])("does not lose a possibly unmodeled object when joining paths: %s", assignment => {
    expect(() => evaluateCode(`
      function inspect(guard) { ${assignment} return arguments; }
      inspect(Math.random() < 0.5);
    `, nodeInitialExecutionContext)).toThrow(unsupportedArguments);
  });

  test("allows replacement on every path and unconditional replacement after a join", () => {
    const [, context] = evaluateCode(`
      const guard = Math.random() < 0.5;
      function inspect(guard) {
        if (guard) arguments = 17;
        else arguments = 23;
        return arguments;
      }
      function overwrite(guard) {
        if (guard) arguments = 17;
        arguments = 29;
        return arguments;
      }
      const result = inspect(guard);
      const proof = guard ? result === 17 : result === 23;
      const overwritten = overwrite(guard);
    `, nodeInitialExecutionContext);
    expect(context.value.uncaught).toBeUndefined();
    expect((context.value.scope.result as TESNumber).value).toBeUndefined();
    expect(context.value.scope.proof).toMatchObject({ value: true });
    expect(context.value.scope.overwritten).toMatchObject({ value: 29 });
  });

  test("reading a conditional assignment result does not read the implicit object", () => {
    const [, context] = evaluateCode(`
      function inspect(guard) { return guard ? (arguments = 17) : 23; }
      const guard = Math.random() < 0.5;
      const result = inspect(guard);
      const proof = guard ? result === 17 : result === 23;
    `, nodeInitialExecutionContext);
    expect(context.value.uncaught).toBeUndefined();
    expect(context.value.scope.proof).toMatchObject({ value: true });
  });
});
