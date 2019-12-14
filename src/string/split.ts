import { Any, FunctionImplementation } from "../types";
import { TESString, ESString } from "./String";
import { Array } from "../array/Array";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { tuple } from "@deaven/tuple";

export const split: FunctionImplementation<
  TESString,
  [TESString, ...Array<Any>]
> = function*(self, args, execContext: TExecutionContext) {
  return tuple(
    Array(
      (self.value as Array<TESString>).map(part => {
        if (part.value) {
          return Array(
            (part.value as string)
              .split(args[0].value as string)
              .map(string => ESString(string)),
            true
          );
        }
        return Array();
      })
    ),
    execContext
  );
};
