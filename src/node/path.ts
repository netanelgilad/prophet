import { invoke, readMember } from "../ASTResolvers";
import { isESFunction } from "../Function/Function";
import { isObjectValue, withValue } from "../conversion/toString";
import { createHostFunction, HostModel } from "../effects";
import { createError } from "../error/Error";
import { bindNormal } from "../evaluate";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { ESObject } from "../Object";
import { ESString, TESString } from "../string/String";
import { Any, ESNumber, isESBoolean, isESNull, isESNumber, isESString,
  isUndefined, ThrownValue, Undefined } from "../types";

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

function invalidType(message: TESString, context: TExecutionContext): BranchResult {
  const error = createError("TypeError", message);
  error.properties.code = ESString("ERR_INVALID_ARG_TYPE");
  // Node's coded errors have their own prototype and toString formatting.
  // Ordinary TypeError formatting would silently omit the code. Name/message/
  // code are supported; the residual prototype/descriptor model stays explicit.
  Object.assign(error, {
    unmodeledPropertyReads: ["stack", "toString", "constructor"],
    unmodeledPropertyWrites: ["stack", "toString", "constructor"],
    unmodeledOwnPropertyInspection: "Node coded error descriptors"
  });
  return [ThrownValue(error), context];
}

function withPath(value: Any, context: TExecutionContext,
  continuation: (path: string, context: TExecutionContext) => BranchResult): BranchResult {
  return withValue(value, context, (input, branch) => {
    if (isESString(input)) {
      if (typeof input.value !== "string") return unsupported("open symbolic path string");
      return continuation(input.value, branch);
    }
    const fail = (received: string, after: TExecutionContext) => invalidType(ESString(
      `The "path" argument must be of type string. Received ${received}`), after);
    if (isUndefined(input)) return fail("undefined", branch);
    if (isESNull(input)) return fail("null", branch);
    if (isESNumber(input)) {
      // The rejection is certain even when its diagnostic text is not known.
      // Widening the message loses precision, never the throw or its code.
      if (typeof input.value !== "number") return invalidType(ESString(), branch);
      const text = Object.is(input.value, -0) ? "-0" : String(input.value);
      return fail(`type number (${text})`, branch);
    }
    if (isESBoolean(input)) return evaluateBranches(input, branch,
      after => fail("type boolean (true)", after), after => fail("type boolean (false)", after));
    // Node formats invalid objects using constructor/name and util.inspect;
    // these reads may execute user code or throw before ERR_INVALID_ARG_TYPE.
    if (isObjectValue(input)) return unsupported("object/function argument diagnostics");
    return unsupported("argument diagnostic for this value kind");
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
 * Node v24.21.0 POSIX join/normalize. An embedding can register the same module
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
