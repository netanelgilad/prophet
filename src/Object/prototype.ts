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
import { assumeInContext } from "../execution-context/branches";
import { choiceOf, resolveBoolean, selectValue } from "../symbolic";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { ESBoolean } from "../boolean/ESBoolean";

let objectPrototype: TESObject | undefined;

export function getObjectPrototype(): TESObject {
  if (objectPrototype) return objectPrototype;
  objectPrototype = { ...ESObject(), prototype: ESNull };
  Object.assign(objectPrototype.properties, { toString: ESBuiltinFunction(function*(self, _args, context) {
    const type = (self as Type<string>).type;
    const tag = (self as { errorData?: boolean }).errorData ? "Error" :
      (self as { stringData?: boolean }).stringData ? "String" :
      ({ object: "Object", array: "Array", function: "Function", string: "String",
        number: "Number", boolean: "Boolean", null: "Null", undefined: "Undefined" } as {[key: string]: string})[type];
    if (!tag) throw new Error("Object.prototype.toString requires a modeled value kind");
    return tuple(ESString("[object " + tag + "]"), context);
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
        if (ownership) throw new Error(`Unmodeled host own-property inspection: ${ownership}`);
        const unsupported = (self as WithProperties).unmodeledPropertyReads;
        if (unsupported && unsupported.includes((name as TESString).value as string)) throw new Error(`Unmodeled property presence '${(name as TESString).value}'`);
        const own = ownPropertyPresence(self as WithProperties, (name as TESString).value as string, branch);
        if (own.value !== true && (self as WithProperties).unknownProperties &&
            !((self as WithProperties).modeledInheritedProperties || []).includes((name as TESString).value as string)) {
          throw new Error("Unmodeled host property presence");
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
    throw new Error(`Unmodeled property presence '${name}'`);
  }
  const own = ownPropertyPresence(object, name, context);
  const known = resolveBoolean(own, context.value.knowledge);
  if (known === true) return ESBoolean(true);
  if (object.unknownProperties && !(object.modeledInheritedProperties || []).includes(name)) {
    throw new Error(`Unmodeled host property presence '${name}'`);
  }
  const prototype = prototypeOf(value);
  const inherited = isESNull(prototype) ? ESBoolean(false) :
    hasProperty(prototype, name, assumeInContext(context, own, false));
  return known === false ? inherited : selectValue(own, ESBoolean(true), inherited, context.value.knowledge) as TESBoolean;
}
