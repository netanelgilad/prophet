import { Any, ESNumber, FunctionImplementation, isESNull, isUndefined, TESNumber, ThrownValue, Undefined } from "../types";
import { ESString, TESString } from "./String";
import { bindNormal } from "../evaluate";
import { isObjectValue, toString, withValue } from "../conversion/toString";
import { toNumber } from "../conversion/toNumber";
import { readWellKnownSymbol, toPrimitiveSymbol } from "../Object/wellKnownSymbols";
import { createError } from "../error/Error";
import { BranchResult } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { UnsupportedAnalysisError } from "../execution-context/analysis-failure";

// Opt this operation into typed admission guards without repairing legacy shared
// converters. Check at each reached conversion, with current inherited hooks.
function convert(input: Any, context: TExecutionContext, numeric: boolean): BranchResult {
  return withValue(input, context, (value, branch) => {
    const kind = (value as {type: string}).type;
    if (!["undefined", "null", "number", "boolean", "string", "object"].includes(kind)) {
      throw new UnsupportedAnalysisError("String.charCodeAt array/function or exotic operand conversion is not yet supported");
    }
    const ordinary = (after: TExecutionContext) => numeric ? toNumber(value, after) : toString(value, after);
    if (!isObjectValue(value)) return ordinary(branch);
    return bindNormal(readWellKnownSymbol(value, toPrimitiveSymbol, branch), (method, after) =>
      withValue(method, after, (hook, ready) => {
        if (!isUndefined(hook) && !isESNull(hook)) {
          throw new UnsupportedAnalysisError("String.charCodeAt custom Symbol.toPrimitive conversion is not yet supported");
        }
        return ordinary(ready);
      }));
  });
}

// Bounded String.prototype.charCodeAt following
// https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.charcodeat.
// One UTF-16 code unit is read, so there is no scan budget: conversion order
// (RequireObjectCoercible, receiver ToString, position ToNumber) and the
// truncating ToIntegerOrInfinity position rule carry the semantics. NaN
// positions mean +0; fractions truncate toward zero; out-of-range positions
// (including infinities) answer NaN. Astral halves and lone surrogates are
// ordinary code units. Symbolic text or position stops as a typed boundary.
export const stringCharCodeAt: FunctionImplementation = function*(self, args, context) {
  return withValue(self, context, (receiver, branch) => {
    if (isESNull(receiver) || isUndefined(receiver)) return [ThrownValue(createError(
      "TypeError", ESString("String.prototype.charCodeAt called on null or undefined"))), branch];
    // Do not inspect converted values yet: even an open string must allow the
    // later position conversion to mutate, fork or throw first.
    return bindNormal(convert(receiver, branch, false), (string, afterReceiver) =>
      bindNormal(convert(args.length ? args[0] : Undefined, afterReceiver, true), (position, afterPosition) =>
        withValue(string, afterPosition, (textValue, textBranch) =>
          withValue(position, textBranch, (positionValue, ready) => {
            const text = (textValue as TESString).value;
            const number = (positionValue as TESNumber).value;
            if (typeof text !== "string" || typeof number !== "number") {
              throw new UnsupportedAnalysisError("String.charCodeAt open symbolic or legacy chunk operands are not yet supported");
            }
            // ToIntegerOrInfinity: NaN is +0, fractions truncate toward zero,
            // infinities stay infinite and fall out of range below.
            const integer = Number.isNaN(number) ? 0 : Math.trunc(number);
            if (integer < 0 || integer >= text.length) return [ESNumber(NaN), ready];
            return [ESNumber(text.charCodeAt(integer)), ready];
          }))));
  });
};
