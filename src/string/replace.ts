import { FunctionImplementation, isESNull, isUndefined, ThrownValue, Undefined, WithProperties } from "../types";
import { ESString, TESString } from "./String";
import { bindNormal } from "../evaluate";
import { isObjectValue, toString, withValue } from "../conversion/toString";
import { readWellKnownSymbol, toPrimitiveSymbol } from "../Object/wellKnownSymbols";
import { createError } from "../error/Error";
import { getProperties } from "../execution-context/Heap";
import { BranchResult } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { UnsupportedAnalysisError } from "../execution-context/analysis-failure";
import { isRegExp, hasIntrinsicRegExpPrototype } from "../regexp/RegExp";
import { matches } from "../regexp/matcher";

export const stringReplace: FunctionImplementation = function*(self, args, context) {
  return withValue(self, context, (receiver, branch) => {
    // RequireObjectCoercible precedes ToString; nullish values are guest errors.
    if (isESNull(receiver) || isUndefined(receiver)) return [ThrownValue(createError(
      "TypeError", ESString("String.prototype.replace called on null or undefined"))), branch];
    const kind = (receiver as {type: string}).type;
    if (kind === "array" || kind === "function") {
      throw new UnsupportedAnalysisError("String.replace array/function receiver conversion is not yet supported");
    }
    const convert = (ready: TExecutionContext): BranchResult =>
      bindNormal(toString(receiver, ready), (string, afterString) =>
        withValue(string, afterString, (textValue, afterText) => {
          const text = (textValue as TESString).value;
          if (typeof text !== "string") {
            throw new UnsupportedAnalysisError("String.replace open symbolic or legacy chunk input is not yet supported");
          }
          return withValue(args.length ? args[0] : Undefined, afterText, (search, afterSearch) => {
            // Bounded slice: an intrinsic-layout RegExp search value. String
            // patterns, custom Symbol.replace and non-RegExp objects stay out.
            if (!isRegExp(search)) {
              throw new UnsupportedAnalysisError("String.replace non-RegExp search values are not yet supported");
            }
            const prototype = search.prototype as WithProperties;
            if (!hasIntrinsicRegExpPrototype(search) || search.propertyAccess || !prototype || prototype.propertyAccess ||
                (search.unmodeledPropertyReads && search.unmodeledPropertyReads.includes("exec")) ||
                Object.prototype.hasOwnProperty.call(getProperties(search, afterSearch), "exec") ||
                Object.prototype.hasOwnProperty.call(getProperties(prototype, afterSearch), "exec")) {
              throw new UnsupportedAnalysisError("String.replace custom exec dispatch or regexp layout is not yet supported");
            }
            // The Boolean matcher is flagless, so only flagless and g layouts
            // can reuse its no-match answer: with no match, replace is the
            // identity regardless of replacement kind or substitution syntax,
            // and the replacement is never observed. A match needs ordered
            // match positions, which the Boolean matcher must not provide.
            const flags = search.regexpData.originalFlags;
            if (flags !== "" && flags !== "g") {
              throw new UnsupportedAnalysisError("String.replace regexp flags other than g are not yet supported");
            }
            if (matches(search.regexpData.originalSource, text)) {
              throw new UnsupportedAnalysisError("String.replace matched substitutions are not yet supported");
            }
            return [ESString(text), afterSearch];
          });
        }));
    if (!isObjectValue(receiver)) return convert(branch);
    // Establish absence through the current prototype chain before delegating
    // to the shared ordinary converter, which does not implement symbol hooks.
    return bindNormal(readWellKnownSymbol(receiver, toPrimitiveSymbol, branch), (method, after) =>
      withValue(method, after, (hook, final) => {
        if (!isUndefined(hook) && !isESNull(hook)) {
          throw new UnsupportedAnalysisError("String.replace custom Symbol.toPrimitive conversion is not yet supported");
        }
        return convert(final);
      }));
  });
};
