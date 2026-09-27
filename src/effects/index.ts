import { ESBuiltinFunction } from "../Function/Function";
import { isReturnValue, isThrownValue } from "../types";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult } from "../execution-context/branches";
import { mapCompletions } from "../evaluate";
import { HostCall as Call, HostEffect as Effect, EffectTrace as Trace, EffectPath as Path } from "./model";
import { appendEffect } from "./trace";

export { effectContext, effectPaths } from "./trace";
export type HostCall = Call;
export type HostEffect = Effect;
export type EffectTrace = Trace;
export type EffectPath = Path;

export type HostModel = (call: HostCall, context: TExecutionContext) => BranchResult;

// A model is an explicit synchronous VM transition. It must use persistent VM
// state and interpreted completions, never perform the real external operation.
// A host exception remains an analysis failure, not a program-visible throw.
export function createHostFunction(operation: string, model?: HostModel) {
  const fn = ESBuiltinFunction(function*(receiver, args, context) {
    if (!model) throw new Error(`Unmodeled host operation '${operation}'`);
    const call: HostCall = Object.freeze({ id: {}, operation, target: fn, receiver,
      args: Object.freeze(args.slice()) });
    const snapshot = (current: TExecutionContext) => ({ call,
      heap: current.value.heap, knowledge: current.value.knowledge || [] });
    const started = appendEffect({ ...snapshot(context), kind: "call" }, context);
    return mapCompletions(model(call, started), (completion, after) => {
      if (isReturnValue(completion)) throw new Error("Host models must return a value, not a ReturnValue completion");
      return [completion, appendEffect({ ...snapshot(after),
        kind: isThrownValue(completion) ? "throw" : "return",
        value: isThrownValue(completion) ? completion.value : completion
      }, after)];
    });
  });
  return fn;
}
