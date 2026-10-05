import { markUnsupportedBoundaryObject } from "../execution-context/analysis-failure";
import { ESObject, TESObject } from "../Object";
import { getObjectPrototype } from "../Object/prototype";
import { ESNumber } from "../types";

export type TESRegExp = TESObject & {
  // ECMAScript internal source/flags, separate from guest properties. No native
  // RegExp or matcher is retained. Matching is an explicit unfinished operation.
  readonly regexpData: { readonly originalSource: string; readonly originalFlags: string };
};

let prototype: TESObject | undefined;
function getRegExpPrototype(): TESObject {
  if (!prototype) prototype = markUnsupportedBoundaryObject(Object.assign(ESObject(undefined, "unmodeled"), {
    prototype: getObjectPrototype(), modeledPrototype: true,
    unknownProperties: "RegExp prototype API",
    unmodeledOwnPropertyInspection: "RegExp prototype descriptors"
  }));
  return prototype;
}

// The shared parser has admitted the complete literal before evaluation begins.
// Every evaluation allocates a new identity, including repeated calls at one AST
// site. lastIndex is writable without coercion and uses the persistent heap.
// Its nonenumerable/nonconfigurable descriptor is not represented by the ordinary
// enumerable-data model, so descriptor inspection and enumeration stay guarded.
export function createRegExpLiteral(pattern: string, flags: string): TESRegExp {
  return markUnsupportedBoundaryObject(Object.assign(ESObject({ lastIndex: ESNumber(0) }, "unmodeled"), {
    regexpData: Object.freeze({ originalSource: pattern, originalFlags: flags }),
    prototype: getRegExpPrototype(), modeledPrototype: true,
    unknownProperties: "RegExp instance API",
    unmodeledOwnPropertyInspection: "RegExp instance descriptors"
  }));
}
