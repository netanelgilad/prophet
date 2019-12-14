import { split } from "./split";
import { substr } from "./substr";
import {
  Number,
  WithProperties,
  Any,
  GreaterThanEquals,
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
    substr: Function<TESString>;
    length: typeof Number | TESNumber | GreaterThanEquals;
  }> &
  WithValue<string | Array<TESString>>;

export function ESString(value?: string | Array<TESString>): TESString {
  return {
    type: "string",
    id: ValueIdentifier(),
    properties: {
      toString: {
        function: {
          implementation: function*(
            self,
            _args,
            execContext: TExecutionContext
          ) {
            return tuple(self, execContext);
          }
        }
      },
      split: <Function<TESString>>{
        implementation: split
      },
      substr: <Function<TESString, [TESNumber, TESNumber, ...Array<Any>]>>{
        implementation: substr
      },
      length: calculateLength(value)
    },
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

function calculateLength(
  value?: string | Array<TESString>
): typeof Number | TESNumber | GreaterThanEquals {
  if (!value) {
    return Number;
  }
  if (typeof value === "string") {
    return { number: value.length };
  }
  return value.reduce((result, part) => {
    if (!result) {
      return calculateLength(part.value);
    } else {
      return {
        gte: (result as TESNumber).value
      };
    }
  }, (undefined as any) as typeof Number | Any | GreaterThanEquals);
}
