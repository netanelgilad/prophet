import { FunctionImplementation, isESNull, isUndefined, ThrownValue } from "../types";
import { ESString, TESString } from "./String";
import { bindNormal } from "../evaluate";
import { isObjectValue, toString, withValue } from "../conversion/toString";
import { readWellKnownSymbol, toPrimitiveSymbol } from "../Object/wellKnownSymbols";
import { createError } from "../error/Error";
import { BranchResult } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { ExecutionBudgetError, UnsupportedAnalysisError } from "../execution-context/analysis-failure";

// Modern ECMAScript WhiteSpace + LineTerminator, in UTF-16 code units.
// U+0085, U+180E and U+200B are deliberately absent. No normalization occurs.
function whitespace(unit: number): boolean {
  return (unit >= 0x09 && unit <= 0x0d) || unit === 0x20 || unit === 0xa0 ||
    unit === 0x1680 || (unit >= 0x2000 && unit <= 0x200a) ||
    unit === 0x2028 || unit === 0x2029 || unit === 0x202f ||
    unit === 0x205f || unit === 0x3000 || unit === 0xfeff;
}

export const stringTrim: FunctionImplementation = function*(self, _args, context) {
  return withValue(self, context, (receiver, branch) => {
    // RequireObjectCoercible precedes ToString; nullish values are guest errors.
    if (isESNull(receiver) || isUndefined(receiver)) return [ThrownValue(createError(
      "TypeError", ESString("String.prototype.trim called on null or undefined"))), branch];
    const kind = (receiver as {type: string}).type;
    // Shared default array/function conversion still has legacy failure paths.
    // Keep these exotic receivers (including customized ones) explicitly out.
    if (kind === "array" || kind === "function") {
      throw new UnsupportedAnalysisError("String.trim array/function receiver conversion is not yet supported");
    }
    const convert = (ready: TExecutionContext): BranchResult =>
      bindNormal(toString(receiver, ready), (string, afterString) =>
        withValue(string, afterString, (value, after) => {
          const text = (value as TESString).value;
          if (typeof text !== "string") {
            throw new UnsupportedAnalysisError("String.trim open symbolic or legacy chunk input is not yet supported");
          }
          // Check before scanning, copying or allocating the output. At most
          // 65536 distinct units are visited (at most length + 1 predicate calls),
          // and the single slice is no larger than the input.
          // This analysis limit does not model Node allocation failure semantics.
          if (text.length > 65536) throw new ExecutionBudgetError("String.trim input exceeds 65536 UTF-16 units");
          let start = 0, end = text.length;
          while (start < end && whitespace(text.charCodeAt(start))) start++;
          while (end > start && whitespace(text.charCodeAt(end - 1))) end--;
          return [ESString(text.slice(start, end)), after];
        }));
    if (!isObjectValue(receiver)) return convert(branch);
    // Establish absence through the current prototype chain before delegating
    // to the shared ordinary converter, which does not implement symbol hooks.
    return bindNormal(readWellKnownSymbol(receiver, toPrimitiveSymbol, branch), (method, after) =>
      withValue(method, after, (hook, final) => {
        if (!isUndefined(hook) && !isESNull(hook)) {
          throw new UnsupportedAnalysisError("String.trim custom Symbol.toPrimitive conversion is not yet supported");
        }
        return convert(final);
      }));
  });
};
