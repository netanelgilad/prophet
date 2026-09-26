import { evaluateCode, nodeInitialExecutionContext } from "../src";
import {
  setVariablesInScope,
  TExecutionContext
} from "../src/execution-context/ExecutionContext";
import {
  Any, ESNumber, TESBoolean, TESNumber, isThrownValue, isUndefined
} from "../src/types";
import { isForkedCompletion } from "../src/execution-context/Completion";
import { resolveBoolean } from "../src/symbolic";

function run(source: string, initial: TExecutionContext = nodeInitialExecutionContext) {
  const [completion, context] = evaluateCode(source, initial);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(isThrownValue(completion)).toBe(false);
  expect(context.value.uncaught).toBeUndefined();
  return context.value.scope;
}

test("a captured throwing validator preserves accepted bounds and catch/finally correlation", () => {
  // Every finite input is allowed, including both interval boundaries and all
  // rejected values. The input is neither sampled nor restricted to the range.
  const input = ESNumber();
  input.knowledge = [{ kind: "finite", subject: input }];
  const initial = setVariablesInScope(nodeInitialExecutionContext, { input });
  const scope = run(`
    function range(low, high) {
      return function(value) {
        if (value < low || value > high) throw "range";
        return value;
      };
    }
    const validate = range(0, 10);
    let observed = -1;
    let caught = false;
    let finished = 0;
    try { observed = validate(input); }
    catch (error) { caught = error === "range"; }
    finally { finished = finished + 1; }
    const outside = input < 0 || input > 10;
    const correlated = outside
      ? caught && observed === -1
      : !caught && observed === input;
    const bounds = caught ? true : observed >= 0 && observed <= 10;
    const interior = caught ? true : observed > 0 && observed < 10;
    const boundaries = validate(0) === 0 && validate(10) === 10;
  `, initial);

  expect(scope.correlated).toMatchObject({ value: true });
  expect(scope.bounds).toMatchObject({ value: true });
  expect(scope.boundaries).toMatchObject({ value: true });
  expect(scope.finished).toMatchObject({ value: 1 });
  expect((scope.caught as TESBoolean).value).toBeUndefined();
  expect((scope.observed as TESNumber).value).toBeUndefined();
  expect((scope.interior as TESBoolean).value).toBeUndefined();
});

test("a throwing call in a binary expression preserves earlier effects and skips later operands", () => {
  const scope = run(`
    const guard = Math.random() < 0.5;
    let trace = "";
    let observed = 0;
    let caught = "";
    function left() { trace = trace + "L"; return 10; }
    function middle() { trace = trace + "M"; if (guard) throw "stop"; return 2; }
    function right() { trace = trace + "R"; return 3; }
    try { observed = left() + middle() + right(); }
    catch (error) { caught = error; }
    const proof = guard
      ? trace === "LM" && observed === 0 && caught === "stop"
      : trace === "LMR" && observed === 15 && caught === "";
  `);
  expect(scope.proof).toMatchObject({ value: true });
});

for (const [name, expression, observed] of [
  ["array", "[first(), middle(), last()]", "created[0] + created[1] + created[2]"],
  ["object", "{ first: first(), middle: middle(), last: last() }", "created.first + created.middle + created.last"]
]) {
  test(`a throwing ${name} initializer leaves the destination unchanged and skips later entries`, () => {
    const scope = run(`
      const guard = Math.random() < 0.5;
      let trace = "";
      let created = 0;
      let observed = 0;
      let caught = false;
      function first() { trace = trace + "A"; return 1; }
      function middle() { trace = trace + "B"; if (guard) throw "stop"; return 2; }
      function last() { trace = trace + "C"; return 3; }
      try { created = ${expression}; observed = ${observed}; }
      catch (error) { caught = error === "stop"; }
      const proof = guard
        ? trace === "AB" && created === 0 && observed === 0 && caught
        : trace === "ABC" && observed === 6 && !caught;
    `);
    expect(scope.proof).toMatchObject({ value: true });
  });
}

