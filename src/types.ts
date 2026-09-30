import { isObject, keys } from "lodash";
import { TESString } from "./string/String";
import { TExecutionContext } from "./execution-context/ExecutionContext";
import { unsafeCast } from "@deaven/unsafe-cast.macro";
import { Expression, Knowledge } from "./symbolic/model";

export const NotANumber = {};
export const Number = {};
export const TODOTYPE = {};

export type TESUndefined = Type<"undefined">;

export type TESNull = Type<"null">;

export const ESNull: TESNull = {
  type: "null"
};

export function isESNull(arg: any): arg is TESNull {
  return arg.type === "null";
}

export const Undefined: TESUndefined = {
  type: "undefined"
};

export function isUndefined(arg: any): arg is TESUndefined {
  return arg.type === "undefined";
}

export function isESString(arg: any): arg is TESString {
  return arg.type === "string";
}

export function isArray(arg: any) {
  return arg.type === "array";
}

export type TESNumber = Type<"number"> & WithProperties & WithValue<number>;

export function ESNumber(value?: number): TESNumber {
  return {
    type: "number",
    id: ValueIdentifier(),
    properties: {},
    value
  };
}

export function isESNumber(arg: any): arg is TESNumber {
  return arg.type === "number";
}

export type GreaterThanEquals = {
  gte: number;
};

export type TGreaterThan<T extends Any> = Type<"GreaterThan"> & {
  gt: T;
};

export function GreaterThan<T extends Any>(type: T): TGreaterThan<T> {
  return {
    type: "GreaterThan",
    gt: type
  };
}

export function isGreaterThan<T extends Type<any>>(arg: T) {
  return arg.type === "GreaterThan";
}

export type FunctionImplementation<
  TSelf extends Any = Any,
  TArgs extends Array<Any> = Array<Any>
> = (
  self: TSelf,
  args: TArgs,
  execContext: TExecutionContext
) => Generator<
  never | [Any, TExecutionContext],
  [EvaluationResult, TExecutionContext],
  [Any, TExecutionContext]
>;

export interface Function<
  TSelf extends Any = Any,
  TArgs extends Array<Any> = Array<Any>
> {
  implementation: FunctionImplementation<TSelf, TArgs>;
}

export function isFunction(arg: any): arg is Function {
  return (
    isObject(arg) && keys(arg).length === 1 && keys(arg)[0] === "implementation"
  );
}

export type FunctionBinding = WithProperties & {
  self?: Any;
  function: Function;
};

export type WithProperties<
  KnownProperties extends {
    [name: string]: Any;
  } = {}
> = {
  properties: { [name: string]: Any } & KnownProperties;
  // Internal prototype link; distinct from an ordinary property named prototype.
  prototype?: Any;
  unmodeledPropertyReads?: ReadonlyArray<string>;
  // A partial host object has modeled fields, but other fields are unknown,
  // not absent. Access must report the missing model instead of inventing
  // undefined values or assuming ordinary writable data properties.
  unknownProperties?: string;
  // Reading some host fields is modeled before their mutation semantics are.
  // These writes are analysis gaps, not claims that JavaScript forbids them.
  unmodeledPropertyWrites?: ReadonlyArray<string>;
};

export function ValueIdentifier() {
  return {} as object;
}

export type Type<T extends string> = {
  type: T;
};

export type TValueIdentifier = ReturnType<typeof ValueIdentifier>;

export type WithValue<T> = {
  id?: TValueIdentifier;
  value?: T;
  expression?: Expression;
  knowledge?: Knowledge;
};

export type TReturnValue = {
  type: "ReturnValue";
  value: Any;
};

export function ReturnValue(value: Any) {
  return {
    type: "ReturnValue",
    value
  };
}

export function isReturnValue(arg: any): arg is TReturnValue {
  return arg.type === "ReturnValue";
}

export type TThrownValue = {
  type: "ThrownValue";
  value: Any;
};

export function ThrownValue(value: Any) {
  return {
    type: "ThrownValue",
    value
  };
}

export function isThrownValue(arg: any): arg is TThrownValue {
  return arg.type === "ThrownValue";
}

export type TESBoolean = Type<"boolean"> &
  WithProperties &
  WithValue<boolean>;

export function isESBoolean(arg: Any): arg is TESBoolean {
  return unsafeCast<Type<string>>(arg).type === "boolean";
}

// Every interpreter value is an object, including undefined and primitive
// values. The former union contained the {}-typed Number sentinel, effectively
// admitting all objects already, while recursively expanding every value kind.
// Individual operations narrow this opaque boundary using their type guards.
export type Any = object;

export type ExpressionEvaluationResult = TThrownValue | Any;
export type ControlFlowResult = TThrownValue | TReturnValue;
export type EvaluationResult = Any | ControlFlowResult;
