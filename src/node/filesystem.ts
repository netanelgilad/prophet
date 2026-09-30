import { ESBoolean } from "../boolean/ESBoolean";
import { withValue } from "../conversion/toString";
import { createHostFunction, HostModel } from "../effects";
import { createError } from "../error/Error";
import { ExecutionContext, TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult } from "../execution-context/branches";
import { getProperties } from "../execution-context/Heap";
import { ESObject, TESObject } from "../Object";
import { getObjectPrototype, hasProperty } from "../Object/prototype";
import { ESString } from "../string/String";
import { choiceOf, resolveBoolean } from "../symbolic";
import { Any, ESNull, ESNumber, isESNull, isESString, isUndefined, ThrownValue, Undefined } from "../types";
import { createBufferValue } from "./buffer";

const entries = new WeakMap<object, "directory" | "file">();
type LookupFailure = "ENOENT" | "ENOTDIR";
type LookupResult = { node: TESObject } | { error: LookupFailure };

function unsupported(detail: string): never {
  throw new Error(`Filesystem analysis is not yet supported: ${detail}`);
}

// Node passes strings to the filesystem as UTF-8, replacing unpaired UTF-16
// surrogates. The declared namespace compares those bytes without case folding
// or Unicode normalization. This is not a model of every POSIX filesystem.
function utf8(text: string): string { return Buffer.from(text, "utf8").toString("utf8"); }

function entry(kind: "directory" | "file", properties: { [key: string]: Any }): TESObject {
  const node = Object.assign(ESObject(Object.freeze(properties)), {
    unknownProperties: "Private filesystem state",
    unmodeledOwnPropertyInspection: "Private filesystem state",
    unmodeledPropertyReads: Object.keys(properties),
    unmodeledPropertyWrites: Object.keys(properties)
  });
  entries.set(node, kind);
  return Object.freeze(node);
}

/** Embedding input: a readable regular file written from concrete UTF-8 text. */
export function fileSystemFile(contents: string): TESObject {
  if (typeof contents !== "string") return unsupported("open file contents or non-text setup");
  return entry("file", { text: ESString(utf8(contents)) });
}

/** Embedding input: closed directory; absent names or ESNull mean missing. */
export function fileSystemDirectory(children: { [name: string]: Any }): TESObject {
  const copy: { [name: string]: Any } = Object.create(null);
  for (const original of Object.keys(children)) {
    const name = utf8(original);
    if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\0")) {
      throw new Error("Filesystem directory entries require nonempty single-component names");
    }
    if (Buffer.byteLength(name, "utf8") > 255) return unsupported("overlong directory entry name");
    if (Object.prototype.hasOwnProperty.call(copy, name)) throw new Error("Filesystem UTF-8 entry name collision");
    copy[name] = children[original];
  }
  return entry("directory", copy);
}

function operation(name: string, length: number, model: HostModel, publicName = name) {
  const method = Object.assign(createHostFunction(`fs.${name}`, model), {
    nonConstructible: false,
    unmodeledConstruct: `Filesystem ${name} construction is not yet supported`,
    unknownProperties: `Node fs.${name} function API`, modeledInheritedProperties: ["call"],
    unmodeledOwnPropertyInspection: "Node filesystem function descriptors",
    unmodeledPropertyReads: ["caller", "arguments"],
    unmodeledPropertyWrites: ["name", "length", "caller", "arguments"]
  });
  Object.assign(method.properties, { name: ESString(publicName), length: ESNumber(length) });
  return method;
}

function systemError(code: LookupFailure | "EISDIR", syscall: "stat" | "open" | "read", path?: string): Any {
  const description = { ENOENT: "no such file or directory", ENOTDIR: "not a directory", EISDIR: "illegal operation on a directory" }[code];
  const error = createError("Error", ESString(`${code}: ${description}, ${syscall}${path === undefined ? "" : ` '${path}'`}`));
  Object.assign(error.properties, { code: ESString(code), errno: ESNumber({ ENOENT: -2, ENOTDIR: -20, EISDIR: -21 }[code]),
    syscall: ESString(syscall), ...(path === undefined ? {} : { path: ESString(path) }) });
  Object.assign(error, { unmodeledPropertyReads: ["stack", "constructor"],
    unmodeledPropertyWrites: ["stack", "constructor"], unmodeledOwnPropertyInspection: "Node filesystem error descriptors" });
  return ThrownValue(error);
}

