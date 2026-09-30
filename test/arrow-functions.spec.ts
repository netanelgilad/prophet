import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { symbolicNumberArray } from "../src/array/symbolic";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { mapCompletions } from "../src/evaluate";
import { getInferredSummaries } from "../src/Function/summaries";
import { resolveBoolean } from "../src/symbolic";
import { ESNumber, isThrownValue } from "../src/types";
import { compareModule } from "./commonjs/oracle";

// Complete local modules run independently in the pinned Node release and in
// Prophet. Test262 coverage below lives in its own complete-source corpus.
function compare(source: string) {
  const result = compareModule(`${source}\nmodule.exports = result;`);
  expect(result.loaded).toMatchObject({ type: "boolean", value: true });
  return result;
}

test("arrow expression bodies return values while block bodies require an explicit return", () => {
  compare(`
    const expression = value => value + 1;
    const block = value => { return value + 2; };
    const noReturn = value => { value + 3; };
    const empty = () => {};
    const object = value => ({ value: value });
    const result = expression(3) === 4 && block(3) === 5 &&
      noReturn(3) === undefined && empty() === undefined && object(7).value === 7;
  `);
});

test("arrow callbacks read current captured bindings after their creator returns", () => {
  compare(`
    function make() {
      let value = 1;
      const read = () => value;
      value = 2;
      return { read: read, change: next => { value = next; } };
    }
    const counter = make();
    const before = counter.read();
    counter.change(3);
    const result = before === 2 && counter.read() === 3;
  `);
});

test("method calls and Function.prototype.call cannot replace an arrow's lexical this", () => {
  compare(`
    const creator = { value: 17, make: function() { return () => this.value; } };
    const callback = creator.make();
    const other = { value: 99, callback: callback };
    const before = callback() === 17 && other.callback() === 17 && callback.call(other) === 17;
    creator.value = 23;
    const result = before && callback() === 23;
  `);
});

test("nested arrows keep the enclosing ordinary function's this through later calls", () => {
  compare(`
    function make() { return () => () => this; }
    const original = {};
    const outer = make.call(original);
    const inner = outer.call({});
    const result = inner.call({}) === original;
  `);
});

test("an ordinary function inside an arrow still receives its own call receiver", () => {
  compare(`
    const original = {};
    const other = {};
    function make() { return () => function() { return this; }; }
    const ordinary = make.call(original)();
    const result = ordinary.call(other) === other;
  `);
});

test("returning from another function restores this before a later arrow is created", () => {
  compare(`
    const original = {};
    const other = {};
    function visit() { return this; }
    function make() { visit.call(other); return () => this; }
    const result = make.call(original)() === original;
  `);
});

test("arrows preserve undefined and primitive this from strict enclosing functions without boxing", () => {
  compare(`
    function make() { "use strict"; return () => this; }
    const result = make()() === undefined && make.call(7)() === 7 &&
      make.call(null).call({}) === null;
  `);
});

test("arrow parameters and local declarations create their own bindings", () => {
  compare(`
    let value = 40;
    const run = value => {
      let inner = value + 1;
      function nested() { return inner; }
      return nested();
    };
    const result = run(1) === 2 && value === 40;
  `);
});

test("arrows do not introduce an implicit arguments binding over an explicitly named outer binding", () => {
  compare(`
    function make(arguments) { return () => arguments; }
    const result = make(17)(99) === 17;
  `);
});

test("arguments can be an arrow parameter or an explicit local binding in sloppy code", () => {
  compare(`
    const parameter = arguments => arguments;
    const lexical = () => { let arguments = 11; return arguments; };
    const variable = () => { var arguments = 13; return arguments; };
    const result = parameter(7) === 7 && lexical() === 11 && variable() === 13;
  `);
});

test("reading a captured implicit arguments object remains an explicit shared VM gap", () => {
  expect(() => evaluateCode(`
    function outer() { return () => arguments; }
    const read = outer(17);
    let caught = false;
    try { read(); } catch (error) { caught = true; }
  `, nodeInitialExecutionContext)).toThrow(/arguments objects/);
});

test("arrows inherit strictness from their enclosing code", () => {
  compare(`
    "use strict";
    let caught = false;
    const run = () => { undeclaredArrowTarget = 1; };
    try { run(); } catch (error) { caught = error.name === "ReferenceError"; }
    const result = caught && typeof undeclaredArrowTarget === "undefined";
  `);
});

test("an arrow's own strict directive governs its body while preserving lexical this", () => {
  compare(`
    function make() {
      return () => {
        "use strict";
        let caught = false;
        try { undeclaredArrowTarget = 1; } catch (error) { caught = error.name === "ReferenceError"; }
        return caught && this;
      };
    }
    const object = {};
    const result = make.call(object)() === object;
  `);
});

test("an arrow is callable but not constructible and initially has no own prototype", () => {
  compare(`
    let entered = false;
    const callback = () => { entered = true; };
    let caught = false;
    try { new callback(); } catch (error) { caught = error.name === "TypeError"; }
    const result = typeof callback === "function" && caught && !entered &&
      !Object.prototype.hasOwnProperty.call(callback, "prototype") && callback.prototype === undefined;
  `);
});

test("assigning an arrow a prototype property does not make it a constructor", () => {
  compare(`
    const callback = () => 1;
    callback.prototype = {};
    let caught = false;
    try { new callback(); } catch (error) { caught = error.name === "TypeError"; }
    const result = caught && Object.prototype.hasOwnProperty.call(callback, "prototype");
  `);
});

test("arrow creation does not evaluate default parameter initializers", () => {
  compare(`
    let calls = 0;
    function initialize() { calls = calls + 1; throw "must not run"; }
    const callback = (value = initialize()) => value;
    const result = calls === 0 && typeof callback === "function";
  `);
});

