import { ESFunction } from "../Function/Function";
import { Any, isESNumber } from "../types";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { sloppyBoxPrototypes } from "../Function/boxing";
import { TESObject } from "../Object";

export const NumberConstructor = Object.assign(ESFunction(function*(
  _self: Any,
  args: Any[],
  execContext
) {
  if (!args.length || !isESNumber(args[0])) {
    throw new Error("Number conversion is not yet supported except for an existing number value");
  }
  return [args[0], execContext] as [Any, TExecutionContext];
}), {
  unmodeledConstruct: "Number wrapper construction is not yet supported",
  unknownProperties: "Number constructor API",
  modeledInheritedProperties: ["call", "constructor"]
});

// The constructor link is available, but this is not yet a Number wrapper
// carrying [[NumberData]]. Do not inherit Object's methods as numeric methods.
Object.assign(NumberConstructor.properties.prototype, { unknownProperties: "Number prototype API" });

// The original intrinsic prototype boxes sloppy primitive receivers (ToObject).
sloppyBoxPrototypes.number = NumberConstructor.properties.prototype as TESObject;
