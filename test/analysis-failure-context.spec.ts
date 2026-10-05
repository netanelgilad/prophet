import { CodeEvaluationError, evaluate, evaluateCode } from "../src/evaluate";
import { isExecutionBoundary } from "../src/execution-context/Completion";
import { effectPaths } from "../src/effects";
import { analysisFailureContext } from "../src/execution-context/analysis-failure";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { nodeInitialExecutionContext } from "../src/execution-context/nodeInitialExecutionContext";
import { createConsoleModel } from "../src/node/console";
import { parseECMACompliant } from "../src/parseECMACompliant";
import { resolveBoolean } from "../src/symbolic";
import { TESBoolean } from "../src/types";

function failureOf(run: () => unknown): Error {
  let failure: Error | undefined;
  try { run(); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error);
  return failure!;
}

test("an unsupported statement retains earlier console effects in its boundary", () => {
  const console = createConsoleModel();
  const initial = setVariablesInScope(nodeInitialExecutionContext, { console: console.module });
  const [boundary, checkpoint] = evaluateCode(`
    console.log("before");
    debugger;
    console.log("after");
  `, initial);

  expect(boundary).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported" });
  expect(isExecutionBoundary(boundary) && boundary.message).toContain("DebuggerStatement");
  expect(checkpoint).toBeDefined();
  expect(console.inspectOutput(checkpoint)[0].chunks.map(chunk => chunk.value)).toEqual(["before\n"]);
  expect(console.inspectOutput(initial)[0].chunks).toEqual([]);
});

test("a noncallable invocation retains argument effects completed before the analysis failure", () => {
  const console = createConsoleModel();
  const initial = setVariablesInScope(nodeInitialExecutionContext, { console: console.module });
  const failure = failureOf(() => evaluateCode(`
    const notCallable = 1;
    notCallable(console.log("argument"));
  `, initial));

  // The VM still reports this legacy boundary as an analysis error. Retaining
  // its context must not invent a program-visible TypeError completion.
  expect(failure.message).toBe("Value is not callable");
  const checkpoint = analysisFailureContext(failure)!;
  expect(checkpoint).toBeDefined();
  expect(console.inspectOutput(checkpoint)[0].chunks.map(chunk => chunk.value)).toEqual(["argument\n"]);
});

test("an unsupported operator retains effects from operands before its continuation fails", () => {
  const console = createConsoleModel();
  const initial = setVariablesInScope(nodeInitialExecutionContext, { console: console.module });
  const failure = failureOf(() => evaluateCode('console.log("operand") ** 2;', initial));

  expect(failure).toBeInstanceOf(CodeEvaluationError);
  expect(failure.message).toContain("Binary operator resolver for **");
  const checkpoint = analysisFailureContext(failure)!;
  expect(checkpoint).toBeDefined();
  expect(console.inspectOutput(checkpoint)[0].chunks.map(chunk => chunk.value)).toEqual(["operand\n"]);
});

test("an entered unsupported host call remains an attempt without a fabricated outcome or program catch", () => {
  const console = createConsoleModel();
  const initial = setVariablesInScope(nodeInitialExecutionContext, { console: console.module });
  const failure = failureOf(() => evaluateCode(`
    try {
      console.log("before");
      console.log(42);
    } catch (error) {
      console.log("caught");
    }
  `, initial));

  expect(failure.message).toContain("non-string formatting");
  const checkpoint = analysisFailureContext(failure)!;
  expect(checkpoint).toBeDefined();
  expect(console.inspectOutput(checkpoint)[0].chunks.map(chunk => chunk.value)).toEqual(["before\n"]);
  const events = effectPaths(checkpoint.value.effects)[0].events;
  const attempt = events[events.length - 1];
  expect(attempt.kind).toBe("call");
  expect(attempt.call.operation).toBe("console.log");
  expect(attempt.call.args[0]).toMatchObject({ value: 42 });
  expect(events.filter(event => event.call === attempt.call)).toEqual([attempt]);
});

test("an exhausted evaluation budget retains the entering state as a boundary", () => {
  const console = createConsoleModel();
  const initial = setVariablesInScope(nodeInitialExecutionContext, { console: console.module });
  const [, before] = evaluateCode('console.log("before budget");', initial);
  const exhausted = ExecutionContext({ ...before.value, evaluationBudget: { remaining: 0 } });
  const source = 'console.log("after budget");';
  const [boundary, checkpoint] = evaluate(parseECMACompliant(source), exhausted);
  expect(boundary).toMatchObject({ type: "ExecutionBoundary", kind: "budget" });
  expect(isExecutionBoundary(boundary) && boundary.message).toContain("evaluation budget");
  expect(checkpoint).toBe(exhausted);
  expect(console.inspectOutput(exhausted)[0].chunks.map(chunk => chunk.value)).toEqual(["before budget\n"]);
});

test("a nested failure retains its branch condition and inner scope, not a joined all-path result", () => {
  const console = createConsoleModel();
  const initial = setVariablesInScope(nodeInitialExecutionContext, { console: console.module });
  const failure = failureOf(() => evaluateCode(`
    const selected = Math.random() < 0.5;
    function nested() {
      const retained = "inner";
      console.log(retained);
      1 ** 2;
    }
    if (selected) nested();
    else console.log("other path");
  `, initial));

  const checkpoint = analysisFailureContext(failure)!;
  expect(checkpoint).toBeDefined();
  expect(checkpoint.value.scope.retained).toMatchObject({ value: "inner" });
  expect(resolveBoolean(checkpoint.value.scope.selected as TESBoolean, checkpoint.value.knowledge)).toBe(true);
  expect(console.inspectOutput(checkpoint)[0].chunks.map(chunk => chunk.value)).toEqual(["inner\n"]);
});
