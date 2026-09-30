import { ESBuiltinFunction } from "./Function";
import { functionCall } from "./call";
import { Undefined, ESNumber } from "../types";
import { getObjectPrototype } from "../Object/prototype";
import { tuple } from "@deaven/tuple";
import { ordinaryHasInstance } from "./instanceof";
import { hasInstanceSymbol } from "../Object/wellKnownSymbols";
import { ESString } from "../string/String";

let functionPrototype: ReturnType<typeof ESBuiltinFunction> | undefined;

export function getFunctionPrototype() {
  if (!functionPrototype) {
    functionPrototype = ESBuiltinFunction(function*(_self, _args, context) {
      return tuple(Undefined, context);
    });
    Object.assign(functionPrototype, { prototype: getObjectPrototype() });
    const hasInstance = Object.assign(ESBuiltinFunction(function*(self, args, context) {
      return ordinaryHasInstance(self, args[0] || Undefined, context);
    }), {
      unknownProperties: "Function.prototype Symbol.hasInstance API",
      modeledInheritedProperties: ["call"],
      unmodeledOwnPropertyInspection: "Symbol.hasInstance function descriptors",
      unmodeledPropertyReads: ["caller", "arguments"],
      unmodeledPropertyWrites: ["name", "length", "caller", "arguments"]
    });
    Object.assign(hasInstance.properties, { name: ESString("[Symbol.hasInstance]"), length: ESNumber(1) });
    // This intrinsic property is non-writable and non-configurable. Public
    // Symbol access/descriptor support must preserve those attributes later.
    Object.assign(functionPrototype, { wellKnownSymbols: new Map([[hasInstanceSymbol, hasInstance]]) });
    Object.assign(functionPrototype.properties, {
      call: functionCall,
      toString: ESBuiltinFunction(function*() {
        throw new Error("Function source string conversion is not yet supported");
      })
    });
  }
  return functionPrototype;
}
