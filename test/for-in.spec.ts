import { execFileSync } from "child_process";
import { evaluateCode, nodeInitialExecutionContext, hasExecutionBoundary, isForkedCompletion, isThrownValue } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
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

describe("for-in enumeration order and domain", () => {
  test("integer indices come first in ascending order, then string keys in insertion order", () => {
    compare(`let seen = [];
      for (const k in {b: 1, a: 2, 1: 3, 0: 4}) seen.push(k);
      const proof = seen.length === 4 && seen[0] === "0" && seen[1] === "1" && seen[2] === "b" && seen[3] === "a";`);
  });

  // Inherited keys are pinned natively (own before inherited, shadowed
  // inherited keys visited once, deletion reveals) but constructor prototype
  // objects carry ownPropertyModel "unmodeled" in the VM and Object.create is
  // unmodeled, so chains stop as legacy host errors until prototype
  // descriptors are modeled (see the task record's remaining gaps).
  test("a chain through an unmodeled prototype stops with the enumeration error", () => {
    expect(() => run(`function P(){}
      P.prototype.p = 1;
      const obj = new P();
      obj.o = 2;
      for (const k in obj) { }`)).toThrow(
        "Own property enumeration is not yet supported for unmodeled descriptors or keys");
  });

  test("keys added during iteration are not visited", () => {
    compare(`let seen = [];
      const obj = {a: 1};
      for (const k in obj) { seen.push(k); obj.z = 9; }
      const proof = seen.length === 1 && seen[0] === "a" && obj.z === 9;`);
  });

  test("strings contribute their UTF-16 indices and an empty string contributes none", () => {
    compare(`let seen = [];
      for (const k in "ab") seen.push(k);
      for (const k in "") seen.push("never");
      const proof = seen.length === 2 && seen[0] === "0" && seen[1] === "1";`);
  });

  test("nullish and non-string primitive heads run zero iterations and complete", () => {
    compare(`let bodies = 0;
      for (const k in null) bodies = bodies + 1;
      for (const k in undefined) bodies = bodies + 1;
      for (const k in 42) bodies = bodies + 1;
      for (const k in true) bodies = bodies + 1;
      const proof = bodies === 0;`);
  });
});

describe("for-in bindings", () => {
  test("let heads bind a fresh cell per iteration so closures capture distinct keys", () => {
    compare(`const fns = [];
      for (let k in {x: 1, y: 2}) fns.push(() => k);
      const proof = fns.length === 2 && fns[0]() === "x" && fns[1]() === "y";`);
  });

  test("const heads bind a fresh cell per iteration", () => {
    compare(`const fns = [];
      for (const k in {x: 1, y: 2}) fns.push(() => k);
      const proof = fns.length === 2 && fns[0]() === "x" && fns[1]() === "y";`);
  });

  test("var heads share one binding that survives the loop", () => {
    compare(`let observed = "none";
      for (var k in {x: 1, y: 2}) observed = k;
      const proof = observed === "y" && k === "y";`);
  });

  test("an identifier head assigns the existing binding", () => {
    compare(`let key = "before";
      let seen = [];
      for (key in {m: 1, n: 2}) seen.push(key);
      const proof = seen.length === 2 && key === "n";`);
  });

  test("a member expression head assigns through the member", () => {
    compare(`const holder = {};
      let count = 0;
      for (holder.k in {m: 1, n: 2}) count = count + 1;
      const proof = count === 2 && holder.k === "n";`);
  });

  test("the loop variable is not leaked when the head has no keys", () => {
    compare(`let leaked = "untouched";
      for (let k in {}) leaked = k;
      const proof = leaked === "untouched";`);
  });
});

describe("for-in control flow", () => {
  test("break finishes the loop without visiting later keys", () => {
    compare(`let seen = [];
      for (const k in {a: 1, b: 2, c: 3}) { seen.push(k); if (k === "b") break; }
      const proof = seen.length === 2 && seen[0] === "a" && seen[1] === "b";`);
  });

  test("continue skips to the next key", () => {
    compare(`let seen = [];
      for (const k in {a: 1, b: 2, c: 3}) { if (k === "b") continue; seen.push(k); }
      const proof = seen.length === 2 && seen[0] === "a" && seen[1] === "c";`);
  });

  test("a throwing head expression propagates without any iteration", () => {
    compare(`let bodies = 0;
      function bomb() { throw "head"; }
      let caught = "";
      try { for (const k in bomb()) bodies = bodies + 1; }
      catch (error) { caught = error; }
      const proof = caught === "head" && bodies === 0;`);
  });

  test("a throw inside the body propagates with the prefix effects retained", () => {
    compare(`let seen = [];
      let caught = "";
      try { for (const k in {a: 1, b: 2}) { seen.push(k); throw "body"; } }
      catch (error) { caught = error; }
      const proof = caught === "body" && seen.length === 1 && seen[0] === "a";`);
  });

  test("the body can read the visited values through the key", () => {
    compare(`let total = 0;
      const obj = {a: 1, b: 2, c: 3};
      for (const k in obj) total = total + obj[k];
      const proof = total === 6;`);
  });
});
