import { execFileSync } from "child_process";
import {
  evaluateCode, hasExecutionBoundary, isExecutionBoundary, isForkedCompletion,
  isThrownValue, nodeInitialExecutionContext
} from "../src";
import { symbolicArrayRegion, symbolicNumberArray } from "../src/array/symbolic";
import { Array as ESArray } from "../src/array/Array";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { createConsoleModel } from "../src/node/console";
import { createOpaqueHostFunction } from "../src/node/opaque";
import { ESNumber, TESBoolean, TESNumber } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

const nodeBinary = process.env.PROPHET_NODE_BINARY || process.execPath;

const minimum = `
  function reduce(a) {
    let best = a[0];
    for (let i = 1; i < a.length; i++) {
      if (a[i] < best) best = a[i];
    }
    return best;
  }
`;
const maximum = `
  function highest(a) {
    let best = a[0];
    for (let i = 1; i < a.length; i++) {
      if (a[i] > best) best = a[i];
    }
    return best;
  }
`;

// Arbitrary finite elements in [-20, 30], including values outside Math.random's
// [0, 1) contract. The array constructor clones these local facts per element.
function finiteElement(): TESNumber {
  const element = ESNumber();
  element.knowledge = [
    { kind: "finite", subject: element },
    { kind: "order", left: ESNumber(-20), right: element, strict: false },
    { kind: "order", left: element, right: ESNumber(30), strict: false }
  ];
  return element;
}

function input(minimumLength = 1, maximumLength = 64) {
  return symbolicNumberArray({ minimumLength, maximumLength, element: finiteElement() });
}

