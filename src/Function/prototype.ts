import { ESBuiltinFunction } from "./Function";
import { functionCall } from "./call";
import { Undefined } from "../types";
import { getObjectPrototype } from "../Object/prototype";
import { tuple } from "@deaven/tuple";

let functionPrototype: ReturnType<typeof ESBuiltinFunction> | undefined;

export function getFunctionPrototype() {
  if (!functionPrototype) {
    functionPrototype = ESBuiltinFunction(function*(_self, _args, context) {
      return tuple(Undefined, context);
    });
    Object.assign(functionPrototype, { prototype: getObjectPrototype() });
    Object.assign(functionPrototype.properties, {
      call: functionCall,
      toString: ESBuiltinFunction(function*() {
        throw new Error("Function source string conversion is not yet supported");
      })
    });
  }
  return functionPrototype;
}
