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
export function getStringPrototype(): TESObject {
  if (!stringPrototype) {
    const prototype: TESObject & { stringData: true } = {
      ...ESObject({ length: ESNumber(0) }), stringData: true,
      unmodeledPropertyWrites: ["length"]
    };
    stringPrototype = prototype;
    prototype.properties.concat = {
      ...ESBuiltinFunction(concat),
      properties: { length: ESNumber(1), name: ESString("concat") },
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

function calculateLength(value?: string | Array<TESString>): TESNumber {
  if (typeof value === "string") return ESNumber(value.length);
  const lengths = value && value.map(part => calculateLength(part.value));
  if (lengths && lengths.every(length => typeof length.value === "number")) {
    return ESNumber(lengths.reduce((total, length) => total + length.value!, 0));
  }
  const length = ESNumber();
  length.knowledge = [
    { kind: "finite", subject: length },
    { kind: "order", left: ESNumber(0), right: length, strict: false }
  ];
  return length;
}
