import { Any, FunctionImplementation } from "../types";
import { UnsupportedAnalysisError } from "../execution-context/analysis-failure";
import { TESString, ESString } from "./String";
import { Array } from "../array/Array";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { tuple } from "@deaven/tuple";

export const split: FunctionImplementation<
  TESString,
  [TESString, ...Array<Any>]
> = function*(self, args, execContext: TExecutionContext) {
  // Concrete receivers split through the pinned host's literal-separator
  // semantics: omitted/undefined separators yield the whole string, empty
  // separators split characters, and adjacent separators keep empty
  // elements. RegExp separators and limit arguments remain gaps.
  if (typeof self.value === "string") {
    const separator = args.length ? args[0] : undefined;
    if (separator !== undefined && typeof (separator as TESString).value !== "string") {
      throw new UnsupportedAnalysisError("String.split non-string separators are not yet supported");
    }
    if (args.length > 1 && !(args[1] === undefined)) {
      throw new UnsupportedAnalysisError("String.split limit arguments are not yet supported");
    }
    // Spec 22.1.3.20: an absent (undefined) separator yields the whole
    // string as the single element; the ES2015+ TS lib typings reject
    // split(undefined), so the absent case is spelled out directly.
    const pieces = separator === undefined ? [self.value]
      : self.value.split((separator as TESString).value as string);
    return tuple(
      Array(pieces.map((part: string) => ESString(part)), "elements"),
      execContext
    );
  }
  return tuple(
    Array(
      (self.value as Array<TESString>).map(part => {
        if (part.value) {
          return Array(
            (part.value as string)
              .split(args[0].value as string)
              .map(string => ESString(string)),
            "elements"
          );
        }
        return Array();
      }),
      "segments"
    ),
    execContext
  );
};
