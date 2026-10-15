import { execFileSync } from "child_process";
import { evaluateCode, nodeInitialExecutionContext, hasExecutionBoundary, isForkedCompletion, isThrownValue } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESObject } from "../src/Object";
import { Any } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

const nodeBinary = process.env.PROPHET_NODE_BINARY || process.execPath;

function run(source: string, input: { [key: string]: Any } = {}) {
  return evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, input));
}

function scope(source: string, input: { [key: string]: Any } = {}) {
  const [completion, context] = run(source, input);
  expect(hasExecutionBoundary(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(isThrownValue(completion)).toBe(false);
  expect(context.value.uncaught).toBeUndefined();
  return context.value.scope;
}

// The native oracle checks the concrete expectation independently under pinned
// Node 24.21.0. Every compare source must define `proof` as true natively.
function compare(source: string) {
  assertPinnedNode();
  const native = execFileSync(nodeBinary,
    ["-e", source + ";process.stdout.write(JSON.stringify(proof));"],
    { encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(JSON.parse(native)).toBe(true);
  const result = scope(source);
  expect(result.proof).toMatchObject({ value: true });
  return result;
}

describe("array binding patterns in declarations", () => {
  test("elements bind in order and extra source elements are ignored", () => {
    compare(`let [a, b] = [10, 20, 30];
      const proof = a === 10 && b === 20;`);
  });

  test("missing elements and source holes bind undefined", () => {
    compare(`let [c, d, e] = [1];
      let [f, g] = [, 7];
      const proof = c === 1 && d === undefined && e === undefined && f === undefined && g === 7;`);
  });

  test("pattern holes skip their indices", () => {
    compare(`let [h, , i] = [1, 2, 3];
      const proof = h === 1 && i === 3;`);
  });

  test("defaults run only for undefined, in element order", () => {
    compare(`const seen = [];
      let [j = 5, k = 6] = [undefined, 0];
      let [l = seen.push("d1"), m = seen.push("d2")] = [9];
      const proof = j === 5 && k === 0 && l === 9 && m === 1 && seen.join(",") === "d2";`);
  });

  test("an empty pattern over an ordinary array reads nothing and binds nothing", () => {
    compare(`let [] = [1, 2, 3];
      const proof = true;`);
  });

  test("nested array and object patterns bind through recursion", () => {
    compare(`let [[s], { t }] = [[1], { t: 2 }];
      const proof = s === 1 && t === 2;`);
  });

  test("var declarations assign through the pattern", () => {
    compare(`var [w] = [42];
      const proof = w === 42;`);
  });

  test("const declarations initialize through the pattern", () => {
    compare(`const [x, y] = [3, 4];
      const proof = x === 3 && y === 4;`);
  });

  test("null, undefined and plain-object sources throw a catchable TypeError", () => {
    compare(`const seen = [];
      try { const [a] = null; seen.push("no-throw"); }
      catch (failure) { seen.push(failure instanceof TypeError ? "type" : "other"); }
      try { const [b] = undefined; seen.push("no-throw"); }
      catch (failure) { seen.push(failure instanceof TypeError ? "type" : "other"); }
      try { const [c] = {}; seen.push("no-throw"); }
      catch (failure) { seen.push(failure instanceof TypeError ? "type" : "other"); }
      const proof = seen.join(",") === "type,type,type";`);
  });

  test("a non-array iterable source stays an explicit gap", () => {
    expect(() => run('let [q] = "hi";'))
      .toThrow(/Array binding pattern sources must be ordinary arrays/);
  });

  // A host-modeled object (a Buffer chunk, a stream) may be iterable in
  // Node, so the catchable TypeError would be wrong for it: the source
  // stops as a typed boundary instead. Only provably non-iterable sources
  // (nullish, primitives, guest-ordinary objects) throw.
  test("host-object sources that may carry an iterator stop as a typed boundary", () => {
    expect(() => run("const [chunk] = input;", { input: Object.assign(ESObject({}), { unknownProperties: "Node Buffer API" }) }))
      .toThrow(/may carry an iterator/);
  });

  test("rest elements stay an explicit gap", () => {
    expect(() => run('let [u, ...v] = [1, 2, 3];'))
      .toThrow(/Array binding rest elements are not yet supported/);
  });
});
