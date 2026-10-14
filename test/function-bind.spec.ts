import { execFileSync } from "child_process";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESObject } from "../src/Object";
import { isThrownValue, Undefined } from "../src/types";
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

test("bound calls forward receiver and partial arguments, matching native", () => {
  compare('function f(a, b, c) { return [a, b, c].join(","); }', 'f.bind(null, 1)(2, 3)');
  compare('function f(a, b) { return a * 10 + b; }', 'f.bind(null)(4, 2)');
  compare('const obj = { x: 9, m: function() { return this.x; } };', 'obj.m.bind(obj)()');
  compare('const obj = { x: 3, m: function(a) { return this.x + a; } };', 'obj.m.bind(obj, 4)()');
  compare('function f(a) { return a; } const g = f.bind(null, 1);', 'g() + g()');
});

test("bound length clamps the target length minus bound arguments, matching native", () => {
  compare('function f(a, b, c) {}', 'f.bind(null, 1).length');
  compare('function f(a, b, c) {}', 'f.bind(null).length');
  compare('function f(a) {}', 'f.bind(null, 1, 2, 3).length');
  compare('function f() {}', 'f.bind(null).length');
});

test("a non-callable bind receiver is a guest TypeError, matching native", () => {
  const expected = native('(() => { try { Function.prototype.bind.call(42); } catch (e) { return e.name; } })()');
  expect(expected).toBe("TypeError");
  const result = run('let answer = ""; try { Function.prototype.bind.call(42); } catch (e) { answer = e.name; }');
  expect(result.context.value.scope.answer).toMatchObject({ value: "TypeError" });
});

test("bound construction and name reads stop as typed boundaries", () => {
  const constructed = run('function f() {} new (f.bind(null))()');
  expect(constructed.value).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported",
    message: "Bound function construction is not yet supported" });
  const named = run('function viaCache() {} viaCache.bind(null).name');
  expect(named.value).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported" });
});

test("a symbolic callable receiver binds on both branches and preserves correlations", () => {
  const selected = ESBoolean();
  const [done, merged] = evaluateCode(
    'function one() { return 1; } function two() { return 2; } const chosen = selected ? one : two; const bound = chosen.bind(null); let mark = 0; if (selected) { mark = bound(); }',
    setVariablesInScope(nodeInitialExecutionContext, { selected }));
  expect(done).toBe(Undefined);
  const [checkDone, checked] = evaluateCode(
    'const answer = selected ? mark === 1 : mark === 0;', merged);
  if (isForkedCompletion(checkDone)) {
    for (const leaf of [checkDone.consequent, checkDone.alternate]) {
      expect(leaf[1].value.scope.answer).toMatchObject({ value: true });
    }
  } else {
    expect(checkDone).toBe(Undefined);
    expect(checked.value.scope.answer).toMatchObject({ value: true });
  }
});
