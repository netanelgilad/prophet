import { FunctionImplementation, isESNull, isESString, isUndefined, ThrownValue, Undefined, WithProperties } from "../types";
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


// GetSubstitution for a string search value: without capture groups, $n and
// $<name> are literal text; $$ escapes a dollar, $& is the matched string,
// $` the preceding text and $' the following text.
function substituteStringPattern(replacement: string, text: string, position: number, matched: string): string {
  let result = "";
  for (let index = 0; index < replacement.length; index++) {
    const char = replacement[index];
    if (char !== "$" || index + 1 >= replacement.length) { result += char; continue; }
    const next = replacement[index + 1];
    if (next === "$") { result += "$"; index++; continue; }
    if (next === "&") { result += matched; index++; continue; }
    if (next === "\u0060") { result += text.slice(0, position); index++; continue; }
    if (next === "'") { result += text.slice(position + matched.length); index++; continue; }
    result += char;
  }
  return result;
}

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
            // Bounded string slice: a concrete string search value replaces the
            // first literal occurrence, with the bounded GetSubstitution forms
            // ($$, $&, $`, $'); $n/$< stay literal without capture groups.
            // Function replacements and non-string conversions stay out.
            if (isESString(search) && typeof search.value === "string") {
              const searchString = search.value;
              return withValue(args.length > 1 ? args[1] : Undefined, afterSearch, (replacement, afterReplacement) => {
                if (isESString(replacement) && typeof replacement.value === "string") {
                  const position = text.indexOf(searchString);
                  if (position === -1) return [ESString(text), afterReplacement];
                  return [ESString(text.slice(0, position) +
                    substituteStringPattern(replacement.value, text, position, searchString) +
                    text.slice(position + searchString.length)), afterReplacement];
                }
                if (replacement && (replacement as { type?: string }).type === "function") {
                  throw new UnsupportedAnalysisError("String.replace function replacements are not yet supported");
                }
                throw new UnsupportedAnalysisError("String.replace non-string replacement values are not yet supported");
              });
            }
            // Bounded slice: an intrinsic-layout RegExp search value. Custom
            // Symbol.replace and non-RegExp objects stay out.
            if (!isRegExp(search)) {
              throw new UnsupportedAnalysisError("String.replace non-string search values are not yet supported");
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
