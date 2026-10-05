import { evaluateCode, isExecutionBoundary, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { createHostFunction } from "../src/effects";
import { analysisFailureContext } from "../src/execution-context/analysis-failure";
import { assumeInContext } from "../src/execution-context/branches";
import { ExecutionContext, setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getArrayElements, getProperties, writeProperty } from "../src/execution-context/Heap";
import { createJobQueue } from "../src/jobs";
import { ESObject, TESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { choiceOf, resolveBoolean } from "../src/symbolic";
import { Any, ESNumber, isThrownValue, TESBoolean, Undefined } from "../src/types";

function execute(source: string, context: TExecutionContext) {
  const [completion, current] = evaluateCode(source, context);
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  return current;
}

function queued(state: TESObject, context: TExecutionContext): TESObject[] {
  let value = getProperties(state, context).pending;
  for (let choice = choiceOf(value); choice; choice = choiceOf(value)) {
    const selected = resolveBoolean(choice.condition, context.value.knowledge);
    if (selected === undefined) throw new Error("Expected one queue alternative");
    value = selected ? choice.consequent : choice.alternate;
  }
  const elements = getArrayElements(value as any, context);
  if (!elements) throw new Error("Expected a known queue");
  return elements as TESObject[];
}

function failureOf(run: () => unknown): Error {
  try { run(); } catch (error) { return error; }
  throw new Error("Expected an analysis failure");
}

function setup(inputs: { [name: string]: Any } = {}) {
  const queue = createJobQueue();
  const defer = createHostFunction("test.defer", (call, context) =>
    queue.enqueue(call.args[0], call.args.slice(1), context));
  return { queue, context: setVariablesInScope(nodeInitialExecutionContext, { defer, ...inputs }) };
}

test("jobs run in FIFO order and callbacks append behind the existing tail", () => {
  const { queue, context } = setup();
  const before = execute(`
    let trace = "";
    function third() { trace = trace + "C"; }
    function first() { trace = trace + "A"; defer(third); }
    function second() { trace = trace + "B"; }
    defer(first);
    defer(second);
  `, context);
  const jobs = queued(queue.state, before);
  expect(jobs).toHaveLength(2);
  const [completion, after] = queue.drain(before, 10);
  expect(completion).toBe(Undefined);
  expect(after.value.scope.trace).toMatchObject({ value: "ABC" });
  expect(queued(queue.state, after)).toEqual([]);
  expect(getProperties(queue.state, after).active).toBe(Undefined);
  expect(before.value.scope.trace).toMatchObject({ value: "" });
  expect(queued(queue.state, before)).toEqual(jobs);
});

test("conditional enqueue preserves both FIFO alternatives and mandatory unknown output", () => {
  const selected = ESBoolean();
  const { queue, context } = setup({ selected });
  const before = execute(`
    let trace = "";
    function first() { trace = trace + "A"; }
    function second() { trace = trace + "B"; }
    if (selected) defer(first);
    defer(second);
  `, context);
  expect(queued(queue.state, assumeInContext(before, selected, true))).toHaveLength(2);
  expect(queued(queue.state, assumeInContext(before, selected, false))).toHaveLength(1);
  const [completion, after] = queue.drain(before, 10);
  expect(completion).toBe(Undefined);
  const observed = execute(`
    const proof = trace === (selected ? "AB" : "B");
    const uncertain = trace === "AB";
  `, after);
  expect(observed.value.scope.proof).toMatchObject({ value: true });
  expect(resolveBoolean(observed.value.scope.uncertain as TESBoolean, observed.value.knowledge)).toBeUndefined();
  expect(resolveBoolean(selected, observed.value.knowledge)).toBeUndefined();
  for (const truth of [true, false]) {
    expect(queued(queue.state, assumeInContext(after, selected, truth))).toEqual([]);
  }
  expect(before.value.scope.trace).toMatchObject({ value: "" });
});

test("a throwing callback stops only its branch and leaves that branch's tail pending", () => {
  const selected = ESBoolean(), failure = ESObject({ label: ESString("failure") });
  const { queue, context } = setup({ selected, failure });
  const before = execute(`
    let trace = "";
    function first() { trace = trace + "A"; if (selected) throw failure; trace = trace + "a"; }
    function second() { trace = trace + "B"; }
    defer(first);
    defer(second);
  `, context);
  const secondJob = queued(queue.state, before)[1];
  const [completion] = queue.drain(before, 10);
  expect(isForkedCompletion(completion)).toBe(true);
  if (!isForkedCompletion(completion)) throw new Error("Expected normal and throwing branches");
  const [thrown, failed] = completion.consequent;
  const [normal, succeeded] = completion.alternate;
  expect(isThrownValue(thrown)).toBe(true);
  if (!isThrownValue(thrown)) throw new Error("Expected callback throw");
  expect(thrown.value).toBe(failure);
  expect(failed.value.scope.trace).toMatchObject({ value: "A" });
  expect(queued(queue.state, failed)).toEqual([secondJob]);
  expect(getProperties(queue.state, failed).active).toBe(Undefined);
  expect(normal).toBe(Undefined);
  expect(succeeded.value.scope.trace).toMatchObject({ value: "AaB" });
  expect(queued(queue.state, succeeded)).toEqual([]);
  expect(getProperties(queue.state, succeeded).active).toBe(Undefined);
  expect(queued(queue.state, before)).toHaveLength(2);
});

test("jobs retain aliases and copied arguments while reading current receiver and lexical state", () => {
  const queue = createJobQueue();
  const defined = execute(`
    let trace = "", message = "old";
    const receiver = { prefix: "R" };
    function callback(suffix) { trace = this.prefix + message + suffix; return 77; }
    const alias = callback;
  `, nodeInitialExecutionContext);
  const args: Any[] = [ESString(":captured")];
  const [, enqueued] = queue.enqueue(defined.value.scope.alias, args, defined, defined.value.scope.receiver);
  const job = queued(queue.state, enqueued)[0];
  expect(getProperties(job, enqueued).callback).toBe(defined.value.scope.callback);
  expect(getProperties(job, enqueued).receiver).toBe(defined.value.scope.receiver);
  args[0] = ESString(":changed outside");
  const before = execute(`message = "new"; receiver.prefix = "X";`, enqueued);
  const [completion, after] = queue.drain(before, 10);
  expect(completion).toBe(Undefined);
  expect(after.value.scope.trace).toMatchObject({ value: "Xnew:captured" });
  expect(queued(queue.state, enqueued)).toEqual([job]);
  expect(enqueued.value.scope.message).toMatchObject({ value: "old" });
  expect(getProperties(defined.value.scope.receiver as TESObject, enqueued).prefix).toMatchObject({ value: "R" });
  expect(getProperties(queue.state, enqueued).active).toBe(Undefined);
});

test("an analysis stop inside a callback retains its active job and the unstarted tail", () => {
  const { queue, context } = setup();
  const before = execute(`
    let trace = "";
    function first() { trace = "entered"; debugger; }
    function second() { trace = "must not run"; }
    defer(first);
    defer(second);
  `, context);
  const jobs = queued(queue.state, before);
  const [boundary, checkpoint] = queue.drain(before, 10);
  expect(isExecutionBoundary(boundary)).toBe(true);
  expect(checkpoint).toBeDefined();
  expect(checkpoint.value.scope.trace).toMatchObject({ value: "entered" });
  expect(getProperties(queue.state, checkpoint).active).toBe(jobs[0]);
  expect(queued(queue.state, checkpoint)).toEqual([jobs[1]]);
  expect(getProperties(queue.state, before).active).toBe(Undefined);
  expect(queued(queue.state, before)).toEqual(jobs);
  expect(() => queue.drain(checkpoint, 10)).toThrow(/active|resum/i);
  expect(getProperties(queue.state, checkpoint).active).toBe(jobs[0]);
  expect(queued(queue.state, checkpoint)).toEqual([jobs[1]]);
});

test("reentrant draining cannot bypass the currently running job to execute its tail", () => {
  const queue = createJobQueue();
  const callback = createHostFunction("test.reentrant", (_call, context) => queue.drain(context, 10));
  const tail = createHostFunction("test.tail", () => { throw new Error("tail ran during reentry"); });
  const [, first] = queue.enqueue(callback, [], nodeInitialExecutionContext);
  const [, before] = queue.enqueue(tail, [], first);
  const jobs = queued(queue.state, before);
  const failure = failureOf(() => queue.drain(before, 10));
  expect(failure.message).toMatch(/active|resum/i);
  expect(failure.message).not.toMatch(/tail ran/);
  const checkpoint = analysisFailureContext(failure)!;
  expect(checkpoint).toBeDefined();
  expect(getProperties(queue.state, checkpoint).active).toBe(jobs[0]);
  expect(queued(queue.state, checkpoint)).toEqual([jobs[1]]);
});

test("a long native callback enqueue chain reaches the explicit job budget without overflowing the stack", () => {
  const queue = createJobQueue();
  const counter = ESObject({ value: ESNumber(0) });
  let cycle: Any;
  cycle = createHostFunction("test.cycle", (_call, context) => {
    const value = (getProperties(counter, context).value as { value: number }).value;
    return queue.enqueue(cycle, [], writeProperty(counter, "value", ESNumber(value + 1), context));
  });
  const [, before] = queue.enqueue(cycle, [], nodeInitialExecutionContext);
  const [boundary, checkpoint] = queue.drain(before, 3000);
  expect(boundary).toMatchObject({ type: "ExecutionBoundary", kind: "budget" });
  expect(isExecutionBoundary(boundary) && boundary.message).toMatch(/job.*budget/i);
  expect(checkpoint).toBeDefined();
  expect(getProperties(counter, checkpoint).value).toMatchObject({ value: 3000 });
  expect(queued(queue.state, checkpoint)).toHaveLength(1);
  expect(getProperties(queued(queue.state, checkpoint)[0], checkpoint).callback).toBe(cycle);
  expect(getProperties(queue.state, checkpoint).active).toBe(Undefined);
  expect(getProperties(counter, before).value).toMatchObject({ value: 0 });
  expect(queued(queue.state, before)).toHaveLength(1);
}, 20000);

test("native jobs charge the shared AST evaluation budget and preserve the undelivered head on exhaustion", () => {
  const queue = createJobQueue();
  const counter = ESObject({ value: ESNumber(0) });
  const callback = createHostFunction("test.increment", (_call, context) => {
    const value = (getProperties(counter, context).value as { value: number }).value;
    return [Undefined, writeProperty(counter, "value", ESNumber(value + 1), context)];
  });
  const budget = { remaining: 2 };
  let before: TExecutionContext = ExecutionContext({ ...nodeInitialExecutionContext.value, evaluationBudget: budget });
  for (let index = 0; index < 3; index++) before = queue.enqueue(callback, [], before)[1];
  const lastJob = queued(queue.state, before)[2];
  const [boundary, checkpoint] = queue.drain(before, 10);
  expect(isExecutionBoundary(boundary) && boundary.message).toMatch(/evaluation budget/i);
  expect(checkpoint).toBeDefined();
  expect(checkpoint.value.evaluationBudget).toBe(budget);
  expect(budget.remaining).toBeLessThan(1);
  expect(getProperties(counter, checkpoint).value).toMatchObject({ value: 2 });
  expect(queued(queue.state, checkpoint)).toEqual([lastJob]);
  expect(getProperties(queue.state, checkpoint).active).toBe(Undefined);
  expect(queued(queue.state, before)).toHaveLength(3);
});

test("an empty queue does not consume a job or an AST evaluation step", () => {
  const queue = createJobQueue(), budget = { remaining: 0 };
  const before = ExecutionContext({ ...nodeInitialExecutionContext.value, evaluationBudget: budget });
  const [completion, after] = queue.drain(before, 0);
  expect(completion).toBe(Undefined);
  expect(queued(queue.state, after)).toEqual([]);
  expect(budget.remaining).toBe(0);
});

test("zero job budget leaves a nonempty queue untouched", () => {
  const queue = createJobQueue(), budget = { remaining: 5 };
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value, evaluationBudget: budget });
  const callback = createHostFunction("test.mustNotRun", () => { throw new Error("zero-budget callback ran"); });
  const [, before] = queue.enqueue(callback, [], initial);
  const jobs = queued(queue.state, before);
  const [boundary, checkpoint] = queue.drain(before, 0);
  expect(isExecutionBoundary(boundary) && boundary.message).toMatch(/job.*budget/i);
  expect(checkpoint).toBe(before);
  expect(queued(queue.state, before)).toEqual(jobs);
  expect(budget.remaining).toBe(5);
});

test.each([undefined, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  "an invalid or missing job budget rejects before dispatch: %s", limit => {
    const queue = createJobQueue();
    const callback = createHostFunction("test.mustNotRun", () => { throw new Error("callback ran before validation"); });
    const [, before] = queue.enqueue(callback, [], nodeInitialExecutionContext);
    const jobs = queued(queue.state, before);
    const failure = failureOf(() => queue.drain(before, limit as number));
    expect(failure.message).toMatch(/budget|limit/i);
    expect(failure.message).not.toMatch(/callback ran/);
    expect(queued(queue.state, before)).toEqual(jobs);
    expect(getProperties(queue.state, before).active).toBe(Undefined);
  }
);
