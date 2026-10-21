import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { invoke } from "../src/ASTResolvers";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { createHostFunction, effectPaths } from "../src/effects";
import { ExecutionContext, setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { isExecutionBoundary, isForkedCompletion } from "../src/execution-context/Completion";
import { BranchResult } from "../src/execution-context/branches";
import { ESString } from "../src/string/String";
import { Any, isThrownValue, Undefined } from "../src/types";

const record = createHostFunction("record", (_call, context) => [Undefined, context]);
function initial(inputs: { [name: string]: Any } = {}): TExecutionContext {
  return setVariablesInScope(ExecutionContext({ ...nodeInitialExecutionContext.value, sourceFile: "/entry.cjs" }), { record, ...inputs });
}
function leaves(result: BranchResult): BranchResult[] {
  return isForkedCompletion(result[0]) ? leaves(result[0].consequent).concat(leaves(result[0].alternate)) : [result];
}
function normal(result: BranchResult) {
  for (const [value] of leaves(result)) {
    expect(isThrownValue(value)).toBe(false);
    expect(isExecutionBoundary(value)).toBe(false);
  }
  return result[1];
}

test("interpreted activations are dynamic immutable identities, restored after nested and recursive calls", () => {
  const context = normal(evaluateCode(`
    function inner() { record('inner'); }
    function outer() { inner(); record('outer'); }
    function recur(n) { record('recur'); if (n) recur(n - 1); }
    outer(); outer(); recur(2); record('top');
  `, initial()));
  const events = effectPaths(context.value.effects)[0].events;
  const calls = events.filter(event => event.kind === "call").map(event => event.call);
  expect(calls.map(call => call.args[0])).toMatchObject([
    {value:'inner'}, {value:'outer'}, {value:'inner'}, {value:'outer'},
    {value:'recur'}, {value:'recur'}, {value:'recur'}, {value:'top'}]);
  const first = calls[0].origin.activation!, outer = calls[1].origin.activation!;
  expect(first.target).toBe(context.value.scope.inner);
  expect(first.parent).toBe(outer);
  expect(outer.target).toBe(context.value.scope.outer);
  expect(outer.parent).toBeUndefined();
  expect(calls[2].origin.activation).not.toBe(first);
  expect(calls[3].origin.activation).not.toBe(outer);
  for (let index = 4; index < 7; index++) {
    expect(calls[index].origin.activation!.target).toBe(context.value.scope.recur);
    expect(calls[index].origin.activation!.parent).toBe(index === 4 ? undefined : calls[index - 1].origin.activation);
  }
  for (const call of calls) {
    expect(call.origin.sourceFile).toBe('/entry.cjs');
    expect(Object.isFrozen(call.origin)).toBe(true);
    if (call.origin.activation) expect(Object.isFrozen(call.origin.activation)).toBe(true);
    expect(events.filter(event => event.call === call).map(event => event.kind)).toEqual(['call', 'return']);
  }
  expect(calls[7].origin.activation).toBeUndefined();
  expect(context.value.activation).toBeUndefined();
});

test.each(["if (flag) return 1; throw 2;", "if (flag) return 1; return 2;", "if (flag) throw 1; throw 2;"])(
  "balanced symbolic branch joins do not resurrect returned callee frames: %s", body => {
    const context = normal(evaluateCode(`
      function child() { ${body} }
      function parent() { try { child(); } catch (e) { record('caught'); } finally { record('finally'); } record('after'); }
      parent(); record('top');
    `, initial({ flag: ESBoolean() })));
    for (const path of effectPaths(context.value.effects)) for (const event of path.events) {
      if (event.kind !== 'call') continue;
      const label = event.call.args[0] as { value: string };
      if (label.value === 'top') expect(event.call.origin.activation).toBeUndefined();
      else expect(event.call.origin.activation!.target).toBe(context.value.scope.parent);
    }
    expect(context.value.activation).toBeUndefined();
  }
);

test("default parameter effects enter the callee before body execution", () => {
  const context = normal(evaluateCode(`function callee(x = record('default')) { record('body'); } callee();`, initial()));
  const calls = effectPaths(context.value.effects)[0].events.filter(event => event.kind === 'call').map(event => event.call);
  expect(calls).toHaveLength(2);
  expect(calls[0].origin.activation!.target).toBe(context.value.scope.callee);
  expect(calls[1].origin.activation).toBe(calls[0].origin.activation);
});

test("body and pre-body analysis stops retain the entered callee and prior effects", () => {
  for (const source of [
    "function callee() { record('entered'); debugger; } record('before'); callee();",
    "function callee() { record('not entered'); } record('before'); callee.call(longText);"
  ]) {
    const [value, checkpoint] = evaluateCode(source, initial({ longText: ESString('x'.repeat(65537)) }));
    expect(isExecutionBoundary(value)).toBe(true);
    expect(checkpoint.value.activation!.target).toBe(checkpoint.value.scope.callee);
    expect(checkpoint.value.activation!.sourceFile).toBe('/entry.cjs');
    expect(checkpoint.value.activation!.parent).toBeUndefined();
    const labels = effectPaths(checkpoint.value.effects)[0].events.filter(event => event.kind === 'call')
      .map(event => (event.call.args[0] as { value: string }).value);
    expect(labels[0]).toBe('before');
    expect(labels).not.toContain('not entered');
  }
});

test("host callbacks retain callback ancestry while the enclosing host call keeps its entry origin", () => {
  const host = createHostFunction('host', (call, context) => invoke(call.args[0], [], context));
  const context = normal(evaluateCode(`function child() { record('child'); } function parent() { host(child); } parent();`, initial({ host })));
  const events = effectPaths(context.value.effects)[0].events;
  const hostEvents = events.filter(event => event.call.operation === 'host');
  const childCall = events.find(event => event.call.operation === 'record')!.call;
  expect(hostEvents.map(event => event.kind)).toEqual(['call','return']);
  expect(hostEvents[1].call).toBe(hostEvents[0].call);
  expect(hostEvents[0].call.origin.activation!.target).toBe(context.value.scope.parent);
  expect(childCall.origin.activation!.target).toBe(context.value.scope.child);
  expect(childCall.origin.activation!.parent).toBe(hostEvents[0].call.origin.activation);
});

test("proof-session setup does not push speculative interpreted activations", () => {
  const context = initial();
  const proof = ExecutionContext({ ...context.value, interceptCall: () => undefined });
  const [boundary, checkpoint] = evaluateCode("function speculative() { debugger; } speculative();", proof);
  expect(isExecutionBoundary(boundary)).toBe(true);
  expect(checkpoint.value.activation).toBeUndefined();
});
