import { ESObject, TESObject } from "../Object";

/**
 * Identity and object type only for a builtin known to have object exports.
 * The embedding shares this value between require aliases. No API, descriptor,
 * prototype or environment state is inferred from the empty property table;
 * shared VM guards stop any operation needing that missing knowledge.
 * Do not apply this to callable builtin exports or auto-register a catalog.
 */
export function createOpaqueBuiltinModule(name: string): TESObject {
  return Object.assign(ESObject(undefined, "unmodeled"), {
    unknownProperties: `Unimplemented Node ${name} API`,
    unmodeledOwnPropertyInspection: `Unimplemented Node ${name} descriptors`
  });
}
