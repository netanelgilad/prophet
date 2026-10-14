import { Any, ESNumber, FunctionImplementation, isESNull, isUndefined, TESNumber, ThrownValue, Undefined } from "../types";
import { ESString, getStringPrototype, TESString } from "./String";
import { bindNormal } from "../evaluate";
import { ordinaryStringHint, toString, withValue } from "../conversion/toString";
import { ordinaryNumberHint, toNumber } from "../conversion/toNumber";
import { readWellKnownSymbol, toPrimitiveSymbol } from "../Object/wellKnownSymbols";
import { createError } from "../error/Error";
import { BranchResult } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { ExecutionBudgetError, UnsupportedAnalysisError } from "../execution-context/analysis-failure";

// Admission belongs at each reached primitive finish, including values returned
// by interpreted ordinary methods. Do not send late exotic kinds to a legacy
// shared converter, or mistake a returned undefined end for an omitted argument.
function convert(input: Any, context: TExecutionContext, numeric: boolean): BranchResult {
  return withValue(input, context, (value, branch) => {
    const kind = (value as { type: string }).type;
    if (!["undefined", "null", "number", "boolean", "string", "object"].includes(kind) ||
        ((value as { stringData?: boolean }).stringData && value !== getStringPrototype())) {
      throw new UnsupportedAnalysisError("String.substring exotic, wrapper, BigInt or Symbol conversion is not yet supported");
    }
    if (kind !== "object") return numeric ? toNumber(value, branch) : toString(value, branch);
    return bindNormal(readWellKnownSymbol(value, toPrimitiveSymbol, branch), (method, after) =>
      withValue(method, after, (hook, ready) => {
        if (!isUndefined(hook) && !isESNull(hook)) {
          throw new UnsupportedAnalysisError("String.substring custom Symbol.toPrimitive conversion is not yet supported");
        }
        const finish = (primitive: Any, current: TExecutionContext) => convert(primitive, current, numeric);
        return numeric ? ordinaryNumberHint(value, ready, finish) : ordinaryStringHint(value, ready, finish);
      }));
  });
}

function clamp(number: number, length: number): number {
  const integer = Number.isNaN(number) || number === 0 ? 0 : Math.trunc(number);
  return Math.min(Math.max(integer, 0), length);
}

export const stringSubstring: FunctionImplementation = function*(self, args, context) {
  return withValue(self, context, (receiver, branch) => {
    if (isESNull(receiver) || isUndefined(receiver)) return [ThrownValue(createError(
      "TypeError", ESString("String.prototype.substring called on null or undefined"))), branch];
    return bindNormal(convert(receiver, branch, false), (string, afterReceiver) =>
      bindNormal(convert(args.length ? args[0] : Undefined, afterReceiver, true), (start, afterStart) =>
        withValue(args.length > 1 ? args[1] : Undefined, afterStart, (endArgument, endBranch) => {
          // Capture default-end identity before conversion. Length admission is
          // late: open receiver/start values still allow end effects and throws.
          const defaultEnd = isUndefined(endArgument);
          const end = defaultEnd ? [ESNumber(0), endBranch] as BranchResult : convert(endArgument, endBranch, true);
          return bindNormal(end, (convertedEnd, afterEnd) =>
            withValue(string, afterEnd, (textValue, textBranch) =>
              withValue(start, textBranch, (startValue, startBranch) =>
                withValue(convertedEnd, startBranch, (endValue, ready) => {
                  const text = (textValue as TESString).value;
                  const from = (startValue as TESNumber).value;
                  const to = (endValue as TESNumber).value;
                  if (typeof text !== "string" || typeof from !== "number" || typeof to !== "number") {
                    throw new UnsupportedAnalysisError("String.substring open symbolic or legacy chunk operands are not yet supported");
                  }
                  // Before any copy/preparation, even when the result is empty.
                  // This cap does not bound interpreted coercion or Number parsing.
                  if (text.length > 65536) {
                    throw new ExecutionBudgetError("String.substring receiver exceeds 65536 UTF-16 units");
                  }
                  const a = clamp(from, text.length), b = defaultEnd ? text.length : clamp(to, text.length);
                  const output: string[] = [];
                  for (let i = Math.min(a, b); i < Math.max(a, b); i++) {
                    output.push(String.fromCharCode(text.charCodeAt(i)));
                  }
                  return [ESString(output.join("")), ready];
                }))));
        })));
  });
};
