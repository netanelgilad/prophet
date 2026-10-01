import { invoke, readMember } from "../ASTResolvers";
import { isESFunction } from "../Function/Function";
import { withValue } from "../conversion/toString";
import { createHostFunction, HostModel } from "../effects";
import { createError } from "../error/Error";
import { bindNormal } from "../evaluate";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult } from "../execution-context/branches";
import { ESObject } from "../Object";
import { ESString } from "../string/String";
import { Any, ESNumber, isESString, ThrownValue, Undefined } from "../types";
import { withStringArgument } from "./arguments";

function unsupported(detail: string): never {
  throw new Error(`POSIX path analysis is not yet supported: ${detail}`);
}

// Lexical POSIX normalization, independent of the machine running Prophet.
// Only '/' separates segments; backslashes, NUL and UTF-16 code units remain
// ordinary text. This neither consults a filesystem nor establishes containment.
function normalizePath(path: string): string {
  if (path === "") return ".";
  const absolute = path[0] === "/";
  const trailing = path[path.length - 1] === "/";
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length && segments[segments.length - 1] !== "..") segments.pop();
      else if (!absolute) segments.push(segment);
    } else segments.push(segment);
  }
  const joined = segments.join("/");
  if (!joined) return absolute ? "/" : trailing ? "./" : ".";
  return (absolute ? "/" : "") + joined + (trailing ? "/" : "");
}

// Lexical decomposition, independent of normalize and the mutable path module.
// Return a fresh ordinary VM object so aliases and later field writes use the
// same persistent heap as objects produced by interpreted JavaScript.
function parsePath(path: string) {
  const root = path[0] === "/" ? "/" : "";
  let end = path.length;
  while (end > 0 && path[end - 1] === "/") end--;
  const separator = end > 0 ? path.lastIndexOf("/", end - 1) : -1;
  const base = path.slice(separator + 1, end);
  const dot = base.lastIndexOf(".");
  // Pinned Node excludes a two-dot component from extension recognition,
  // except immediately after a single root slash. Thus /.. has ext ".",
  // whereas .., //.. and a/.. have ext "". Preserve that observable behavior.
  const ext = dot > 0 && (base !== ".." || separator === 0) ? base.slice(dot) : "";
  return ESObject({
    root: ESString(root),
    dir: ESString(separator > 0 ? path.slice(0, separator) : root),
    base: ESString(base),
    ext: ESString(ext),
    name: ESString(base.slice(0, base.length - ext.length))
  });
}

function withPath(value: Any, context: TExecutionContext,
  continuation: (path: string, context: TExecutionContext) => BranchResult): BranchResult {
  return withStringArgument("path", value, context, (input, branch) => {
    if (typeof input.value !== "string") return unsupported("open symbolic path string");
    return continuation(input.value, branch);
  });
}

function operation(name: string, length: number, model: HostModel) {
  const method = Object.assign(createHostFunction(`path.posix.${name}`, model), {
    unknownProperties: `Node path.posix.${name} function API`,
    modeledInheritedProperties: ["call"],
    unmodeledOwnPropertyInspection: "Node path function descriptors",
    unmodeledPropertyReads: ["caller", "arguments"],
    unmodeledPropertyWrites: ["name", "length", "caller", "arguments"]
  });
  Object.assign(method.properties, { name: ESString(name), length: ESNumber(length) });
  return method;
}

/**
 * Node v24.21.0 POSIX join/normalize/parse. An embedding can register the same module
 * as path/posix and, in an explicitly POSIX environment, path. Open string
 * reasoning, other APIs, Win32 and complete descriptors remain separate gaps.
 * Assumes the intrinsic Array.prototype.push is unchanged: pinned join uses it
 * on its temporary array, and that intrinsic's mutation is not modeled yet.
 */
export function createPosixPathModel() {
  const module = Object.assign(ESObject({ sep: ESString("/"), delimiter: ESString(":") }), {
    unknownProperties: "Node POSIX path API",
    unmodeledOwnPropertyInspection: "Node POSIX path descriptors"
  });
  module.properties.posix = module;
  module.properties.normalize = operation("normalize", 1, (call, context) =>
    withPath(call.args[0] || Undefined, context, (path, branch) => [ESString(normalizePath(path)), branch]));
  module.properties.parse = operation("parse", 1, (call, context) =>
    withPath(call.args[0] || Undefined, context, (path, branch) => [parsePath(path), branch]));
  module.properties.join = operation("join", 0, (call, context) => {
    // All arguments are validated before reading normalize. Persistent branch
    // state and independent segment lists prevent symbolic choices leaking.
    const collect = (index: number, paths: string[], current: TExecutionContext): BranchResult => {
      // Keep long concrete argument lists iterative. Only a symbolic choice
      // needs a continuation, with a fresh list owned by each branch.
      const parts = paths.slice();
      for (let position = index; position < call.args.length; position++) {
        const value = call.args[position];
        if (!isESString(value) || typeof value.value !== "string") return withPath(value, current, (path, branch) =>
          collect(position + 1, path.length ? parts.concat([path]) : parts, branch));
        if (value.value.length) parts.push(value.value);
      }
      if (!parts.length) return [ESString("."), current];
      // Pinned Node calls the CURRENT method on its captured POSIX object.
      // Reassigning .posix or detaching join does not change that receiver.
      return bindNormal(readMember(module, "normalize", current), (method, afterRead) =>
        withValue(method, afterRead, (callee, branch) => isESFunction(callee)
          ? invoke(callee, [ESString(parts.join("/"))], branch, module)
          : [ThrownValue(createError("TypeError", ESString("posix.normalize is not a function"))), branch]));
    };
    return collect(0, [], context);
  });
  return { module };
}
