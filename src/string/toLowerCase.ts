import { FunctionImplementation, isESNull, isUndefined, ThrownValue } from "../types";
import { ESString, TESString } from "./String";
import { bindNormal } from "../evaluate";
import { isObjectValue, toString, withValue } from "../conversion/toString";
import { readWellKnownSymbol, toPrimitiveSymbol } from "../Object/wellKnownSymbols";
import { createError } from "../error/Error";
import { BranchResult } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { ExecutionBudgetError, UnsupportedAnalysisError } from "../execution-context/analysis-failure";

export const stringToLowerCase: FunctionImplementation = function*(self, _args, context) {
  return withValue(self, context, (receiver, branch) => {
    // RequireObjectCoercible precedes ToString; nullish values are guest errors.
    if (isESNull(receiver) || isUndefined(receiver)) return [ThrownValue(createError(
      "TypeError", ESString("String.prototype.toLowerCase called on null or undefined"))), branch];
    const kind = (receiver as {type: string}).type;
    // Shared default array/function conversion still has legacy failure paths.
    // Keep these exotic receivers (including customized ones) explicitly out.
    if (kind === "array" || kind === "function") {
      throw new UnsupportedAnalysisError("String.toLowerCase array/function receiver conversion is not yet supported");
    }
    const convert = (ready: TExecutionContext): BranchResult =>
      bindNormal(toString(receiver, ready), (string, afterString) =>
        withValue(string, afterString, (value, after) => {
          const text = (value as TESString).value;
          if (typeof text !== "string") {
            throw new UnsupportedAnalysisError("String.toLowerCase open symbolic or legacy chunk input is not yet supported");
          }
          // Bound work and allocation before scans, copies or output preparation.
          // Coercion has already happened; this is an analysis budget, not a
          // guest allocation failure or an ASCII assumption about unknown text.
          if (text.length > 65536) throw new ExecutionBudgetError("String.toLowerCase input exceeds 65536 UTF-16 units");
          for (let i = 0; i < text.length; i++) {
            if (text.charCodeAt(i) > 0x7f) {
              throw new UnsupportedAnalysisError("String.toLowerCase non-ASCII input is not yet supported");
            }
          }
          // One bounded unit scan plus one bounded output array/join. Do not
          // use a native casing backend or infer Unicode from ASCII results.
          const output: string[] = [];
          for (let i = 0; i < text.length; i++) {
            const unit = text.charCodeAt(i);
            output.push(String.fromCharCode(unit >= 0x41 && unit <= 0x5a ? unit + 0x20 : unit));
          }
          return [ESString(output.join("")), after];
        }));
    if (!isObjectValue(receiver)) return convert(branch);
    // Establish absence through the current prototype chain before delegating
    // to the shared ordinary converter, which does not implement symbol hooks.
    return bindNormal(readWellKnownSymbol(receiver, toPrimitiveSymbol, branch), (method, after) =>
      withValue(method, after, (hook, final) => {
        if (!isUndefined(hook) && !isESNull(hook)) {
          throw new UnsupportedAnalysisError("String.toLowerCase custom Symbol.toPrimitive conversion is not yet supported");
        }
        return convert(final);
      }));
  });
};
