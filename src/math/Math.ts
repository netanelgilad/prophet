import { floor } from "./floor";
import { ESBuiltinFunction } from "../Function/Function";
import { round } from "./round";
import { FunctionImplementation } from "../types";
import { randomNumber } from "../number/symbolic";
import { tuple } from "@deaven/tuple";

const random: FunctionImplementation = function*(_self, _args, execContext) {
  return tuple(randomNumber(), execContext);
};

export const Math = {
  properties: {
    floor: Object.assign(ESBuiltinFunction(floor), { unknownProperties: "Math.floor function API", modeledInheritedProperties: ["call"] }),
    random: {
      implementation: random
    },
    round: {
      implementation: round
    }
  }
};
