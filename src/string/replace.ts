import { Any, FunctionImplementation, isESNull, isESString, isUndefined, ThrownValue, Undefined, WithProperties, ESNumber } from "../types";
import { ESString, TESString } from "./String";
import { bindNormal } from "../evaluate";
import { isObjectValue, toString, withValue } from "../conversion/toString";
import { readWellKnownSymbol, toPrimitiveSymbol, replaceSymbol } from "../Object/wellKnownSymbols";
import { createError } from "../error/Error";
import { toNumber } from "../conversion/toNumber";
import { getObjectPrototype, prototypeOf } from "../Object/prototype";
import { getProperties, writeProperty } from "../execution-context/Heap";
import { BranchResult } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { ExecutionBudgetError, UnsupportedAnalysisError } from "../execution-context/analysis-failure";
import { isRegExp, hasIntrinsicRegExpPrototype } from "../regexp/RegExp";
import { readMember } from "../ASTResolvers";
import { matches } from "../regexp/matcher";


// GetSubstitution for a string search value: without capture groups, $n and
// $<name> are literal text; $$ escapes a dollar, $& is the matched string,
// $` the preceding text and $' the following text.
function substituteStringPattern(replacement: string, text: string, position: number, matched: string): string {
  let result = "";
  const append = (piece: string) => {
    if (result.length + piece.length > 65536) throw new ExecutionBudgetError("String.replace result exceeds 65536 UTF-16 units");
    result += piece;
  };
  for (let index = 0; index < replacement.length; index++) {
    const char = replacement[index];
    if (char !== "$" || index + 1 >= replacement.length) { append(char); continue; }
    const next = replacement[index + 1];
    if (next === "$") { append("$"); index++; continue; }
    if (next === "&") { append(matched); index++; continue; }
    if (next === "\u0060") { append(text.slice(0, position)); index++; continue; }
    if (next === "'") { append(text.slice(position + matched.length)); index++; continue; }
    append(char);
  }
  return result;
}

export const stringReplace: FunctionImplementation = function*(self, args, context) {
  return withValue(self, context, (receiver, branch) => {
    // RequireObjectCoercible precedes ToString; nullish values are guest errors.
    if (isESNull(receiver) || isUndefined(receiver)) return [ThrownValue(createError(
      "TypeError", ESString("String.prototype.replace called on null or undefined"))), branch];
    const preflightSearch = (search: Any, ready: TExecutionContext, proceed: (context: TExecutionContext) => BranchResult): BranchResult => {
      if (isESNull(search) || isUndefined(search)) return proceed(ready);
      let holder = search;
      const seen = new Set<Any>();
      while (!isESNull(holder)) {
        if (seen.has(holder)) throw new UnsupportedAnalysisError("Cyclic String.replace symbol lookup is not yet supported");
        seen.add(holder);
        const model = holder as WithProperties;
        if (model.wellKnownSymbols && model.wellKnownSymbols.has(replaceSymbol)) throw new UnsupportedAnalysisError("String.replace custom Symbol.replace dispatch is not yet supported");
        if (model.propertyAccess || (model.unknownProperties && !isRegExp(search))) throw new UnsupportedAnalysisError("String.replace unknown Symbol.replace dispatch is not yet supported");
        holder = prototypeOf(holder);
      }
      return proceed(ready);
    };
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
              if (text.length > 65536 || searchString.length > 65536) throw new ExecutionBudgetError("String.replace operand exceeds 65536 UTF-16 units");
              return withValue(args.length > 1 ? args[1] : Undefined, afterSearch, (replacement, afterReplacement) => {
                if (isESString(replacement) && typeof replacement.value === "string") {
                  if (replacement.value.length > 65536) throw new ExecutionBudgetError("String.replace replacement exceeds 65536 UTF-16 units");
                  const position = text.indexOf(searchString);
                  if (position === -1) return [ESString(text), afterReplacement];
                  const substitution = substituteStringPattern(replacement.value, text, position, searchString);
                  if (text.length - searchString.length + substitution.length > 65536) throw new ExecutionBudgetError("String.replace result exceeds 65536 UTF-16 units");
                  return [ESString(text.slice(0, position) + substitution + text.slice(position + searchString.length)), afterReplacement];
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
                Object.prototype.hasOwnProperty.call(getProperties(prototype, afterSearch), "exec") ||
                Object.prototype.hasOwnProperty.call(getProperties(getObjectPrototype(), afterSearch), "exec")) {
              throw new UnsupportedAnalysisError("String.replace custom exec dispatch or regexp layout is not yet supported");
            }
            // The Boolean matcher is flagless, so only flagless and g layouts
            // can reuse its no-match answer after replacement conversion and
            // lastIndex bookkeeping. A match needs ordered match positions,
            // which the Boolean matcher must not provide.
            const flags = search.regexpData.originalFlags;
            if (flags !== "" && flags !== "g") {
              throw new UnsupportedAnalysisError("String.replace regexp flags other than g are not yet supported");
            }
            const finish = (current: TExecutionContext): BranchResult => {
              if (text.length > 65536 || search.regexpData.originalSource.length > 65536) throw new ExecutionBudgetError("String.replace operand exceeds 65536 UTF-16 units");
              const prepared = flags === "g" ? writeProperty(search, "lastIndex", ESNumber(0), current) : current;
              return bindNormal(readMember(search, "lastIndex", prepared), (lastIndex, afterRead) =>
                withValue(lastIndex, afterRead, (selectedIndex, selectedContext) => {
                  if (!["undefined", "null", "number", "boolean", "string"].includes((selectedIndex as {type: string}).type)) {
                    throw new UnsupportedAnalysisError("String.replace object or exotic lastIndex conversion is not yet supported");
                  }
                  return bindNormal(toNumber(selectedIndex, selectedContext), (_index, afterIndex) => {
                  if (matches(search.regexpData.originalSource, text)) {
                    throw new UnsupportedAnalysisError("String.replace matched substitutions are not yet supported");
                  }
                  return [ESString(text), afterIndex];
                });
                }));
            };
            return withValue(args.length > 1 ? args[1] : Undefined, afterSearch, (replacement, afterReplacement) => {
              if ((replacement as {function?: unknown}).function) return finish(afterReplacement);
              const convertReplacement = (ready: TExecutionContext) => bindNormal(toString(replacement, ready), (_text, converted) => finish(converted));
              if (!isObjectValue(replacement)) return convertReplacement(afterReplacement);
              return bindNormal(readWellKnownSymbol(replacement, toPrimitiveSymbol, afterReplacement), (hook, afterHook) =>
                withValue(hook, afterHook, (resolved, final) => {
                  if (!isUndefined(resolved) && !isESNull(resolved)) throw new UnsupportedAnalysisError("String.replace custom replacement conversion is not yet supported");
                  return convertReplacement(final);
                }));
            });
          });
        }));
    return withValue(args.length ? args[0] : Undefined, branch, (search, beforeSearch) => preflightSearch(search, beforeSearch, afterSearch => {
    if (!isObjectValue(receiver)) return convert(afterSearch);
    // Establish absence through the current prototype chain before delegating
    // to the shared ordinary converter, which does not implement symbol hooks.
    return bindNormal(readWellKnownSymbol(receiver, toPrimitiveSymbol, afterSearch), (method, after) =>
      withValue(method, after, (hook, final) => {
        if (!isUndefined(hook) && !isESNull(hook)) {
          throw new UnsupportedAnalysisError("String.replace custom Symbol.toPrimitive conversion is not yet supported");
        }
        return convert(final);
      }));
    }));
  });
};
