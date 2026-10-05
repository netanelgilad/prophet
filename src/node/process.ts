import { createHostFunction } from "../effects";
import { getProperties } from "../execution-context/Heap";
import { ESObject, TESObject } from "../Object";
import { ESString } from "../string/String";
import { ESNumber } from "../types";
import { createWarningModel } from "./warnings";

export type ProcessModelOptions = {
  cwd: string;
  warnings?: ReturnType<typeof createWarningModel>;
};

/** Assemble one declared POSIX process environment before execution starts. */
export function createProcessModel(options: ProcessModelOptions) {
  const cwd = options.cwd;
  if (typeof cwd !== "string" || !cwd.startsWith("/") || cwd.includes("\0") ||
      Buffer.from(cwd, "utf8").toString("utf8") !== cwd ||
      (cwd !== "/" && cwd.slice(1).split("/").some(part => !part || part === "." || part === ".."))) {
    throw new Error("Process cwd must be a concrete canonical absolute UTF-8 POSIX directory path");
  }
  const warnings = options.warnings === undefined ? createWarningModel() : options.warnings;
  if (!warnings || !warnings.process) throw new Error("Process environment requires a warning process model");
  const process: TESObject = warnings.process;
  const previousSlots = process.hostSlots || {};
  if (Object.prototype.hasOwnProperty.call(previousSlots, "node.process.environment")) {
    throw new Error("Process environment is already configured");
  }
  const state = ESObject({ cwd: ESString(cwd) });
  // Pinned Node's wrappedCwd ignores its receiver and arguments. It is a
  // constructible function, but construction/prototype behavior is not modeled.
  const method = Object.assign(createHostFunction("process.cwd", (_call, context) =>
    [getProperties(state, context).cwd, context]), {
    nonConstructible: false,
    unmodeledConstruct: "Process cwd construction is not yet supported",
    unknownProperties: "Node process.cwd function API",
    modeledInheritedProperties: ["call"],
    unmodeledOwnPropertyInspection: "Node process.cwd descriptors",
    unmodeledPropertyReads: ["prototype", "caller", "arguments"],
    unmodeledPropertyWrites: ["name", "length", "prototype", "caller", "arguments"]
  });
  Object.assign(method.properties, { name: ESString("wrappedCwd"), length: ESNumber(0) });
  Object.assign(process.properties, { cwd: method });
  process.hostSlots = Object.freeze({ ...previousSlots, "node.process.environment": state });
  return { process, state, warnings };
}
