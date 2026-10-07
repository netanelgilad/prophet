import { tuple } from "@deaven/tuple";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { Any, isESNumber, isUndefined, TESNumber } from "../types";
import { Array, TArray } from "./Array";
import { getArrayElements } from "../execution-context/Heap";
import { getSymbolicArrayShape, sliceSymbolicArray } from "./symbolic";
import { assertNoInheritedArrayElements } from './inherited-elements';

type SliceResult = TArray<any> & {
  type: string;
  properties: {
    [name: string]: Any;
    [index: number]: Any;
    length: TESNumber;
  };
};

export function* slice(
  self: TArray<any>,
  args: Any[],
  execContext: TExecutionContext
): Generator<never, [SliceResult, TExecutionContext], unknown> {
  if (getSymbolicArrayShape(self, execContext)) {
    const start = concreteBound(args[0]);
    const end = concreteBound(args[1]);
    if (end !== undefined) {
      throw new Error("Symbolic Array.slice does not yet support an end bound");
    }
    return tuple(sliceSymbolicArray(self, start === undefined ? 0 : start, execContext), execContext);
  }
  const elements = getArrayElements(self, execContext);
  if (elements === undefined) {
    throw new Error("Array.slice requires an array with known element positions");
  }
  assertNoInheritedArrayElements(self, elements, execContext);

  const start = concreteBound(args[0]);
  const end = concreteBound(args[1]);
  return tuple(Array(elements.slice(start, end), "elements"), execContext);
}

function concreteBound(bound: Any | undefined): number | undefined {
  if (bound === undefined || isUndefined(bound)) {
    return undefined;
  }
  if (isESNumber(bound) && bound.value !== undefined) {
    return bound.value;
  }
  throw new Error("Array.slice requires concrete numeric bounds");
}
