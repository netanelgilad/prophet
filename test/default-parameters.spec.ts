import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { mapCompletions } from "../src/evaluate";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { resolveBoolean, selectValue } from "../src/symbolic";
import { ESNumber, isThrownValue, Undefined } from "../src/types";
import { compareModule } from "./commonjs/oracle";

function compare(source: string) {
  const result = compareModule(`${source}\nmodule.exports = result;`);
  expect(result.loaded).toMatchObject({ type: "boolean", value: true });
}

for (const kind of ["ordinary", "arrow"]) {
  const fn = (parameters: string, body: string) => kind === "arrow"
    ? `(${parameters}) => { ${body} }` : `function(${parameters}) { ${body} }`;

  test(`${kind} defaults run only for omitted or undefined arguments`, () => {
    compare(`
      let calls = 0;
      function initialize() { calls = calls + 1; return 9; }
      const run = ${fn("value = initialize()", "return value;")};
      const object = {};
      const nan = 0 / 0;
      const result = run() === 9 && run(undefined) === 9 && run(null) === null &&
        run(false) === false && run(0) === 0 && run("") === "" && run(object) === object &&
        run(nan) !== run(nan) && calls === 2;
    `);
  });

  test(`${kind} evaluates call arguments first and then initializes parameters left to right`, () => {
    compare(`
      let trace = "";
      function mark(label, value) { trace = trace + label; return value; }
      const run = ${fn('first = mark("first:", 1), second = mark("second:", first + 1)',
        'trace = trace + "body:"; return first === 1 && second === 2;')};
      const values = run(mark("arg1:", undefined), mark("arg2:", undefined));
      const result = values && trace === "arg1:arg2:first:second:body:";
    `);
  });

  test(`${kind} defaults can read earlier initialized parameters including an omitted plain parameter`, () => {
    compare(`
      const run = ${fn("first, second = first, third = second", "return third;")};
      const result = run(7) === 7 && run(undefined, 8) === 8 && run() === undefined;
    `);
  });

  for (const parameters of ["first = first", "first = second, second = 2", "first = typeof second, second = 2"]) {
    test(`${kind} parameters shadow outer bindings before initialization: ${parameters}`, () => {
      compare(`
        const first = 10;
        const second = 20;
        let entered = false;
        const run = ${fn(parameters, "entered = true;")};
        let caught = false;
        try { run(); } catch (error) { caught = error.name === "ReferenceError"; }
        const result = caught && !entered && first === 10 && second === 20;
      `);
    });
  }

  test(`${kind} an initializer throw preserves earlier work and skips later defaults and the body`, () => {
    compare(`
      let trace = "";
      const failure = {};
      function mark(label) { trace = trace + label; return 1; }
      function fail() { trace = trace + "throw:"; throw failure; }
      const run = ${fn('first = mark("first:"), second = fail(), third = mark("third:")', 'trace = trace + "body:";')};
      let caught = false;
      try { run(); } catch (error) { caught = error === failure; }
      const result = caught && trace === "first:throw:";
    `);
  });

  test(`${kind} body var starts with the parameter value but has a separate binding from a parameter closure`, () => {
    compare(`
      const run = ${fn("value = 1, read = () => value", `
        var value;
        const before = value;
        value = 2;
        return before === 1 && value === 2 && read() === 1;
      `)};
      const result = run();
    `);
  });

  test(`${kind} default object creation produces a fresh object on each invocation`, () => {
    compare(`
      const run = ${fn("value = {}", "return value;")};
      const first = run();
      const second = run();
      const provided = {};
      const result = first !== second && run(provided) === provided;
    `);
  });

  test(`${kind} copied body var bindings keep object identity while separating later reassignment`, () => {
    compare(`
      const run = ${fn("value = { count: 1 }, read = () => value", `
        var value;
        value.count = 2;
        const shared = read() === value && read().count === 2;
        value = { count: 3 };
        return shared && read().count === 2 && value.count === 3;
      `)};
      const result = run();
    `);
  });

  test(`${kind} closures created by defaults cannot see body var or function declarations`, () => {
    compare(`
      let value = "outside";
      function helper() { return "outer helper"; }
      const run = ${fn("read = () => value, call = () => helper()", `
        var value = "inside";
        function helper() { return "inner helper"; }
        return read() === "outside" && value === "inside" && call() === "outer helper" && helper() === "inner helper";
      `)};
      const result = run();
    `);
  });

  test(`${kind} body function declarations override body parameters without changing parameter closures`, () => {
    compare(`
      const run = ${fn("value = 1, read = () => value", `
        function value() { return 9; }
        return value() === 9 && read() === 1;
      `)};
      const result = run();
    `);
  });

  test(`${kind} parameter bindings without a matching body declaration remain shared with captured defaults`, () => {
    compare(`
      const run = ${fn("value = 1, read = () => value", "value = 2; return read() === 2;")};
      const result = run();
    `);
  });

  test(`${kind} defaults can capture a later parameter once it is initialized`, () => {
    compare(`
      const run = ${fn("read = () => later, later = 7", "later = 9; return read;")};
      const read = run();
      const result = read() === 9;
    `);
  });

  test(`${kind} explicit arguments parameters shadow the implicit or outer binding`, () => {
    compare(`
      const run = ${fn("arguments = 7, value = arguments", "return value;")};
      const result = run() === 7 && run(9) === 9;
    `);
  });

  for (const parameters of ['first = eval("var first = 3")', 'first = eval("var later = 3"), later = 7']) {
    test(`${kind} sloppy eval cannot redeclare a parameter during initialization: ${parameters}`, () => {
      compare(`
        let entered = false;
        const run = ${fn(parameters, "entered = true;")};
        let caught = false;
        try { run(); } catch (error) { caught = error.name === "SyntaxError"; }
        const result = caught && !entered;
      `);
    });
  }

  test(`${kind} a sloppy eval variable is visible to later defaults but separate from a body var`, () => {
    compare(`
      const run = ${fn('value = eval("var local = 3"), read = () => local',
        "var local = 4; return read() === 3 && local === 4;")};
      const result = run();
    `);
  });

  test(`${kind} strict eval variables do not escape into later defaults or the body`, () => {
    compare(`
      "use strict";
      const run = ${fn('value = eval("var local = 3"), read = () => typeof local',
        'return read() === "undefined" && typeof local === "undefined";')};
      const result = run();
    `);
  });

  test(`${kind} body eval creates its own var binding without changing a parameter closure`, () => {
    compare(`
      const run = ${fn("value = 1, read = () => value", 'eval("var value = 2"); return read() === 1 && value === 2;')};
      const result = run();
    `);
  });

  test(`${kind} a symbolic undefined argument controls both default execution and the returned value`, () => {
    const missing = ESBoolean();
    const supplied = selectValue(missing, Undefined, ESNumber(7));
    const [completion, context] = evaluateCode(`
      let defaults = 0;
      function initialize() { defaults = defaults + 1; return 11; }
      const run = ${fn("value = initialize()", "return value;")};
      const value = run(supplied);
      const correct = missing ? value === 11 && defaults === 1 : value === 7 && defaults === 0;
      const uncertain = value === 11;
    `, setVariablesInScope(nodeInitialExecutionContext, { missing, supplied }));
    expect(isThrownValue(completion)).toBe(false);
    expect(isForkedCompletion(completion)).toBe(false);
    expect(resolveBoolean(context.value.scope.correct as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
    expect(resolveBoolean(context.value.scope.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
  });

  test(`${kind} symbolic initializer throws preserve completion paths and earlier writes`, () => {
    const fails = ESBoolean();
    const result = evaluateCode(`
      let defaults = 0;
      let entered = false;
      function initialize() { defaults = defaults + 1; if (fails) throw "default failed"; return 17; }
      const run = ${fn("value = initialize()", "entered = true; return value;")};
      const value = run();
    `, setVariablesInScope(nodeInitialExecutionContext, { fails }));
    expect(isForkedCompletion(result[0])).toBe(true);
    mapCompletions(result, (completion, context) => {
      const failed = resolveBoolean(fails, context.value.knowledge);
      expect(failed).not.toBeUndefined();
      expect(isThrownValue(completion)).toBe(failed);
      expect(context.value.scope.defaults).toMatchObject({ value: 1 });
      expect(context.value.scope.entered).toMatchObject({ value: !failed });
      if (failed) expect(completion).toMatchObject({ type: "ThrownValue", value: { value: "default failed" } });
      else expect(context.value.scope.value).toMatchObject({ value: 17 });
      return [completion, context];
    });
  });

  test(`${kind} conditional eval variable creation remains an explicit binding-presence gap`, () => {
    const missing = ESBoolean();
    const supplied = selectValue(missing, Undefined, ESNumber(7));
    expect(() => evaluateCode(`
      const run = ${fn('value = eval("var local = 3")', "return typeof local;")};
      const observed = run(supplied);
    `, setVariablesInScope(nodeInitialExecutionContext, { missing, supplied })))
      .toThrow(/Conditional creation of bindings/);
  });
}

test("an unknown number is never confused with undefined when choosing defaults", () => {
  const supplied = ESNumber();
  const [completion, context] = evaluateCode(`
    let defaults = 0;
    function initialize() { defaults = defaults + 1; return 11; }
    const ordinary = function(value = initialize()) { return value; };
    const arrow = (value = initialize()) => value;
    const first = ordinary(supplied);
    const second = arrow(supplied);
    const uncertain = first === 17;
  `, setVariablesInScope(nodeInitialExecutionContext, { supplied }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(context.value.scope.defaults).toMatchObject({ value: 0 });
  expect(context.value.scope.first).toBe(supplied);
  expect(context.value.scope.second).toBe(supplied);
  expect(supplied.value).toBeUndefined();
  expect(resolveBoolean(context.value.scope.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("ordinary defaults see the call receiver while arrow defaults retain their lexical receiver", () => {
  compare(`
    const owner = { value: 17, make: function() { return (value = this.value) => value; } };
    const other = { value: 29 };
    const ordinary = function(value = this.value) { return value; };
    const arrow = owner.make();
    owner.value = 19;
    const result = ordinary.call(other) === 29 && arrow.call(other) === 19;
  `);
});

test("a skipped default does not require an implicit arguments object but reading it is still an explicit gap", () => {
  compare(`
    function run(value = arguments[0]) { return value; }
    const result = run(7) === 7;
  `);
  expect(() => evaluateCode(`
    function run(value = arguments[0]) { return value; }
    try { run(); } catch (error) {}
  `, nodeInitialExecutionContext)).toThrow(/arguments objects/);
});

test("eval redeclaration across an unmodeled implicit arguments binding stays an explicit gap", () => {
  expect(() => evaluateCode(`
    function run(value = eval("var arguments = 1")) { return value; }
    try { run(); } catch (error) {}
  `, nodeInitialExecutionContext)).toThrow(/arguments/);
});

for (const parameters of ["...values", "{ value } = {}", "[value] = []"]) {
  test(`unsupported rest/destructuring initialization remains an invocation gap: ${parameters}`, () => {
    const [, created] = evaluateCode(`const run = (${parameters}) => 7;`, nodeInitialExecutionContext);
    expect(created.value.scope.run).toMatchObject({ type: "function" });
    expect(() => evaluateCode("run();", created)).toThrow(/Destructur|parameter|binding pattern/i);
  });
}