function scope(source: string, array = input()) {
  const [completion, context] = evaluateCode(source,
    setVariablesInScope(nodeInitialExecutionContext, { input: array }));
  // A stopped path, exception or mixed fork is not a proof result.
  expect(hasExecutionBoundary(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(isThrownValue(completion)).toBe(false);
  expect(context.value.uncaught).toBeUndefined();
  return context.value.scope;
}

function native(source: string, observation: string) {
  assertPinnedNode();
  return JSON.parse(execFileSync(nodeBinary,
    ["-e", `${source}\nprocess.stdout.write(JSON.stringify(${observation}));`],
    { encoding: "utf8", timeout: 10000,
      env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } }));
}

test("native finite witnesses show strict reverse and unrelated order can go either way", () => {
  const observe = "{ forward: a[0] < reduce(a), reverse: reduce(a) < a[0], outside: x < reduce(a) }";
  expect(native(minimum + "const a = [2, 8]; const x = 1;", observe))
    .toEqual({ forward: false, reverse: false, outside: true });
  expect(native(minimum + "const a = [8, 2]; const x = 9;", observe))
    .toEqual({ forward: false, reverse: true, outside: false });
  // These are countermodels for unknown observations, never induction evidence.
});

test("native concrete finite and exceptional values preserve the loop's actual selection", () => {
  const cases: Array<[string, string, boolean]> = [
    ["[7]", "7", true], ["[-5, 3, -10, 0]", "-10", true],
    ["[0 / 0, 1]", "NaN", false], ["[1, 0 / 0]", "1", true],
    ["[]", "undefined", false], ["[, 1]", "undefined", false],
    ["[1 / 0, 2]", "2", true], ["[-1 / 0, 2]", "-Infinity", true],
    ["[0, -0]", "+0", true], ["[-0, 0]", "-0", true]
  ];
  for (const [literal, expected, lower] of cases) {
    const result = native(minimum + `const a = ${literal}; const best = reduce(a);`,
      `{ value: best === undefined ? "undefined" : Number.isNaN(best) ? "NaN" :
         Object.is(best, -0) ? "-0" : Object.is(best, 0) ? "+0" : String(best),
         lower: best <= a[0], forward: a[0] < best }`);
    expect(result).toEqual({ value: expected, lower, forward: false });
  }
});

test("Prophet concrete loop observations agree with pinned Node edge cases", () => {
  const cases = ["[7]", "[-5, 3, -10, 0]", "[0 / 0, 1]", "[1, 0 / 0]",
    "[]", "[, 1]", "[1 / 0, 2]", "[-1 / 0, 2]", "[0, -0]", "[-0, 0]"];
  const tag = (value: unknown): string => value === undefined ? "undefined" :
    typeof value === "number" && Number.isNaN(value) ? "NaN" :
    Object.is(value, -0) ? "-0" : Object.is(value, 0) ? "+0" : String(value);
  for (const literal of cases) {
    const observed = native(minimum + `const a = ${literal}; const best = reduce(a);`,
      `{ value: best === undefined ? "undefined" : Number.isNaN(best) ? "NaN" :
         Object.is(best, -0) ? "-0" : Object.is(best, 0) ? "+0" : String(best),
         lower: best <= a[0], forward: a[0] < best }`);
    const [completion, context] = evaluateCode(minimum + `
      const a = ${literal}; const best = reduce(a);
      const lower = best <= a[0], forward = a[0] < best;
    `, nodeInitialExecutionContext);
    expect(hasExecutionBoundary(completion)).toBe(false);
    expect(isForkedCompletion(completion)).toBe(false);
    expect(isThrownValue(completion)).toBe(false);
    expect({ value: tag((context.value.scope.best as TESNumber).value),
      lower: (context.value.scope.lower as TESBoolean).value,
      forward: (context.value.scope.forward as TESBoolean).value }).toEqual(observed);
  }
});

test("a guarded symbolic index reads an actual member of the same array snapshot", () => {
  // Representation prerequisite for an arbitrary loop transition. The index is
  // an integer in [1, 2], and the dense array has at least three elements.
  const index = ESNumber();
  index.knowledge = [
    { kind: "integer", subject: index },
    { kind: "order", left: ESNumber(1), right: index, strict: false },
    { kind: "order", left: index, right: ESNumber(2), strict: false }
  ];
  const [completion, context] = evaluateCode(`
    const chosen = input[index];
    const range = chosen >= -20 && chosen <= 30;
    const alias = chosen === input[1] || chosen === input[2];
  `, setVariablesInScope(nodeInitialExecutionContext, { input: input(3, 64), index }));
  expect(hasExecutionBoundary(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(isThrownValue(completion)).toBe(false);
  expect(context.value.scope.range).toMatchObject({ value: true });
  expect(context.value.scope.alias).toMatchObject({ value: true });
});

test("a 1025-or-1026 element loop requires induction beyond the ordinary body cap", () => {
  // Constant element values keep ordinary branch volume small. The length is
  // still genuinely unknown and exceeds the ordinary 1024-body-entry budget.
  const array = symbolicNumberArray({ minimumLength: 1025, maximumLength: 1026,
    element: ESNumber(7) });
  const result = scope(minimum + `
    const best = reduce(input);
    const claim = input[0] < best;
    const length = input.length;
  `, array);
  expect(result.claim).toMatchObject({ value: false });
  expect((result.length as TESNumber).value).toBeUndefined();
});

test("unknown length minimum proves the first and guaranteed later members", () => {
  // Dense immutable finite-number array, 1 <= length <= 64. The 0th index is
  // present on every path; neither exact length nor element values are known.
  const result = scope(minimum + `
    const best = reduce(input);
    const first = input[0] < best;
    const lower = best <= input[0];
    const reverse = best < input[0];
  `, input());
  expect(result.first).toMatchObject({ value: false });
  expect(result.lower).toMatchObject({ value: true });
  expect((result.reverse as TESBoolean).value).toBeUndefined();
});

test("the default uint32 length domain proves a nonconstant finite-element minimum", () => {
  const array = symbolicNumberArray({ minimumLength: 1, element: finiteElement() });
  const result = scope(minimum + `
    const best = reduce(input);
    const first = input[0] < best;
    const lower = best <= input[0];
  `, array);
  expect(result.first).toMatchObject({ value: false });
  expect(result.lower).toMatchObject({ value: true });
  expect(array.shape.sequence.indexedReads.size).toBeLessThan(8);
});

test("a counter declared before the loop retains its proved observable exit value", () => {
  const source = minimum.replace("for (let i = 1; i < a.length; i++)", "let i = 1; for (; i < a.length; i++)")
    .replace("return best;", "return i;");
  const result = scope(source + `
    const count = reduce(input);
    const exact = count === input.length;
  `, input(2, 64));
  expect(result.exact).toMatchObject({ value: true });
});

test("distinct calls verify their reached parameter state without a reusable summary", () => {
  const source = `function choose(a, high) {
    let best = a[0];
    for (let i = 1; i < a.length; i++) {
      if (high ? a[i] > best : a[i] < best) best = a[i];
    }
    return best;
  }`;
  const result = scope(source + `
    const low = choose(input, false), high = choose(input, true);
    const lowClaim = input[0] < low;
    const highClaim = input[0] > high;
  `, input(2, 40));
  expect(result.lowClaim).toMatchObject({ value: false });
  expect(result.highClaim).toMatchObject({ value: false });
});

test("changing the array binding between calls uses each reached snapshot", () => {
  const first = input(2, 64), second = input(2, 64);
  const [completion, context] = evaluateCode(minimum + `
    let active = first;
    const low = reduce(active);
    active = second;
    const next = reduce(active);
    const firstClaim = first[0] < low;
    const secondClaim = second[0] < next;
  `, setVariablesInScope(nodeInitialExecutionContext, { first, second }));
  expect(hasExecutionBoundary(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(isThrownValue(completion)).toBe(false);
  expect(context.value.scope.firstClaim).toMatchObject({ value: false });
  expect(context.value.scope.secondClaim).toMatchObject({ value: false });
});

test("an array alias shares the proof snapshot while a shadowed carry does not", () => {
  const aliased = minimum.replace("let best = a[0];", "const copy = a; let best = a[0];")
    .replace(/a\[i\]/g, "copy[i]");
  const good = scope(aliased + `
    const best = reduce(input);
    const claim = input[0] < best;
  `, input(2, 48));
  expect(good.claim).toMatchObject({ value: false });
  const shadowed = minimum.replace("if (a[i] < best) best = a[i];",
    "if (a[i] < best) { let best = a[i]; }");
  const unknown = scope(shadowed + `
    const value = reduce(input);
    const alleged = value <= input[1];
  `, input(2, 3));
  expect((unknown.alleged as TESBoolean).value).toBeUndefined();
});

test("a readonly or unchanged mutable seed before the changed carry does not prevent its proof", () => {
  for (const kind of ["const", "let"]) {
    const seeded = minimum.replace("let best = a[0];",
      `${kind} seed = a[0]; let best = seed;`);
    const result = scope(seeded + `
      const best = reduce(input);
      const claim = input[0] < best;
    `, input(2, 64));
    expect(result.claim).toMatchObject({ value: false });
  }
});

test("readonly and mutable-but-unchanged seed bindings retain their original value", () => {
  for (const kind of ["const", "let"]) {
    const source = `function scan(a) {
      ${kind} seed = a[0];
      for (let i = 1; i < a.length; i++) { }
      return seed;
    }
    const same = scan(input) === input[0];`;
    const result = scope(source, input(2, 3));
    expect(result.same).toMatchObject({ value: true });
  }
});

test("a late index-dependent deviation cannot use a uniform reducer proof", () => {
  const source = minimum.replace("if (a[i] < best) best = a[i];",
    "if (i === a.length - 1) best = a[i] + 1; else if (a[i] < best) best = a[i];");
  const result = scope(source + `
    const value = reduce(input);
    const alleged = value <= input[0];
  `, input(2, 3));
  expect((result.alleged as TESBoolean).value).toBeUndefined();
});

test("a changed base value and an extra carried write do not borrow the loop theorem", () => {
  const changedBase = minimum.replace("let best = a[0];",
    "let best = a[0]; best = a[1];");
  const result = scope(changedBase + `
    const value = reduce(input);
    const alleged = value <= input[0];
  `, input(2, 3));
  expect((result.alleged as TESBoolean).value).toBeUndefined();

  const extraWrite = minimum.replace("let best = a[0];", "let best = a[0]; let count = 0;")
    .replace("if (a[i] < best) best = a[i];", "count++; if (a[i] < best) best = a[i];");
  const large = symbolicNumberArray({ minimumLength: 1025, maximumLength: 1026,
    element: ESNumber(7) });
  const [completion] = evaluateCode(extraWrite + `
    const value = reduce(input);
  `, setVariablesInScope(nodeInitialExecutionContext, { input: large }));
  expect(hasExecutionBoundary(completion)).toBe(true);
});

test("a declined arbitrary transition leaves caller indexed-read caches untouched", () => {
  const array = input(2, 3);
  const stride = minimum.replace("i++", "i = i + 2");
  const result = scope(stride + `
    const value = reduce(input);
  `, array);
  expect(result.value).toBeDefined();
  expect(array.shape.sequence.indexedReads.size).toBe(0);
});

test("a validated selection result retains membership in the input snapshot", () => {
  const array = input(2, 64);
  const result = scope(minimum + "const best = reduce(input);", array);
  const best = result.best as TESNumber;
  expect(best.knowledge).toContainEqual({
    kind: "member", collection: symbolicArrayRegion(array), element: best
  });
});

test("a renamed and restructured minimum and the dual maximum use evaluated transitions", () => {
  const renamed = `function smallest(a) {
    let answer = a[0]; let index = 1;
    for (; index < a.length; index = index + 1) {
      if (answer > a[index]) { answer = a[index]; }
    }
    return answer;
  }`;
  const result = scope(renamed + maximum + `
    const low = smallest(input), high = highest(input);
    const lowClaim = input[0] < low;
    const highClaim = input[0] > high;
    const lowReverse = low < input[0];
    const highReverse = input[0] < high;
  `, input(2, 80));
  expect(result.lowClaim).toMatchObject({ value: false });
  expect(result.highClaim).toMatchObject({ value: false });
  expect((result.lowReverse as TESBoolean).value).toBeUndefined();
  expect((result.highReverse as TESBoolean).value).toBeUndefined();
});

test("singleton, varied bounds, later guaranteed index and aliased suffix use one snapshot", () => {
  for (const [minimumLength, maximumLength] of [[1, 1], [1, 40], [16, 80]]) {
    const result = scope(minimum + `
      const best = reduce(input);
      const first = input[0] < best;
      const lastGuaranteed = input[${minimumLength - 1}] < best;
      const tail = input.slice(1);
      const alias = ${minimumLength > 1 ? `tail[${minimumLength - 2}] === input[${minimumLength - 1}]` : "true"};
      const tailClaim = ${minimumLength > 1 ? "tail[0] < best" : "false"};
    `, input(minimumLength, maximumLength));
    expect(result.first).toMatchObject({ value: false });
    expect(result.lastGuaranteed).toMatchObject({ value: false });
    expect(result.alias).toMatchObject({ value: true });
    expect(result.tailClaim).toMatchObject({ value: false });
  }
});

test("the result's finite range and strict or unrelated comparisons retain exact precision", () => {
  const array = input(2, 60);
  const independent = finiteElement();
  const [completion, context] = evaluateCode(minimum + `
    const best = reduce(input);
    const floor = best >= -20;
    const ceiling = best <= 30;
    const strict = best < input[0];
    const unrelated = independent < best;
  `, setVariablesInScope(nodeInitialExecutionContext, { input: array, independent }));
  expect(hasExecutionBoundary(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(isThrownValue(completion)).toBe(false);
  expect(context.value.scope.floor).toMatchObject({ value: true });
  expect(context.value.scope.ceiling).toMatchObject({ value: true });
  expect((context.value.scope.strict as TESBoolean).value).toBeUndefined();
  expect((context.value.scope.unrelated as TESBoolean).value).toBeUndefined();
});

test("carry arithmetic cannot retain the element template's upper range", () => {
  const changed = minimum.replace("if (a[i] < best) best = a[i];", "best = best + 1;");
  const result = scope(changed + `
    const value = reduce(input);
    const allegedRange = value <= 30;
  `, input(1, 2));
  expect((result.allegedRange as TESBoolean).value).toBeUndefined();
});

test("last element and best plus one cannot borrow universal lower bounds", () => {
  const wrong = [
    minimum.replace("return best;", "return a[a.length - 1];"),
    minimum.replace("return best;", "return best + 1;")
  ];
  for (const source of wrong) {
    const result = scope(source + `
      const value = reduce(input);
      const first = input[0] < value;
      const allegedBound = value <= input[0];
    `, input(2, 64));
    expect((result.first as TESBoolean).value).toBeUndefined();
    expect((result.allegedBound as TESBoolean).value).toBeUndefined();
  }
});

test("skipped index, short guard and mutated index cannot assert full coverage", () => {
  const variants: Array<[string, number]> = [
    [minimum.replace("let i = 1", "let i = 2"), 1],
    [minimum.replace("i < a.length", "i < a.length - 1"), 2],
    [minimum.replace("i++", "i = i + 2"), 2],
    [minimum.replace("if (a[i] < best) best = a[i];", "if (a[i] < best) best = a[i]; i = i + 1;"), 2]
  ];
  for (const [source, skipped] of variants) {
    const result = scope(source + `
      const value = reduce(input);
      const allegedBound = value <= input[${skipped}];
    `, input(3, 4));
    expect((result.allegedBound as TESBoolean).value).toBeUndefined();
  }
});

test("a nonprogressing transition remains unfinished and never yields a completed proof", () => {
  const nonprogress = minimum.replace("i++", "i = i");
  const [completion] = evaluateCode(nonprogress + `
    const value = reduce(input);
    const falseClaim = input[0] < value;
  `, setVariablesInScope(nodeInitialExecutionContext, { input: input(2, 2) }));
  expect(hasExecutionBoundary(completion)).toBe(true);
  const large = symbolicNumberArray({ minimumLength: 1025, maximumLength: 1026,
    element: ESNumber(7) });
  const [largeCompletion] = evaluateCode(nonprogress + `
    const value = reduce(input);
    const falseClaim = input[0] < value;
  `, setVariablesInScope(nodeInitialExecutionContext, { input: large }));
  expect(hasExecutionBoundary(largeCompletion)).toBe(true);
});

test("an opaque call after a real output retains that output and stops without a summary", () => {
  const consoleModel = createConsoleModel();
  const source = minimum.replace("let best = a[0];", `let best = a[0];
    console.log("entered"); probe();`);
  const [completion, context] = evaluateCode(source + `
    const value = reduce(input);
    const falseClaim = input[0] < value;
  `, setVariablesInScope(nodeInitialExecutionContext, {
    input: input(1, 32), console: consoleModel.module,
    probe: createOpaqueHostFunction("p006.probe")
  }));
  expect(isExecutionBoundary(completion)).toBe(true);
  expect(consoleModel.inspectOutput(context)[0].chunks.map(chunk => chunk.value)).toEqual(["entered\n"]);
  expect(context.value.scope.falseClaim).toBeUndefined();
});

test("real output before an inferred loop occurs once and body effects use ordinary execution", () => {
  const before = createConsoleModel();
  const logged = minimum.replace("let best = a[0];",
    'console.log("entered"); let best = a[0];')
    .replace("return best;", 'console.log("after"); return best;');
  const [completion, context] = evaluateCode(logged + `
    const value = reduce(input);
    const claim = input[0] < value;
  `, setVariablesInScope(nodeInitialExecutionContext, {
    input: input(2, 40), console: before.module
  }));
  expect(hasExecutionBoundary(completion)).toBe(false);
  expect(context.value.scope.claim).toMatchObject({ value: false });
  expect(before.inspectOutput(context).map(path => path.chunks.map(chunk => chunk.value)))
    .toEqual([["entered\n", "after\n"]]);

  const bodyOutput = createConsoleModel();
  const effectful = minimum.replace("if (a[i] < best) best = a[i];",
    'console.log("step"); if (a[i] < best) best = a[i];');
  const [ordinaryCompletion, ordinaryContext] = evaluateCode(effectful + `
    const value = reduce(input);
  `, setVariablesInScope(nodeInitialExecutionContext, {
    input: input(2, 3), console: bodyOutput.module
  }));
  expect(hasExecutionBoundary(ordinaryCompletion)).toBe(false);
  const lengths = bodyOutput.inspectOutput(ordinaryContext)
    .map(path => path.chunks.filter(chunk => chunk.value === "step\n").length).sort();
  expect(lengths).toEqual([1, 2]);
});

test("a mutable captured guard cannot reuse coverage after its value changes", () => {
  const guarded = `let skip = false; ` + minimum.replace(
    "if (a[i] < best) best = a[i];", "if (skip) break; if (a[i] < best) best = a[i];");
  const result = scope(guarded + `
    const first = reduce(input);
    skip = true;
    const second = reduce(input);
    const allegedBound = second <= input[1];
  `, input(2, 2));
  expect((result.allegedBound as TESBoolean).value).toBeUndefined();
  // With unknown length, the same captured guard is already true. Ordinary
  // execution breaks on its first iteration and must not invent coverage.
  const unknown = scope(guarded.replace("let skip = false", "let skip = true") + `
    const value = reduce(input);
    const allegedBound = value <= input[1];
  `, input(2, 32));
  expect((unknown.allegedBound as TESBoolean).value).toBeUndefined();
});

test("a reached symbolic array mutation is rejected before a numeric result", () => {
  const mutating = minimum.replace("let best = a[0];", "a[0] = 1; let best = a[0];");
  // The current mutation guard is a legacy host error. The implementation
  // phase should classify it as a reached boundary before any numeric result.
  let failure: unknown;
  try {
    evaluateCode(mutating + "const value = reduce(input);",
      setVariablesInScope(nodeInitialExecutionContext, { input: input(2, 32) }));
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toMatch(/symbolic array snapshots/);
});

test("empty and possibly NaN arrays never acquire a finite nonempty proof", () => {
  const empty = symbolicNumberArray({ minimumLength: 0, maximumLength: 0,
    element: finiteElement() });
  const emptyResult = scope(minimum + `
    const value = reduce(input);
    const lower = value <= input[0];
  `, empty);
  expect(emptyResult.value).toMatchObject({ type: "undefined" });
  expect(emptyResult.lower).toMatchObject({ value: false });

  const nan = symbolicNumberArray({ minimumLength: 1, maximumLength: 1,
    element: ESNumber(NaN) });
  const nanResult = scope(minimum + `
    const value = reduce(input);
    const lower = value <= input[0];
  `, nan);
  expect((nanResult.value as TESNumber).value).toBeNaN();
  expect(nanResult.lower).toMatchObject({ value: false });

  const possibleNan = symbolicNumberArray({ minimumLength: 1, maximumLength: 1,
    element: ESNumber() });
  const possibleResult = scope(minimum + `
    const value = reduce(input);
    const lower = value <= input[0];
  `, possibleNan);
  expect((possibleResult.lower as TESBoolean).value).toBeUndefined();
});

test("a throwing length branch remains an abrupt completion beside a normal result", () => {
  const throwing = minimum.replace("let best = a[0];", `
    if (a.length === 2) throw "stop";
    let best = a[0];`);
  const [completion] = evaluateCode(throwing + `
    const value = reduce(input);
    const claim = input[0] < value;
  `, setVariablesInScope(nodeInitialExecutionContext, { input: input(1, 2) }));
  expect(isForkedCompletion(completion)).toBe(true);
  expect(hasExecutionBoundary(completion)).toBe(false);
  const leaves: unknown[] = [];
  const walk = (value: any): void => {
    if (isForkedCompletion(value)) {
      walk(value.consequent[0]);
      walk(value.alternate[0]);
    } else leaves.push(value);
  };
  walk(completion);
  expect(leaves.some(isThrownValue)).toBe(true);
  expect(leaves.some(value => !isThrownValue(value) && !isExecutionBoundary(value))).toBe(true);
});

test("an unknown sparse-capable array representation has no dense proof contract", () => {
  expect(() => evaluateCode(minimum + "const value = reduce(input);",
    setVariablesInScope(nodeInitialExecutionContext, { input: ESArray() })))
    .toThrow(/known element positions/);
});

test("custom indexed property lookup cannot borrow the dense snapshot contract", () => {
  const array = input(1, 1);
  array.unmodeledPropertyReads = ["0"];
  const [completion] = evaluateCode(minimum + "const value = reduce(input);",
    setVariablesInScope(nodeInitialExecutionContext, { input: array }));
  expect(hasExecutionBoundary(completion)).toBe(true);
});
