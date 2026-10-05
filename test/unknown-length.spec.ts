import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { symbolicNumberArray } from "../src/array/symbolic";
import { Array as ESArray, getArrayPrototype } from "../src/array/Array";
import { ESNumber, TESBoolean, TESNumber } from "../src/types";
import { randomNumber } from "../src/symbolic";
import { ESBuiltinFunction } from "../src/Function/Function";
import { FunctionBinding, Undefined } from "../src/types";
import { ESObject } from "../src/Object";
import { getInferredSummaries } from "../src/Function/summaries";

const minimum = `
  function reduce(a) {
    if (a.length === 1) return a[0];
    const rest = reduce(a.slice(1));
    return a[0] < rest ? a[0] : rest;
  }
`;
const maximum = `
  function choose(a) {
    if (a.length === 1) return a[0];
    const rest = choose(a.slice(1));
    if (a[0] > rest) return a[0];
    return rest;
  }
`;

function run(source: string, input = symbolicNumberArray({ minimumLength: 1, element: randomNumber() })) {
  const [, context] = evaluateCode(source,
    setVariablesInScope(nodeInitialExecutionContext, { input }));
  expect(context.value.uncaught).toBeUndefined();
  return context.value.scope;
}

test("unknown-length minimum is inferred from execution and reused", () => {
  const result = run(minimum + `
    const x = input[0] < reduce(input);
    const result = reduce(input);
    const proof = result <= input[0];
    const strict = result < input[0];
    const unrelated = Math.random() < result;
    const length = input.length;
  `);
  expect(result.x).toMatchObject({ value: false });
  expect(result.proof).toMatchObject({ value: true });
  expect((result.strict as TESBoolean).value).toBeUndefined();
  expect((result.unrelated as TESBoolean).value).toBeUndefined();
  expect(result.length).toMatchObject({ type: "number" });
  expect((result.length as TESNumber).value).toBeUndefined();
  const summaries = getInferredSummaries(result.reduce);
  expect(summaries).toHaveLength(1);
  expect(summaries[0].facts).toEqual(["finite", "notNaN", "lower"]);
  expect(summaries[0].proof).toEqual({ baseExecutions: 1, stepExecutions: 2, recursiveCalls: 2 });
  expect(summaries[0].applications).toBe(2);
});

test("the same inference discovers maximum expressed with if and early returns", () => {
  const result = run(maximum + `
    const result = choose(input);
    const proof = input[0] <= result;
    const wrong = result < input[0];
    const aboveMaximum = input[0] > result;
    const uncertain = result <= input[0];
  `);
  expect(result.proof).toMatchObject({ value: true });
  expect(result.wrong).toMatchObject({ value: false });
  expect(result.aboveMaximum).toMatchObject({ value: false });
  expect((result.uncertain as TESBoolean).value).toBeUndefined();
  const summaries = getInferredSummaries(result.choose);
  expect(summaries).toHaveLength(1);
  expect(summaries[0].facts).toEqual(["finite", "notNaN", "upper"]);
  expect(summaries[0].proof).toEqual({ baseExecutions: 1, stepExecutions: 2, recursiveCalls: 2 });
  expect(summaries[0].applications).toBe(1);
});

test("minimum and maximum keep separate summaries for the same unknown-length input", () => {
  const result = run(minimum + maximum + `
    const x = input[0] < reduce(input);
    const aboveMaximum = input[0] > choose(input);
    const strict = reduce(input) < input[0];
    const length = input.length;
  `);
  expect(result.x).toMatchObject({ value: false });
  expect(result.aboveMaximum).toMatchObject({ value: false });
  expect((result.strict as TESBoolean).value).toBeUndefined();
  expect((result.length as TESNumber).value).toBeUndefined();
  const [lower] = getInferredSummaries(result.reduce);
  const [upper] = getInferredSummaries(result.choose);
  expect(lower.facts).toEqual(["finite", "notNaN", "lower"]);
  expect(upper.facts).toEqual(["finite", "notNaN", "upper"]);
  expect(lower.applications).toBe(2);
  expect(upper.applications).toBe(1);
});

test("universal bounds cover later elements and slices without enumerating the array", () => {
  const input = symbolicNumberArray({ minimumLength: 100, element: randomNumber() });
  const result = run(minimum + `
    const value = reduce(input);
    const later = input[99] < value;
    const suffix = input.slice(20);
    const aliased = suffix[79] === input[99];
    const suffixProof = suffix[0] < value;
  `, input);
  expect(result.later).toMatchObject({ value: false });
  expect(result.aliased).toMatchObject({ value: true });
  expect(result.suffixProof).toMatchObject({ value: false });
  expect(getInferredSummaries(result.reduce)[0].proof.stepExecutions).toBe(2);
});

test("bounds are discarded when the body does not establish them", () => {
  for (const returned of ["a[0]", "rest", "a[0] + 1"]) {
    const result = run(minimum.replace("a[0] < rest ? a[0] : rest", returned) + `
      const value = reduce(input);
      const bound = value <= input[0];
    `);
    expect(getInferredSummaries(result.reduce)[0].facts).not.toContain("lower");
    expect(getInferredSummaries(result.reduce)[0].facts).not.toContain("upper");
    expect((result.bound as TESBoolean).value).toBeUndefined();
  }
});

