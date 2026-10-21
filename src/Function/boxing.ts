import { ESObject, TESObject } from "../Object";
import { ESString, TESString } from "../string/String";
import { ExecutionBudgetError, UnsupportedAnalysisError, markUnsupportedBoundaryObject } from "../execution-context/analysis-failure";
import { Any, ESNumber } from "../types";

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
const boxedPrimitives = new WeakMap<object, Any>();
export function boxedPrimitive(value: Any): Any | undefined { return boxedPrimitives.get(value); }

export function boxSloppyReceiver(self: Any): TESObject | undefined {
  const kind = (self as { type: string }).type;
  const prototype = kind === "number" ? sloppyBoxPrototypes.number
    : kind === "string" ? sloppyBoxPrototypes.string
    : kind === "boolean" ? sloppyBoxPrototypes.boolean : undefined;
  if (!prototype) return undefined;
  const result = Object.assign(ESObject(), { prototype });
  boxedPrimitives.set(result, self);
  if (kind === "string") {
    const text = (self as TESString).value;
    if (typeof text === "string" && text.length > 65536) throw new ExecutionBudgetError("Sloppy string boxing exceeds 65536 UTF-16 units");
    Object.assign(result, { stringData: true, ownPropertyModel: "unmodeled",
      ...(typeof text !== "string" ? {unknownProperties: "Symbolic boxed string indexed properties"} : {}),
      unmodeledPropertyWrites: ["length"],
      propertyAccess: { read(name: string) {
        if (/^(0|[1-9][0-9]*)$/.test(name) && typeof text !== "string") {
          throw new UnsupportedAnalysisError("Symbolic boxed string index reads are not yet supported");
        }
        return undefined;
      }, write(name: string) {
        if (/^(0|[1-9][0-9]*)$/.test(name)) throw new UnsupportedAnalysisError("Boxed string index writes are not yet supported");
        return undefined;
      } }
    });
    result.properties.length = typeof text === "string" ? ESNumber(text.length) : (self as TESString).properties.length;
    if (typeof text === "string") for (let index = 0; index < text.length; index++) result.properties[index] = ESString(text[index]);
    markUnsupportedBoundaryObject(result);
  }
  return result;
}
