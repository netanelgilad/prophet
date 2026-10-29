import { execFileSync } from "child_process";
import { evaluateCode, nodeInitialExecutionContext, hasExecutionBoundary, isForkedCompletion } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { Any, ESNumber, TESBoolean, Undefined } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

const search = `function search(values, target) {
  let low = 0;
  let high = values.length - 1;
  for (; low <= high;) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] === target) return middle;
    if (values[middle] < target) low = middle + 1;
    else high = middle - 1;
  }
  return -1;
}`;
function integer() {
  const value = ESNumber();
  value.knowledge = [{ kind: "integer", subject: value },
    { kind: "order", left: ESNumber(-1000000), right: value, strict: false },
    { kind: "order", left: value, right: ESNumber(1000000), strict: false }];
  return value;
}
function run(source: string, inputs: {[name: string]: Any} = {}) {
  const [completion, context] = evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, inputs));
  expect(hasExecutionBoundary(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(completion).toBe(Undefined);
  return context.value.scope;
}
function native(source: string) {
  return JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ["-e", source + ";process.stdout.write(JSON.stringify(answer));"],
    {encoding: "utf8", timeout: 10000, env: {...process.env, NODE_OPTIONS: "", NODE_PATH: ""}}));
}
function obligation(length: number, implementation = search) {
  const names = Array.from({length}, (_, i) => `x${i}`);
  const sorted = names.slice(1).map((name, i) => `if (!(${names[i]} <= ${name})) return true;`).join("\n");
  const absent = names.map(name => `${name} !== target`).join(" && ") || "true";
  return implementation + `
    function verify() {
      const values = [${names.join(",")}];
      ${sorted}
      const index = search(values, target);
      if (index === -1) return ${absent};
      return index >= 0 && index < values.length && values[index] === target;
    }
    const answer = verify();`;
}
for (const length of [0, 1, 2, 3, 4]) {
  test(`binary search is correct for every sorted symbolic integer array of fixed length ${length}`, () => {
    const inputs: {[name: string]: Any} = {target: integer()};
    for (let i = 0; i < length; i++) inputs[`x${i}`] = integer();
    expect(run(obligation(length), inputs).answer).toMatchObject({type: "boolean", value: true});
    expect(Object.values(inputs).every(value => (value as ReturnType<typeof integer>).value === undefined)).toBe(true);
  });
}

test("a skipped-boundary mutant must not establish correctness", () => {
  const mutant = search.replace("low = middle + 1", "low = middle + 2");
  const result = run(obligation(2, mutant), {x0: integer(), x1: integer(), target: integer()});
  expect((result.answer as TESBoolean).value).toBeUndefined();
  expect(native(mutant + "const answer = search([1, 2], 2);")).toBe(-1);
  expect(native(search + "const answer = search([1, 2], 2);")).toBe(1);
});

test("unsorted inputs cannot establish the absent-result implication", () => {
  const source = search + `const values = [2, 1]; const index = search(values, target);
    const answer = index !== -1 || (values[0] !== target && values[1] !== target);`;
  expect((run(source, {target: integer()}).answer as TESBoolean).value).toBeUndefined();
  expect(native(search + "const answer = search([2, 1], 1);")).toBe(-1);
});

test("empty arrays, duplicate keys and both boundaries agree with pinned Node", () => {
  for (const [values, target] of [[[], 0], [[1], 1], [[1], 0], [[1, 1, 1, 1], 1],
    [[-4, -2, 0, 3], -4], [[-4, -2, 0, 3], 3], [[-4, -2, 0, 3], 2],
    [[-1000000, 0, 0, 1000000], 1000000]] as [number[], number][]) {
    const source = search + `const answer = search(${JSON.stringify(values)}, ${target});`;
    expect(run(source).answer).toMatchObject({type: "number", value: native(source)});
  }
});
