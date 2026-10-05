import { createCommonJSLoader, evaluateCode, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { createHostFunction, effectPaths } from "../src/effects";
import { UnsupportedAnalysisError } from "../src/execution-context/analysis-failure";
import { BranchResult } from "../src/execution-context/branches";
import { isExecutionBoundary, isForkedCompletion } from "../src/execution-context/Completion";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { getArrayElements, getProperties } from "../src/execution-context/Heap";
import { createJobQueue } from "../src/jobs";
import { createConsoleModel } from "../src/node/console";
import { createOpaqueBuiltinModule } from "../src/node/opaque";
import { ESObject, TESObject } from "../src/Object";
import { resolveBoolean } from "../src/symbolic";
import { isThrownValue, TESBoolean, Undefined } from "../src/types";

function leaves(result: BranchResult): BranchResult[] {
  const completion = result[0];
  return isForkedCompletion(completion) ? leaves(completion.consequent).concat(leaves(completion.alternate)) : [result];
}
function setup() {
  const console = createConsoleModel();
  const context = ExecutionContext({ ...setVariablesInScope(nodeInitialExecutionContext, {
    console: console.module, selected: ESBoolean(), nested: ESBoolean(), fs: createOpaqueBuiltinModule("fs")
  }).value, sourceFile: "/fixture/input.js" });
  return { context, console };
}

for (const stoppedFirst of [true, false]) test(`an unsupported branch preserves its sibling (${stoppedFirst})`, () => {
  const { context, console } = setup();
  const outcomes = leaves(evaluateCode(`
    console.log("prefix");
    if (${stoppedFirst ? "selected" : "!selected"}) {
      const local = "checkpoint";
      console.log(local);
      fs.readFileSync("file");
      console.log("unvisited");
    } else console.log("sibling");
    console.log("tail");
  `, context));
  expect(outcomes).toHaveLength(2);
  const stopped = outcomes.find(([value]) => isExecutionBoundary(value))!;
  const finished = outcomes.find(([value]) => !isExecutionBoundary(value))!;
  expect(stopped[0]).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported" });
  expect(stopped[1].value.scope.local).toMatchObject({ value: "checkpoint" });
  expect(console.inspectOutput(stopped[1])[0].chunks.map(item => item.value)).toEqual(["prefix\n", "checkpoint\n"]);
  expect(console.inspectOutput(finished[1])[0].chunks.map(item => item.value)).toEqual(["prefix\n", "sibling\n", "tail\n"]);
  expect(isExecutionBoundary(stopped[0]) && stopped[0].frames.some(frame => frame.sourceFile === "/fixture/input.js" && frame.node.type === "CallExpression")).toBe(true);
  expect(isExecutionBoundary(stopped[0]) && stopped[0].frames.some(frame => frame.node.type === "Program")).toBe(true);
  expect(isExecutionBoundary(stopped[0]) && stopped[0].pendingStatements).toHaveLength(2);
});

test("nested unsupported, thrown and normal leaves retain their own catch/finally behavior", () => {
  const { context, console } = setup();
  const outcomes = leaves(evaluateCode(`
    try {
      if (selected) { if (nested) fs.readFileSync("x"); else throw "failure"; }
      else console.log("normal");
    } finally { console.log("finally"); }
  `, context));
  expect(outcomes).toHaveLength(3);
  expect(outcomes.filter(([value]) => isThrownValue(value))).toHaveLength(1);
  for (const [value, after] of outcomes) {
    const output = console.inspectOutput(after)[0].chunks.map(item => item.value);
    expect(output).toEqual(isExecutionBoundary(value) ? [] : isThrownValue(value) ? ["finally\n"] : ["normal\n", "finally\n"]);
  }
  const caught = leaves(evaluateCode('try { fs.readFileSync("x"); } catch (error) { console.log("caught"); } finally { console.log("finally"); }', context));
  expect(isExecutionBoundary(caught[0][0])).toBe(true);
  expect(console.inspectOutput(caught[0][1])[0].chunks).toEqual([]);
});

test("a tagged host stop retains the call attempt and unexpected errors still escape", () => {
  const { context } = setup();
  const stop = createHostFunction("test.stop", () => { throw new UnsupportedAnalysisError("known boundary"); });
  const [boundary, after] = evaluateCode('stop();', setVariablesInScope(context, { stop }));
  expect(isExecutionBoundary(boundary)).toBe(true);
  expect(effectPaths(after.value.effects)[0].events.map(event => event.kind)).toEqual(["call"]);
  for (const error of [new Error("internal defect"), new TypeError("internal type defect")]) {
    const broken = createHostFunction("test.broken", () => { throw error; });
    expect(() => evaluateCode('try { broken(); } catch (e) {}', setVariablesInScope(context, { broken }))).toThrow(error.message);
  }
});

test("a stopped callback keeps its active job and pending tail while its sibling drains", () => {
  const { context, console } = setup();
  const queue = createJobQueue();
  const defer = createHostFunction("test.defer", (call, current) => queue.enqueue(call.args[0], [], current));
  const [, before] = evaluateCode(`
    defer(function() { console.log("first"); if (selected) fs.readFileSync("x"); });
    defer(function() { console.log("second"); });
  `, setVariablesInScope(context, { defer }));
  const outcomes = leaves(queue.drain(before, 10));
  expect(outcomes).toHaveLength(2);
  for (const [value, after] of outcomes) {
    const fields = getProperties(queue.state, after);
    const stopped = isExecutionBoundary(value);
    expect(fields.active === Undefined).toBe(!stopped);
    expect(getArrayElements(fields.pending as any, after)).toHaveLength(stopped ? 1 : 0);
    expect(console.inspectOutput(after)[0].chunks.map(item => item.value)).toEqual(stopped ? ["first\n"] : ["first\n", "second\n"]);
  }
});

test("evaluation and job budgets retain unfinished work instead of normal completion", () => {
  const { context } = setup();
  const [boundary, checkpoint] = evaluateCode('console.log("never");', ExecutionContext({ ...context.value, evaluationBudget: { remaining: 0 } }));
  expect(boundary).toMatchObject({ type: "ExecutionBoundary", kind: "budget" });
  expect(checkpoint.value.effects).toBeUndefined();
  const queue = createJobQueue();
  const [, waiting] = queue.enqueue(createHostFunction("test.job", (_call, after) => [Undefined, after]), [], context);
  const [stopped, after] = queue.drain(waiting, 0);
  expect(stopped).toMatchObject({ type: "ExecutionBoundary", kind: "budget" });
  expect(getArrayElements(getProperties(queue.state, after).pending as any, after)).toHaveLength(1);
});

test("a stopped argument or string conversion cannot be used as an ordinary value", () => {
  const { context, console } = setup();
  for (const source of [
    'function never(a,b) { console.log("body"); } never(fs.readFileSync("x"), console.log("argument"));',
    'const item = { toString: function() { fs.readFileSync("x"); return "wrong"; } }; "prefix".concat(item, "tail");'
  ]) {
    const [completion, after] = evaluateCode(source, context);
    expect(isExecutionBoundary(completion)).toBe(true);
    expect(console.inspectOutput(after)[0].chunks).toEqual([]);
  }
});

test("CommonJS stopped initialization remains loaded:false while its sibling finishes", () => {
  const { context, console } = setup();
  const loader = createCommonJSLoader({ "/fixture/module.cjs": `
    module.exports = module;
    try { if (selected) require("fs").readFileSync("x"); }
    catch (error) { console.log("caught"); }
    finally { console.log("finally"); }
    console.log("loaded");
  ` }, { builtins: { fs: createOpaqueBuiltinModule("fs") } });
  const initial = ExecutionContext({ ...context.value,
    global: ESObject({ ...context.value.global.properties, selected: ESBoolean(), console: console.module }) });
  const outcomes = leaves(loader.load("/fixture/module.cjs", initial));
  expect(outcomes).toHaveLength(2);
  const stopped = outcomes.find(([value]) => isExecutionBoundary(value))!;
  const completed = outcomes.find(([value]) => !isExecutionBoundary(value))!;
  const module = stopped[1].value.scope.module as TESObject;
  expect(completed[0]).toBe(module);
  expect(getProperties(module, stopped[1]).loaded).toMatchObject({ value: false });
  expect(getProperties(module, completed[1]).loaded).toMatchObject({ value: true });
  expect(console.inspectOutput(stopped[1])[0].chunks).toEqual([]);
  expect(console.inspectOutput(completed[1])[0].chunks.map(chunk => chunk.value)).toEqual(["finally\n", "loaded\n"]);
  // The supported leaf reuses the cached record; there is no second evaluation.
  const [cached, after] = loader.load("/fixture/module.cjs", completed[1]);
  expect(cached).toBe(module);
  expect(after.value.effects).toBe(completed[1].value.effects);
});

test("a completed sibling survives later exhaustion and budget does not become an input fact", () => {
  const { context, console } = setup();
  const outcomes = leaves(evaluateCode(`
    function recurse() { return recurse(); }
    if (selected) console.log("finished"); else recurse();
  `, ExecutionContext({ ...context.value, evaluationBudget: { remaining: 100 } })));
  expect(outcomes).toHaveLength(2);
  expect(outcomes[0][0]).toBe(Undefined);
  expect(outcomes[1][0]).toMatchObject({ type: "ExecutionBoundary", kind: "budget" });
  expect(console.inspectOutput(outcomes[0][1])[0].chunks.map(chunk => chunk.value)).toEqual(["finished\n"]);
  expect(console.inspectOutput(outcomes[1][1])[0].chunks).toEqual([]);
  expect(context.value.knowledge || []).toEqual([]);
});

test("a reused classified host error retains the current branch rather than a previous checkpoint", () => {
  const { context } = setup();
  const error = new UnsupportedAnalysisError("shared error identity");
  const stop = createHostFunction("test.stop", () => { throw error; });
  const outcomes = leaves(evaluateCode('if (selected) stop(); else stop();', setVariablesInScope(context, { stop })));
  expect(outcomes).toHaveLength(2);
  expect(outcomes[0][1]).not.toBe(outcomes[1][1]);
  for (const [index, outcome] of outcomes.entries()) {
    expect(isExecutionBoundary(outcome[0])).toBe(true);
    expect(resolveBoolean(context.value.scope.selected as TESBoolean, outcome[1].value.knowledge)).toBe(index === 0);
  }
});

test("eval retains its unvisited statement sequence at a classified boundary", () => {
  const { context } = setup();
  const [completion] = evaluateCode(`eval('fs.readFileSync("x"); var unvisited = 1;');`, context);
  expect(isExecutionBoundary(completion)).toBe(true);
  expect(isExecutionBoundary(completion) && completion.pendingStatements.some(sequence =>
    sequence.statements.some(statement => statement.type === "VariableDeclaration"))).toBe(true);
});
