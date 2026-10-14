import { execFileSync } from "child_process";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { isThrownValue } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

function native(code: string) {
  assertPinnedNode();
  return JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ["--no-global-search-paths", "-e", `process.stdout.write(JSON.stringify(eval(${JSON.stringify(code)})));`],
    { encoding: "utf8", timeout: 10000,
      env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }, stdio: ["ignore", "pipe", "pipe"] }));
}

function run(code: string, inputs: { [name: string]: any } = {}) {
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...inputs }) });
  const [value, context] = evaluateCode(code, initial);
  return { value, context };
}

function compare(setup: string, expression: string) {
  const expected = native(`${setup}; ${expression}`);
  const result = run(`${setup}\nconst answer = (${expression});`);
  expect(isThrownValue(result.value)).toBe(false);
  expect(isForkedCompletion(result.value)).toBe(false);
  expect(result.context.value.scope.answer).toMatchObject({ value: expected });
}

test("sloppy calls box concrete primitive receivers into fresh wrappers, matching native", () => {
  compare('function f() { return typeof this; }', 'f.call(0)');
  compare('function f() { return typeof this; }', 'f.call("text")');
  compare('function f() { return typeof this; }', 'f.call(true)');
  compare('function f() { return this === 0; }', 'f.call(0)');
  compare('function f() { return this === "text"; }', 'f.call("text")');
});

test("boxed wrappers survive own writes for their single activation, matching native", () => {
  compare('function f() { this.mark = 7; return this.mark; }', 'f.call(0)');
  compare('function f() { this.mark = 7; return this.mark; }', 'f.call("text")');
});

test("reads missing on the wrapper reach the guarded intrinsic prototype", () => {
  // instanceof and prototype mutation stay guarded on the constructors and
  // prototypes; a miss on the fresh wrapper surfaces the prototype's guarded
  // API message, proving the wrapper's internal prototype link. These remain
  // legacy host assertions (LANG-003), not modeled boundary completions.
  expect(() => run('function f() { return this.valueOf; } f.call(0);')).toThrow(/Number prototype API/);
  expect(() => run('function f() { return this.valueOf; } f.call(true);')).toThrow(/Boolean prototype API/);
});

test("strict and arrow receivers pass through unboxed, matching native", () => {
  compare('function f() { "use strict"; return this; }', 'f.call(0)');
  compare('function f() { "use strict"; return this === 0; }', 'f.call(0)');
  compare('const f = () => typeof this;', 'f.call(0) === "undefined" || f.call(0) === "object"');
});

test("nullish receivers still become the global object, matching native", () => {
  compare('function f() { return typeof this; }', 'f.call(null)');
  compare('function f() { return typeof this; }', 'f.call(undefined)');
});

test("symbolic receiver choices box on each branch and complete", () => {
  const [value] = evaluateCode(
    'function f() { return typeof this; } const picked = flag ? 0 : 1; f.call(picked);',
    setVariablesInScope(nodeInitialExecutionContext, { flag: ESBoolean() }));
  expect(isThrownValue(value)).toBe(false);
  expect(isForkedCompletion(value)).toBe(false);
  expect(value).toMatchObject({ type: "undefined" });
});

test("a symbolic string receiver boxes by its type tag and keeps wrapper identity", () => {
  const result = run('function f() { return typeof this; } const answer = f.call(text);',
    { text: ESString() });
  expect(isThrownValue(result.value)).toBe(false);
  expect(result.context.value.scope.answer).toMatchObject({ value: "object" });
});
