import { isObjectValue, withValue } from "../conversion/toString";
import { createError } from "../error/Error";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { ESString, TESString } from "../string/String";
import { Any, isESBoolean, isESNull, isESNumber, isESString, isUndefined, ThrownValue } from "../types";

function invalidType(message: TESString, context: TExecutionContext): BranchResult {
  const error = createError("TypeError", message);
  error.properties.code = ESString("ERR_INVALID_ARG_TYPE");
  Object.assign(error, {
    unmodeledPropertyReads: ["stack", "toString", "constructor"],
    unmodeledPropertyWrites: ["stack", "toString", "constructor"],
    unmodeledOwnPropertyInspection: "Node coded error descriptors"
  });
  return [ThrownValue(error), context];
}

// Node validateString rejects without coercion. Primitive diagnostic formatting
// has no user effects; unknown numbers retain the throw with an unknown message.
// Object/function formatting reads constructor/name or inspects the object and
// requires a separate model, rather than a fabricated unconditional TypeError.
export function withStringArgument(name: string, value: Any, context: TExecutionContext,
  continuation: (value: TESString, context: TExecutionContext) => BranchResult): BranchResult {
  return withValue(value, context, (input, branch) => {
    if (isESString(input)) return continuation(input, branch);
    const fail = (received: string, after: TExecutionContext) => invalidType(ESString(
      `The "${name}" argument must be of type string. Received ${received}`), after);
    if (isUndefined(input)) return fail("undefined", branch);
    if (isESNull(input)) return fail("null", branch);
    if (isESNumber(input)) {
      if (typeof input.value !== "number") return invalidType(ESString(), branch);
      return fail(`type number (${Object.is(input.value, -0) ? "-0" : String(input.value)})`, branch);
    }
    if (isESBoolean(input)) return evaluateBranches(input, branch,
      after => fail("type boolean (true)", after), after => fail("type boolean (false)", after));
    if (isObjectValue(input)) throw new Error(`Node ${name} argument analysis is not yet supported: object/function argument diagnostics`);
    throw new Error(`Node ${name} argument analysis is not yet supported: diagnostic for this value kind`);
  });
}