test("a throwing computed assignment key skips its right-hand side and evaluates the base once", () => {
  const scope = run(`
    const guard = Math.random() < 0.5;
    const box = { value: 0 };
    let trace = "";
    let caught = false;
    function base() { trace = trace + "B"; return box; }
    function key() { trace = trace + "K"; if (guard) throw "key"; return "value"; }
    function right() { trace = trace + "R"; return 9; }
    try { base()[key()] = right(); }
    catch (error) { caught = error === "key"; }
    const proof = guard
      ? trace === "BK" && box.value === 0 && caught
      : trace === "BKR" && box.value === 9 && !caught;
  `);
  expect(scope.proof).toMatchObject({ value: true });
});

test("a throwing argument preserves callee and earlier argument effects without invoking the callee", () => {
  const scope = run(`
    const guard = Math.random() < 0.5;
    let trace = "";
    let observed = 0;
    let caught = false;
    function consume(a, b, c) { trace = trace + "C"; return a + b + c; }
    function callee() { trace = trace + "F"; return consume; }
    function first() { trace = trace + "A"; return 1; }
    function middle() { trace = trace + "B"; if (guard) throw "stop"; return 2; }
    function last() { trace = trace + "D"; return 3; }
    try { observed = callee()(first(), middle(), last()); }
    catch (error) { caught = error === "stop"; }
    const proof = guard
      ? trace === "FAB" && observed === 0 && caught
      : trace === "FABDC" && observed === 6 && !caught;
  `);
  expect(scope.proof).toMatchObject({ value: true });
});

test("mixed completion propagates through nested returning wrappers", () => {
  const scope = run(`
    const guard = Math.random() < 0.5;
    let trace = "";
    let observed = 0;
    let caught = "";
    function leaf() { trace = trace + "L"; if (guard) throw "leaf"; return 5; }
    function middle() { const value = leaf(); trace = trace + "M"; return value + 1; }
    function outer() { return middle() + 1; }
    try { observed = outer(); trace = trace + "R"; }
    catch (error) { caught = error; }
    const proof = guard
      ? trace === "L" && observed === 0 && caught === "leaf"
      : trace === "LMR" && observed === 7 && caught === "";
  `);
  expect(scope.proof).toMatchObject({ value: true });
});

test("a conditionally throwing constructor preserves escaped receiver effects on both paths", () => {
  const scope = run(`
    const guard = Math.random() < 0.5;
    let allocated;
    let effects = 0;
    let caught = false;
    function Item() {
      allocated = this;
      effects = effects + 1;
      this.value = 1;
      if (guard) throw "construction";
      this.value = 2;
    }
    let instance = { value: 0 };
    try { instance = new Item(); }
    catch (error) { caught = error === "construction"; }
    const proof = guard
      ? instance.value === 0 && allocated.value === 1 && caught
      : instance === allocated && instance.value === 2 && !caught;
  `);
  expect(scope.proof).toMatchObject({ value: true });
  expect(scope.effects).toMatchObject({ value: 1 });
});

test("a finally return overrides either outcome of a partially throwing call exactly once", () => {
  const scope = run(`
    const guard = Math.random() < 0.5;
    let calls = 0;
    let finished = 0;
    function operation() { calls = calls + 1; if (guard) throw "inner"; return 2; }
    function replace() {
      try { return operation(); }
      finally { finished = finished + 1; return 8; }
    }
    const observed = replace();
  `);
  expect(scope.observed).toMatchObject({ value: 8 });
  expect(scope.calls).toMatchObject({ value: 1 });
  expect(scope.finished).toMatchObject({ value: 1 });
});

