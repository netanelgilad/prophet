// Independent P036 review probes: interpreted activation, not a native stack.
import { evaluateThrowableIterator } from "../src/evaluate";
import { evaluateCode, nodeInitialExecutionContext, isForkedCompletion, isExecutionBoundary } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { symbolicNumberArray } from "../src/array/symbolic";
import { createHostFunction, effectPaths } from "../src/effects";
import { ExecutionContext, setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { analysisFailureContext, ExecutionBudgetError, UnsupportedAnalysisError } from "../src/execution-context/analysis-failure";
import { BranchResult } from "../src/execution-context/branches";
import { getInferredSummaries } from "../src/Function/summaries";
import { encodeGraph } from "../src/cli/graph";
import { Any, ESNumber, isThrownValue, Undefined } from "../src/types";
import { ESString } from "../src/string/String";

function initial(inputs: { [name: string]: Any } = {}) {
  return setVariablesInScope(ExecutionContext({ ...nodeInitialExecutionContext.value, sourceFile: "/review.js" }), {
    mark: createHostFunction("review.mark", (_call, context) => [Undefined, context]),
    stop: createHostFunction("review.stop", () => { throw new UnsupportedAnalysisError("review stop"); }), ...inputs
  });
}
function leaves(pair: BranchResult): BranchResult[] {
  return isForkedCompletion(pair[0]) ? leaves(pair[0].consequent).concat(leaves(pair[0].alternate)) : [pair];
}
function calls(context: TExecutionContext) {
  return effectPaths(context.value.effects, context.value.knowledge).map(path => path.events
    .filter(event => event.kind === "call" && event.call.operation === "review.mark").map(event => event.call as any));
}
function normal(pair: BranchResult) {
  for (const [value] of leaves(pair)) expect(isThrownValue(value) || isExecutionBoundary(value)).toBe(false);
}

test("mixed return/throw restores caller activation through catch/finally and joined continuation", () => {
  const pair = evaluateCode(`function inner() { mark('inner'); if (choice) throw 'x'; return 3; }
    function outer() { try { inner(); } catch(e) { mark('caught'); } finally { mark('finally'); } mark('after'); }
    outer(); mark('top');`, initial({ choice: ESBoolean() }));
  normal(pair);
  expect((pair[1].value as any).activation).toBeUndefined();
  const targets = pair[1].value.scope;
  let caught = false;
  for (const [, context] of leaves(pair)) for (const history of calls(context)) {
    const entered = history.find(call => call.args[0].value === "inner");
    expect(entered).toBeDefined();
    const outerFrame = entered.origin.activation.parent;
    expect(entered.origin.activation.target).toBe(targets.inner);
    expect(outerFrame.target).toBe(targets.outer);
    expect(outerFrame.parent).toBeUndefined();
    for (const call of history) {
      const label = call.args[0].value;
      if (label === "caught") caught = true;
      if (["caught", "finally", "after"].includes(label)) expect(call.origin.activation).toBe(outerFrame);
      if (label === "top") expect(call.origin.activation).toBeUndefined();
    }
  }
  expect(caught).toBe(true);
});

test("a boxing budget stop retains the entered function before parameter/body execution", () => {
  const pair = evaluateCode(`function target() { mark('unreachable'); } target.call(long);`,
    initial({ long: ESString("x".repeat(65537)) }));
  expect(pair[0]).toMatchObject({ type: "ExecutionBoundary", kind: "budget" });
  const activation = (pair[1].value as any).activation;
  expect(activation).toBeDefined();
  expect(activation.target).toBe(pair[1].value.scope.target);
  expect(activation.sourceFile).toBe("/review.js");
  expect(activation.parent).toBeUndefined();
  expect(calls(pair[1])).toEqual([[]]);
});

test("parameter admission legacy failure checkpoint retains the entered target", () => {
  let failure: unknown;
  try { evaluateCode("function target({ x }) {} target({ x: 1 });", initial()); }
  catch (error) { failure = error; }
  expect(failure).toBeDefined();
  const checkpoint = analysisFailureContext(failure)!;
  expect(checkpoint).toBeDefined();
  const activation = (checkpoint.value as any).activation;
  expect(activation).toBeDefined();
  expect(activation.target).toBe(checkpoint.value.scope.target);
});

test("a parameter-initializer boundary retains callee while a normal sibling returns to caller", () => {
  const pair = evaluateCode(`function target(x = stop()) { return x; }
    if (choice) target(); else { target(1); mark('survives'); }`, initial({ choice: ESBoolean() }));
  const all = leaves(pair), stopped = all.filter(([value]) => isExecutionBoundary(value));
  expect(stopped).toHaveLength(1);
  expect((stopped[0][1].value as any).activation.target).toBe(stopped[0][1].value.scope.target);
  const survived = all.filter(([value]) => !isExecutionBoundary(value));
  expect(survived).toHaveLength(1);
  expect((survived[0][1].value as any).activation).toBeUndefined();
  expect(calls(survived[0][1])[0][0].origin.activation).toBeUndefined();
});

function symbolicInput() {
  const element = ESNumber(); element.knowledge = [{ kind: "finite", subject: element }];
  return symbolicNumberArray({ minimumLength: 1, element });
}

test("summary inference and cache reuse preserve only the actual caller activation", () => {
  const pair = evaluateCode(`function fold(a) { if(a.length === 1) return a[0];
      const rest = fold(a.slice(1)); return a[0] < rest ? a[0] : rest; }
    function outer() { const first = fold(input); mark('first'); const second = fold(input); mark('second'); }
    outer(); mark('top');`, initial({ input: symbolicInput() }));
  normal(pair);
  const history = calls(pair[1])[0];
  expect(history.map(call => call.args[0].value)).toEqual(["first", "second", "top"]);
  expect(history[0].origin.activation.target).toBe(pair[1].value.scope.outer);
  expect(history[1].origin.activation).toBe(history[0].origin.activation);
  expect(history[0].origin.activation.parent).toBeUndefined();
  expect(history[2].origin.activation).toBeUndefined();
  expect(getInferredSummaries(pair[1].value.scope.fold)[0].applications).toBe(2);
});

test("failed speculative singleton proof exposes caller provenance, not a proof-only fold frame", () => {
  let failure: unknown;
  try { evaluateCode(`function fold(a) { if(a.length === 1) return fold(a); return fold(a.slice(1)); }
    function outer() { fold(input); } outer();`, initial({ input: symbolicInput() })); }
  catch (error) { failure = error; }
  expect(failure).toBeDefined();
  expect((failure as Error).message).toMatch(/singleton.*recurs/);
  const checkpoint = analysisFailureContext(failure)!;
  expect(checkpoint).toBeDefined();
  expect((checkpoint.value as any).activation).toBeDefined();
  expect((checkpoint.value as any).activation.target).toBe(checkpoint.value.scope.outer);
  expect((checkpoint.value as any).activation.parent).toBeUndefined();
});

test("eval and generated function origins keep unknown direct source while restoring caller", () => {
  const pair = evaluateCode(`function outer() { eval("mark('eval')");
    Function('mark', "mark('generated')")(mark); mark('after'); } outer();`, initial());
  normal(pair);
  const history = calls(pair[1])[0];
  expect(history.map(call => call.args[0].value)).toEqual(["eval", "generated", "after"]);
  expect(history[0].origin.sourceFile).toBeUndefined();
  expect(history[1].origin.sourceFile).toBeUndefined();
  expect(history[2].origin.sourceFile).toBe("/review.js");
  const outer = history[2].origin.activation;
  expect(outer.target).toBe(pair[1].value.scope.outer);
  expect(history[0].origin.activation).toBe(outer);
  expect(history[1].origin.activation.sourceFile).toBeUndefined();
  expect(history[1].origin.activation.parent).toBe(outer);
});

test("moderate recursion preserves distinct frames and graph aliases without copying ancestors", () => {
  const pair = evaluateCode(`function recurse(n) { if(n > 0) return recurse(n - 1); mark('deep'); }
    recurse(24); mark('top');`, initial());
  normal(pair);
  const history = calls(pair[1])[0];
  let frame = history[0].origin.activation;
  const identities = new Set();
  while (frame) {
    expect(identities.has(frame)).toBe(false); identities.add(frame);
    expect(frame.target).toBe(pair[1].value.scope.recurse);
    expect(Object.isFrozen(frame)).toBe(true);
    frame = frame.parent;
  }
  expect(identities.size).toBe(25);
  const graph = encodeGraph({ context: pair[1], origin: history[0].origin, target: pair[1].value.scope.recurse });
  const targetRef = (graph.roots.target as { ref: string }).ref;
  expect(graph.nodes.filter(node => node.kind === "record" && node.entries.some(([key, value]) =>
    key === "target" && value !== null && typeof value === "object" && (value as { ref?: string }).ref === targetRef)))
    .toHaveLength(25);
  expect(history[1].origin.activation).toBeUndefined();
});


test("direct generator consumers receive early typed errors with checkpoints, not invented completion conversion", () => {
  const [, context] = evaluateCode("function target() {}", initial());
  const target = context.value.scope.target as any;
  let failure: unknown;
  try { evaluateThrowableIterator(target.function.implementation(ESString("x".repeat(65537)), [], context)); }
  catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(ExecutionBudgetError);
  const checkpoint = analysisFailureContext(failure)!;
  expect(checkpoint).toBeDefined();
  expect((checkpoint.value as any).activation.target).toBe(target);
  expect((checkpoint.value as any).activation.sourceFile).toBe("/review.js");
  expect((context.value as any).activation).toBeUndefined();
});
