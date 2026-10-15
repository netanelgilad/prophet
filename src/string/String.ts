import { sloppyBoxPrototypes } from "../Function/boxing";
import { split } from "./split";
import { substr } from "./substr";
import {
  WithProperties,
  Any,
  ESNumber,
  TESNumber,
  WithValue,
  ValueIdentifier,
  Type,
  Function,
  isESString,
  ThrownValue
} from "../types";
import { ESBuiltinFunction, ESFunction } from "../Function/Function";
import { tuple } from "@deaven/tuple";
import { ESObject, TESObject } from "../Object";
import { createError } from "../error/Error";
import { toString } from "../conversion/toString";
import { concat } from "./concat";
import { stringSlice } from "./slice";
import { stringTrim } from "./trim";
import { stringToLowerCase } from "./toLowerCase";
import { stringLastIndexOf } from "./lastIndexOf";
import { stringCharCodeAt } from "./charCodeAt";
import { stringIncludes } from "./includes";
import { stringIndexOf } from "./indexOf";
import { stringSubstring } from "./substring";
import { stringNormalize } from "./normalize";
import { stringReplace } from "./replace";
import { markPartialIntrinsic } from "../execution-context/Heap";
import { markUnsupportedBoundaryObject } from "../execution-context/analysis-failure";

export type TESString = Type<"string"> &
  WithProperties<{
    split: Function<TESString>;
    substr: Function<TESString, [TESNumber, TESNumber, ...Array<Any>]>;
    length: TESNumber;
  }> &
  WithValue<string | Array<TESString>>;

// Created lazily because strings, conversion, functions and the evaluator
// depend on one another. Install the identity before creating string metadata.
var stringPrototype: TESObject | undefined;
// Remaining standard own string-keyed names of the pinned Node String prototype
// (including Annex B aliases/HTML helpers). Primitive split/substr keep their
// legacy own implementations; borrowing those methods from the prototype is not
// modeled. Other absent string-keyed names still use ordinary prototype lookup.
const deferredPrototypeNames = ["anchor", "at", "big", "blink", "bold", "charAt",
  "codePointAt", "endsWith", "fontcolor", "fontsize", "fixed",
  "isWellFormed", "italics", "link",
  "localeCompare", "match", "matchAll", "padEnd", "padStart",
  "repeat", "replaceAll", "search", "small", "split", "strike",
  "sub", "substr", "sup", "startsWith", "toWellFormed",
  "trimStart", "trimLeft", "trimEnd", "trimRight", "toLocaleLowerCase",
  "toLocaleUpperCase", "toUpperCase"];
