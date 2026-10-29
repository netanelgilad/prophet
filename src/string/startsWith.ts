import { Any, FunctionImplementation, isESNull, isUndefined, TESNumber, ThrownValue, Undefined, WithProperties } from "../types";
import { coerceToBoolean, ESBoolean } from "../boolean/ESBoolean";
import { ESString, TESString } from "./String";
import { bindNormal } from "../evaluate";
import { isObjectValue, toString, withValue } from "../conversion/toString";
import { toNumber } from "../conversion/toNumber";
import { toPrimitiveSymbol, matchSymbol } from "../Object/wellKnownSymbols";
import { createError } from "../error/Error";
import { prototypeOf } from "../Object/prototype";
import { hasIntrinsicRegExpPrototype, isRegExp } from "../regexp/RegExp";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { ExecutionBudgetError, UnsupportedAnalysisError } from "../execution-context/analysis-failure";

// These bounds cover synchronous search work, independently of VM step limits.
const maxUnits = 65536;

// Scoped lookup keeps unsupported prototype graphs typed. Only the known
// intrinsic RegExp instance/prototype pair supplies an implicit default @@match;
// an embedding-provided replacement chain cannot inherit that exemption.
function readSymbol(input: Any, key: {name: string}, context: TExecutionContext, intrinsicMatch = false): BranchResult {
  const intrinsic = intrinsicMatch && isRegExp(input) && hasIntrinsicRegExpPrototype(input);
  const knownPrototype = intrinsic ? prototypeOf(input) : undefined;
  const visit = (value: Any, branch: TExecutionContext, seen: Any[]): BranchResult => withValue(value, branch, (object, current) => {
    if (seen.includes(object)) throw new UnsupportedAnalysisError("String.startsWith cyclic symbol lookup is not yet supported");
    const model = object as WithProperties;
    if(model.wellKnownSymbols && model.wellKnownSymbols.has(key)) return [model.wellKnownSymbols.get(key)!, current];
    if(intrinsic && object===knownPrototype) return [ESBoolean(true), current];
    if(model.unknownProperties && !(intrinsic && (object===input || object===knownPrototype))) {
      throw new UnsupportedAnalysisError("String.startsWith symbol lookup on partial objects is not yet supported");
    }
    if(model.unmodeledPrototype) throw new UnsupportedAnalysisError("String.startsWith unmodeled symbol lookup prototype is not yet supported");
    const prototype = prototypeOf(object);
    if(isESNull(prototype)) return [Undefined,current];
    if(!isObjectValue(prototype)) throw new UnsupportedAnalysisError("String.startsWith invalid symbol lookup prototype is not yet supported");
    return visit(prototype,current,seen.concat([object]));
  });
  return visit(input,context,[]);
}

// Opt this operation into typed admission guards without repairing legacy shared
// converters. Check at each reached conversion, with current inherited hooks.
function convert(input: Any, context: TExecutionContext, numeric: boolean): BranchResult {
  return withValue(input, context, (value, branch) => {
    const kind = (value as {type: string}).type;
    if (!["undefined", "null", "number", "boolean", "string", "object"].includes(kind)) {
      throw new UnsupportedAnalysisError("String.startsWith array/function or exotic operand conversion is not yet supported");
    }
    const ordinary = (after: TExecutionContext) => numeric ? toNumber(value, after) : toString(value, after);
    if (!isObjectValue(value)) return ordinary(branch);
    return bindNormal(readSymbol(value, toPrimitiveSymbol, branch), (method, after) =>
      withValue(method, after, (hook, ready) => {
        if (!isUndefined(hook) && !isESNull(hook)) {
          throw new UnsupportedAnalysisError("String.startsWith custom Symbol.toPrimitive conversion is not yet supported");
        }
        return ordinary(ready);
      }));
  });
}

function rejectRegExp(input: Any, context: TExecutionContext, proceed: (context: TExecutionContext) => BranchResult): BranchResult {
  return withValue(input, context, (value, branch) => {
    const reject = (current: TExecutionContext): BranchResult => [ThrownValue(createError("TypeError", ESString("First argument to String.prototype.startsWith must not be a regular expression"))), current];
    if (!isObjectValue(value)) return proceed(branch);
    return bindNormal(readSymbol(value, matchSymbol, branch, true), (hook, afterHook) =>
      withValue(hook, afterHook, (selected, current) => isUndefined(selected) ?
        (isRegExp(value) ? reject(current) : proceed(current)) :
        evaluateBranches(coerceToBoolean(selected), current, reject, proceed)));
  });
}

export const stringStartsWith: FunctionImplementation = function*(self, args, context) {
  return withValue(self, context, (receiver, branch) => {
    if (isESNull(receiver) || isUndefined(receiver)) return [ThrownValue(createError(
      "TypeError", ESString("String.prototype.startsWith called on null or undefined"))), branch];
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
                  throw new UnsupportedAnalysisError("String.startsWith open symbolic or legacy chunk operands are not yet supported");
                }
                // Check both lengths before any scan, even for empty needles
                // or needles longer than the receiver. IsRegExp was checked
                // before the search string conversion above.
                if (text.length > maxUnits || needle.length > maxUnits) {
                  throw new ExecutionBudgetError("String.startsWith operand exceeds 65536 UTF-16 units");
                }
                // The position truncates and clamps like indexOf: NaN is +0,
                // negatives clamp upward, and anything past the length clamps
                // downward, where an empty needle still matches.
                const integer = Number.isNaN(number) ? 0 : Math.trunc(number);
                const start = Math.min(Math.max(integer, 0), text.length);
                if (start + needle.length > text.length) return [ESBoolean(false), ready];
                // Compare UTF-16 code units exactly, including lone surrogates.
                // The operand cap bounds this single prefix comparison.
                for (let offset = 0; offset < needle.length; offset++) {
                  if (text.charCodeAt(start + offset) !== needle.charCodeAt(offset)) {
                    return [ESBoolean(false), ready];
                  }
                }
                return [ESBoolean(true), ready];
              })))))));
  });
};
