import { invoke } from "../ASTResolvers";
import { Any, ESNumber, FunctionBinding, ThrownValue, Undefined } from "../types";
import { ESString } from "../string/String";
import { createError } from "../error/Error";
import { choiceOf } from "../symbolic";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";

function call(self: Any, args: Any[], context: TExecutionContext): BranchResult {
  const choice = choiceOf(self);
  if (choice) return evaluateBranches(choice.condition, context,
    branch => call(choice.consequent, args, branch),
    branch => call(choice.alternate, args, branch));
  if (!(self as FunctionBinding).function) {
    return [ThrownValue(createError("TypeError", ESString("Function.prototype.call requires a callable receiver"))), context];
  }
  return invoke(self, args.slice(1), context, args.length ? args[0] : Undefined);
}

// After selecting and checking its callable receiver, this built-in forwards
// through ordinary invocation to preserve receiver handling and completions.
export const functionCall: FunctionBinding & { type: "function"; nonConstructible: boolean } = {
  type: "function",
  nonConstructible: true,
  properties: { length: ESNumber(1) },
  function: {
    implementation: function*(self: Any, args, context) {
      return call(self, args, context);
    }
  }
};
