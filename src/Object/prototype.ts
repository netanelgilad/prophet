import { unsupportedPropertyError } from "../execution-context/analysis-failure";
import { ESObject, TESObject } from "../Object";
import { ESBuiltinFunction } from "../Function/Function";
import { Any, ESNull, Undefined, Type, ThrownValue, WithProperties, TESBoolean, isESNull, isUndefined } from "../types";
import { ESString, TESString } from "../string/String";
import { bindNormal } from "../evaluate";
import { isObjectValue, toString, withValue } from "../conversion/toString";
import { ownPropertyPresence } from "../execution-context/Heap";
import { createError } from "../error/Error";
import { tuple } from "@deaven/tuple";
import { getFunctionPrototype } from "../Function/prototype";
import { assumeInContext, BranchResult, evaluateBranches } from "../execution-context/branches";
import { choiceOf, resolveBoolean, selectValue } from "../symbolic";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { ESBoolean } from "../boolean/ESBoolean";

let objectPrototype: TESObject | undefined;

function withModeledStringTag(
  value: Any, context: TExecutionContext,
  continuation: (context: TExecutionContext) => BranchResult, seen: Any[] = []
): BranchResult {
  return withValue(value, context, (object, branch) => {
    // Symbol.toStringTag is inherited. A partial host model anywhere in the
    // prototype chain cannot establish that the property is absent.
    const unknown = (object as WithProperties).unknownProperties;
    if (unknown) throw unsupportedPropertyError(object, `Unmodeled host Symbol.toStringTag read: ${unknown}`);
    if (seen.includes(object)) throw new Error("Cyclic prototype graphs are not yet supported");
    const prototype = prototypeOf(object);
    return isESNull(prototype) ? continuation(branch) :
      withModeledStringTag(prototype, branch, continuation, seen.concat([object]));
  });
}

export function getObjectPrototype(): TESObject {
  if (objectPrototype) return objectPrototype;
  objectPrototype = { ...ESObject(undefined, "unmodeled"), prototype: ESNull,
    unmodeledPropertyReads: ["__proto__"] };
  Object.assign(objectPrototype.properties, { toString: ESBuiltinFunction(function*(self, _args, context) {
    return withValue(self, context, (value, branch) => {
      // Object.prototype.toString reads Symbol.toStringTag even when borrowed.
      // Deriving a tag from a partial host model's broad VM type would invent
      // a concrete result, including through an ordinary object's prototype.
      const type = (value as Type<string>).type;
      const tag = (value as { errorData?: boolean }).errorData ? "Error" :
        (value as { stringData?: boolean }).stringData ? "String" :
        ({ object: "Object", array: "Array", function: "Function", string: "String",
          number: "Number", boolean: "Boolean", null: "Null", undefined: "Undefined" } as {[key: string]: string})[type];
      if (!tag) throw new Error("Object.prototype.toString requires a modeled value kind");
      return withModeledStringTag(value, branch, after => tuple(ESString("[object " + tag + "]"), after));
    });
  }), valueOf: ESBuiltinFunction(function*(self, _args, context) {
    if (isUndefined(self) || isESNull(self)) return tuple(ThrownValue(createError("TypeError", ESString("Cannot convert null or undefined to object"))), context);
    if (!["object", "array", "function"].includes((self as Type<string>).type)) {
      throw new Error("Primitive wrapper objects are not yet supported");
    }
    return tuple(self, context);
  }), hasOwnProperty: ESBuiltinFunction(function*(self, args, context) {
    return bindNormal(toString(args[0] || Undefined, context), (key, afterKey) =>
      withValue(key, afterKey, (name, branch) => {
        if (isUndefined(self) || isESNull(self)) return [ThrownValue(createError("TypeError", ESString("Cannot convert null or undefined to object"))), branch];
        if (!isObjectValue(self)) throw new Error("Primitive receiver boxing is not yet supported for hasOwnProperty");
        if (typeof (name as TESString).value !== "string") throw new Error("Property keys require a concrete string");
        const ownership = (self as WithProperties).unmodeledOwnPropertyInspection;
        if (ownership) throw unsupportedPropertyError(self, `Unmodeled host own-property inspection: ${ownership}`);
        const unsupported = (self as WithProperties).unmodeledPropertyReads;
        if (unsupported && unsupported.includes((name as TESString).value as string)) throw unsupportedPropertyError(self, `Unmodeled property presence '${(name as TESString).value}'`);
        const own = ownPropertyPresence(self as WithProperties, (name as TESString).value as string, branch);
        if (own.value !== true && (self as WithProperties).unknownProperties &&
            !((self as WithProperties).modeledInheritedProperties || []).includes((name as TESString).value as string)) {
          throw unsupportedPropertyError(self, "Unmodeled host property presence");
        }
        return [own, branch];
      }));
  }) });
  return objectPrototype;
}

