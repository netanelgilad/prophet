import { Any, FunctionBinding, isESNull, isUndefined, ThrownValue } from "../types";
import { ESBoolean, coerceToBoolean } from "../boolean/ESBoolean";
import { isObjectValue, withValue } from "../conversion/toString";
import { createError } from "../error/Error";
import { ESString } from "../string/String";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { withInternalPrototype } from "../Object/prototype";
import { hasInstanceSymbol, readWellKnownSymbol } from "../Object/wellKnownSymbols";
import { readMember, invoke } from "../ASTResolvers";
import { bindNormal } from "../evaluate";
import { strictEquality } from "../symbolic";

function callable(value: Any): boolean {
  return isObjectValue(value) && !!(value as FunctionBinding).function;
}

function typeError(context: TExecutionContext): BranchResult {
  // The language specifies TypeError, not a fixed engine diagnostic. Keep its
  // message unknown until the diagnostic behavior is modeled independently.
  return [ThrownValue(createError("TypeError", ESString())), context];
}

export function ordinaryHasInstance(ctor: Any, instance: Any, context: TExecutionContext): BranchResult {
  return withValue(ctor, context, (target, branch) => {
    if (!callable(target)) return [ESBoolean(false), branch];
    // Bound functions/Proxy objects cannot currently be constructed by the VM.
    // Their internal delegation/traps need models before that surface opens.
    return withValue(instance, branch, (value, afterValue) => {
      if (!isObjectValue(value)) return [ESBoolean(false), afterValue];
      return bindNormal(readMember(target, "prototype", afterValue), (selected, afterRead) =>
        withValue(selected, afterRead, (prototype, afterPrototype) => {
          if (!isObjectValue(prototype)) return typeError(afterPrototype);
          const walk = (current: Any, currentContext: TExecutionContext, seen: Any[]): BranchResult => {
            if (seen.includes(current)) throw new Error("Cyclic instanceof prototype chains are not yet supported");
            return withInternalPrototype(current, currentContext, (parent, afterParent) => {
              if (isESNull(parent)) return [ESBoolean(false), afterParent];
              return evaluateBranches(strictEquality(parent, prototype, afterParent.value.knowledge), afterParent,
                yes => [ESBoolean(true), yes], no => walk(parent, no, seen.concat([current])));
            });
          };
          return walk(value, afterPrototype, []);
        }));
    });
  });
}

export function instanceOf(value: Any, ctor: Any, context: TExecutionContext): BranchResult {
  return withValue(ctor, context, (target, branch) => {
    if (!isObjectValue(target)) return typeError(branch);
    return bindNormal(readWellKnownSymbol(target, hasInstanceSymbol, branch), (selected, afterLookup) =>
      withValue(selected, afterLookup, (handler, afterHandler) => {
        if (!isUndefined(handler) && !isESNull(handler)) {
          if (!callable(handler)) return typeError(afterHandler);
          return bindNormal(invoke(handler, [value], afterHandler, target), (result, afterCall) =>
            [coerceToBoolean(result, afterCall.value.knowledge), afterCall]);
        }
        if (!callable(target)) return typeError(afterHandler);
        return ordinaryHasInstance(target, value, afterHandler);
      }));
  });
}
