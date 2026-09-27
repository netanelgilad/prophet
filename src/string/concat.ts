import { Any, FunctionImplementation, isESNull, isUndefined, isThrownValue, isReturnValue, ThrownValue } from "../types";
import { ESString, TESString } from "./String";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { createError } from "../error/Error";
import { bindNormal } from "../evaluate";
import { choiceOf } from "../symbolic";
import { toString } from "../conversion/toString";
import { isForkedCompletion } from "../execution-context/Completion";

// Inputs have already been converted. This is also the shared string operation
// used when constructing messages; it never invokes user code itself.
export function concatenateStrings(left: TESString, right: TESString): TESString {
  if (left.value === "") return right;
  if (right.value === "") return left;
  if (typeof left.value === "string" && typeof right.value === "string") {
    return ESString(left.value + right.value);
  }
  return { ...ESString(), expression: { kind: "binary", operator: "+", left, right } };
}

function append(left: TESString, right: TESString, context: TExecutionContext): BranchResult {
  const leftChoice = choiceOf(left);
  const rightChoice = choiceOf(right);
  const choice = leftChoice || rightChoice;
  if (choice) return evaluateBranches(choice.condition, context,
    branch => append((leftChoice ? choice.consequent : left) as TESString,
      (leftChoice ? right : choice.consequent) as TESString, branch),
    branch => append((leftChoice ? choice.alternate : left) as TESString,
      (leftChoice ? right : choice.alternate) as TESString, branch));
  return [concatenateStrings(left, right), context];
}

function concatenate(self: Any, args: Any[], context: TExecutionContext): BranchResult {
  const choice = choiceOf(self);
  if (choice) return evaluateBranches(choice.condition, context,
    branch => concatenate(choice.consequent, args, branch),
    branch => concatenate(choice.alternate, args, branch));
  if (isESNull(self) || isUndefined(self)) {
    return [ThrownValue(createError("TypeError", ESString("String.prototype.concat called on null or undefined"))), context];
  }
  const next = (result: TESString, index: number, after: TExecutionContext): BranchResult => {
    let accumulated = result;
    let current = after;
    for (let position = index; position < args.length; position++) {
      const converted = toString(args[position], current);
      if (isForkedCompletion(converted[0]) || isThrownValue(converted[0]) || isReturnValue(converted[0])) {
        // Capture an immutable prefix for each normal continuation. Only a
        // branching/abrupt conversion needs continuation frames; long ordinary
        // argument lists should not consume the host JavaScript call stack.
        const prefix = accumulated;
        const following = position + 1;
        return bindNormal(converted, (value, afterValue) =>
          bindNormal(append(prefix, value as TESString, afterValue), (joined, afterJoin) =>
            next(joined as TESString, following, afterJoin)));
      }
      // append operates only on strings and therefore has normal completions.
      const joined = append(accumulated, converted[0] as TESString, converted[1]);
      accumulated = joined[0] as TESString;
      current = joined[1];
    }
    return [accumulated, current];
  };
  return bindNormal(toString(self, context), (value, after) => next(value as TESString, 0, after));
}

export const concat: FunctionImplementation = function*(self, args, context) {
  return concatenate(self, args, context);
};
