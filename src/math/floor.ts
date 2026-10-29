import { FunctionImplementation, ESNumber, TESNumber, Undefined } from "../types";
import { toNumber } from "../conversion/toNumber";
import { withValue } from "../conversion/toString";
import { bindNormal } from "../evaluate";
import { UnsupportedAnalysisError } from "../execution-context/analysis-failure";

// Apply ToNumber through the VM before rounding; coercion calls and abrupt
// completion stay in the same state graph. Open numeric rounding is a gap.
export const floor: FunctionImplementation = function*(_self, args, context) {
  return bindNormal(toNumber(args.length ? args[0] : Undefined, context), (converted, after) =>
    withValue(converted, after, (number, ready) => {
      const value = (number as TESNumber).value;
      if (typeof value !== "number") {
        throw new UnsupportedAnalysisError("Math.floor open symbolic Number rounding is not yet supported");
      }
      return [ESNumber(Math.floor(value)), ready];
    }));
};
