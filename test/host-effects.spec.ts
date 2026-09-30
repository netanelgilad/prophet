import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { invoke } from "../src/ASTResolvers";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { createHostFunction, effectContext, effectPaths, HostEffect } from "../src/effects";
import { setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { evaluateBranches } from "../src/execution-context/branches";
import { getProperties, writeProperty } from "../src/execution-context/Heap";
import { ESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { assume, resolveBoolean, strictEquality } from "../src/symbolic";
import { Any, ESNumber, isThrownValue, ThrownValue, Undefined } from "../src/types";

function run(source: string, inputs: { [name: string]: Any } = {}) {
  const [completion, context] = evaluateCode(source,
    setVariablesInScope(nodeInitialExecutionContext, inputs));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(context.value.uncaught).toBeUndefined();
  return context;
}

function recording(operation: string) {
  return createHostFunction(operation, (_call, context) => [Undefined, context]);
}

function labels(events: ReadonlyArray<HostEffect>) {
  return events.map(event => event.call.operation + ":" + event.kind);
}

function outcome(event: HostEffect) {
  if (event.kind === "call") throw new Error("Expected a host outcome event");
  return event.value;
}

test("a conditional host call is absent on the other path, not an unconditional possible effect", () => {
  // The input is either Boolean; neither alternative is assumed initially.
  const accepted = ESBoolean();
  const context = run(`
    if (accepted) save(23);
    const uncertain = accepted;
  `, { accepted, save: recording("save") });
  expect(context.value.scope.uncertain).toMatchObject({ value: undefined });
  const paths = effectPaths(context.value.effects!);
  expect(paths).toHaveLength(2);
  for (const path of paths) {
    const called = resolveBoolean(accepted, path.knowledge);
    expect(called).not.toBeUndefined();
    expect(labels(path.events)).toEqual(called ? ["save:call", "save:return"] : []);
    if (called) {
      expect(path.events[0].call.args[0]).toMatchObject({ value: 23 });
      expect(path.events[1].call).toBe(path.events[0].call);
      expect(resolveBoolean(accepted, path.events[0].knowledge)).toBe(true);
    }
  }
});

test("successive operations retain JavaScript evaluation order and distinct call identities", () => {
  const context = run(`
    const first = open("record");
    write(first, 9);
    close(first);
  `, {
    open: createHostFunction("open", (_call, current) => [ESString("handle"), current]),
    write: recording("write"),
    close: recording("close")
  });
  const paths = effectPaths(context.value.effects!);
  expect(paths).toHaveLength(1);
  const events = paths[0].events;
  expect(labels(events)).toEqual([
    "open:call", "open:return", "write:call", "write:return", "close:call", "close:return"
  ]);
  expect(events[2].call.args[0]).toBe(outcome(events[1]));
  expect(events[4].call.args[0]).toBe(outcome(events[1]));
  expect(new Set(events.filter(event => event.kind === "call").map(event => event.call.id)).size).toBe(3);
});

test("the model and trace receive the original receiver and arguments", () => {
  const payload = ESObject({ amount: ESNumber(1) });
  const resource = ESObject();
  const observed: Any[] = [];
  const write = createHostFunction("resource.write", (call, context) => {
    observed.push(call.receiver, call.args[0]);
    return [call.args[0], context];
  });
  resource.properties.write = write;
  const context = run(`
    const result = resource.write(payload);
    const same = result === payload;
  `, { resource, payload });
  expect(context.value.scope.same).toMatchObject({ value: true });
  expect(observed).toEqual([resource, payload]);
  const events = effectPaths(context.value.effects!)[0].events;
  expect(events[0].call.target).toBe(write);
  expect(events[0].call.receiver).toBe(resource);
  expect(events[0].call.args[0]).toBe(payload);
  expect(outcome(events[1])).toBe(payload);
});

test("distinct host functions retain their target identities even with the same descriptive label", () => {
  const first = recording("write");
  const second = recording("write");
  const context = run("first(1); second(2); first(3);", { first, second });
  const calls = effectPaths(context.value.effects!)[0].events.filter(event => event.kind === "call");
  expect(calls.map(event => event.call.operation)).toEqual(["write", "write", "write"]);
  expect(calls.map(event => event.call.target)).toEqual([first, second, first]);
  expect(calls[0].call.target).not.toBe(calls[1].call.target);
  expect(calls[0].call.target).toBe(calls[2].call.target);
  expect(calls[0].call.id).not.toBe(calls[2].call.id);
});

test("events retain an argument object's state when the call happened", () => {
  const payload = ESObject({ amount: ESNumber(0) });
  const context = run(`
    payload.amount = 1;
    save(payload);
    payload.amount = 2;
    save(payload);
    payload.amount = 3;
  `, { payload, save: recording("save") });
  const events = effectPaths(context.value.effects!)[0].events;
  expect(getProperties(payload, context).amount).toMatchObject({ value: 3 });
  expect(getProperties(payload, effectContext(events[0], context)).amount).toMatchObject({ value: 1 });
  expect(getProperties(payload, effectContext(events[1], context)).amount).toMatchObject({ value: 1 });
  expect(getProperties(payload, effectContext(events[2], context)).amount).toMatchObject({ value: 2 });
  expect(events[0].call.args[0]).toBe(events[2].call.args[0]);
});

test("an event before the first heap write retains the object's original properties", () => {
  const payload = ESObject({ amount: ESNumber(1) });
  const context = run(`
    save(payload);
    payload.amount = 2;
  `, { payload, save: recording("save") });
  const event = effectPaths(context.value.effects!)[0].events[0];
  expect(event.heap).toBeUndefined();
  expect(getProperties(payload, context).amount).toMatchObject({ value: 2 });
  expect(getProperties(payload, effectContext(event, context)).amount).toMatchObject({ value: 1 });
});

test("a later path condition resolves earlier argument snapshots without applying later mutations", () => {
  const selected = ESBoolean();
  const payload = ESObject({ amount: ESNumber(0) });
  const context = run(`
    if (selected) payload.amount = 1;
    else payload.amount = 2;
    save(payload);
    payload.amount = 99;
    if (selected) audit();
  `, { selected, payload, save: recording("save"), audit: recording("audit") });
  const paths = effectPaths(context.value.effects!);
  expect(paths).toHaveLength(2);
  for (const path of paths) {
    const chosen = resolveBoolean(selected, path.knowledge);
    expect(chosen).not.toBeUndefined();
    const snapshot = effectContext(path.events[0], context, path.knowledge);
    expect(strictEquality(getProperties(payload, snapshot).amount,
      ESNumber(chosen ? 1 : 2), snapshot.value.knowledge)).toMatchObject({ value: true });
  }
  expect(getProperties(payload, context).amount).toMatchObject({ value: 99 });
});

test("a thrown model outcome preserves preceding operations and its explicit state changes", () => {
  const state = ESObject({ attempted: ESBoolean(false) });
  const failure = ESString("storage unavailable");
  const context = run(`
    start();
    let caught = false;
    try { fail(); unreachable(); }
    catch (error) { caught = error === failure; }
    finish();
    const attempted = state.attempted;
  `, {
    state, failure,
    start: recording("start"),
    fail: createHostFunction("fail", (_call, current) => [
      ThrownValue(failure), writeProperty(state, "attempted", ESBoolean(true), current)
    ]),
    unreachable: recording("unreachable"),
    finish: recording("finish")
  });
  expect(context.value.scope.caught).toMatchObject({ value: true });
  expect(context.value.scope.attempted).toMatchObject({ value: true });
  const events = effectPaths(context.value.effects!)[0].events;
  expect(labels(events)).toEqual([
    "start:call", "start:return", "fail:call", "fail:throw", "finish:call", "finish:return"
  ]);
  expect(outcome(events[3])).toBe(failure);
  expect(getProperties(state, effectContext(events[2], context)).attempted).toMatchObject({ value: false });
  expect(getProperties(state, effectContext(events[3], context)).attempted).toMatchObject({ value: true });
});

test("symbolic success and failure retain correlated results, resource state, and effects", () => {
  // Failure is an unconstrained Boolean supplied by the host model.
  const fails = ESBoolean();
  const failure = ESString("write failed");
  const state = ESObject({ saved: ESBoolean(false) });
  const context = run(`
    let caught = false;
    let correct = false;
    try {
      const result = save();
      correct = !fails && result === 7 && state.saved;
    } catch (error) {
      caught = true;
      correct = fails && error === failure && !state.saved;
    }
    const classified = caught === fails;
  `, {
    fails, failure, state,
    save: createHostFunction("save", (_call, current) => evaluateBranches(fails, current,
      rejected => [ThrownValue(failure), rejected],
      accepted => [ESNumber(7), writeProperty(state, "saved", ESBoolean(true), accepted)]))
  });
  expect(context.value.scope.correct).toMatchObject({ value: true });
  expect(context.value.scope.classified).toMatchObject({ value: true });
  expect(context.value.scope.caught).toMatchObject({ value: undefined });
  const paths = effectPaths(context.value.effects!);
  expect(paths).toHaveLength(2);
  for (const path of paths) {
    const failed = resolveBoolean(fails, path.knowledge);
    expect(failed).not.toBeUndefined();
    expect(labels(path.events)).toEqual(["save:call", failed ? "save:throw" : "save:return"]);
    expect(strictEquality(outcome(path.events[1]), failed ? failure : ESNumber(7), path.knowledge))
      .toMatchObject({ value: true });
  }
});

test("an unmodeled operation is an analysis gap, never a silent successful no-op", () => {
  expect(() => run(`
    let caught = false;
    try { unmodeled(); } catch (error) { caught = true; }
  `, { unmodeled: createHostFunction("unmodeled") })).toThrow(/Unmodeled host operation/);
});

test("a host model implementation failure cannot be caught as a JavaScript failure", () => {
  expect(() => run(`
    let caught = false;
    try { broken(); } catch (error) { caught = true; }
  `, {
    broken: createHostFunction("broken", () => { throw new Error("model implementation failed"); })
  })).toThrow(/model implementation failed/);
});

test("a suffix after a branch is recorded once per feasible path", () => {
  const selected = ESBoolean();
  const context = run(`
    if (selected) first();
    shared();
    if (selected) last();
  `, { selected, first: recording("first"), shared: recording("shared"), last: recording("last") });
  const paths = effectPaths(context.value.effects!);
  expect(paths).toHaveLength(2);
  for (const path of paths) {
    const called = resolveBoolean(selected, path.knowledge);
    expect(called).not.toBeUndefined();
    expect(labels(path.events)).toEqual(called ? [
      "first:call", "first:return", "shared:call", "shared:return", "last:call", "last:return"
    ] : ["shared:call", "shared:return"]);
    expect(path.events.filter(event => event.kind === "call" && event.call.operation === "shared"))
      .toHaveLength(1);
  }
});

test("an effect before a branch remains a single shared prefix of each outcome", () => {
  const selected = ESBoolean();
  const context = run(`
    before();
    if (selected) conditional();
    after();
  `, {
    selected, before: recording("before"), conditional: recording("conditional"), after: recording("after")
  });
  const paths = effectPaths(context.value.effects!);
  expect(paths).toHaveLength(2);
  for (const path of paths) {
    const called = resolveBoolean(selected, path.knowledge);
    expect(called).not.toBeUndefined();
    expect(labels(path.events)).toEqual(called ? [
      "before:call", "before:return", "conditional:call", "conditional:return", "after:call", "after:return"
    ] : ["before:call", "before:return", "after:call", "after:return"]);
  }
  expect(paths[0].events[0]).toBe(paths[1].events[0]);
  expect(paths[0].events[1]).toBe(paths[1].events[1]);
});

test("large flat effect histories can be inspected without recursive stack growth", () => {
  const save = recording("save");
  let context: TExecutionContext = nodeInitialExecutionContext;
  // Invoke the same VM operation directly so this exercises trace size rather
  // than the statement evaluator's separate recursion-depth limit.
  for (let index = 0; index < 3000; index++) {
    const [completion, next] = invoke(save, [ESNumber(index)], context);
    expect(isThrownValue(completion)).toBe(false);
    context = next;
  }
  const paths = effectPaths(context.value.effects!);
  expect(paths).toHaveLength(1);
  expect(paths[0].events).toHaveLength(6000);
  expect(paths[0].events[0].call.args[0]).toMatchObject({ value: 0 });
  expect(paths[0].events[5998].call.args[0]).toMatchObject({ value: 2999 });
  expect(paths[0].events[5999].call).toBe(paths[0].events[5998].call);
});

test("the inspection limit reports too many paths without restricting evaluated inputs", () => {
  const first = ESBoolean();
  const second = ESBoolean();
  const context = run(`
    if (first) save(1);
    if (second) save(2);
    const uncertain = first && second;
  `, { first, second, save: recording("save") });
  expect(context.value.scope.uncertain).toMatchObject({ value: undefined });
  expect(() => effectPaths(context.value.effects!, [], 3)).toThrow("Effect trace path limit exceeded");
  expect(effectPaths(context.value.effects!, [], 4)).toHaveLength(4);
  const selected = effectPaths(context.value.effects!, assume([], first, true), 2);
  expect(selected).toHaveLength(2);
  selected.forEach(path => expect(resolveBoolean(first, path.knowledge)).toBe(true));
});

test("separate evaluations never inherit another execution's effect trace", () => {
  const save = recording("save");
  const first = run("save(1);", { save });
  const second = run("save(2);", { save });
  const untouched = run("const result = 3;");
  expect(effectPaths(first.value.effects!)[0].events).toHaveLength(2);
  expect(effectPaths(second.value.effects!)[0].events).toHaveLength(2);
  expect(effectPaths(second.value.effects!)[0].events[0].call.args[0]).toMatchObject({ value: 2 });
  expect(effectPaths(untouched.value.effects!)[0].events).toEqual([]);
  expect(effectPaths(nodeInitialExecutionContext.value.effects!)[0].events).toEqual([]);
});
