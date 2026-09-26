import { round } from "./round";
import { FunctionImplementation } from "../types";
import { randomNumber } from "../number/symbolic";
import { tuple } from "@deaven/tuple";

const random: FunctionImplementation = function*(_self, _args, execContext) {
  return tuple(randomNumber(), execContext);
};

export const Math = {
  properties: {
    random: {
      implementation: random
    },
    round: {
      implementation: round
    }
  }
};