test("nested catches and a conditional finally throw preserve which exception wins", () => {
  const scope = run(`
    const guard = Math.random() < 0.5;
    const override = Math.random() < 0.5;
    let observed = 0;
    let caught = "";
    let finished = 0;
    function operation() { if (guard) throw "inner"; return 2; }
    function nested() {
      try {
        try { return operation(); }
        catch (error) { throw "wrapped"; }
      } finally {
        finished = finished + 1;
        if (override) throw "final";
      }
    }
    try { observed = nested(); }
    catch (error) { caught = error; }
    const proof = override ? observed === 0 && caught === "final"
      : guard ? observed === 0 && caught === "wrapped"
      : observed === 2 && caught === "";
    const uncertain = caught === "final";
  `);
  expect(scope.proof).toMatchObject({ value: true });
  expect(scope.finished).toMatchObject({ value: 1 });
  expect((scope.uncertain as TESBoolean).value).toBeUndefined();
});

test("an uncaught symbolic throw exposes separate completions and path-specific final state", () => {
  const [completion, merged] = evaluateCode(`
    const guard = Math.random() < 0.5;
    let progress = 0;
    function operation() {
      progress = progress + 1;
      if (guard) throw "top";
      return 5;
    }
    const value = operation();
    progress = progress + 10;
  `, nodeInitialExecutionContext);

  expect(isForkedCompletion(completion)).toBe(true);
  expect(merged.value.uncaught).toBeUndefined();
  let throws = 0;
  let normal = 0;
  const inspect = (value: Any, context: TExecutionContext): void => {
    if (isForkedCompletion(value)) {
      inspect(value.consequent[0], value.consequent[1]);
      inspect(value.alternate[0], value.alternate[1]);
      return;
    }
    const guard = resolveBoolean(context.value.scope.guard as TESBoolean, context.value.knowledge);
    if (isThrownValue(value)) {
      throws += 1;
      expect(value.value).toMatchObject({ value: "top" });
      expect(context.value.uncaught).toMatchObject({ value: "top" });
      expect(context.value.stderr).toBe("top");
      expect(context.value.scope.progress).toMatchObject({ value: 1 });
      expect(context.value.scope).not.toHaveProperty("value");
      expect(guard).toBe(true);
    } else {
      normal += 1;
      expect(isUndefined(value)).toBe(true);
      expect(context.value.uncaught).toBeUndefined();
      expect(context.value.stderr).toBe("");
      expect(context.value.scope.progress).toMatchObject({ value: 11 });
      expect(context.value.scope.value).toMatchObject({ value: 5 });
      expect(guard).toBe(false);
    }
  };
  inspect(completion, merged);
  expect(throws).toBe(1);
  expect(normal).toBe(1);
});

test("a throwing range validator does not invent bounds when the input may be NaN", () => {
  const source = `
    function validate(value) {
      if (value < 0 || value > 10) throw "range";
      return value;
    }
    let observed = -1;
    let caught = false;
    let finished = 0;
    try { observed = validate(input); }
    catch (error) { caught = error === "range"; }
    finally { finished = finished + 1; }
    const bounds = caught ? true : observed >= 0 && observed <= 10;
  `;
  // This contract includes NaN and infinities. NaN passes both rejection tests,
  // so accepted bounds must remain unknown even though finite inputs satisfy them.
  const symbolic = run(source, setVariablesInScope(nodeInitialExecutionContext, { input: ESNumber() }));
  expect((symbolic.bounds as TESBoolean).value).toBeUndefined();
  expect(symbolic.finished).toMatchObject({ value: 1 });

  const oracle = Function("input", source + "return { observed, caught, finished, bounds };");
  for (const input of [NaN, -Infinity, -1, -0, 0, 5, 10, 11, Infinity]) {
    const expected = oracle(input);
    const actual = run(source, setVariablesInScope(nodeInitialExecutionContext, { input: ESNumber(input) }));
    for (const name of ["observed", "caught", "finished", "bounds"]) {
      // Host execution checks concrete cases; it never supplies Prophet's proof.
      expect((actual[name] as TESNumber | TESBoolean).value).toBe(expected[name]);
    }
  }
});
