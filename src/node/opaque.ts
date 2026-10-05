import { createHostFunction } from "../effects";
import { captureExecutionBoundary, UnsupportedAnalysisError, markUnsupportedBoundaryObject } from "../execution-context/analysis-failure";
import { ESObject, TESObject } from "../Object";

/**
 * Identity and object type only for a builtin known to have object exports.
 * The embedding shares this value between require aliases. No API, descriptor,
 * prototype or environment state is inferred from the empty property table;
 * shared VM guards stop any operation needing that missing knowledge.
 * Do not apply this to callable builtin exports or auto-register a catalog.
 */
export function createOpaqueBuiltinModule(name: string): TESObject {
  return markUnsupportedBoundaryObject(Object.assign(ESObject(undefined, "unmodeled"), {
    unknownProperties: `Unimplemented Node ${name} API`,
    unmodeledOwnPropertyInspection: `Unimplemented Node ${name} descriptors`
  }));
}

/** A runtime-known ordinary callable export, not a modeled implementation.
 * Its identity and inherited Function.prototype.call are available. Invocation
 * enters the shared host-call trace and then stops; it neither calls Node nor
 * invents a return, guest exception, or resource transition. Metadata and
 * construction are separate unknowns, not evidence of nonconstructibility. */
export function createOpaqueHostFunction(operation: string) {
  return markUnsupportedBoundaryObject(Object.assign(createHostFunction(operation, (_call, context) =>
    captureExecutionBoundary(context, () => {
      throw new UnsupportedAnalysisError(`Unimplemented host operation '${operation}'`);
    })), {
    nonConstructible: false,
    unmodeledConstruct: `Unimplemented host construction '${operation}'`,
    unknownProperties: `Unimplemented host function metadata '${operation}'`,
    modeledInheritedProperties: ["call"],
    unmodeledPropertyWrites: ["call"],
    unmodeledOwnPropertyInspection: `Unimplemented host function descriptors '${operation}'`
  }));
}
