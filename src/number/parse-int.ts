import { ESBuiltinFunction } from "../Function/Function";
import { markUnsupportedBoundaryObject, UnsupportedAnalysisError } from "../execution-context/analysis-failure";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { Any, ESNumber, isESNumber, isESString, isUndefined, TESNumber, Undefined } from "../types";
import { ESString } from "../string/String";
import { withValue } from "../conversion/toString";
import { BranchResult } from "../execution-context/branches";

// Over concrete inputs, digit semantics delegate to the pinned host's
// spec-exact parseInt: whitespace, sign, auto/explicit radix (2..36 and the
// 0x prefix rules), fractional-radix truncation, digit collection and
// double rounding all match Node 24.21.0. Non-string inputs and non-number
// radices need ToString/ToNumber conversions that stay typed boundaries;
// symbolic values branch through withValue.
export const parseIntGlobal = markUnsupportedBoundaryObject({
  ...ESBuiltinFunction(function*(_self: Any, args: Any[], context: TExecutionContext): Generator<never, BranchResult, never> {
    return withValue(args.length ? args[0] : Undefined, context, (input, afterInput) => {
      const text = isESString(input) ? input.value : Undefined;
      if (typeof text !== "string") {
        throw new UnsupportedAnalysisError("parseInt non-string inputs are not yet supported");
      }
      return withValue(args.length > 1 ? args[1] : Undefined, afterInput, (radixValue, afterRadix) => {
        if (!isUndefined(radixValue) && (!isESNumber(radixValue) || typeof radixValue.value !== "number")) {
          throw new UnsupportedAnalysisError("parseInt non-number radices are not yet supported");
        }
        const radix = isUndefined(radixValue) ? undefined : (radixValue as TESNumber).value;
        return [ESNumber(parseInt(text, radix)), afterRadix];
      });
    });
  }),
  properties: { length: ESNumber(2), name: ESString("parseInt") },
  unknownProperties: "parseInt metadata",
  modeledInheritedProperties: ["call", "prototype"],
  unmodeledPropertyReads: ["caller", "arguments"],
  unmodeledPropertyWrites: ["length", "name"]
});
