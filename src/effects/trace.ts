import { TESBoolean } from "../types";
import { assume, Knowledge, resolveBoolean } from "../symbolic";
import { ExecutionContext, TExecutionContext } from "../execution-context/ExecutionContext";
import { EffectPath, EffectTrace, HostEffect } from "./model";

export const emptyEffects: EffectTrace = Object.freeze({ kind: "empty" });

export function mergeEffectTraces(
  condition: TESBoolean, consequent: EffectTrace = emptyEffects,
  alternate: EffectTrace = emptyEffects, knowledge: Knowledge = []
): EffectTrace {
  if (consequent === alternate) return consequent;
  const known = resolveBoolean(condition, knowledge);
  if (known !== undefined) return known ? consequent : alternate;
  return Object.freeze({ kind: "choice", condition, consequent, alternate });
}

export function appendEffect(event: HostEffect, context: TExecutionContext): TExecutionContext {
  return ExecutionContext({ ...context.value, effects: Object.freeze({
    kind: "event", previous: context.value.effects || emptyEffects, event: Object.freeze(event)
  }) });
}

// Restore the event's object state, not the final heap. Extra constraints can
// refine symbolic fields for a selected trace path. This is an inspection
// context: it does not reconstruct captured environments for replaying callbacks.
export function effectContext(
  event: HostEffect, context: TExecutionContext, knowledge: Knowledge = []
): TExecutionContext {
  return ExecutionContext({ ...context.value, heap: event.heap,
    knowledge: event.knowledge.concat(knowledge) });
}

// Inspection enumerates trace choices, not every possible value inside an
// event. Payloads and snapshots can still contain symbolic selections. Paths
// that the reasoner proves impossible are omitted; this is not a SAT solver.
export function effectPaths(
  trace: EffectTrace = emptyEffects, knowledge: Knowledge = [], maxPaths = 256
): EffectPath[] {
  if (!Number.isSafeInteger(maxPaths) || maxPaths < 1) throw new Error("Effect path limit must be a positive safe integer");
  type Suffix = { event: HostEffect; next?: Suffix };
  type Pending = { trace: EffectTrace; knowledge: Knowledge; suffix?: Suffix };
  const pending: Pending[] = [{ trace, knowledge }];
  const result: EffectPath[] = [];
  while (pending.length) {
    let { trace: current, knowledge: facts, suffix } = pending.pop()!;
    while (current.kind === "event") {
      suffix = { event: current.event, next: suffix };
      current = current.previous;
    }
    if (current.kind === "empty") {
      if (result.length === maxPaths) throw new Error("Effect trace path limit exceeded");
      const events: HostEffect[] = [];
      for (let item = suffix; item; item = item.next) events.push(item.event);
      result.push({ knowledge: facts, events });
    } else {
      const known = resolveBoolean(current.condition, facts);
      if (known !== true) pending.push({ trace: current.alternate,
        knowledge: assume(facts, current.condition, false), suffix });
      if (known !== false) pending.push({ trace: current.consequent,
        knowledge: assume(facts, current.condition, true), suffix });
    }
  }
  return result;
}
