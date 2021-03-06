import {
  TESBoolean,
  Any,
  ValueIdentifier,
  isESBoolean,
  isESNumber,
  isESNull,
  isUndefined,
  isESString,
  Undefined
} from "../types";
import { isESObject } from "../Object";
import { ESFunction, isESFunction } from "../Function/Function";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { unimplemented } from "@deaven/unimplemented";

export function ESBoolean(value?: boolean): TESBoolean {
  return {
    type: "boolean",
    id: ValueIdentifier(),
    properties: {},
    value
  };
}

export function coerceToBoolean(val: Any): TESBoolean {
  if (isESBoolean(val)) {
    return val;
  }

  if (isESNumber(val)) {
    return typeof val.value === "number"
      ? val.value === 0
        ? ESBoolean(false)
        : ESBoolean(true)
      : ESBoolean();
  }

  if (isESNull(val) || isUndefined(val)) {
    return ESBoolean(false);
  }

  if (isESString(val)) {
    return typeof val.value === "string"
      ? val.value === ""
        ? ESBoolean(false)
        : ESBoolean(true)
      : unimplemented();
  }

  if (isESObject(val)) {
    return ESBoolean(true);
  }

  if (isESFunction(val)) {
    return ESBoolean(true);
  }

  return unimplemented();
}

export const ESBooleanConstructor = ESFunction(function*(
  _self: Any,
  args: Any[],
  execContext
) {
  return [coerceToBoolean(args[0] || Undefined), execContext] as [
    Any,
    TExecutionContext
  ];
});
