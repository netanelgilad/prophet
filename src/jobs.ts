import { invoke } from "./ASTResolvers";
import { Array as ESArray, TArray } from "./array/Array";
import { withValue } from "./conversion/toString";
import { mapCompletions } from "./evaluate";
import { withAnalysisFailureContext } from "./execution-context/analysis-failure";
import { assumeInContext, BranchResult, mergeBranchResults } from "./execution-context/branches";
import { isForkedCompletion } from "./execution-context/Completion";
import { TExecutionContext } from "./execution-context/ExecutionContext";
import { getArrayElements, getProperties, writeProperty } from "./execution-context/Heap";
import { ESObject, TESObject } from "./Object";
import { choiceOf, resolveBoolean } from "./symbolic";
import { Any, isReturnValue, isThrownValue, isUndefined, TESBoolean, Undefined } from "./types";

export type JobQueue = {
  state: TESObject;
  enqueue(callback: Any, args: Any[], context: TExecutionContext, receiver?: Any): BranchResult;
  drain(context: TExecutionContext, maxJobs: number): BranchResult;
};

// A FIFO primitive, not a policy for when a runtime reaches a checkpoint or
// which external events arrive. State is ordinary persistent heap data; jobs
// retain values and identities, never a captured execution-context snapshot.
export function createJobQueue(): JobQueue {
  const state = ESObject({ pending: ESArray<Any>([]), active: Undefined });
  const entries = (value: Any, context: TExecutionContext): Any[] => {
    const result = getArrayElements(value as TArray<Any>, context);
    if (!result) throw new Error("Job queue requires a finite dense pending list");
    return result;
  };
  const save = (pending: Any[], context: TExecutionContext) =>
    writeProperty(state, "pending", ESArray(pending), context);

  return {
    state,
    enqueue(callback, args, context, receiver = Undefined) {
      const job = ESObject({ callback, args: ESArray(args.slice()), receiver });
      return withValue(getProperties(state, context).pending, context, (pending, branch) =>
        [Undefined, save(entries(pending, branch).concat([job]), branch)]);
    },
    drain(context, maxJobs) {
      withAnalysisFailureContext(context, () => {
        if (!Number.isSafeInteger(maxJobs) || maxJobs < 0) {
          throw new Error("Job budget must be a nonnegative safe integer");
        }
        if (!isUndefined(getProperties(state, context).active)) {
          throw new Error("Draining an active job or resuming its continuation is not yet supported");
        }
      });
      type Work = { kind: "resume"; result: BranchResult } |
        { kind: "join"; condition: TESBoolean; base: TExecutionContext };
      const work: Work[] = [{ kind: "resume", result: [Undefined, context] }];
      const results: BranchResult[] = [];
      let delivered = 0;
      // Explicit continuation frames keep long enqueue chains off the native
      // stack. Join a completed subtree once; never redrain its merged state.
      const fork = (condition: TESBoolean, base: TExecutionContext, yes: BranchResult, no: BranchResult) => {
        work.push({ kind: "join", condition, base },
          { kind: "resume", result: no }, { kind: "resume", result: yes });
      };
      while (work.length) {
        const next = work.pop()!;
        if (next.kind === "join") {
          const no = results.pop()!, yes = results.pop()!;
          results.push(withAnalysisFailureContext(next.base, () =>
            mergeBranchResults(next.condition, next.base, yes, no)));
          continue;
        }
        let result = next.result;
        for (;;) {
          const value = result[0];
          if (isForkedCompletion(value)) {
            fork(value.condition, value.base, value.consequent, value.alternate);
            break;
          }
          if (isThrownValue(value) || isReturnValue(value)) {
            results.push(result);
            break;
          }
          let current = result[1];
          const step = withAnalysisFailureContext(current, () => {
            let pending = getProperties(state, current).pending;
            for (;;) {
              const choice = choiceOf(pending);
              if (!choice) break;
              const known = resolveBoolean(choice.condition, current.value.knowledge);
              if (known === undefined) {
                fork(choice.condition, current,
                  [Undefined, assumeInContext(current, choice.condition, true)],
                  [Undefined, assumeInContext(current, choice.condition, false)]);
                return undefined;
              }
              current = assumeInContext(current, choice.condition, known);
              pending = known ? choice.consequent : choice.alternate;
            }
            const jobs = entries(pending, current);
            if (!jobs.length) {
              results.push([Undefined, current]);
              return undefined;
            }
            // Charge before dequeue so an exhausted budget retains the head.
            if (delivered >= maxJobs) throw new Error("Execution exceeded its job budget");
            const budget = current.value.evaluationBudget;
            if (budget && --budget.remaining < 0) throw new Error("Execution exceeded its evaluation budget");
            delivered++;
            const job = jobs[0] as TESObject;
            const fields = getProperties(job, current);
            const active = writeProperty(state, "active", job, save(jobs.slice(1), current));
            // Analysis failures retain active work. Language completions clear
            // it, including throws whose remaining queue must stay unexecuted.
            return withAnalysisFailureContext(active, () => mapCompletions(
              invoke(fields.callback, entries(fields.args, active), active, fields.receiver),
              (completion, after) => [completion, writeProperty(state, "active", Undefined, after)]));
          });
          if (!step) break;
          result = step;
        }
      }
      return results[0];
    }
  };
}
