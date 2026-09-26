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
  Function
} from "../types";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { ESFunction } from "../Function/Function";
import { __ } from "@deaven/bottomdash";
import { tuple } from "@deaven/tuple";

export type TESString = Type<"string"> &
  WithProperties<{
    toString: Function<TESString, Any[]>;
    split: Function<TESString>;
    substr: Function<TESString, [TESNumber, TESNumber, ...Array<Any>]>;
    length: TESNumber;
  }> &
  WithValue<string | Array<TESString>>;

export function ESString(value?: string | Array<TESString>): TESString {
  const properties = {
    toString: {
      implementation: function*(self: TESString, _args: Any[], execContext: TExecutionContext) {
        return tuple(self, execContext);
      }
    },
    split: <Function<TESString>>{ implementation: split },
    substr: <Function<TESString, [TESNumber, TESNumber, ...Array<Any>]>>{ implementation: substr },
    length: calculateLength(value)
  };
  return {
    type: "string",
    id: ValueIdentifier(),
    properties,
    value
  };
}

export const StringConstructor = ESFunction(function*(
  _self: Any,
  args: Any[],
  execContext
) {
  return [args[0], execContext] as [Any, TExecutionContext];
});

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
