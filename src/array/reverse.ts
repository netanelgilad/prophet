import { tuple } from "@deaven/tuple";
import { Any } from "../types";
import { TArray } from "./Array";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { getArrayElements, writeArrayElements } from "../execution-context/Heap";

export function* reverse(
  self: TArray<any>,
  _args: Array<Any>,
  execContext: TExecutionContext
) {
  const elements = getArrayElements(self, execContext);
  if (elements === undefined) {
    throw new Error("Array.reverse requires an array with known element positions");
  }
  return tuple(self, writeArrayElements(self, elements.slice().reverse(), execContext));
}
