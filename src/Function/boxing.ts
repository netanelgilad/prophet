import { ESObject, TESObject } from "../Object";
import { Any } from "../types";

// Intrinsic prototypes for sloppy receiver boxing. The Number/String/Boolean
// modules register their original intrinsic prototypes at initialization;
// Function.ts reads them at call time, avoiding the intrinsic/evaluator
// module initialization cycle.
export const sloppyBoxPrototypes: { number?: TESObject; string?: TESObject; boolean?: TESObject } = {};

// Sloppy-mode [[Call]] boxes a primitive this value through ToObject: a fresh
// ordinary wrapper whose only link is the original intrinsic prototype, even
// when the constructor's prototype property was reassigned. Own writes behave
// correctly for the single activation the wrapper survives; slot-dependent
// reads stop at the guarded prototype APIs rather than fabricating
// [[NumberData]]/[[StringData]]/[[BooleanData]] behavior. The wrapper is
// fresh per call, so it never aliases a later call's receiver.
export function boxSloppyReceiver(self: Any): TESObject | undefined {
  const kind = (self as { type: string }).type;
  const prototype = kind === "number" ? sloppyBoxPrototypes.number
    : kind === "string" ? sloppyBoxPrototypes.string
    : kind === "boolean" ? sloppyBoxPrototypes.boolean : undefined;
  if (!prototype) return undefined;
  return Object.assign(ESObject(), { prototype });
}
