import { execFileSync } from "child_process";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESString } from "../src/string/String";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESObject } from "../src/Object";
import { isThrownValue, Undefined } from "../src/types";
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

function compare(code: string) {
  const expected = native(code);
  const result = run(`const answer = (${code});`);
  expect(isThrownValue(result.value)).toBe(false);
  expect(isForkedCompletion(result.value)).toBe(false);
  expect(result.context.value.scope.answer).toMatchObject({ value: expected });
}

test("normalize is the identity on ASCII text, matching native NFC", () => {
  compare('"hello.txt".normalize()');
  compare('"".normalize()');
  compare('"site/hello world-2_~!.txt".normalize()');
  compare('"\\x00\\x7F".normalize()');
  compare('String(65).normalize()');
});

test("nullish receivers are guest TypeErrors, matching native", () => {
  const expected = native('(() => { try { String.prototype.normalize.call(null); } catch (e) { return e.name; } })()');
  expect(expected).toBe("TypeError");
  const result = run('let answer = ""; try { String.prototype.normalize.call(null); } catch (e) { answer = e.name; }');
  expect(result.context.value.scope.answer).toMatchObject({ value: "TypeError" });
});

test("explicit forms, non-ASCII text and symbolic receivers stop as typed boundaries", () => {
  const cases: Array<[string, string]> = [
    ['"abc".normalize("NFC")', "String.normalize explicit forms are not yet supported"],
    ['"caf\\u00e9".normalize()', "String.normalize non-ASCII text is not yet supported"],
    ['"e\\u0301".normalize()', "String.normalize non-ASCII text is not yet supported"]
  ];
  for (const [code, message] of cases) {
    const { value } = run(code);
    expect(value).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported", message });
  }
  const { value } = run("selected.normalize()", { selected: ESString() });
  expect(value).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported",
    message: "String.normalize open symbolic or legacy chunk input is not yet supported" });
});

test("a conditional normalize completes on both symbolic branches and preserves correlations", () => {
  const selected = ESBoolean();
  const [done, merged] = evaluateCode(
    'let mark = 0, name = ""; if (selected) { mark = 1; name = "hello.txt".normalize(); } else { mark = 2; }',
    setVariablesInScope(nodeInitialExecutionContext, { selected }));
  expect(done).toBe(Undefined);
  const [checkDone, checked] = evaluateCode(
    'const answer = selected ? (mark === 1 && name === "hello.txt") : (mark === 2 && name === "");', merged);
  if (isForkedCompletion(checkDone)) {
    for (const leaf of [checkDone.consequent, checkDone.alternate]) {
      expect(leaf[1].value.scope.answer).toMatchObject({ value: true });
    }
  } else {
    expect(checkDone).toBe(Undefined);
    expect(checked.value.scope.answer).toMatchObject({ value: true });
  }
});
