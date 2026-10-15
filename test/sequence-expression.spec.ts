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

describe("sequence expressions (comma operator)", () => {
  test("the value is the last operand and every operand evaluates left to right", () => {
    compare(`let seen = [];
      const value = (seen.push(1), seen.push(2), seen.push(3));
      const proof = value === 3 && seen.length === 3 && seen[0] === 1 && seen[1] === 2 && seen[2] === 3;`);
  });

  test("two-operand sequences discard the first value and keep side effects", () => {
    compare(`let count = 0;
      function bump() { count = count + 1; return count; }
      const value = (bump(), bump());
      const proof = value === 2 && count === 2;`);
  });

  test("a sequence in return position runs every operand, matching the is404 shape", () => {
    compare(`function is404(res) { return (res.statusCode = 404, res.end(), "done"); }
      const calls = [];
      const res = { end: function() { calls.push("end"); }, statusCode: 200 };
      const value = is404(res);
      const proof = value === "done" && res.statusCode === 404 && calls.join(",") === "end";`);
  });

  test("a sequence nested in a callee-ternary alternate evaluates the alternate", () => {
    compare(`function fallback(req, res) { return (res.hit = true, "fb"); }
      function handler(req, res, next) { return next ? next() : fallback(req, res); }
      const res = {};
      const value = handler(1, res, undefined);
      const proof = value === "fb" && res.hit === true;`);
  });

  test("a thrown operand propagates and skips the rest of the sequence", () => {
    const [completion, context] = run(`let seen = [];
      try { (seen.push("before"), (function() { throw "boom"; })(), seen.push("after")); }
      catch (failure) { seen.push("caught:" + failure); }
      const proof = seen.join(",") === "before,caught:boom";`);
    expect(hasExecutionBoundary(completion)).toBe(false);
    expect(isForkedCompletion(completion)).toBe(false);
    expect(isThrownValue(completion)).toBe(false);
    expect(context.value.scope.proof).toMatchObject({ value: true });
  });

  test("a sequence as a single call argument passes the last operand", () => {
    compare(`function id(x) { return x; }
      let seen = 0;
      const proof = id((seen = 1, seen + 1)) === 2 && seen === 1;`);
  });
});
