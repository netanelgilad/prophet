import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { isForkedCompletion } from "../src/execution-context/Completion";
import { Any, ESNumber, TESNumber, TESBoolean, isThrownValue } from "../src/types";
import { isFiniteNumber, notNaN, numberBounds } from "../src/symbolic";

function run(source: string, inputs: { [name: string]: Any } = {}) {
  const [completion, context] = evaluateCode(source,
    setVariablesInScope(nodeInitialExecutionContext, inputs));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(context.value.uncaught).toBeUndefined();
  return context.value.scope;
}

for (const [expression, low, high, expected] of [
  ["Math.random() * 10", 0, 10, false],
  ["Math.random() * 1000", 0, 10, undefined],
  ["Math.random() * 1000 + 11", 0, 10, true],
  ["Math.random() * -10", -10, 0, false],
  ["(Math.random() * 20 - 10) / 2", -5, 5, false]
] as Array<[string, number, number, boolean | undefined]>) {
  test(`a captured range validator analyzes ${expression}`, () => {
    const scope = run(`
      function range(low, high) {
        return function(value) {
          if (value < low || value > high) throw "range";
          return value;
        };
      }
      let d = false;
      try { range(${low}, ${high})(${expression}); }
      catch (error) { d = true; }
    `);
    expect(scope.d).toMatchObject({ type: "boolean" });
    expect((scope.d as TESBoolean).value).toBe(expected);
  });
}

test("a separate normalization function learns input bounds from its caller's branch", () => {
  const scope = run(`
    function normalize(value, low, high) {
      return (value - low) / (high - low);
    }
    let proof = true;
    if (input >= 20 && input <= 80) {
      const result = normalize(input, 20, 80);
      proof = result >= 0 && result <= 1;
    }
    const outside = normalize(input, 20, 80);
    const unproved = outside >= 0 && outside <= 1;
  `, { input: ESNumber() });
  expect(scope.proof).toMatchObject({ value: true });
  expect((scope.unproved as TESBoolean).value).toBeUndefined();
});

test("arithmetic preserves choices and uses the facts belonging to each path", () => {
  const scope = run(`
    const r = Math.random();
    const small = r < 0.5;
    const scaled = small ? r * 20 : r * -10;
    const proof = small ? scaled >= 0 && scaled <= 10 : scaled >= -10 && scaled <= -5;
    const unresolved = scaled > 0;
    const negated = -(+r);
    const signs = negated <= 0 && negated > -1;
  `);
  expect(scope.proof).toMatchObject({ value: true });
  expect(scope.signs).toMatchObject({ value: true });
  expect((scope.unresolved as TESBoolean).value).toBeUndefined();
});

test("operators distribute over guarded values with each guard's bounds", () => {
  const scope = run(`
    const r = Math.random();
    const small = r < 0.5;
    const chosen = small ? r : 1;
    const result = chosen * 20;
    const proof = small ? result >= 0 && result <= 10 : result === 20;
  `);
  expect(scope.proof).toMatchObject({ value: true });
});

test("bounds learned later do not yet refine an earlier arithmetic expression", () => {
  const scope = run(`
    const before = input * 2;
    let earlier = true;
    let later = true;
    if (input >= 0 && input <= 5) {
      earlier = before >= 0 && before <= 10;
      const after = input * 2;
      later = after >= 0 && after <= 10;
    }
  `, { input: ESNumber() });
  // This is a current precision gap, not a desired permanent restriction.
  expect((scope.earlier as TESBoolean).value).toBeUndefined();
  expect(scope.later).toMatchObject({ value: true });
});

test("strict input bounds do not become unsound strict output bounds after rounding", () => {
  const scope = run(`
    const rounded = 1 + Math.random() * 1e-20;
    const bounds = rounded >= 1 && rounded <= 1;
    const strictlyGreater = rounded > 1;
    const tiny = Math.random() * 5e-324;
    const tooStrict = tiny < 5e-324;
  `);
  expect(scope.bounds).toMatchObject({ value: true });
  expect(scope.strictlyGreater).toMatchObject({ value: false });
  expect((scope.tooStrict as TESBoolean).value).toBeUndefined();
  expect(0.75 * Number.MIN_VALUE).toBe(Number.MIN_VALUE);
});

test("overflow stays possible and finite operands do not justify a finite result", () => {
  const input = ESNumber();
  input.knowledge = [{ kind: "finite", subject: input }];
  const scope = run(`
    const doubled = input * 2;
    const sum = input + input;
    const difference = input - -input;
    const quotient = input / 0.5;
    const scaled = Math.random() * 1.7976931348623157e308 * 2;
    const within = scaled <= 1.7976931348623157e308;
    const reflexive = scaled === scaled;
    const invalid = scaled * 0;
    const maybeNaN = invalid === invalid;
  `, { input });
  for (const name of ["doubled", "sum", "difference", "quotient", "scaled"]) {
    expect(isFiniteNumber(scope[name] as TESNumber)).toBe(false);
    expect(notNaN(scope[name] as TESNumber)).toBe(true);
  }
  expect((scope.within as TESBoolean).value).toBeUndefined();
  expect(scope.reflexive).toMatchObject({ value: true });
  expect((scope.maybeNaN as TESBoolean).value).toBeUndefined();
});

test("possible NaN and zero denominators remain unconstrained", () => {
  const scope = run(`
    const unknownProduct = input * 0;
    const unknownSum = input + 1;
    const unknownDifference = input - input;
    const crossing = 1 / (Math.random() - 0.5);
    const touching = 1 / Math.random();
    const zeroOverZero = 0 / Math.random();
    const remainder = Math.random() % 0.1;
  `, { input: ESNumber() });
  for (const name of ["unknownProduct", "unknownSum", "unknownDifference", "crossing", "touching", "zeroOverZero", "remainder"]) {
    const result = scope[name] as TESNumber;
    expect(result.value).toBeUndefined();
    expect(numberBounds(result)).toEqual({ lower: undefined, upper: undefined });
    expect(notNaN(result)).toBe(false);
  }
});

test("an order interval containing zero does not choose its sign", () => {
  const input = ESNumber();
  input.knowledge = [
    { kind: "order", left: ESNumber(0), right: input, strict: false },
    { kind: "order", left: input, right: ESNumber(0), strict: false }
  ];
  const scope = run(`
    const zero = input * 2;
    const equal = zero === 0;
    const reciprocal = 1 / zero;
    const positive = reciprocal > 0;
  `, { input });
  expect(scope.equal).toMatchObject({ value: true });
  expect((scope.zero as TESNumber).value).toBeUndefined();
  expect((scope.positive as TESBoolean).value).toBeUndefined();
  expect(1 / (-0 * 2)).toBe(-Infinity);
  expect(1 / (0 * 2)).toBe(Infinity);
});
