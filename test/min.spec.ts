import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { TESNumber, TESBoolean, WithProperties, ESNumber } from "../src/types";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESObject } from "../src/Object";
import { getProperties } from "../src/execution-context/Heap";

const minFunction = `
  function min(arr) {
    if (arr.length === 1) return arr[0];
    const tailMin = min(arr.slice(1));
    return arr[0] < tailMin ? arr[0] : tailMin;
  }
`;
const tenItemProgram = minFunction + `
  const d = [
    Math.random(), Math.random(), Math.random(), Math.random(), Math.random(),
    Math.random(), Math.random(), Math.random(), Math.random(), Math.random()
  ];
  const x = d[0] < min(d);
`;

function scope(code: string) {
  return evaluateCode(code, nodeInitialExecutionContext)[1].value.scope;
}

test("recursive min proves the ten-symbol program without sampling random numbers", () => {
  const random = jest.spyOn(Math, "random");
  let result;
  try {
    result = scope(tenItemProgram);
    expect(random).not.toHaveBeenCalled();
  } finally {
    random.mockRestore();
  }
  expect(result!.x).toMatchObject({ type: "boolean", value: false });
  const d = result!.d as WithProperties;
  expect(d.properties.length).toMatchObject({ type: "number", value: 10 });
  const values = Array.from({ length: 10 }, (_, index) => d.properties[index] as TESNumber);
  expect(values.every(value => value.type === "number" && value.value === undefined)).toBe(true);
  expect(new Set(values.map(value => value.id)).size).toBe(10);
});

test("the minimum is no greater than every member, including through an alias", () => {
  const comparisons = Array.from({ length: 10 }, (_, index) =>
    `const below${index} = d[${index}] < minimum;
     const bound${index} = minimum <= d[${index}];`
  ).join("\n");
  const result = scope(tenItemProgram + `
    const minimum = min(d);
    const alias = minimum;
    const aliasBelow = d[0] < alias;
    const strictReverse = minimum < d[0];
    const independent = Math.random() < minimum;
    const equal = d[0] === d[1];
    const unequal = d[0] !== d[1];
  ` + comparisons);
  for (let index = 0; index < 10; index++) {
    expect(result[`below${index}`]).toMatchObject({ type: "boolean", value: false });
    expect(result[`bound${index}`]).toMatchObject({ type: "boolean", value: true });
  }
  expect(result.aliasBelow).toMatchObject({ value: false });
  for (const name of ["strictReverse", "independent", "equal", "unequal"]) {
    expect((result[name] as TESBoolean).type).toBe("boolean");
    expect((result[name] as TESBoolean).value).toBeUndefined();
  }
  expect((result.minimum as TESNumber).value).toBeUndefined();
});

test("concrete minima, singleton arrays, and ties retain JavaScript behavior", () => {
  const result = scope(minFunction + `
    const concrete = min([8, 2, 5, 2]);
    const only = Math.random();
    const singleton = min([only]);
    const tied = min([only, only]);
    const x = only < tied;
  `);
  expect(result.concrete).toMatchObject({ value: 2 });
  expect(result.singleton).toBe(result.only);
  expect(result.tied).toBe(result.only);
  expect(result.x).toMatchObject({ value: false });
});

test("the requested strict comparison needs less than an element-wide lower-bound fact", () => {
  // Unknown-length summaries currently reject these domains, but the concrete
  // VM must preserve their JavaScript behavior. NaN and holes can invalidate
  // the stronger <= claim without making the original comparison true.
  const cases: Array<[string, boolean]> = [
    ["[1 / 0, 2]", true],
    ["[-1 / 0, 2]", true],
    ["[1 / 0]", true],
    ["[0 / 0, 1]", false],
    ["[1, 0 / 0]", false],
    ["[, 1]", false],
    ["[1, ,]", false],
    ["[,]", false]
  ];
  for (const [array, lowerBound] of cases) {
    const result = scope(minFunction + `
      const d = ${array};
      const value = min(d);
      const x = d[0] < value;
      const lowerBound = value <= d[0];
    `);
    expect(result.x).toMatchObject({ value: false });
    expect(result.lowerBound).toMatchObject({ value: lowerBound });
  }
});

test("the same selection machinery handles maximum and uncertain comparisons", () => {
  const result = scope(`
    function max(arr) {
      if (arr.length === 1) return arr[0];
      const rest = max(arr.slice(1));
      return arr[0] > rest ? arr[0] : rest;
    }
    const d = [Math.random(), Math.random(), Math.random()];
    const maximum = max(d);
    const above = d[2] > maximum;
    const below = d[0] < maximum;
  `);
  expect(result.above).toMatchObject({ value: false });
  expect((result.below as TESBoolean).value).toBeUndefined();
});

test("random interval facts and unsupported arithmetic retain sound values", () => {
  const result = scope(`
    const a = Math.random();
    const b = Math.random();
    const lower = a >= 0;
    const upper = a < 1;
    const same = a === a;
    const different = a < b;
    const sum = a + b;
    const difference = a - b;
    const negated = -a;
  `);
  for (const name of ["lower", "upper", "same"]) {
    expect(result[name]).toMatchObject({ value: true });
  }
  for (const name of ["different", "sum", "difference", "negated"]) {
    expect((result[name] as TESNumber).value).toBeUndefined();
  }
});

test("concrete branches are lazy and symbolic alternatives merge effects without changing the input state", () => {
  expect(scope(`const x = true ? 7 : missing();`).x).toMatchObject({ value: 7 });
  const box = ESObject({ value: ESNumber(0) });
  const context = setVariablesInScope(nodeInitialExecutionContext, { box });
  const first = evaluateCode(`
    const a = Math.random();
    const b = Math.random();
    const x = a < b ? (box.value = 1) : 2;
    const proof = a < b ? box.value === 1 : box.value === 0;
  `, context)[1];
  expect(first.value.scope.proof).toMatchObject({ value: true });
  expect(getProperties(box, first).value).toMatchObject({ type: "number" });
  expect(box.properties.value).toMatchObject({ value: 0 });
  const second = evaluateCode(`
    function mutate() { box.value = 1; return 2; }
    const guard = Math.random() < Math.random();
    const x = guard ? mutate() : 3;
    const proof = guard ? box.value === 1 : box.value === 0;
  `, context)[1];
  expect(second.value.scope.proof).toMatchObject({ value: true });
  expect(box.properties.value).toMatchObject({ value: 0 });
});

test("computed indices, slice, and array writes share the same element values", () => {
  const result = scope(`
    const d = [9, 5, 3];
    const index = 1;
    d[index] = 2;
    const tail = d.slice(index);
    const changed = tail[0];
    d.length = 1;
    const length = d.length;
    const removed = d[1];
    const empty = [];
    const hole = [, 1];
    const missing = hole[0];
  `);
  expect(result.changed).toMatchObject({ value: 2 });
  expect(result.length).toMatchObject({ value: 1 });
  expect(result.removed).toEqual({ type: "undefined" });
  expect(result.missing).toEqual({ type: "undefined" });
  expect((result.empty as WithProperties).properties.length).toMatchObject({ value: 0 });
});
