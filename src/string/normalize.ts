import { FunctionImplementation, isESNull, isUndefined, ThrownValue } from "../types";
import { ESString, TESString } from "./String";
import { bindNormal } from "../evaluate";
import { isObjectValue, toString, withValue } from "../conversion/toString";
import { readWellKnownSymbol, toPrimitiveSymbol } from "../Object/wellKnownSymbols";
import { createError } from "../error/Error";
import { BranchResult } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { ExecutionBudgetError, UnsupportedAnalysisError } from "../execution-context/analysis-failure";

export const stringNormalize: FunctionImplementation = function*(self, args, context) {
  return withValue(self, context, (receiver, branch) => {
    // RequireObjectCoercible precedes ToString; nullish values are guest errors.
    if (isESNull(receiver) || isUndefined(receiver)) return [ThrownValue(createError(
      "TypeError", ESString("String.prototype.normalize called on null or undefined"))), branch];
    const kind = (receiver as {type: string}).type;
    if (kind === "array" || kind === "function") {
      throw new UnsupportedAnalysisError("String.normalize array/function receiver conversion is not yet supported");
    }
    const convert = (ready: TExecutionContext): BranchResult =>
      bindNormal(toString(receiver, ready), (string, afterString) =>
        withValue(string, afterString, (value, after) => {
          // Form admission is reached only after receiver ToString effects.
          const form = args.length ? args[0] : undefined;
          if (form !== undefined && !isUndefined(form)) throw new UnsupportedAnalysisError("String.normalize explicit forms are not yet supported");
          const text = (value as TESString).value;
          if (typeof text !== "string") {
            throw new UnsupportedAnalysisError("String.normalize open symbolic or legacy chunk input is not yet supported");
          }
          // This analysis limit does not model Node allocation failure semantics.
          if (text.length > 65536) throw new ExecutionBudgetError("String.normalize input exceeds 65536 UTF-16 units");
          // ASCII is closed under every Unicode normalization form, so NFC is
          // the identity there. Non-ASCII text needs the normalization tables.
          for (let index = 0; index < text.length; index++) {
            if (text.charCodeAt(index) > 0x7f) {
              throw new UnsupportedAnalysisError("String.normalize non-ASCII text is not yet supported");
            }
          }
          return [ESString(text), after];
        }));
    if (!isObjectValue(receiver)) return convert(branch);
    // Establish absence through the current prototype chain before delegating
    // to the shared ordinary converter, which does not implement symbol hooks.
    return bindNormal(readWellKnownSymbol(receiver, toPrimitiveSymbol, branch), (method, after) =>
      withValue(method, after, (hook, final) => {
        if (!isUndefined(hook) && !isESNull(hook)) {
          throw new UnsupportedAnalysisError("String.normalize custom Symbol.toPrimitive conversion is not yet supported");
        }
        return convert(final);
      }));
  });
};
