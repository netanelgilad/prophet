import { Any, ESNumber, isESNull, isUndefined, ThrownValue, Undefined, WithProperties } from "../types";
import { ESBoolean } from "../boolean/ESBoolean";
import { ESString, TESString } from "../string/String";
import { ESBuiltinFunction } from "../Function/Function";
import { isObjectValue, toString, withValue } from "../conversion/toString";
import { toNumber } from "../conversion/toNumber";
import { readMember } from "../ASTResolvers";
import { bindNormal } from "../evaluate";
import { createError } from "../error/Error";
import { getProperties } from "../execution-context/Heap";
import { markUnsupportedBoundaryObject } from "../execution-context/analysis-failure";
import { readWellKnownSymbol, toPrimitiveSymbol } from "../Object/wellKnownSymbols";
import { BranchResult } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { isRegExp, hasIntrinsicRegExpPrototype } from "./RegExp";
import { matches, regexpBoundary } from "./matcher";

function typeError(context: TExecutionContext): BranchResult {
  return [ThrownValue(createError("TypeError", ESString("RegExp.test requires an object with RegExp matching state"))), context];
}

// The shared string converter predates symbol dispatch. Establish absence
// through the whole current prototype chain before relying on its ordinary
// conversion order. Do the same for number conversion to give a typed boundary
// for custom symbol hooks (the shared numeric guard is still a legacy error).
function withoutCustomPrimitive(value: Any, context: TExecutionContext,
  next: (value: Any, context: TExecutionContext) => BranchResult): BranchResult {
  return withValue(value, context, (input, branch) => !isObjectValue(input) ? next(input, branch) :
    bindNormal(readWellKnownSymbol(input, toPrimitiveSymbol, branch), (method, after) =>
      withValue(method, after, (hook, final) => {
        if (!isUndefined(hook) && !isESNull(hook)) return regexpBoundary("custom Symbol.toPrimitive conversion");
        return next(input, final);
      })));
}

function test(receiver: Any, args: Any[], context: TExecutionContext): BranchResult {
  return withValue(receiver, context, (value, branch) => {
    // Test checks Object before ToString; RegExpExec's brand check follows it.
    if (!isObjectValue(value)) return typeError(branch);
    return bindNormal(withoutCustomPrimitive(args[0] || Undefined, branch, toString), (string, afterString) => {
      if (!isRegExp(value)) return bindNormal(readMember(value, "exec", afterString), (exec, afterExec) =>
        withValue(exec, afterExec, (method, after) => (method as { function?: object }).function
          ? regexpBoundary("custom exec dispatch") : typeError(after)));
      // Guest writes/descriptor changes/RegExp.prototype exposure are guarded.
      // Also reject embedding-provided custom exec or exotic layouts rather than
      // silently bypass RegExpExec's Get. The intrinsic exec remains private.
      const prototype = value.prototype as WithProperties;
      if (!hasIntrinsicRegExpPrototype(value) || value.propertyAccess || !prototype || prototype.propertyAccess ||
          (value.unmodeledPropertyReads && value.unmodeledPropertyReads.includes("exec")) ||
          Object.prototype.hasOwnProperty.call(getProperties(value, afterString), "exec") ||
          Object.prototype.hasOwnProperty.call(getProperties(prototype, afterString), "exec")) {
        return regexpBoundary("custom exec dispatch or receiver layout");
      }
      return bindNormal(readMember(value, "lastIndex", afterString), (lastIndex, afterRead) =>
        bindNormal(withoutCustomPrimitive(lastIndex, afterRead, toNumber), (_number, afterIndex) => {
          // ToLength's pure clamp is unobservable here: with neither g nor y,
          // BuiltinExec replaces the local index with zero and never writes it.
          if (value.regexpData.originalFlags !== "") return regexpBoundary("flags (including global/sticky state)");
          return withValue(string, afterIndex, (input, after) => {
            if (typeof (input as TESString).value !== "string") return regexpBoundary("open symbolic input strings");
            return [ESBoolean(matches(value.regexpData.originalSource, (input as TESString).value as string)), after];
          });
        }));
    });
  });
}

let intrinsic: ReturnType<typeof ESBuiltinFunction> | undefined;
// Lazy metadata avoids calling String's mutually dependent factory at module load.
export function getRegExpTest() {
  if (intrinsic) return intrinsic;
  intrinsic = markUnsupportedBoundaryObject(Object.assign(ESBuiltinFunction(function*(self, args, context) {
    return test(self, args, context);
  }), {
    properties: { name: ESString("test"), length: ESNumber(1) },
    unknownProperties: "RegExp.test metadata",
    modeledInheritedProperties: ["call", "prototype"],
    unmodeledOwnPropertyInspection: "RegExp.test descriptors",
    unmodeledPropertyReads: ["caller", "arguments"],
    unmodeledPropertyWrites: ["name", "length", "call", "prototype", "caller", "arguments"]
  }));
  return intrinsic;
}