for (const [parameters, expected] of [
  ["", 0], ["first", 1], ["first, second", 2], ["first = 1, second", 0],
  ["first, second = 1, third", 1], ["first, ...rest", 1], ["{ value }", 1], ["[value]", 1]
] as Array<[string, number]>) {
  test(`arrow length reflects the parameter syntax without calling it: (${parameters})`, () => {
    compare(`const callback = (${parameters}) => 7; const result = callback.length === ${expected};`);
  });
}

for (const name of ["name", "caller", "arguments"]) {
  test(`arrow ${name} reads stay explicit gaps until name inference or restricted accessors are modeled`, () => {
    expect(() => evaluateCode(`const callback = () => 7; callback.${name};`, nodeInitialExecutionContext))
      .toThrow(/Unmodeled property read/);
  });
}

for (const name of ["name", "caller", "arguments", "length"]) {
  test(`arrow ${name} assignment cannot bypass unsupported property descriptors`, () => {
    expect(() => evaluateCode(`const callback = () => 7; callback.${name} = 17;`, nodeInitialExecutionContext))
      .toThrow(/Unmodeled host property write/);
  });
}

test("an arrow applies an identifier default when invoked without a value", () => {
  compare("const callback = (value = 1) => value; const result = callback() === 1 && callback(7) === 7;");
});

for (const parameters of ["...values", "{ value }", "[value]"]) {
  test(`unsupported arrow parameter initialization is an invocation gap: ${parameters}`, () => {
    const source = `const callback = (${parameters}) => 7;`;
    const [created, context] = evaluateCode(source, nodeInitialExecutionContext);
    expect(isThrownValue(created)).toBe(false);
    expect(isForkedCompletion(created)).toBe(false);
    expect(context.value.scope.callback).toMatchObject({ type: "function" });
    expect(() => evaluateCode(`
      let caught = false;
      try { callback(); } catch (error) { caught = true; }
    `, context)).toThrow(/parameter|binding pattern/i);
  });
}

test("async arrows remain an explicit function-kind gap even with no await", () => {
  expect(() => evaluateCode(`const callback = async () => 7;`, nodeInitialExecutionContext))
    .toThrow(/Async.*not yet supported/i);
});

test("conditional arrow calls preserve the branch condition and current captured values", () => {
  const selected = ESBoolean();
  const [completion, context] = evaluateCode(`
    let captured = 1;
    const first = () => captured;
    const second = () => captured + 1;
    captured = 10;
    const callback = selected ? first : second;
    const value = callback();
    const correct = selected ? value === 10 : value === 11;
    const uncertain = value === 10;
  `, setVariablesInScope(nodeInitialExecutionContext, { selected }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(resolveBoolean(context.value.scope.correct as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(context.value.scope.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("conditional arrow throws retain the path, captured mutation, and thrown completion", () => {
  const fails = ESBoolean();
  const result = evaluateCode(`
    let calls = 0;
    const callback = () => { calls = calls + 1; if (fails) throw "failure"; return 17; };
    const value = callback();
  `, setVariablesInScope(nodeInitialExecutionContext, { fails }));
  expect(isForkedCompletion(result[0])).toBe(true);
  mapCompletions(result, (completion, context) => {
    const failed = resolveBoolean(fails, context.value.knowledge);
    expect(failed).not.toBeUndefined();
    expect(isThrownValue(completion)).toBe(failed);
    expect(context.value.scope.calls).toMatchObject({ value: 1 });
    if (failed) expect(completion).toMatchObject({ type: "ThrownValue", value: { value: "failure" } });
    else expect(context.value.scope.value).toMatchObject({ value: 17 });
    return [completion, context];
  });
});

test("recursive arrow minimum uses the shared summary for an unknown-length nonempty dense finite-number array", () => {
  const element = ESNumber();
  element.knowledge = [{ kind: "finite", subject: element }];
  const input = symbolicNumberArray({ minimumLength: 1, element });
  const [completion, context] = evaluateCode(`
    const minimum = array => {
      if (array.length === 1) return array[0];
      const rest = minimum(array.slice(1));
      return array[0] < rest ? array[0] : rest;
    };
    const value = minimum(input);
    const belowMinimum = input[0] < value;
    const possiblySmaller = value < input[0];
    const repeatedProof = input[0] < minimum(input);
  `, setVariablesInScope(nodeInitialExecutionContext, { input }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(context.value.scope.belowMinimum).toMatchObject({ value: false });
  expect(context.value.scope.repeatedProof).toMatchObject({ value: false });
  expect(resolveBoolean(context.value.scope.possiblySmaller as ReturnType<typeof ESBoolean>, context.value.knowledge))
    .toBeUndefined();
  const summaries = getInferredSummaries(context.value.scope.minimum);
  expect(summaries).toHaveLength(1);
  expect(summaries[0].facts).toEqual(["finite", "notNaN", "lower"]);
  expect(summaries[0].applications).toBe(2);
});

test("a recursive arrow cannot hide a lexical-this dependency inside a pure array summary", () => {
  const element = ESNumber();
  element.knowledge = [{ kind: "finite", subject: element }];
  const input = symbolicNumberArray({ minimumLength: 1, element });
  const [, context] = evaluateCode(`
    const owner = { make: function() {
      const reduce = array => {
        if (this === undefined) return 0;
        if (array.length === 1) return array[0];
        return reduce(array.slice(1));
      };
      return reduce;
    } };
    const reduce = owner.make();
  `, setVariablesInScope(nodeInitialExecutionContext, { input }));
  expect(() => evaluateCode("const value = reduce(input);", context))
    .toThrow(/ThisExpression.*pure summary subset/);
  expect(getInferredSummaries(context.value.scope.reduce)).toEqual([]);
});
