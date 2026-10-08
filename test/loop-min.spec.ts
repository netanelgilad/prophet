import { execFileSync } from "child_process";
import { evaluateCode, nodeInitialExecutionContext, hasExecutionBoundary, isForkedCompletion, isThrownValue } from "../src";
import { TESNumber, TESBoolean, WithProperties } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

const minimum = `
  function minimum(a) {
    let best = a[0];
    for (let i = 1; i < a.length; i++) {
      if (a[i] < best) best = a[i];
    }
    return best;
  }
`;
const lowest = minimum.replace(/minimum/g, "lowest");
const highest = `
  function highest(a) {
    let best = a[0];
    for (let i = 1; i < a.length; i++) {
      if (a[i] > best) best = a[i];
    }
    return best;
  }
`;
const lastPick = `
  function lastPick(a) {
    let best = a[0];
    for (let i = 1; i < a.length; i++) {
      if (a[i] < best) best = a[i];
    }
    return a[a.length - 1];
  }
`;
const tenRandom = "[Math.random(), Math.random(), Math.random(), Math.random(), Math.random(), Math.random(), Math.random(), Math.random(), Math.random(), Math.random()]";
const tenItemProgram = minimum + `
  const d = [
    Math.random(), Math.random(), Math.random(), Math.random(), Math.random(),
    Math.random(), Math.random(), Math.random(), Math.random(), Math.random()
  ];
  const x = d[0] < minimum(d);
`;

const nodeBinary = process.env.PROPHET_NODE_BINARY || process.execPath;

function scope(code: string) {
  const [completion, context] = evaluateCode(code, nodeInitialExecutionContext);
  if (hasExecutionBoundary(completion)) {
    const boundary = isForkedCompletion(completion)
      ? "a forked completion containing a boundary"
      : "an execution boundary";
    const detail = isForkedCompletion(completion) ? "nested boundary" : (completion as { message: string }).message;
    throw new Error(`Evaluation stopped at ${boundary}: ${detail}`);
  }
  if (isForkedCompletion(completion)) {
    throw new Error("Evaluation produced a forked completion instead of a single normal scope");
  }
  if (isThrownValue(completion)) {
    throw new Error("Evaluation threw before producing a scope");
  }
  return context.value.scope;
}