export function prototypeOf(value: Any): Any {
  const explicit = (value as WithProperties).prototype;
  if (explicit) return explicit;
  const type = (value as Type<string>).type;
  return type === "function" ? getFunctionPrototype() : type === "object" ? getObjectPrototype() : ESNull;
}

// Unlike the legacy property-lookup fallback, operations proving prototype
// relationships must reject incomplete host/array links rather than guess.
export function withInternalPrototype(
  value: Any, context: TExecutionContext,
  next: (prototype: Any, context: TExecutionContext) => BranchResult
): BranchResult {
  return withValue(value, context, (object, branch) => {
    const model = object as WithProperties;
    if (model.unmodeledPrototype) throw unsupportedPropertyError(object, `Unmodeled internal prototype: ${model.unmodeledPrototype}`);
    if (model.unknownProperties && !model.modeledPrototype) {
      throw unsupportedPropertyError(object, `Unmodeled host prototype: ${model.unknownProperties}`);
    }
    if ((object as Type<string>).type === "array" && !model.modeledPrototype) {
      throw new Error("Array prototype relationships are not yet supported");
    }
    return withValue(prototypeOf(object), branch, (prototype, after) => {
      if (!isESNull(prototype) && !isObjectValue(prototype)) throw new Error("Invalid internal prototype model");
      return next(prototype, after);
    });
  });
}

// The legacy __proto__ setter is inherited. Treating an assignment as ordinary
// data would leave the internal link stale and make instanceof proofs unsound.
// Own data properties with this spelling remain ordinary writable properties.
export function withoutPrototypeSetter(
  value: Any, context: TExecutionContext, next: (context: TExecutionContext) => BranchResult,
  seen: Any[] = []
): BranchResult {
  return withValue(value, context, (object, branch) => {
    if (object === getObjectPrototype()) throw new Error("Inherited __proto__ setter is not yet supported");
    if (seen.includes(object)) throw new Error("Cyclic prototype writes are not yet supported");
    return evaluateBranches(ownPropertyPresence(object as WithProperties, "__proto__", branch), branch,
      next, absent => withInternalPrototype(object, absent, (prototype, after) =>
        isESNull(prototype) ? next(after) : withoutPrototypeSetter(prototype, after, next, seen.concat([object]))));
  });
}

// HasProperty does not read values or invoke conversion methods. Keep own
// presence distinct from inherited presence, including after a heap join.
export function hasProperty(value: Any, name: string, context: TExecutionContext): TESBoolean {
  const choice = choiceOf(value);
  if (choice) {
    const knownChoice = resolveBoolean(choice.condition, context.value.knowledge);
    if (knownChoice !== undefined) return hasProperty(knownChoice ? choice.consequent : choice.alternate,
      name, assumeInContext(context, choice.condition, knownChoice));
    return selectValue(choice.condition,
      hasProperty(choice.consequent, name, assumeInContext(context, choice.condition, true)),
      hasProperty(choice.alternate, name, assumeInContext(context, choice.condition, false)),
      context.value.knowledge) as TESBoolean;
  }
  const object = value as WithProperties;
  if (object.unmodeledPropertyReads && object.unmodeledPropertyReads.includes(name)) {
    throw unsupportedPropertyError(object, `Unmodeled property presence '${name}'`);
  }
  const own = ownPropertyPresence(object, name, context);
  const known = resolveBoolean(own, context.value.knowledge);
  if (known === true) return ESBoolean(true);
  if (object.unknownProperties && !(object.modeledInheritedProperties || []).includes(name)) {
    throw unsupportedPropertyError(object, `Unmodeled host property presence '${name}'`);
  }
  const prototype = prototypeOf(value);
  const inherited = isESNull(prototype) ? ESBoolean(false) :
    hasProperty(prototype, name, assumeInContext(context, own, false));
  return known === false ? inherited : selectValue(own, ESBoolean(true), inherited, context.value.knowledge) as TESBoolean;
}