export function getStringPrototype(): TESObject {
  if (!stringPrototype) {
    const prototype: TESObject & { stringData: true } = markPartialIntrinsic({
      ...ESObject({ length: ESNumber(0) }, "unmodeled"), stringData: true,
      unmodeledPropertyWrites: ["length"]
    }, "String.prototype", deferredPrototypeNames);
    stringPrototype = prototype;
    prototype.properties.trim = markUnsupportedBoundaryObject({
      ...ESBuiltinFunction(stringTrim),
      properties: { length: ESNumber(0), name: ESString("trim") },
      unknownProperties: "String.trim metadata",
      modeledInheritedProperties: ["call", "prototype"],
      unmodeledPropertyReads: ["caller", "arguments"],
      unmodeledPropertyWrites: ["length", "name"]
    });
    prototype.properties.toLowerCase = markUnsupportedBoundaryObject({
      ...ESBuiltinFunction(stringToLowerCase),
      properties: { length: ESNumber(0), name: ESString("toLowerCase") },
      unknownProperties: "String.toLowerCase metadata",
      modeledInheritedProperties: ["call", "prototype"],
      unmodeledPropertyReads: ["caller", "arguments"],
      unmodeledPropertyWrites: ["length", "name"]
    });
    prototype.properties.charCodeAt = markUnsupportedBoundaryObject({
      ...ESBuiltinFunction(stringCharCodeAt),
      properties: { length: ESNumber(1), name: ESString("charCodeAt") },
      unknownProperties: "String.charCodeAt metadata",
      modeledInheritedProperties: ["call", "prototype"],
      unmodeledPropertyReads: ["caller", "arguments"],
      unmodeledPropertyWrites: ["length", "name"]
    });
    prototype.properties.indexOf = markUnsupportedBoundaryObject({
      ...ESBuiltinFunction(stringIndexOf),
      properties: { length: ESNumber(1), name: ESString("indexOf") },
      unknownProperties: "String.indexOf metadata",
      modeledInheritedProperties: ["call", "prototype"],
      unmodeledPropertyReads: ["caller", "arguments"],
      unmodeledPropertyWrites: ["length", "name"]
    });
    prototype.properties.includes = markUnsupportedBoundaryObject({
      ...ESBuiltinFunction(stringIncludes),
      properties: { length: ESNumber(1), name: ESString("includes") },
      unknownProperties: "String.includes metadata",
      modeledInheritedProperties: ["call", "prototype"],
      unmodeledPropertyReads: ["caller", "arguments"],
      unmodeledPropertyWrites: ["length", "name"]
    });
    prototype.properties.lastIndexOf = markUnsupportedBoundaryObject({
      ...ESBuiltinFunction(stringLastIndexOf),
      properties: { length: ESNumber(1), name: ESString("lastIndexOf") },
      unknownProperties: "String.lastIndexOf metadata",
      modeledInheritedProperties: ["call", "prototype"],
      unmodeledPropertyReads: ["caller", "arguments"],
      unmodeledPropertyWrites: ["length", "name"]
    });
    prototype.properties.normalize = markUnsupportedBoundaryObject({
      ...ESBuiltinFunction(stringNormalize),
      properties: { length: ESNumber(0), name: ESString("normalize") },
      unknownProperties: "String.normalize metadata",
      modeledInheritedProperties: ["call", "prototype"],
      unmodeledPropertyReads: ["caller", "arguments"],
      unmodeledPropertyWrites: ["length", "name"]
    });
    prototype.properties.replace = markUnsupportedBoundaryObject({
      ...ESBuiltinFunction(stringReplace),
      properties: { length: ESNumber(2), name: ESString("replace") },
      unknownProperties: "String.replace metadata",
      modeledInheritedProperties: ["call", "prototype"],
      unmodeledPropertyReads: ["caller", "arguments"],
      unmodeledPropertyWrites: ["length", "name"]
    });
    prototype.properties.substring = markUnsupportedBoundaryObject({
      ...ESBuiltinFunction(stringSubstring),
      properties: { length: ESNumber(2), name: ESString("substring") },
      unknownProperties: "String.substring metadata",
      modeledInheritedProperties: ["call", "prototype"],
      unmodeledPropertyReads: ["caller", "arguments"],
      unmodeledPropertyWrites: ["length", "name"]
    });
    prototype.properties.concat = {
      ...ESBuiltinFunction(concat),
      properties: { length: ESNumber(1), name: ESString("concat") },
      unmodeledPropertyWrites: ["length", "name"]
    };
    prototype.properties.slice = {
      ...ESBuiltinFunction(stringSlice),
      properties: { length: ESNumber(2), name: ESString("slice") },
      unmodeledPropertyWrites: ["length", "name"]
    };
    const stringValue = (name: string) => ({ ...ESBuiltinFunction(function*(self, _args, context) {
      if (isESString(self)) return tuple(self, context);
      if (self === prototype) return tuple(ESString(""), context);
      return tuple(ThrownValue(createError("TypeError", ESString("String method requires a string receiver"))), context);
    }),
      properties: { length: ESNumber(0), name: ESString(name) },
      unmodeledPropertyWrites: ["length", "name"]
    });
    Object.assign(prototype.properties, { toString: stringValue("toString"), valueOf: stringValue("valueOf") });
  }
  return stringPrototype;
}

export function ESString(value?: string | Array<TESString>): TESString {
  const properties = {
    split: <Function<TESString>>{ implementation: split },
    substr: <Function<TESString, [TESNumber, TESNumber, ...Array<Any>]>>{ implementation: substr },
    length: calculateLength(value)
  };
  return {
    type: "string",
    id: ValueIdentifier(),
    prototype: getStringPrototype(),
    properties,
    value
  };
}

export const StringConstructor = Object.assign(ESFunction(function*(
  _self: Any,
  args: Any[],
  execContext
) {
  return args.length ? toString(args[0], execContext) : tuple(ESString(""), execContext);
}), { unmodeledConstruct: "String wrapper construction is not yet supported",
  unmodeledPropertyWrites: ["prototype"] });
StringConstructor.properties.prototype = getStringPrototype();
Object.assign(getStringPrototype().properties, { constructor: StringConstructor });

// The original intrinsic prototype boxes sloppy primitive receivers (ToObject).
sloppyBoxPrototypes.string = getStringPrototype();

function calculateLength(value?: string | Array<TESString>): TESNumber {
  if (typeof value === "string") return ESNumber(value.length);
  const lengths = value && value.map(part => calculateLength(part.value));
  if (lengths && lengths.every(length => typeof length.value === "number")) {
    return ESNumber(lengths.reduce((total, length) => total + length.value!, 0));
  }
  const length = ESNumber();
  length.knowledge = [
    { kind: "finite", subject: length },
    { kind: "integer", subject: length },
    { kind: "order", left: length, right: ESNumber(Number.MAX_SAFE_INTEGER), strict: false },
    { kind: "order", left: ESNumber(0), right: length, strict: false }
  ];
  return length;
}
