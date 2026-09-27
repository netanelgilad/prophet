import { Any, Type, isESString, isESNumber, isESBoolean, isUndefined, isESNull, ThrownValue } from "../types";
import { ESString } from "../string/String";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { choiceOf, resolveBoolean } from "../symbolic";
import { bindNormal } from "../evaluate";
import { invoke, readMember } from "../ASTResolvers";
import { createError } from "../error/Error";

export function withValue(
  value: Any, context: TExecutionContext,
  continuation: (value: Any, context: TExecutionContext) => BranchResult
): BranchResult {
  const choice = choiceOf(value);
  return choice ? evaluateBranches(choice.condition, context,
    branch => withValue(choice.consequent, branch, continuation),
    branch => withValue(choice.alternate, branch, continuation)) : continuation(value, context);
}

export function isObjectValue(value: Any): boolean {
  return ["object", "array", "function"].includes((value as Type<string>).type);
}

// ToString with the string hint's ordinary toString/valueOf order. Calls are
// interpreted, so coercion keeps conditional effects and abrupt completions.
// Symbol.toPrimitive and exotic objects require their own future models.
export function toString(value: Any, context: TExecutionContext): BranchResult {
  return withValue(value, context, (input, branch) => {
    if (isESString(input)) return [input, branch];
    if (isUndefined(input)) return [ESString("undefined"), branch];
    if (isESNull(input)) return [ESString("null"), branch];
    if (isESNumber(input)) return [typeof input.value === "number" ? ESString(String(input.value)) : {
      ...ESString(), expression: { kind: "unary", operator: "ToString", operand: input }
    }, branch];
    if (isESBoolean(input)) {
      const concrete = resolveBoolean(input, branch.value.knowledge);
      return concrete === undefined ? evaluateBranches(input, branch,
        after => [ESString("true"), after], after => [ESString("false"), after]) :
        [ESString(String(concrete)), branch];
    }
    if (isObjectValue(input)) return ordinaryToPrimitive(input, branch, 0);
    throw new Error("ToString is not yet modeled for this value kind");
  });
}

function ordinaryToPrimitive(object: Any, context: TExecutionContext, index: number): BranchResult {
  if (index === 2) return [ThrownValue(createError("TypeError", ESString("Cannot convert object to primitive value"))), context];
  return bindNormal(readMember(object, ["toString", "valueOf"][index], context), (method, afterRead) =>
    withValue(method, afterRead, (callee, branch) => {
      if (!(callee as { function?: object }).function) return ordinaryToPrimitive(object, branch, index + 1);
      return bindNormal(invoke(callee, [], branch, object), (result, afterCall) =>
        withValue(result, afterCall, (primitive, after) => isObjectValue(primitive)
          ? ordinaryToPrimitive(object, after, index + 1) : toString(primitive, after)));
    }));
}
