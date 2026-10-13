import { Any, ESNumber, FunctionImplementation, isESNull, isUndefined, TESNumber, ThrownValue, Undefined } from "../types";
import { ESString, TESString } from "./String";
import { bindNormal } from "../evaluate";
import { isObjectValue, toString, withValue } from "../conversion/toString";
import { toNumber } from "../conversion/toNumber";
import { readWellKnownSymbol, toPrimitiveSymbol } from "../Object/wellKnownSymbols";
import { createError } from "../error/Error";
import { BranchResult } from "../execution-context/branches";
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
      throw new UnsupportedAnalysisError("String.lastIndexOf array/function or exotic operand conversion is not yet supported");
    }
    const ordinary = (after: TExecutionContext) => numeric ? toNumber(value, after) : toString(value, after);
    if (!isObjectValue(value)) return ordinary(branch);
    return bindNormal(readWellKnownSymbol(value, toPrimitiveSymbol, branch), (method, after) =>
      withValue(method, after, (hook, ready) => {
        if (!isUndefined(hook) && !isESNull(hook)) {
          throw new UnsupportedAnalysisError("String.lastIndexOf custom Symbol.toPrimitive conversion is not yet supported");
        }
        return ordinary(ready);
      }));
  });
}

export const stringLastIndexOf: FunctionImplementation = function*(self, args, context) {
  return withValue(self, context, (receiver, branch) => {
    if (isESNull(receiver) || isUndefined(receiver)) return [ThrownValue(createError(
      "TypeError", ESString("String.prototype.lastIndexOf called on null or undefined"))), branch];
    // Do not inspect converted values yet: even an open string or an oversized
    // operand must allow later conversions to mutate, fork or throw first.
    return bindNormal(convert(receiver, branch, false), (string, afterReceiver) =>
      bindNormal(convert(args.length ? args[0] : Undefined, afterReceiver, false), (search, afterSearch) =>
        bindNormal(convert(args.length > 1 ? args[1] : Undefined, afterSearch, true), (position, afterPosition) =>
          withValue(string, afterPosition, (textValue, textBranch) =>
            withValue(search, textBranch, (searchValue, searchBranch) =>
              withValue(position, searchBranch, (positionValue, ready) => {
                const text = (textValue as TESString).value;
                const needle = (searchValue as TESString).value;
                const number = (positionValue as TESNumber).value;
                if (typeof text !== "string" || typeof needle !== "string" || typeof number !== "number") {
                  throw new UnsupportedAnalysisError("String.lastIndexOf open symbolic or legacy chunk operands are not yet supported");
                }
                // Check both lengths before any scan/copy/preprocessing, even
                // for empty needles or needles longer than the receiver.
                if (text.length > maxUnits || needle.length > maxUnits) {
                  throw new ExecutionBudgetError("String.lastIndexOf operand exceeds 65536 UTF-16 units");
                }
                const integer = Number.isNaN(number) ? Infinity : Math.trunc(number);
                const start = Math.min(Math.max(integer, 0), text.length);
                if (!needle.length) return [ESNumber(start === 0 ? 0 : start), ready];
                let comparisons = 0;
                for (let index = Math.min(start, text.length - needle.length); index >= 0; index--) {
                  let offset = 0;
                  for (; offset < needle.length; offset++) {
                    if (comparisons >= maxComparisons) {
                      throw new ExecutionBudgetError("String.lastIndexOf exceeds 1048576 UTF-16 unit comparisons");
                    }
                    comparisons++;
                    if (text.charCodeAt(index + offset) !== needle.charCodeAt(offset)) break;
                  }
                  if (offset === needle.length) return [ESNumber(index), ready];
                }
                return [ESNumber(-1), ready];
              }))))));
  });
};
