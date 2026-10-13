import { Any, ESNumber, isESNull, isUndefined, TESNumber } from "../types";
import { toNumber, ordinaryNumberHint } from "../conversion/toNumber";
import { withValue } from "../conversion/toString";
import { bindNormal } from "../evaluate";
import { BranchResult } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { readWellKnownSymbol, toPrimitiveSymbol } from "../Object/wellKnownSymbols";
import { ExecutionBudgetError, UnsupportedAnalysisError } from "../execution-context/analysis-failure";

// Number::bitwiseNOT: bounded arithmetic, independent of host bitwise operators.
// Truncate, mathematical modulo 2^32, signed interpretation, one's complement.
function complement(number: number): number {
  const integer = Number.isFinite(number) ? Math.trunc(number) : 0;
  const remainder = integer % 4294967296;
  const unsigned = remainder < 0 ? remainder + 4294967296 : remainder;
  const signed = unsigned >= 2147483648 ? unsigned - 4294967296 : unsigned;
  const result = -signed - 1;
  return result === 0 ? 0 : result;
}

export function bitwiseNot(input: Any, context: TExecutionContext): BranchResult {
  return withValue(input, context, (value, branch) => {
    const kind = (value as { type: string }).type;
    // ToNumeric admits BigInt in JavaScript. This Number-domain slice has no
    // BigInt representation: stop explicitly, including after ordinary calls.
    if (!["number", "string", "boolean", "null", "undefined", "object"].includes(kind) ||
        (value as { stringData?: boolean }).stringData) {
      throw new UnsupportedAnalysisError("Unary ~ Number-domain conversion does not yet support " + kind + " values or wrappers");
    }
    if (kind === "object") {
      return bindNormal(readWellKnownSymbol(value, toPrimitiveSymbol, branch), (method, after) =>
        withValue(method, after, (hook, ready) => {
          if (!isUndefined(hook) && !isESNull(hook)) {
            throw new UnsupportedAnalysisError("Unary ~ custom Symbol.toPrimitive conversion is not yet supported");
          }
          return ordinaryNumberHint(value, ready, bitwiseNot);
        }));
    }
    if (kind === "string") {
      const string = (value as { value?: unknown }).value;
      if (typeof string !== "string") {
        throw new UnsupportedAnalysisError("Unary ~ open symbolic or legacy chunk string conversion is not yet supported");
      }
      // Check before Number's numeric-string scan/preparation. Operand and
      // ordinary conversion effects have already occurred at this continuation.
      if (string.length > 65536) {
        throw new ExecutionBudgetError("Unary ~ numeric string exceeds 65536 UTF-16 units");
      }
    }
    return bindNormal(toNumber(value, branch), (converted, after) =>
      withValue(converted, after, (number, ready) => {
        const concrete = (number as TESNumber).value;
        if (typeof concrete !== "number") {
          throw new UnsupportedAnalysisError("Unary ~ open converted Number is not yet supported");
        }
        return [ESNumber(complement(concrete)), ready];
      }));
  });
}
