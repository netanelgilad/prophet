import { ESFunction, ESBuiltinFunction } from "../Function/Function";
import { Any, Undefined, ThrownValue, ESNumber, isUndefined, isESNull } from "../types";
import { tuple } from "@deaven/tuple";
import { isObjectValue, withValue } from "../conversion/toString";
import { ESObject } from "../Object";
import { withEnumerableOwnProperties } from "./enumeration";
import { createError } from "../error/Error";
import { ESString } from "../string/String";
import { Array as ESArray } from "../array/Array";
import { ownPropertyPresence } from "../execution-context/Heap";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";

export const ObjectConstructor = ESFunction(function*(
  _self: Any,
  args: Any[],
  execContext
) {
  return withValue(args[0] || Undefined, execContext, (value, context) => {
    if (isUndefined(value) || isESNull(value)) return tuple(ESObject(), context);
    if (isObjectValue(value)) return tuple(value, context);
    // Returning a primitive would let new Object fall back to an ordinary
    // receiver, incorrectly claiming e.g. a string wrapper has no indexed keys.
    throw new Error("Object primitive wrapper construction is not yet supported");
  });
});

const objectKeys = ESBuiltinFunction(function*(_self, args, context) {
  return withValue(args[0] || Undefined, context, (value, initial) => {
    if (isUndefined(value) || isESNull(value)) {
      return [ThrownValue(createError("TypeError", ESString("Cannot convert undefined or null to object"))), initial];
    }
    return withEnumerableOwnProperties(value, initial, (source, candidates, afterKeys) => {
      const collect = (index: number, keys: string[], current: TExecutionContext): BranchResult => {
        if (index === candidates.length) return [ESArray(keys.map(key => ESString(key))), current];
        const key = candidates[index];
        return evaluateBranches(ownPropertyPresence(source, key, current), current,
          branch => collect(index + 1, keys.concat(key), branch), branch => collect(index + 1, keys, branch));
      };
      return collect(0, [], afterKeys);
    });
  });
});
Object.assign(objectKeys.properties, { name: ESString("keys"), length: ESNumber(1) });
Object.assign(objectKeys, {
  unmodeledPropertyReads: ["caller", "arguments"],
  unmodeledPropertyWrites: ["name", "length", "caller", "arguments"]
});
Object.assign(ObjectConstructor.properties, { keys: objectKeys });