test("invalid induction and unsupported effects are rejected before publishing facts", () => {
  const cases: Array<[string, RegExp]> = [
    [minimum.replace("a.slice(1)", "a"), /nonempty proper suffix/],
    [minimum.replace("a.slice(1)", "a.slice(0)"), /nonempty proper suffix/],
    [minimum.replace("a.slice(1)", "a.slice(2)"), /nonempty proper suffix/],
    [minimum.replace("a.length === 1", "a.length === 2"), /singleton case recurses/],
    [minimum.replace("const rest", "a[0] = 0; const rest"), /writes outside local/],
    ['var captured = 0; ' + minimum.replace("const rest", "captured = 1; const rest"), /writes outside local/],
    ['var captured = 0; ' + minimum.replace("return a[0];", "return captured;"), /captured binding/]
  ];
  for (const [source, error] of cases) {
    expect(() => run(source + "const value = reduce(input);")).toThrow(error);
  }
});

test("empty and possible-NaN inputs cannot borrow the nonempty finite contract", () => {
  expect(() => run(minimum + "const value = reduce(input);",
    symbolicNumberArray({ element: randomNumber() }))).toThrow(/known nonempty/);
  expect(() => run(minimum + "const value = reduce(input);",
    symbolicNumberArray({ minimumLength: 1, element: ESNumber() }))).toThrow(/exclude NaN/);
});

test("block bindings and shadowed local names retain the recursive proof", () => {
  const source = minimum.replace("const rest", `
    {
      const rest = a[0];
      const reduce = rest;
      { let a = reduce; a = 0; }
    }
    const rest
  `);
  const result = run(source + `
    const value = reduce(input);
    const proof = input[0] < value;
    const uncertain = value < input[0];
  `);
  expect(result.proof).toMatchObject({ value: false });
  expect((result.uncertain as TESBoolean).value).toBeUndefined();
  expect(getInferredSummaries(result.reduce)[0].facts).toEqual(["finite", "notNaN", "lower"]);
});

test("TDZ and const failures cannot acquire numeric summaries", () => {
  for (const source of [
    minimum.replace("if (a.length", "typeof rest; if (a.length"),
    minimum.replace("return a[0] < rest", "rest = a[0]; return a[0] < rest")
  ]) {
    // The shared VM now executes the lexical error. A numeric recursive summary
    // cannot describe this throwing function; exception summaries remain a gap.
    expect(() => run(source + "const value = reduce(input);")).toThrow(/all paths must return a number/);
  }
});

test("unmodeled array properties and method identities cannot steer a cached proof", () => {
  const source = minimum.replace("return a[0] < rest", "if (a.slice === a.slice(1).slice) return a[0]; return a[0] < rest");
  expect(() => run(source + "const value = reduce(input);")).toThrow(/property dependencies/);
  const stringRead = minimum.replace("return a[0] < rest", 'if ("x"[0]) return a[0]; return a[0] < rest');
  expect(() => run(stringRead + "const value = reduce(input);")).toThrow(/verified symbolic array receiver/);
});

test("unknown and segmented array representations do not fabricate undefined reads", () => {
  for (const input of [ESArray(), ESArray([ESArray([ESNumber(1)]), ESArray()], "segments")]) {
    expect(() => evaluateCode("const result = input[0] === undefined;",
      setVariablesInScope(nodeInitialExecutionContext, { input }))).toThrow(/known element positions/);
  }
});

test("symbolic snapshots reject writes and concrete arrays retain ordinary execution", () => {
  expect(() => run(minimum + "const value = reduce(input); input[0] = -1;")).toThrow(/symbolic array snapshots/);
  const [, context] = evaluateCode(minimum + `
    const d = [1, 2];
    const value = reduce(d);
    d[0] = -1;
    const result = d[0] < value;
  `, nodeInitialExecutionContext);
  expect(context.value.scope.result).toMatchObject({ value: true });
  expect(getInferredSummaries(context.value.scope.reduce)).toEqual([]);
});

test("summary trust follows the exact inherited slice intrinsic and rejects shadowing or custom lookup", () => {
  const fresh = () => symbolicNumberArray({ minimumLength: 1, element: randomNumber() });
  const intrinsic = getArrayPrototype().properties.slice as FunctionBinding;
  const shadowed = fresh();
  // Even a different embedding function carrying the same native implementation
  // is not the shared guarded intrinsic identity used during verification.
  Object.assign(shadowed.properties, { slice: ESBuiltinFunction(intrinsic.function.implementation) });
  const missing = fresh(); Object.assign(missing.properties, { slice: Undefined });
  const custom = Object.assign(fresh(), { prototype: ESObject() });
  const hooked = Object.assign(fresh(), { propertyAccess: {
    read() { throw new Error("unverified lookup must not execute"); }, write() { return undefined; }
  } });
  for (const input of [shadowed, missing, custom, hooked]) {
    expect(() => run(minimum + "const value = reduce(input);", input)).toThrow(/trusted slice implementation/);
  }
});
