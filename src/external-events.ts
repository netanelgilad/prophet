import { invoke } from "./ASTResolvers";
import { Array as ESArray, TArray } from "./array/Array";
import { ESBoolean } from "./boolean/ESBoolean";
import { withValue } from "./conversion/toString";
import { bindNormal, mapCompletions } from "./evaluate";
import { withAnalysisFailureContext } from "./execution-context/analysis-failure";
import { BranchResult, evaluateBranches } from "./execution-context/branches";
import { TExecutionContext } from "./execution-context/ExecutionContext";
import { getArrayElements, getProperties, writeProperty } from "./execution-context/Heap";
import { ESObject, TESObject } from "./Object";
import { Any, isESBoolean, Undefined } from "./types";

export type ExternalEvents = {
  state: TESObject;
  register(source: TESObject, context: TExecutionContext): BranchResult;
  explore(context: TExecutionContext, maxEvents: number): BranchResult;
};

/** Runtime-owned sources, not arbitrary retained closures. Each source has an
 * eligible predicate, deliver transition, and receiver. Eligibility functions
 * are runtime-owned, side-effect-free predicates; this is not a user callback
 * scheduler. Registration is ordinary
 * persistent state, so absent/conditional resources never become global sources.
 * The first bounded checkpoint explores no arrival or one eligible source. */
export function createExternalEvents(): ExternalEvents {
  const state = ESObject({ sources: ESArray<Any>([]), active: Undefined });
  const entries = (value: Any, context: TExecutionContext) => {
    const elements = getArrayElements(value as TArray<Any>, context);
    if (!elements || Object.keys(elements).length !== elements.length) {
      throw new Error("External event sources require a finite dense list");
    }
    return elements;
  };
  return {
    state,
    register(source, context) {
      return withValue(getProperties(state, context).sources, context, (sources, branch) =>
        [Undefined, writeProperty(state, "sources", ESArray(entries(sources, branch).concat(source)), branch)]);
    },
    explore(context, maxEvents) {
      return withAnalysisFailureContext(context, () => {
        if (maxEvents !== 0 && maxEvents !== 1) {
          throw new Error("External event exploration currently supports only bounds 0 and 1");
        }
        if (getProperties(state, context).active !== Undefined) {
          throw new Error("Resuming active external event delivery is not yet supported");
        }
        if (maxEvents === 0) return [Undefined, context];
        return withValue(getProperties(state, context).sources, context, (value, branch) => {
          const sources = entries(value, branch);
          const choose = (index: number, current: TExecutionContext): BranchResult => {
            if (index === sources.length) return [Undefined, current];
            const source = sources[index] as TESObject;
            const fields = getProperties(source, current);
            const later = (after: TExecutionContext) => choose(index + 1, after);
            return bindNormal(invoke(fields.eligible, [], current, fields.receiver), (eligible, checked) => {
              if (!isESBoolean(eligible)) throw new Error("External event eligibility must be Boolean");
              return evaluateBranches(eligible, checked, ready =>
                // Independent choice variables represent all first-arrival
                // identities and the no-arrival-yet alternative, not a priority.
                evaluateBranches(ESBoolean(), ready, selected => {
                  const budget = selected.value.evaluationBudget;
                  if (budget && --budget.remaining < 0) throw new Error("Execution exceeded its evaluation budget");
                  const active = writeProperty(state, "active", source, selected);
                  return withAnalysisFailureContext(active, () => mapCompletions(
                    invoke(fields.deliver, [], active, fields.receiver),
                    (completion, after) => [completion, writeProperty(state, "active", Undefined, after)]));
                }, later), later);
            });
          };
          return choose(0, branch);
        });
      });
    }
  };
}
