import { markUnsupportedBoundaryObject, UnsupportedAnalysisError } from "../execution-context/analysis-failure";
import { invoke } from "../ASTResolvers";
import { Any, ESNumber, FunctionBinding, ThrownValue, Undefined } from "../types";
import { ESString } from "../string/String";
import { createError } from "../error/Error";
import { choiceOf } from "../symbolic";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { getProperties } from "../execution-context/Heap";

function bind(self: Any, args: Any[], context: TExecutionContext): BranchResult {
  const choice = choiceOf(self);
  if (choice) return evaluateBranches(choice.condition, context,
    branch => bind(choice.consequent, args, branch),
    branch => bind(choice.alternate, args, branch));
  if (!(self as FunctionBinding).function) {
    return [ThrownValue(createError("TypeError", ESString("Function.prototype.bind requires a callable receiver"))), context];
  }
  const receiver = args.length ? args[0] : Undefined;
  const partial = args.slice(1);
  // Bound length is max(target.length - bound argument count, 0). Admit only
  // a current concrete own length; the bound name stays an unmodeled read,
  // exactly like a guest function's name.
  const length = getProperties(self as Parameters<typeof getProperties>[0], context).length;
  if (!length || (length as { type: string }).type !== "number" ||
      typeof (length as { value?: unknown }).value !== "number") {
    throw new UnsupportedAnalysisError("Function.prototype.bind target length is not yet supported");
  }
  const boundLength = Math.max((length as { value: number }).value - partial.length, 0);
  // Calling the bound value forwards through ordinary invocation, preserving
  // receiver handling and completions exactly like Function.prototype.call.
  const bound = markUnsupportedBoundaryObject({
    type: "function",
    nonConstructible: false,
    unmodeledConstruct: "Bound function construction is not yet supported",
    properties: { length: ESNumber(boundLength) },
    unknownProperties: "Bound function metadata",
    modeledInheritedProperties: ["call"],
    unmodeledPropertyReads: ["name", "caller", "arguments"],
    unmodeledPropertyWrites: ["name", "length", "caller", "arguments"],
    unmodeledOwnPropertyInspection: "Bound function descriptors",
    function: {
      implementation: function*(_self: Any, callArgs: Any[], callContext: TExecutionContext) {
        return invoke(self, partial.concat(callArgs), callContext, receiver);
      }
    }
  });
  return [bound, context];
}

// After selecting and checking its callable receiver, this built-in captures
// the receiver/partial arguments into a concrete bound function identity.
export const functionBind: FunctionBinding & { type: "function"; nonConstructible: boolean } = markUnsupportedBoundaryObject({
  type: "function",
  nonConstructible: true,
  properties: { length: ESNumber(1) },
  unknownProperties: "Function.prototype.bind metadata",
  modeledInheritedProperties: ["call"],
  unmodeledPropertyWrites: ["length", "name"],
  unmodeledOwnPropertyInspection: "Function.prototype.bind descriptors",
  function: {
    implementation: function*(self: Any, args, context) {
      return bind(self, args, context);
    }
  }
});