function nullByteError(): Any {
  // Node's util.inspect-based diagnostic spelling is a separate precision gap.
  const error = createError("TypeError", ESString());
  error.properties.code = ESString("ERR_INVALID_ARG_VALUE");
  Object.assign(error, { unmodeledPropertyReads: ["stack", "constructor", "toString"],
    unmodeledPropertyWrites: ["stack", "constructor", "toString"],
    unmodeledOwnPropertyInspection: "Node filesystem argument error descriptors" });
  return ThrownValue(error);
}

/**
 * A stable closed tree with readable regular files/directories: no symlinks,
 * namespace changes, permission or resource failures. Each operation consults
 * the same VM root and branch knowledge. No real filesystem operation occurs.
 * Read/error behavior follows pinned Node on Linux/macOS;
 * other platforms, options, descriptors and mutation remain explicit gaps.
 */
export function createFileSystemModel(options: { root: Any; cwd?: string }) {
  const validate = (node: Any, ancestors: Any[], root = false): void => {
    if (ancestors.includes(node)) throw new Error("Cyclic filesystem setup");
    const choice = choiceOf(node);
    if (choice) {
      validate(choice.consequent, ancestors.concat([node]), root);
      validate(choice.alternate, ancestors.concat([node]), root);
      return;
    }
    if (isESNull(node) && !root) return;
    const kind = entries.get(node);
    if (!kind || (root && kind !== "directory")) throw new Error("Filesystem setup requires directory roots and helper-created entries");
    if (kind === "directory") Object.keys((node as TESObject).properties).forEach(name =>
      validate((node as TESObject).properties[name], ancestors.concat([node])));
  };
  validate(options.root, [], true);
  const state = ESObject({ root: options.root });
  const cwd = utf8(options.cwd === undefined ? "/" : options.cwd);
  if (!cwd.startsWith("/") || cwd.includes("\0") ||
      (cwd !== "/" && cwd.slice(1).split("/").some(part => !part || part === "." || part === ".."))) {
    throw new Error("Filesystem cwd must be a canonical absolute directory path");
  }

  type Found = (result: LookupResult, context: TExecutionContext) => BranchResult;
  const lookup = (path: string, context: TExecutionContext, found: Found): BranchResult => {
    if (!path) return found({ error: "ENOENT" }, context);
    const absolute = path[0] === "/" ? path : (cwd === "/" ? "/" : cwd + "/") + path;
    // Kernel/filesystem limits vary. Reject outside the common small-path
    // domain rather than falsely concluding that an overlong name is absent.
    if (Buffer.byteLength(absolute, "utf8") >= 1024 || absolute.split("/").some(part => Buffer.byteLength(part, "utf8") > 255)) {
      return unsupported("overlong paths or components");
    }
    const components = absolute.split("/").filter(part => part.length > 0);
    if (absolute.endsWith("/")) components.push(".");
    const step = (node: Any, position: number, parents: TESObject[], current: TExecutionContext): BranchResult =>
      withValue(node, current, (selected, branch) => {
        if (isESNull(selected)) return found({ error: "ENOENT" }, branch);
        const kind = entries.get(selected);
        if (!kind) return unsupported("invalid filesystem state");
        if (position === components.length) return found({ node: selected as TESObject }, branch);
        if (kind !== "directory") return found({ error: "ENOTDIR" }, branch);
        const component = components[position];
        if (component === ".") return step(selected, position + 1, parents, branch);
        if (component === "..") return step(parents.length ? parents[parents.length - 1] : selected,
          position + 1, parents.slice(0, -1), branch);
        const children = getProperties(selected as TESObject, branch);
        const child = Object.prototype.hasOwnProperty.call(children, component) ? children[component] : ESNull;
        return step(child, position + 1, parents.concat([selected as TESObject]), branch);
      });
    return step(getProperties(state, context).root, 0, [], context);
  };
  // Cwd is declared environment state, not a guessed success. Check every
  // feasible setup path using the same choice/knowledge machinery as reads.
  const [cwdValid] = lookup(cwd, ExecutionContext({}), (result, branch) =>
    [ESBoolean("node" in result && entries.get(result.node) === "directory"), branch]);
  if (resolveBoolean(cwdValid as ReturnType<typeof ESBoolean>) !== true) {
    throw new Error("Filesystem cwd must exist as a directory on every setup path");
  }

  const statsKinds = new WeakMap<object, "directory" | "file">();
  const statsPrototype = Object.assign(ESObject(), {
    unknownProperties: "Node Stats prototype API", unmodeledOwnPropertyInspection: "Node Stats prototype descriptors",
    unmodeledPropertyReads: ["_checkModeProperty"], unmodeledPropertyWrites: ["_checkModeProperty"]
  });
  for (const name of ["isDirectory", "isFile"]) statsPrototype.properties[name] =
    operation(`Stats.${name}`, 0, (call, context) => withValue(call.receiver, context, (receiver, branch) => {
      const kind = statsKinds.get(receiver);
      if (!kind) return unsupported("Stats methods borrowed by an unmodeled receiver");
      return [ESBoolean(kind === (name === "isDirectory" ? "directory" : "file")), branch];
    }), "");
  const stats = (node: TESObject) => {
    const result = Object.assign(ESObject(), { prototype: statsPrototype,
      unknownProperties: "Node Stats fields", modeledInheritedProperties: ["isDirectory", "isFile"],
      unmodeledOwnPropertyInspection: "Node Stats descriptors",
      unmodeledPropertyReads: ["mode", "_checkModeProperty"], unmodeledPropertyWrites: ["mode", "_checkModeProperty", "__proto__"]
    });
    statsKinds.set(result, entries.get(node)!);
    return result;
  };
  const withPath = (value: Any, context: TExecutionContext,
    next: (path: string, branch: TExecutionContext) => BranchResult): BranchResult =>
    withValue(value, context, (selected, branch) => {
      if (!isESString(selected)) return unsupported("non-string paths, file descriptors and argument diagnostics (including DEP0187)");
      if (typeof selected.value !== "string") return unsupported("open symbolic path strings");
      return next(utf8(selected.value), branch);
    });
  const module = Object.assign(ESObject(), {
    unknownProperties: "Node filesystem API", unmodeledOwnPropertyInspection: "Node filesystem module descriptors",
    // Default readFileSync calls the current exported helpers. Those APIs and
    // their replacement effects require a descriptor/FD model; never ignore it.
    unmodeledPropertyWrites: ["openSync", "fstatSync", "readSync", "closeSync"]
  });
  module.properties.existsSync = operation("existsSync", 1, (call, context) =>
    withPath(call.args[0] || Undefined, context, (path, branch) => path.includes("\0")
      ? [ESBoolean(false), branch] : lookup(path, branch, (result, after) => [ESBoolean("node" in result), after])));
  module.properties.statSync = operation("statSync", 1, (call, context) =>
    withPath(call.args[0] || Undefined, context, (path, branch) => {
      if (path.includes("\0")) return [nullByteError(), branch];
      return withValue(call.args[1] || Undefined, branch, (option, afterOption) => {
        if (!isUndefined(option)) return unsupported("stat options and bigint Stats");
        return lookup(path, afterOption, (result, after) => ["error" in result
          ? systemError(result.error, "stat", path) : stats(result.node), after]);
      });
    }));
  module.properties.readFileSync = operation("readFileSync", 2, (call, context) =>
    withValue(call.args[1] || Undefined, context, (option, branch) => {
      let encoded = false;
      if (isESString(option) && (option.value === "utf8" || option.value === "utf-8")) encoded = true;
      else if (!isUndefined(option) && !isESNull(option)) return unsupported("read options, encodings, buffers and signals");
      // Node consults ordinary option objects, including inherited fields.
      // Broader option semantics must interpret these effects before path work.
      for (const name of encoded ? ["signal", "buffer"] : ["encoding", "signal", "buffer"]) {
        if (resolveBoolean(hasProperty(getObjectPrototype(), name, branch), branch.value.knowledge) !== false) {
          return unsupported(`inherited read option '${name}'`);
        }
      }
      return withPath(call.args[0] || Undefined, branch, (path, afterPath) => {
        if (path.includes("\0")) return [nullByteError(), afterPath];
        return lookup(path, afterPath, (result, after) => {
          if ("error" in result) return [systemError(result.error, "open", path), after];
          if (entries.get(result.node) === "directory") return [systemError("EISDIR", "read"), after];
          const text = getProperties(result.node, after).text;
          if (!isESString(text) || typeof text.value !== "string") return unsupported("invalid file text state");
          if (!encoded) return [createBufferValue(Array.from(Buffer.from(text.value, "utf8"))), after];
          return [text, after];
        });
      });
    }));
  return { module, inspectRoot: (context: TExecutionContext) => getProperties(state, context).root };
}