function nativeObservation(source: string, names: string[]): any {
  assertPinnedNode();
  const encode = `function encode(v) { return v === undefined ? "undefined" : typeof v === "number" ? (Number.isNaN(v) ? "NaN" : v === Infinity ? "Infinity" : v === -Infinity ? "-Infinity" : Object.is(v, -0) ? "-0" : v) : v; }`;
  const expression = `{ ${names.map(name => `${JSON.stringify(name)}: encode(${name})`).join(", ")} }`;
  const native = execFileSync(nodeBinary,
    ["-e", `${encode}\n${source}; process.stdout.write(JSON.stringify(${expression}));`],
    { encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  return JSON.parse(native);
}

function expectVMValue(actual: unknown, expected: string | number) {
  if (expected === "undefined") {
    expect(actual).toEqual({ type: "undefined" });
  } else if (expected === "NaN") {
    expect(actual).toMatchObject({ type: "number" });
    expect((actual as TESNumber).value).toBeNaN();
  } else if (expected === "Infinity") {
    expect((actual as TESNumber).value).toBe(Infinity);
  } else if (expected === "-Infinity") {
    expect((actual as TESNumber).value).toBe(-Infinity);
  } else if (expected === "-0") {
    expect(Object.is((actual as TESNumber).value, -0)).toBe(true);
  } else if (expected === 0) {
    expect(Object.is((actual as TESNumber).value, 0)).toBe(true);
  } else {
    expect(actual).toMatchObject({ type: "number", value: expected });
  }
}

test("ten symbolic random elements prove the requested false result without host sampling", () => {
  const random = jest.spyOn(Math, "random");
  let result;
  try {
    result = scope(tenItemProgram);
    expect(random).not.toHaveBeenCalled();
  } finally {
    random.mockRestore();
  }
  expect(result.x).toMatchObject({ type: "boolean", value: false });
  const d = result.d as WithProperties;
  expect(d.properties.length).toMatchObject({ type: "number", value: 10 });
  const values = Array.from({ length: 10 }, (_, index) => d.properties[index] as TESNumber);
  expect(values.every(value => value.type === "number" && value.value === undefined)).toBe(true);
  expect(new Set(values.map(value => value.id)).size).toBe(10);
});

test("the loop minimum is no greater than every member, including through an alias", () => {
  const comparisons = Array.from({ length: 10 }, (_, index) =>
    `const below${index} = d[${index}] < m;
     const bound${index} = m <= d[${index}];`
  ).join("\n");
  const result = scope(tenItemProgram + `
    const m = minimum(d);
    const alias = m;
    const aliasBelow = d[0] < alias;
    const strictReverse = m < d[0];
    const independent = Math.random() < m;
    const ordering = d[0] < d[1];
    const equal = d[0] === d[1];
    const unequal = d[0] !== d[1];
  ` + comparisons);
  for (let index = 0; index < 10; index++) {
    expect(result[`below${index}`]).toMatchObject({ type: "boolean", value: false });
    expect(result[`bound${index}`]).toMatchObject({ type: "boolean", value: true });
  }
  expect(result.aliasBelow).toMatchObject({ value: false });
  for (const name of ["strictReverse", "independent", "ordering", "equal", "unequal"]) {
    expect((result[name] as TESBoolean).type).toBe("boolean");
    expect((result[name] as TESBoolean).value).toBeUndefined();
  }
  expect((result.m as TESNumber).value).toBeUndefined();
});

test("deterministic native witnesses show both strict-reverse outcomes", () => {
  const witness = (array: string) => nativeObservation(minimum + `
    const d = ${array};
    const m = minimum(d);
    const strictReverse = m < d[0];
  `, ["strictReverse"]);
  expect(witness("[0.25, 0.75]").strictReverse).toBe(false);
  expect(witness("[0.75, 0.25]").strictReverse).toBe(true);
});

test("concrete loops match pinned Node for singleton, ties, negatives and selection updates", () => {
  const names = ["singleton", "tied", "tiedFirst", "mixed", "updated", "first", "negatives"];
  const source = minimum + `
    const singleton = minimum([7]);
    const tied = minimum([3, 3, 3]);
    const tiedFirst = minimum([2, 2, 5]);
    const mixed = minimum([-5, 3, -10, 0]);
    const updated = minimum([5, 1, 3]);
    const first = minimum([1, 5, 3]);
    const negatives = minimum([-1, -2, -3]);
  `;
  const native = nativeObservation(source, names);
  expect(native.singleton).toBe(7);
  expect(native.tied).toBe(3);
  expect(native.tiedFirst).toBe(2);
  expect(native.mixed).toBe(-10);
  expect(native.updated).toBe(1);
  expect(native.first).toBe(1);
  expect(native.negatives).toBe(-3);
  const result = scope(source);
  for (const name of names) {
    expect(result[name]).toMatchObject({ type: "number", value: native[name] });
  }
});

test("the renamed function proves the same bounds without name recognition", () => {
  const result = scope(lowest + `
    const d = ${tenRandom};
    const m = lowest(d);
    const x = d[0] < m;
    const bound = m <= d[0];
    const strict = m < d[0];
  `);
  expect(result.x).toMatchObject({ value: false });
  expect(result.bound).toMatchObject({ value: true });
  expect((result.strict as TESBoolean).value).toBeUndefined();
  expect((result.m as TESNumber).value).toBeUndefined();
});

test("the analogous maximum proves the dual bounds from its own comparisons", () => {
  const comparisons = Array.from({ length: 10 }, (_, index) =>
    `const above${index} = d[${index}] > m;
     const bound${index} = m >= d[${index}];`
  ).join("\n");
  const result = scope(highest + `
    const d = ${tenRandom};
    const m = highest(d);
    const requested = d[0] > m;
    const strict = d[0] < m;
  ` + comparisons);
  expect(result.requested).toMatchObject({ value: false });
  for (let index = 0; index < 10; index++) {
    expect(result[`above${index}`]).toMatchObject({ value: false });
    expect(result[`bound${index}`]).toMatchObject({ value: true });
  }
  expect((result.strict as TESBoolean).value).toBeUndefined();
  expect((result.m as TESNumber).value).toBeUndefined();
});

test("a deliberately wrong reducer cannot borrow the minimum proof", () => {
  const result = scope(lastPick + `
    const d = ${tenRandom};
    const m = lastPick(d);
    const requested = d[0] < m;
    const bound = m <= d[0];
    const member = m === d[0] || m === d[1] || m === d[2] || m === d[3] || m === d[4] ||
      m === d[5] || m === d[6] || m === d[7] || m === d[8] || m === d[9];
  `);
  expect((result.requested as TESBoolean).value).toBeUndefined();
  expect((result.bound as TESBoolean).value).toBeUndefined();
  expect(result.member).toMatchObject({ value: true });
});

test("loop selection updates and a post-return alias retain relationships", () => {
  const result = scope(minimum + `
    const d = [Math.random(), Math.random(), Math.random()];
    const m = minimum(d);
    const member = m === d[0] || m === d[1] || m === d[2];
    const alias = m;
    const aliasBound = alias <= d[0];
    const aliasBelow = d[0] < alias;
  `);
  expect(result.member).toMatchObject({ value: true });
  expect(result.aliasBound).toMatchObject({ value: true });
  expect(result.aliasBelow).toMatchObject({ value: false });
});

test("NaN, empty, infinity and signed-zero boundaries match pinned Node", () => {
  const cases: Array<{ array: string; sign?: boolean }> = [
    { array: "[1 / 0, 2]" },
    { array: "[-1 / 0, 2]" },
    { array: "[1 / 0]" },
    { array: "[0 / 0, 1]" },
    { array: "[1, 0 / 0]" },
    { array: "[, 1]" },
    { array: "[1, ,]" },
    { array: "[,]" },
    { array: "[]" },
    { array: "[0, -0]", sign: true },
    { array: "[-0, 0]", sign: true }
  ];
  const expected = [
    { value: 2, x: false, lowerBound: true },
    { value: "-Infinity", x: false, lowerBound: true },
    { value: "Infinity", x: false, lowerBound: true },
    { value: "NaN", x: false, lowerBound: false },
    { value: 1, x: false, lowerBound: true },
    { value: "undefined", x: false, lowerBound: false },
    { value: 1, x: false, lowerBound: true },
    { value: "undefined", x: false, lowerBound: false },
    { value: "undefined", x: false, lowerBound: false },
    { value: 0, x: false, lowerBound: true, sign: "Infinity" },
    { value: "-0", x: false, lowerBound: true, sign: "-Infinity" }
  ];
  const sources = cases.map(c => minimum + `
    const d = ${c.array};
    const value = minimum(d);
    const x = d[0] < value;
    const lowerBound = value <= d[0];
    ${c.sign ? "const sign = 1 / value;" : ""}
  `);
  sources.forEach((source, i) => {
    const names = cases[i].sign ? ["value", "x", "lowerBound", "sign"] : ["value", "x", "lowerBound"];
    const native = nativeObservation(source, names);
    expect(native.value).toBe(expected[i].value);
    expect(native.x).toBe(expected[i].x);
    expect(native.lowerBound).toBe(expected[i].lowerBound);
    if (cases[i].sign) expect(native.sign).toBe(expected[i].sign);
  });
  sources.forEach((source, i) => {
    const result = scope(source);
    expectVMValue(result.value, expected[i].value);
    expect(result.x).toMatchObject({ value: expected[i].x });
    expect(result.lowerBound).toMatchObject({ value: expected[i].lowerBound });
    if (cases[i].sign) {
      expect(result.sign).toMatchObject({ type: "number" });
      expect((result.sign as TESNumber).value).toBe(expected[i].sign === "Infinity" ? Infinity : -Infinity);
    }
  });
});
