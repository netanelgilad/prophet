import { ESFunction, ESBuiltinFunction } from "../Function/Function";
import { ESObject, TESObject } from "../Object";
import { Any, Undefined, ThrownValue, isUndefined, ESNumber } from "../types";
import { ESString, TESString } from "../string/String";
import { concatenateStrings } from "../string/concat";
import { bindNormal } from "../evaluate";
import { readMember } from "../ASTResolvers";
import { isObjectValue, toString, withValue } from "../conversion/toString";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { strictEquality } from "../symbolic";
import { tuple } from "@deaven/tuple";

export type ErrorName = "Error" | "EvalError" | "RangeError" | "ReferenceError" | "SyntaxError" | "TypeError" | "URIError";
const prototypes = new Map<ErrorName, TESObject>();
const constructors = new Map<ErrorName, ReturnType<typeof ESFunction>>();

export function createError(name: ErrorName, message?: Any): TESObject {
  return Object.assign(ESObject(message === undefined ? {} : { message }), {
    prototype: getErrorPrototype(name), errorData: true,
    unmodeledPropertyReads: ["stack"], unmodeledPropertyWrites: ["stack"]
  });
}

function getErrorPrototype(name: ErrorName): TESObject {
  const existing = prototypes.get(name);
  if (existing) return existing;
  const prototype = ESObject({ name: ESString(name), message: ESString("") });
  prototypes.set(name, prototype);
  if (name !== "Error") prototype.prototype = getErrorPrototype("Error");
  else Object.assign(prototype.properties, { toString: ESBuiltinFunction(errorToString) });
  return prototype;
}

function defaultString(value: Any, fallback: string, context: TExecutionContext): BranchResult {
  return withValue(value, context, (input, branch) =>
    isUndefined(input) ? [ESString(fallback), branch] : toString(input, branch));
}

function formatError(nameValue: Any, messageValue: Any, context: TExecutionContext): BranchResult {
  return withValue(nameValue, context, (name, afterName) =>
    withValue(messageValue, afterName, (message, afterMessage) =>
      evaluateBranches(strictEquality(name, ESString(""), afterMessage.value.knowledge), afterMessage,
        branch => [message, branch],
        branch => evaluateBranches(strictEquality(message, ESString(""), branch.value.knowledge), branch,
          leaf => [name, leaf], leaf => [concatenateStrings(
            concatenateStrings(name as TESString, ESString(": ")), message as TESString), leaf]))));
}

function* errorToString(self: Any, _args: Any[], context: TExecutionContext) {
  if (!isObjectValue(self)) return tuple(ThrownValue(createError("TypeError", ESString("Error.prototype.toString requires an object"))), context);
  // Read message only after name conversion: a user method may change it.
  return bindNormal(readMember(self, "name", context), (nameValue, afterName) =>
    bindNormal(defaultString(nameValue, "Error", afterName), (name, afterNameString) =>
      bindNormal(readMember(self, "message", afterNameString), (messageValue, afterMessage) =>
        bindNormal(defaultString(messageValue, "", afterMessage), (message, afterMessageString) =>
          formatError(name, message, afterMessageString)))));
}

export function getErrorConstructor(name: ErrorName) {
  const existing = constructors.get(name);
  if (existing) return existing;
  const constructor = ESFunction(function*(_self, args, context) {
    return bindNormal(withValue(args[0] || Undefined, context, (message, branch) =>
      isUndefined(message) ? [createError(name), branch] :
        bindNormal(toString(message, branch), (text, after) => [createError(name, text), after])), (error, afterMessage) =>
      withValue(args[1] || Undefined, afterMessage, (options, after) => {
        if (isObjectValue(options)) throw new Error("Error cause options are not yet supported");
        return [error, after];
      }));
  });
  constructors.set(name, constructor);
  constructor.properties.prototype = getErrorPrototype(name);
  Object.assign(constructor.properties, { name: ESString(name), length: ESNumber(1) });
  // Descriptor mutation needs a separate model; do not treat the non-writable
  // intrinsic prototype property as an ordinary mutable data property.
  Object.assign(constructor, { unmodeledPropertyWrites: ["prototype", "name", "length"] });
  Object.assign(constructor.properties.prototype.properties, { constructor });
  return constructor;
}
