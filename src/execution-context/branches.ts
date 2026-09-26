import { Any, TESBoolean, Undefined, WithProperties, isArray,
  isReturnValue, isThrownValue, ReturnValue, ThrownValue } from "../types";
import { TArray } from "../array/Array";
import { assume, resolveBoolean, selectValue } from "../symbolic";
import { ExecutionContext, TExecutionContext } from "./ExecutionContext";
import { getArrayElements, getProperties, HeapEntry } from "./Heap";
import { isForkedCompletion } from "./Completion";

export function assumeInContext(
  context: TExecutionContext,
  condition: TESBoolean,
  truth: boolean
): TExecutionContext {
  return ExecutionContext({
    ...context.value,
    knowledge: assume(context.value.knowledge || [], condition, truth)
  });
}

export function mergeContexts(
  condition: TESBoolean,
  base: TExecutionContext,
  consequent: TExecutionContext,
  alternate: TExecutionContext
): TExecutionContext {
  const knowledge = base.value.knowledge || [];
  const select = (yes: Any, no: Any) => selectValue(condition, yes, no, knowledge);
  const mergeProperties = (
    yes: { [key: string]: Any },
    no: { [key: string]: Any }
  ) => {
    const result: { [key: string]: Any } = {};
    new Set([...Object.keys(yes), ...Object.keys(no)]).forEach(name => {
      result[name] = select(yes[name] || Undefined, no[name] || Undefined);
    });
    return result;
  };
  const heap = new Map<object, HeapEntry>(base.value.heap || []);
  const changed = new Set<object>();
  if (consequent.value.heap) consequent.value.heap.forEach((_, value) => changed.add(value));
  if (alternate.value.heap) alternate.value.heap.forEach((_, value) => changed.add(value));
  changed.forEach(value => {
    const object = value as WithProperties;
    const entry: HeapEntry = {
      properties: mergeProperties(
        getProperties(object, consequent),
        getProperties(object, alternate)
      )
    };
    if (isArray(value)) {
      const yes = getArrayElements(value as TArray<any>, consequent);
      const no = getArrayElements(value as TArray<any>, alternate);
      if (yes && no && yes.length === no.length &&
          Object.keys(yes).join(",") === Object.keys(no).join(",")) {
        entry.elements = yes.map((item, index) => select(item, no[index]));
      }
    }
    heap.set(value, entry);
  });
  return ExecutionContext({
    ...base.value,
    scope: mergeProperties(consequent.value.scope, alternate.value.scope),
    thisValue: select(consequent.value.thisValue, alternate.value.thisValue),
    heap,
    knowledge
  });
}

export type BranchResult = [Any, TExecutionContext];

// Both alternatives start from the same persistent state. Only the guard is
// added to each path; no branch can mutate the other's bindings or heap.
export function evaluateBranches(
  condition: TESBoolean,
  base: TExecutionContext,
  consequent: (context: TExecutionContext) => BranchResult,
  alternate: (context: TExecutionContext) => BranchResult
): BranchResult {
  const known = resolveBoolean(condition, base.value.knowledge || []);
  if (known !== undefined) {
    return (known ? consequent : alternate)(assumeInContext(base, condition, known));
  }
  const yes = consequent(assumeInContext(base, condition, true));
  const no = alternate(assumeInContext(base, condition, false));
  return mergeBranchResults(condition, base, yes, no);
}

export function mergeBranchResults(
  condition: TESBoolean, base: TExecutionContext,
  yes: BranchResult, no: BranchResult
): BranchResult {
  const context = mergeContexts(condition, base, yes[1], no[1]);
  const select = (a: Any, b: Any) => selectValue(condition, a, b, base.value.knowledge || []);
  if (isReturnValue(yes[0]) && isReturnValue(no[0])) {
    return [ReturnValue(select(yes[0].value, no[0].value)), context];
  }
  if (isThrownValue(yes[0]) && isThrownValue(no[0])) {
    return [ThrownValue(select(yes[0].value, no[0].value)), context];
  }
  if (isReturnValue(yes[0]) || isReturnValue(no[0]) ||
      isThrownValue(yes[0]) || isThrownValue(no[0]) ||
      isForkedCompletion(yes[0]) || isForkedCompletion(no[0])) {
    return [{ type: "ForkedCompletion", condition, base,
      consequent: yes, alternate: no }, context];
  }
  return [select(yes[0], no[0]), context];
}
