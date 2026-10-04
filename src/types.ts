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
  // Explicit representation contract, not a guess from the property names.
  // Legacy intrinsics also store non-enumerable/inherited fields in properties.
  ownPropertyModel?: "enumerable-data" | "unmodeled";
  // Internal prototype link; distinct from an ordinary property named prototype.
  prototype?: Any;
  // A partial host value must explicitly promise its internal prototype link
  // before an operation can traverse it. This does not expose its descriptors.
  modeledPrototype?: boolean;
  unmodeledPrototype?: string;
  // Immutable intrinsic/embedding symbol slots. Public Symbol-key property
  // creation, mutation and descriptors remain separate implementation work.
  wellKnownSymbols?: ReadonlyMap<object, Any>;
  // Immutable identity links for host-state inspection, separate from guest
  // properties. Mutable state and initialization still belong to the heap;
  // these links neither authorize a host receiver nor make graphs resumable.
  hostSlots?: { readonly [name: string]: Any };
  unmodeledPropertyReads?: ReadonlyArray<string>;
  // A partial host object has modeled fields, but other fields are unknown,
  // not absent. Access must report the missing model instead of inventing
  // undefined values or assuming ordinary writable data properties.
  unknownProperties?: string;
  // A partial host object can still promise that selected missing fields use
  // ordinary prototype lookup (for example a function's inherited call).
  modeledInheritedProperties?: ReadonlyArray<string>;
  // Reading some host fields is modeled before their mutation semantics are.
  // These writes are analysis gaps, not claims that JavaScript forbids them.
  unmodeledPropertyWrites?: ReadonlyArray<string>;
  // A host model may expose field values before it models whether those fields
  // are own data properties, inherited methods, or accessors.
  unmodeledOwnPropertyInspection?: string;
  // Exotic host values can handle selected property operations before ordinary
  // lookup/assignment. Undefined delegates to the shared ordinary semantics;
  // a returned pair retains the current path's value, effects and heap.
  // Presence, descriptors and enumeration require separate models.
  propertyAccess?: {
    read(name: string, context: TExecutionContext): [Any, TExecutionContext] | undefined;
    write(name: string, assigned: Any, context: TExecutionContext): [Any, TExecutionContext] | undefined;
  };
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
