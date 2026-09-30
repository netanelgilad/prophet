import { Any, isESNull, Undefined, WithProperties } from "../types";
import { withValue } from "../conversion/toString";
import { BranchResult } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { withInternalPrototype } from "./prototype";

// Identity keys cannot collide with ordinary strings such as "@@hasInstance".
// These internal slots do not claim an implemented public Symbol constructor.
export const hasInstanceSymbol = Object.freeze({ name: "Symbol.hasInstance" });

export function readWellKnownSymbol(
  value: Any, key: { name: string }, context: TExecutionContext, seen: Any[] = []
): BranchResult {
  return withValue(value, context, (object, branch) => {
    if (seen.includes(object)) throw new Error("Cyclic symbol lookup prototypes are not yet supported");
    const slots = (object as WithProperties).wellKnownSymbols;
    if (slots && slots.has(key)) return [slots.get(key)!, branch];
    const partial = (object as WithProperties).unknownProperties;
    if (partial) throw new Error(`Unmodeled host ${key.name} read: ${partial}`);
    return withInternalPrototype(object, branch, (prototype, after) => isESNull(prototype)
      ? [Undefined, after] : readWellKnownSymbol(prototype, key, after, seen.concat([object])));
  });
}
