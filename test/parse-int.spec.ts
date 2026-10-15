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

describe("parseInt", () => {
  test("parses decimal with whitespace, sign and trailing garbage", () => {
    compare(`const proof = parseInt("42") === 42 && parseInt("  42  ") === 42
      && parseInt("-42") === -42 && parseInt("+42") === 42 && parseInt("42abc") === 42;`);
  });

  test("no parseable digits yields NaN", () => {
    compare(`const a = parseInt("abc"), b = parseInt(""), c = parseInt("-");
      const proof = a !== a && b !== b && c !== c && typeof a === "number";`);
  });

  test("auto radix strips a 0x prefix after an optional sign", () => {
    compare(`const proof = parseInt("0x1A") === 26 && parseInt("-0x10") === -16
      && parseInt("0b11") === 0 && parseInt("08") === 8;`);
  });

  test("explicit radix parses digits and allows the 0x prefix only for 16", () => {
    compare(`const proof = parseInt("1A", 16) === 26 && parseInt("0x1A", 16) === 26
      && parseInt("10", 2) === 2 && parseInt("z", 36) === 35
      && parseInt("  -0X1f  ", 16) === -31;`);
  });

  test("out-of-range radices yield NaN and fractional radices truncate", () => {
    compare(`const a = parseInt("10", 37), b = parseInt("10", 1);
      const proof = a !== a && b !== b && parseInt("10", 10.9) === 10;`);
  });

  test("an omitted radix argument behaves as auto", () => {
    compare(`const proof = parseInt("10", undefined) === 10 && parseInt("0x10", undefined) === 16;`);
  });

  test("large integers round to the nearest double", () => {
    compare(`const proof = parseInt("9007199254740993") === 9007199254740992;`);
  });

  test("the global carries pinned length and name metadata", () => {
    compare(`const proof = parseInt.length === 2 && parseInt.name === "parseInt";`);
  });

  test("non-string inputs remain an explicit gap", () => {
    const [completion] = run('parseInt(42);');
    expect(completion).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported",
      message: "parseInt non-string inputs are not yet supported" });
  });

  test("non-number radices remain an explicit gap", () => {
    const [completion] = run('parseInt("10", "10");');
    expect(completion).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported",
      message: "parseInt non-number radices are not yet supported" });
  });
});
