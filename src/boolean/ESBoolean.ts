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
import { assume, choiceOf, Knowledge, resolveBoolean, selectValue } from "../symbolic";

export function ESBoolean(value?: boolean): TESBoolean {
  return {
    type: "boolean",
    id: ValueIdentifier(),
    properties: {},
    value
  };
}

export function coerceToBoolean(val: Any, knowledge: Knowledge = []): TESBoolean {
  if (isESBoolean(val)) {
    const resolved = resolveBoolean(val, knowledge);
    return resolved === undefined ? val : ESBoolean(resolved);
  }

  const choice = choiceOf(val);
  if (choice) {
    const resolved = resolveBoolean(choice.condition, knowledge);
    if (resolved !== undefined) {
      return coerceToBoolean(resolved ? choice.consequent : choice.alternate,
        assume(knowledge, choice.condition, resolved));
    }
    return selectValue(choice.condition,
      coerceToBoolean(choice.consequent, assume(knowledge, choice.condition, true)),
      coerceToBoolean(choice.alternate, assume(knowledge, choice.condition, false)), knowledge) as TESBoolean;
  }

  if (isESNumber(val)) {
    return typeof val.value === "number"
      ? ESBoolean(Boolean(val.value))
      : { ...ESBoolean(), expression: { kind: "truthy", operand: val } };
  }

  if (isESNull(val) || isUndefined(val)) {
    return ESBoolean(false);
  }

  if (isESString(val)) {
    return typeof val.value === "string"
      ? val.value === ""
        ? ESBoolean(false)
        : ESBoolean(true)
      : { ...ESBoolean(), expression: { kind: "truthy", operand: val } };
  }

  if (isESObject(val)) {
    return ESBoolean(true);
  }

  if ((val as { type?: string }).type === "array") return ESBoolean(true);

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
  return [coerceToBoolean(args[0] || Undefined, execContext.value.knowledge), execContext] as [
    Any,
    TExecutionContext
  ];
});
