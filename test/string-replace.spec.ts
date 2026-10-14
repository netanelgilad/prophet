import { execFileSync } from "child_process";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESString } from "../src/string/String";
import { ExecutionContext } from "../src/execution-context/ExecutionContext";
import { ESObject } from "../src/Object";
import { isThrownValue, Undefined } from "../src/types";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { assertPinnedNode } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

function native(expression: string) {
  assertPinnedNode();
  return JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ["--no-global-search-paths", "-e", `process.stdout.write(JSON.stringify(${expression}));`],
    { encoding: "utf8", timeout: 10000,
      env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }, stdio: ["ignore", "pipe", "pipe"] }));
}

function run(code: string, inputs: { [name: string]: any } = {}) {
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...inputs }) });
  const [value, context] = evaluateCode(code, initial);
  return { value, context };
}

// Bounded slice: intrinsic-layout RegExp search value with flagless or g
// flags and no match in concrete text - replace is then the identity and the
// replacement (string or function) is never observed, matching native.
function compare(code: string) {
  const expected = native(code);
  const result = run(`const answer = (${code});`);
  expect(isThrownValue(result.value)).toBe(false);
  expect(isForkedCompletion(result.value)).toBe(false);
  expect(result.context.value.scope.answer).toMatchObject({ value: expected });
}

test("a no-match RegExp replace is the identity, matching native", () => {
  compare('"hello.txt".replace(/\\\\+/g, "/")');
  compare('"hello.txt".replace(/\\\\+/g, "[$&]")');
  compare('"hello.txt".replace(/z+/, "x")');
  compare('"".replace(/\\\\+/g, "/")');
  compare('"hello.txt".replace(/\\\\+/g, () => "never called")');
});

test("nullish receivers are guest TypeErrors, matching native", () => {
  const expected = native('(() => { try { String.prototype.replace.call(undefined, /a/, "b"); } catch (e) { return e.name; } })()');
  expect(expected).toBe("TypeError");
  const result = run('let answer = ""; try { String.prototype.replace.call(undefined, /a/, "b"); } catch (e) { answer = e.name; }');
  expect(result.context.value.scope.answer).toMatchObject({ value: "TypeError" });
});

test("matches, string patterns, other flags and symbolic inputs stop as typed boundaries", () => {
  const cases: Array<[string, string]> = [
    ['"aa".replace(/a+/, "b")', "String.replace matched substitutions are not yet supported"],
    ['"aa".replace(/a+/g, "b")', "String.replace matched substitutions are not yet supported"],
    ['"abc".replace("b", "x")', "String.replace non-RegExp search values are not yet supported"],
    ['"ABC".replace(/z/i, "x")', "String.replace regexp flags other than g are not yet supported"]
  ];
  for (const [code, message] of cases) {
    const { value } = run(code);
    expect(value).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported", message });
  }
  const { value } = run('selected.replace(/z/, "x")', { selected: ESString() });
  expect(value).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported",
    message: "String.replace open symbolic or legacy chunk input is not yet supported" });
});

test("a conditional no-match replace completes on both symbolic branches and preserves correlations", () => {
  const selected = ESBoolean();
  const [done, merged] = evaluateCode(
    'let mark = 0, key = ""; if (selected) { mark = 1; key = "/" + "hello.txt".normalize().replace(/\\\\+/g, "/"); } else { mark = 2; }',
    setVariablesInScope(nodeInitialExecutionContext, { selected }));
  expect(done).toBe(Undefined);
  const [checkDone, checked] = evaluateCode(
    'const answer = selected ? (mark === 1 && key === "/hello.txt") : (mark === 2 && key === "");', merged);
  if (isForkedCompletion(checkDone)) {
    for (const leaf of [checkDone.consequent, checkDone.alternate]) {
      expect(leaf[1].value.scope.answer).toMatchObject({ value: true });
    }
  } else {
    expect(checkDone).toBe(Undefined);
    expect(checked.value.scope.answer).toMatchObject({ value: true });
  }
});
