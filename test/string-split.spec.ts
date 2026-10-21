import { execFileSync } from "child_process";
import { evaluateCode, nodeInitialExecutionContext, hasExecutionBoundary, isForkedCompletion, isThrownValue } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { Any } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

const nodeBinary = process.env.PROPHET_NODE_BINARY || process.execPath;

function scope(source: string, input: { [key: string]: Any } = {}) {
  const [completion, context] = evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, input));
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

describe("String.prototype.split over concrete strings", () => {
  test("splits on a literal separator", () => {
    compare(`const parts = "2-5".split("-");
      const proof = parts.length === 2 && parts[0] === "2" && parts[1] === "5";`);
  });

  test("a missing separator yields the whole string", () => {
    compare(`const parts = "abc".split("x");
      const proof = parts.length === 1 && parts[0] === "abc";`);
  });

  test("an omitted separator yields the whole string", () => {
    compare(`const parts = "abc".split();
      const proof = parts.length === 1 && parts[0] === "abc";`);
  });

  test("an empty separator splits into characters", () => {
    compare(`const parts = "abc".split("");
      const proof = parts.length === 3 && parts[0] === "a" && parts[2] === "c";`);
  });

  test("an empty input yields one empty element", () => {
    compare(`const parts = "".split("-");
      const proof = parts.length === 1 && parts[0] === "";`);
  });

  test("adjacent separators keep empty elements", () => {
    compare(`const parts = "a--b".split("-");
      const proof = parts.length === 3 && parts[1] === "";`);
  });

  test("the sirv range shape destructures through the array binding pattern", () => {
    compare(`const [x, y] = "bytes=2-5".replace("bytes=", "").split("-");
      const proof = x === "2" && y === "5";`);
  });
});
