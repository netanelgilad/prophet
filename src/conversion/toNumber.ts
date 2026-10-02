import { Any, ESNumber, isESBoolean, isESNull, isESNumber, isESString, isUndefined, ThrownValue } from "../types";
import { ESString } from "../string/String";
import { isObjectValue, withValue } from "./toString";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { bindNormal } from "../evaluate";
import { invoke, readMember } from "../ASTResolvers";
import { createError } from "../error/Error";
import { readWellKnownSymbol, toPrimitiveSymbol } from "../Object/wellKnownSymbols";

// Number-hint conversion executes ordinary valueOf/toString through the VM.
// Symbol.toPrimitive remains a declared gap, including embedding-only slots;
// it must not be silently skipped in favor of an ordinary conversion method.
export function toNumber(value: Any, context: TExecutionContext): BranchResult {
  return withValue(value, context, (input, branch) => {
    if (isESNumber(input)) return [input, branch];
    if (isUndefined(input)) return [ESNumber(NaN), branch];
    if (isESNull(input)) return [ESNumber(0), branch];
    if (isESBoolean(input)) return evaluateBranches(input, branch,
      after => [ESNumber(1), after], after => [ESNumber(0), after]);
    if (isESString(input)) return [typeof input.value === "string" ? ESNumber(Number(input.value)) : {
      ...ESNumber(), expression: { kind: "unary", operator: "ToNumber", operand: input }
    }, branch];
    if (isObjectValue(input)) return bindNormal(readWellKnownSymbol(input, toPrimitiveSymbol, branch),
      (method, after) => withValue(method, after, (selected, final) => {
        if (!isUndefined(selected) && !isESNull(selected)) {
          throw new Error("Symbol.toPrimitive numeric conversion is not yet supported");
        }
        return ordinaryToNumber(input, final, 0);
      }));
    throw new Error("ToNumber is not yet modeled for this value kind");
  });
}

function ordinaryToNumber(object: Any, context: TExecutionContext, index: number): BranchResult {
  if (index === 2) return [ThrownValue(createError("TypeError", ESString("Cannot convert object to primitive value"))), context];
  return bindNormal(readMember(object, ["valueOf", "toString"][index], context), (method, afterRead) =>
    withValue(method, afterRead, (callee, branch) => {
      if (!(callee as { function?: object }).function) return ordinaryToNumber(object, branch, index + 1);
      return bindNormal(invoke(callee, [], branch, object), (result, afterCall) =>
        withValue(result, afterCall, (primitive, after) => isObjectValue(primitive)
          ? ordinaryToNumber(object, after, index + 1) : toNumber(primitive, after)));
    }));
}
