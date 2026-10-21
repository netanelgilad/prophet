import { Any, FunctionImplementation, isESNull, isUndefined, TESNumber, ThrownValue, Undefined } from "../types";
import { coerceToBoolean, ESBoolean } from "../boolean/ESBoolean";
import { ESString, TESString } from "./String";
import { bindNormal } from "../evaluate";
import { isObjectValue, toString, withValue } from "../conversion/toString";
import { toNumber } from "../conversion/toNumber";
import { readWellKnownSymbol, toPrimitiveSymbol, matchSymbol } from "../Object/wellKnownSymbols";
import { createError } from "../error/Error";
import { prototypeOf } from "../Object/prototype";
import { isRegExp } from "../regexp/RegExp";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { ExecutionBudgetError, UnsupportedAnalysisError } from "../execution-context/analysis-failure";

// These bounds cover synchronous search work, independently of VM step limits.
const maxUnits = 65536;
const maxComparisons = 1048576;

// Opt this operation into typed admission guards without repairing legacy shared
// converters. Check at each reached conversion, with current inherited hooks.
function convert(input: Any, context: TExecutionContext, numeric: boolean): BranchResult {
  return withValue(input, context, (value, branch) => {
    const kind = (value as {type: string}).type;
    if (!["undefined", "null", "number", "boolean", "string", "object"].includes(kind)) {
      throw new UnsupportedAnalysisError("String.includes array/function or exotic operand conversion is not yet supported");
    }
    const ordinary = (after: TExecutionContext) => numeric ? toNumber(value, after) : toString(value, after);
    if (!isObjectValue(value)) return ordinary(branch);
    return bindNormal(readWellKnownSymbol(value, toPrimitiveSymbol, branch), (method, after) =>
      withValue(method, after, (hook, ready) => {
        if (!isUndefined(hook) && !isESNull(hook)) {
          throw new UnsupportedAnalysisError("String.includes custom Symbol.toPrimitive conversion is not yet supported");
        }
        return ordinary(ready);
      }));
  });
}

function rejectRegExp(input: Any, context: TExecutionContext, proceed: (context: TExecutionContext) => BranchResult): BranchResult {
  return withValue(input, context, (value, branch) => {
    const reject = (current: TExecutionContext): BranchResult => [ThrownValue(createError("TypeError", ESString("First argument to String.prototype.includes must not be a regular expression"))), current];
    if (isRegExp(value)) {
      // Intrinsic RegExp models carry an intentionally partial prototype. Its
      // default @@match is known, but any declared override wins first.
      let holder: Any = value;
      const seen = new Set<Any>();
      while (!isESNull(holder)) {
        if (seen.has(holder)) throw new UnsupportedAnalysisError("Cyclic RegExp match lookup is not yet supported");
        seen.add(holder);
        const slots = (holder as {wellKnownSymbols?: Map<object, Any>}).wellKnownSymbols;
        if (slots && slots.has(matchSymbol)) return withValue(slots.get(matchSymbol)!, branch, (hook, after) =>
          isUndefined(hook) ? reject(after) : evaluateBranches(coerceToBoolean(hook), after, reject, proceed));
        holder = prototypeOf(holder);
      }
      return reject(branch);
    }
    if (!isObjectValue(value)) return proceed(branch);
    return bindNormal(readWellKnownSymbol(value, matchSymbol, branch), (hook, afterHook) =>
      withValue(hook, afterHook, (selected, current) => isUndefined(selected) ? proceed(current) :
        evaluateBranches(coerceToBoolean(selected), current, reject, proceed)));
  });
}

export const stringIncludes: FunctionImplementation = function*(self, args, context) {
  return withValue(self, context, (receiver, branch) => {
    if (isESNull(receiver) || isUndefined(receiver)) return [ThrownValue(createError(
      "TypeError", ESString("String.prototype.includes called on null or undefined"))), branch];
    // Do not inspect converted values yet: even an open string or an oversized
    // operand must allow later conversions to mutate, fork or throw first.
    return bindNormal(convert(receiver, branch, false), (string, afterReceiver) =>
      rejectRegExp(args.length ? args[0] : Undefined, afterReceiver, accepted => bindNormal(convert(args.length ? args[0] : Undefined, accepted, false), (search, afterSearch) =>
        bindNormal(convert(args.length > 1 ? args[1] : Undefined, afterSearch, true), (position, afterPosition) =>
          withValue(string, afterPosition, (textValue, textBranch) =>
            withValue(search, textBranch, (searchValue, searchBranch) =>
              withValue(position, searchBranch, (positionValue, ready) => {
                const text = (textValue as TESString).value;
                const needle = (searchValue as TESString).value;
                const number = (positionValue as TESNumber).value;
                if (typeof text !== "string" || typeof needle !== "string" || typeof number !== "number") {
                  throw new UnsupportedAnalysisError("String.includes open symbolic or legacy chunk operands are not yet supported");
                }
                // Check both lengths before any scan, even for empty needles
                // or needles longer than the receiver. IsRegExp was checked
                // before the search string conversion above.
                if (text.length > maxUnits || needle.length > maxUnits) {
                  throw new ExecutionBudgetError("String.includes operand exceeds 65536 UTF-16 units");
                }
                // The position truncates and clamps like indexOf: NaN is +0,
                // negatives clamp upward, and anything past the length clamps
                // downward, where an empty needle still matches.
                const integer = Number.isNaN(number) ? 0 : Math.trunc(number);
                const start = Math.min(Math.max(integer, 0), text.length);
                if (!needle.length) return [ESBoolean(true), ready];
                let comparisons = 0;
                for (let index = start; index <= text.length - needle.length; index++) {
                  let offset = 0;
                  for (; offset < needle.length; offset++) {
                    if (comparisons >= maxComparisons) {
                      throw new ExecutionBudgetError("String.includes exceeds 1048576 UTF-16 unit comparisons");
                    }
                    comparisons++;
                    if (text.charCodeAt(index + offset) !== needle.charCodeAt(offset)) break;
                  }
                  if (offset === needle.length) return [ESBoolean(true), ready];
                }
                return [ESBoolean(false), ready];
              })))))));
  });
};
