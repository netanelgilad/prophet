import { evaluateCode, evaluateCommonJS, nodeInitialExecutionContext } from "../src";
import { ESFunction } from "../src/Function/Function";
import { ESObject } from "../src/Object";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { Any, ESNumber, TESBoolean, isThrownValue } from "../src/types";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { isForkedCompletion } from "../src/execution-context/Completion";

function initial(globals: { [name: string]: Any } = {}) {
  return ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...globals }) });
}

test("a source module exports a private normalizer whose arithmetic bounds survive calls", () => {
  const source = `
    const low = 20;
    const high = 80;
    module.exports = function(value) {
      if (!(value >= low && value <= high)) throw "range";
      return (value - low) / (high - low);
    };
  `;
  const [normalize, loaded] = evaluateCommonJS(source, "/app/normalize.cjs", initial());
  expect(isThrownValue(normalize)).toBe(false);
  expect(isForkedCompletion(normalize)).toBe(false);
  const [completion, context] = evaluateCode(`
    const input = Math.random() * 60 + 20;
    const result = normalize(input);
    const proof = result >= 0 && result <= 1;
    const hidden = typeof low === "undefined" && typeof high === "undefined";
    let rejected = false;
    try { normalize(100); } catch (error) { rejected = error === "range"; }
  `, setVariablesInScope(loaded, { normalize }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(context.value.scope.proof).toMatchObject({ value: true });
  expect(context.value.scope.hidden).toMatchObject({ value: true });
  expect(context.value.scope.rejected).toMatchObject({ value: true });
});

test("conditional export replacement preserves its receiver, private state and guard", () => {
  const [exported, loaded] = evaluateCommonJS(`
    let count = 0;
    const original = exports;
    original.value = 1;
    if (guard) module.exports = { value: 2 };
    else exports.value = 3;
    module.exports.read = function() { count = count + 1; return count; };
    original.changed = this === original;
  `, "/app/choice.cjs", initial({ guard: ESBoolean() }));
  const [completion, context] = evaluateCode(`
    const proof = guard ? item.value === 2 : item.value === 3 && item.changed;
    const first = item.read();
    const second = item.read();
    const uncertain = item.value === 2;
  `, setVariablesInScope(loaded, { item: exported }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(context.value.scope.proof).toMatchObject({ value: true });
  expect(context.value.scope.first).toMatchObject({ value: 1 });
  expect(context.value.scope.second).toMatchObject({ value: 2 });
  expect((context.value.scope.uncertain as TESBoolean).value).toBeUndefined();
});

test("a module initializer that may throw preserves each effect exactly once through its caller", () => {
  const source = `
    state.entered = state.entered + 1;
    let privateValue = 9;
    if (guard) { state.failed = state.failed + 1; throw "init"; }
    module.exports = function() { return privateValue; };
  `;
  const load = ESFunction(function*(_self, _args, context) {
    return evaluateCommonJS(source, "/app/throws.cjs", context);
  });
  const state = ESObject({ entered: ESNumber(0), failed: ESNumber(0) });
  const [completion, context] = evaluateCode(`
    "use strict";
    let observed = -1;
    let caught = false;
    let finished = 0;
    try { observed = load()(); }
    catch (error) { caught = error === "init"; }
    finally { finished = finished + 1; }
    const proof = guard
      ? caught && observed === -1 && state.failed === 1
      : !caught && observed === 9 && state.failed === 0;
    const effects = state.entered === 1 && finished === 1;
    const hidden = typeof privateValue === "undefined";
  `, setVariablesInScope(initial({ guard: ESBoolean(), state }), { load }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  for (const name of ["proof", "effects", "hidden"]) {
    expect(context.value.scope[name]).toMatchObject({ value: true });
  }
  expect(context.value.strict).toBe(true);
});

test("source executions are independent and preserve prior closure snapshots", () => {
  const source = `let count = 0; module.exports = function() { count = count + 1; return count; };`;
  const [first, one] = evaluateCommonJS(source, "/app/counter.cjs", initial());
  const [second, two] = evaluateCommonJS(source, "/app/counter.cjs", one);
  const starting = setVariablesInScope(two, { first, second });
  const [, advanced] = evaluateCode(`const a = first(); const b = first(); const c = second();`, starting);
  const [, earlier] = evaluateCode(`const a = first();`, starting);
  expect(advanced.value.scope.a).toMatchObject({ value: 1 });
  expect(advanced.value.scope.b).toMatchObject({ value: 2 });
  expect(advanced.value.scope.c).toMatchObject({ value: 1 });
  expect(earlier.value.scope.a).toMatchObject({ value: 1 });
  // This API executes supplied source. It is deliberately not require/cache.
  expect(first).not.toBe(second);
});

test("module scope cannot observe caller locals, and globals retain their modeled state", () => {
  const context = setVariablesInScope(initial({ visible: ESNumber(7) }), { secret: ESNumber(99), callerOnly: ESNumber(8) });
  const [exported, loaded] = evaluateCommonJS(`
    module.exports = { hidden: typeof secret, caller: typeof callerOnly, visible: visible };
    var secret = 1;
  `, "/app/scope.cjs", context);
  const [, result] = evaluateCode(`
    const proof = item.hidden === "undefined" && item.caller === "undefined" && item.visible === 7 && secret === 99;
  `, setVariablesInScope(loaded, { item: exported }));
  expect(result.value.scope.proof).toMatchObject({ value: true });
  expect(loaded.value.environment).toBe(context.value.environment);
  expect(loaded.value.thisValue).toBe(context.value.thisValue);
});

test("unsupported host properties remain guarded after aliases, eval and escaped closures", () => {
  for (const source of [
    `const saved = module; module.exports = function() { return saved.loaded; };`,
    `module.exports = function() { return typeof require.resolve; };`,
    `module.exports = function() { return eval("module.loaded"); };`,
    `module.exports = function() { module.extra = 1; };`
  ]) {
    const [exported, loaded] = evaluateCommonJS(source, "/app/unsupported.cjs", initial());
    expect(() => evaluateCode("item();", setVariablesInScope(loaded, { item: exported })))
      .toThrow("Unmodeled host property");
  }
});
