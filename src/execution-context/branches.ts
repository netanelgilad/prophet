import { Any, TESBoolean, Undefined, WithProperties, isArray,
  isReturnValue, isThrownValue, ReturnValue, ThrownValue } from "../types";
import { TArray } from "../array/Array";
import { assume, resolveBoolean, selectValue } from "../symbolic";
import { Binding, ExecutionContext, TExecutionContext } from "./ExecutionContext";
import { getArrayElements, getProperties, getPropertyKeys, ownPropertyPresence, HeapEntry } from "./Heap";
import { mergePropertyKeys } from "./PropertyKeys";
import { isForkedCompletion } from "./Completion";
import { ESBoolean } from "../boolean/ESBoolean";
import { mergeEffectTraces } from "../effects/trace";

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
    const result: { [key: string]: Any } = Object.create(null);
    new Set([...Object.keys(yes), ...Object.keys(no)]).forEach(name => {
      // Property names are data, including __proto__ and constructor. Never
      // invoke a host setter or read an inherited host property during a join.
      result[name] = select(
        Object.prototype.hasOwnProperty.call(yes, name) ? yes[name] : Undefined,
        Object.prototype.hasOwnProperty.call(no, name) ? no[name] : Undefined
      );
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
    const presence: { [name: string]: TESBoolean } = Object.create(null);
    Object.keys(entry.properties).forEach(name => {
      presence[name] = select(ownPropertyPresence(object, name, consequent),
        ownPropertyPresence(object, name, alternate)) as TESBoolean;
    });
    entry.presence = presence;
    entry.keyOrder = mergePropertyKeys(condition, getPropertyKeys(object, consequent), getPropertyKeys(object, alternate));
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
  const environments = new Map(base.value.environments);
  const records = new Set([
    ...Array.from(consequent.value.environments.keys()),
    ...Array.from(alternate.value.environments.keys())
  ]);
  records.forEach(environment => {
    const yes = consequent.value.environments.get(environment);
    const no = alternate.value.environments.get(environment);
    // A closure created on just one path may escape in a conditional value.
    // Its private environment remains available when that path is selected.
    if (yes === no || !yes || !no) {
      environments.set(environment, (yes || no)!);
      return;
    }
    const merged = new Map<string, Binding>();
    new Set([...Array.from(yes.keys()), ...Array.from(no.keys())]).forEach(name => {
      const a = yes.get(name), b = no.get(name);
      if (!a || !b) {
        // Sloppy eval can add a var to an already existing record on only one
        // path. Treating it as always present would hide an outer binding (or
        // an unresolved name) on the other path. Conditional binding presence
        // needs its own lookup model; never fabricate a universal binding.
        throw new Error("Conditional creation of bindings in an existing environment is not yet supported");
      }
      if (a === b) merged.set(name, a);
      else {
        const initialized = a.initialized === b.initialized ? a.initialized : select(
          typeof a.initialized === "boolean" ? ESBoolean(a.initialized) : a.initialized,
          typeof b.initialized === "boolean" ? ESBoolean(b.initialized) : b.initialized
        ) as TESBoolean;
        merged.set(name, { ...a,
          // Until the implicit value is modeled, a read remains unsupported
          // if either path can retain it. A later overwrite clears the marker.
          unmodeled: a.unmodeled || b.unmodeled,
          initialized: typeof initialized === "boolean" ? initialized :
            initialized.value === undefined ? initialized : initialized.value,
          value: a.value === b.value ? a.value : select(a.value, b.value)
        });
      }
    });
    environments.set(environment, merged);
  });
  return ExecutionContext({
    ...base.value,
    environment: consequent.value.environment,
    environments,
    strict: consequent.value.strict,
    sourceFile: consequent.value.sourceFile === alternate.value.sourceFile
      ? consequent.value.sourceFile : undefined,
    thisValue: select(consequent.value.thisValue, alternate.value.thisValue),
    heap,
    effects: consequent.value.effects === undefined && alternate.value.effects === undefined
      ? undefined
      : mergeEffectTraces(condition, consequent.value.effects, alternate.value.effects, knowledge),
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
