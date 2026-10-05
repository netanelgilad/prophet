import { invoke } from "./ASTResolvers";
import { Array as ESArray, TArray } from "./array/Array";
import { ESBoolean } from "./boolean/ESBoolean";
import { withValue } from "./conversion/toString";
import { bindNormal, mapCompletions } from "./evaluate";
import { captureExecutionBoundary, ExecutionBudgetError, UnsupportedAnalysisError, withAnalysisFailureContext } from "./execution-context/analysis-failure";
import { BranchResult, evaluateBranches } from "./execution-context/branches";
import { TExecutionContext } from "./execution-context/ExecutionContext";
import { getArrayElements, getProperties, writeProperty } from "./execution-context/Heap";
import { ESObject, TESObject } from "./Object";
import { Any, isESBoolean, Undefined } from "./types";

export type ExternalEvents = {
  state: TESObject;
  register(source: TESObject, context: TExecutionContext): BranchResult;
  /** Normal result is true after one arrival, false for the waiting alternative. */
  step(context: TExecutionContext): BranchResult;
  explore(context: TExecutionContext, maxEvents: number,
    afterEvent?: (context: TExecutionContext) => BranchResult): BranchResult;
};

/** Runtime-owned sources, not arbitrary retained closures. Each source has an
 * eligible predicate, deliver transition, and receiver. Eligibility functions
 * are runtime-owned, side-effect-free predicates; this is not a user callback
 * scheduler. Registration is ordinary
 * persistent state, so absent/conditional resources never become global sources.
 * Each checkpoint explores no arrival or one eligible source. A waiting
 * alternative ends that bounded history; it is not a fake event or clock tick. */
export function createExternalEvents(): ExternalEvents {
  const state = ESObject({ sources: ESArray<Any>([]), active: Undefined });
  const entries = (value: Any, context: TExecutionContext) => {
    const elements = getArrayElements(value as TArray<Any>, context);
    if (!elements || Object.keys(elements).length !== elements.length) {
      throw new Error("External event sources require a finite dense list");
    }
    return elements;
  };
  const requireIdle = (context: TExecutionContext) => {
    if (getProperties(state, context).active !== Undefined) {
      throw new UnsupportedAnalysisError("Resuming active external event delivery is not yet supported");
    }
  };
  // Run continuations inside the selected delivery branch. Joining true/false
  // arrival results first and then branching on that composite Boolean can lose
  // provider/state correlations with the current incomplete reasoner.
  const stepWithContinuation = (context: TExecutionContext,
    onArrival: (context: TExecutionContext) => BranchResult,
    onWaiting: (context: TExecutionContext) => BranchResult): BranchResult =>
    captureExecutionBoundary(context, () => withAnalysisFailureContext(context, () => {
      requireIdle(context);
      return withValue(getProperties(state, context).sources, context, (value, branch) => {
        const sources = entries(value, branch);
        const choose = (index: number, current: TExecutionContext): BranchResult => {
          if (index === sources.length) return onWaiting(current);
          const source = sources[index] as TESObject;
          const fields = getProperties(source, current);
          const later = (after: TExecutionContext) => choose(index + 1, after);
          return bindNormal(invoke(fields.eligible, [], current, fields.receiver), (eligible, checked) => {
            if (!isESBoolean(eligible)) throw new Error("External event eligibility must be Boolean");
            return evaluateBranches(eligible, checked, ready =>
              // Each step has fresh arrival choices and reads current sources.
              // Array order does not impose priority among eligible providers.
              evaluateBranches(ESBoolean(), ready, selected => {
                const budget = selected.value.evaluationBudget;
                if (budget && --budget.remaining < 0) throw new ExecutionBudgetError("Execution exceeded its evaluation budget");
                const active = writeProperty(state, "active", source, selected);
                return withAnalysisFailureContext(active, () => bindNormal(mapCompletions(
                  invoke(fields.deliver, [], active, fields.receiver),
                  (completion, after) => [completion, writeProperty(state, "active", Undefined, after)]),
                  (_completion, after) => onArrival(after)));
              }, later), later);
          });
        };
        return choose(0, branch);
      });
    }));
  const registry: ExternalEvents = {
    state,
    register(source, context) {
      return withValue(getProperties(state, context).sources, context, (sources, branch) =>
        [Undefined, writeProperty(state, "sources", ESArray(entries(sources, branch).concat(source)), branch)]);
    },
    step(context) {
      return stepWithContinuation(context, after => [ESBoolean(true), after], waiting => [ESBoolean(false), waiting]);
    },
    explore(context, maxEvents, afterEvent) {
      if (maxEvents !== 0 && maxEvents !== 1 && maxEvents !== 2) {
        throw new Error("External event exploration currently supports only bounds 0, 1 and 2");
      }
      const advance = (remaining: number, current: TExecutionContext): BranchResult => {
        if (!remaining) return [Undefined, current];
        return stepWithContinuation(current,
          delivered => bindNormal(afterEvent ? afterEvent(delivered) : [Undefined, delivered],
            (_value, drained) => advance(remaining - 1, drained)),
          waiting => [Undefined, waiting]);
      };
      return captureExecutionBoundary(context, () => withAnalysisFailureContext(context, () => {
        requireIdle(context);
        return advance(maxEvents, context);
      }));
    }
  };
  return registry;
}
