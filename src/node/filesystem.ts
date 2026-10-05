import { createOpaqueHostFunction } from "./opaque";
import { ESBoolean } from "../boolean/ESBoolean";
import { withValue } from "../conversion/toString";
import { createHostFunction, HostModel } from "../effects";
import { createError } from "../error/Error";
import { ExecutionContext, TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { getProperties, ownPropertyPresence, writeProperty } from "../execution-context/Heap";
import { ESObject, TESObject } from "../Object";
import { getObjectPrototype, hasProperty } from "../Object/prototype";
import { ESString } from "../string/String";
import { choiceOf, resolveBoolean } from "../symbolic";
import { Any, ESNull, ESNumber, isESBoolean, isESNull, isESString, isUndefined, TESBoolean, ThrownValue, Undefined } from "../types";
import { createBufferValue } from "./buffer";

const entries = new WeakMap<object, "directory" | "file">();
const openDirectories = new WeakSet<object>();
const access = new WeakMap<object, { readable: TESBoolean; searchable: TESBoolean }>();
type LookupFailure = "ENOENT" | "ENOTDIR" | "EACCES";
type LookupResult = { node: TESObject; parents: TESObject[] } | { error: LookupFailure };

function unsupported(detail: string): never {
  throw new Error(`Filesystem analysis is not yet supported: ${detail}`);
}

// Node passes strings to the filesystem as UTF-8, replacing unpaired UTF-16
// surrogates. The declared namespace compares those bytes without case folding
// or Unicode normalization. This is not a model of every POSIX filesystem.
function utf8(text: string): string { return Buffer.from(text, "utf8").toString("utf8"); }

function accessFact(value: TESBoolean | undefined): TESBoolean {
  if (value === undefined) return ESBoolean(true);
  if (!value || typeof value !== "object" || !isESBoolean(value)) {
    throw new Error("Filesystem access and availability require VM Boolean values");
  }
  return value;
}

function entry(kind: "directory" | "file", properties: { [key: string]: Any },
  options: { readable?: TESBoolean; searchable?: TESBoolean; complete?: boolean }): TESObject {
  const node = Object.assign(ESObject(Object.freeze(properties)), {
    unknownProperties: "Private filesystem state",
    unmodeledOwnPropertyInspection: "Private filesystem state",
    unmodeledPropertyReads: Object.keys(properties),
    unmodeledPropertyWrites: Object.keys(properties)
  });
  entries.set(node, kind);
  // Effective access for the declared process, not mode/UID/ACL inference.
  // Keep metadata out of the filename table and snapshot the supplied options.
  access.set(node, Object.freeze({ readable: accessFact(options.readable), searchable: accessFact(options.searchable) }));
  if (kind === "directory" && options.complete === false) openDirectories.add(node);
  Object.assign(node, { hostSlots: Object.freeze({ "node.fs.entry": ESObject({
    kind: ESString(kind), readable: access.get(node)!.readable,
    ...(kind === "directory" ? { searchable: access.get(node)!.searchable,
      complete: ESBoolean(options.complete !== false) } : {})
  }) }) });
  return Object.freeze(node);
}

/** Embedding input: regular UTF-8 file with concrete or symbolic effective read access. */
export function fileSystemFile(contents: string, options: { readable?: TESBoolean } = {}): TESObject {
  if (typeof contents !== "string") return unsupported("open file contents or non-text setup");
  return entry("file", { text: ESString(utf8(contents)) }, options);
}

/** An observed regular file whose contents have not yet been acquired. */
export function fileSystemUnobservedFile(options: { readable?: TESBoolean } = {}): TESObject {
  return entry("file", { text: ESString() }, options);
}

/** Closed by default; complete:false leaves unlisted names unobserved. */
export function fileSystemDirectory(children: { [name: string]: Any },
  options: { readable?: TESBoolean; searchable?: TESBoolean; complete?: boolean } = {}): TESObject {
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
  return entry("directory", copy, options);
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

function systemError(code: LookupFailure | "EISDIR" | "EMFILE", syscall: "stat" | "open" | "read", path?: string): Any {
  const description = { ENOENT: "no such file or directory", ENOTDIR: "not a directory", EISDIR: "illegal operation on a directory",
    EACCES: "permission denied", EMFILE: "too many open files" }[code];
  const error = createError("Error", ESString(`${code}: ${description}, ${syscall}${path === undefined ? "" : ` '${path}'`}`));
  Object.assign(error.properties, { code: ESString(code), errno: ESNumber({ ENOENT: -2, ENOTDIR: -20, EISDIR: -21, EACCES: -13, EMFILE: -24 }[code]),
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
 * A stable tree with effective read/search access and baseline descriptor
 * availability. Closed trees need no native I/O; open entries/contents require
 * explicit observation hooks. Later read/close/allocation failures, symlinks and
 * namespace changes remain outside the model. Operations share VM state and knowledge.
 * Read/error behavior follows pinned Node on Linux/macOS;
 * other platforms, options, descriptors and mutation remain explicit gaps.
 */
export function createFileSystemModel(options: { root: Any; cwd?: string; fileDescriptorsAvailable?: TESBoolean;
  platform?: "linux" | "darwin";
  observeEntry?: (directory: TESObject, name: string) => Any;
  observeContents?: (file: TESObject) => string;
}) {
  const observeEntry = options.observeEntry;
  const observeContents = options.observeContents;
  const platform = options.platform === undefined ? "linux" : options.platform;
  if (platform !== "linux" && platform !== "darwin") return unsupported("filesystem platform");
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
  const cwd = utf8(options.cwd === undefined ? "/" : options.cwd);
  if (!cwd.startsWith("/") || cwd.includes("\0") ||
      (cwd !== "/" && cwd.slice(1).split("/").some(part => !part || part === "." || part === ".."))) {
    throw new Error("Filesystem cwd must be a canonical absolute directory path");
  }

  const state = ESObject({ root: options.root, cwd: ESString(cwd), platform: ESString(platform),
    fileDescriptorsAvailable: accessFact(options.fileDescriptorsAvailable) });
  const validatePathDomain = (path: string): void => {
    const absolute = path[0] === "/" ? path : (cwd === "/" ? "/" : cwd + "/") + path;
    // Kernel/filesystem limits vary. Reject outside the common small-path
    // domain rather than falsely concluding that an overlong name is absent.
    if (Buffer.byteLength(absolute, "utf8") >= 1024 || absolute.split("/").some(part => Buffer.byteLength(part, "utf8") > 255)) {
      return unsupported("overlong paths or components");
    }
  };
  let initializingCwd = true;
  type Found = (result: LookupResult, context: TExecutionContext) => BranchResult;
  const lookup = (path: string, context: TExecutionContext, found: Found, checkAccess = true): BranchResult => {
    if (!path) return found({ error: "ENOENT" }, context);
    validatePathDomain(path);
    const walk = (node: Any, components: string[], parents: TESObject[], current: TExecutionContext,
      permissions: boolean, directoryRequired: boolean, finish: Found): BranchResult =>
      withValue(node, current, (selected, branch) => {
        if (isESNull(selected)) return finish({ error: "ENOENT" }, branch);
        const kind = entries.get(selected);
        if (!kind) return unsupported("invalid filesystem state");
        if (!components.length) return finish(directoryRequired && kind !== "directory"
          ? { error: "ENOTDIR" } : { node: selected as TESObject, parents }, branch);
        if (kind !== "directory") return finish({ error: "ENOTDIR" }, branch);
        const traverse = (afterAccess: TExecutionContext): BranchResult => {
          const component = components[0], rest = components.slice(1);
          if (component === ".") return walk(selected, rest, parents, afterAccess, permissions, directoryRequired, finish);
          if (component === "..") return walk(parents.length ? parents[parents.length - 1] : selected,
            rest, parents.slice(0, -1), afterAccess, permissions, directoryRequired, finish);
          const directory = selected as TESObject;
          const descend = (child: Any, afterObservation: TExecutionContext) =>
            walk(child, rest, parents.concat([directory]), afterObservation, permissions, directoryRequired, finish);
          // Acquisition on only one symbolic path creates conditional knowledge
          // of this name, not an undefined/missing entry on the other path.
          return evaluateBranches(ownPropertyPresence(directory, component, afterAccess), afterAccess,
            observed => descend(getProperties(directory, observed)[component], observed),
            unobserved => {
              if (!openDirectories.has(directory)) return descend(ESNull, unobserved);
              if (initializingCwd) return unsupported("cwd must already be observed in the initial tree");
              if (!observeEntry) return unsupported("unobserved directory entry");
              const child = observeEntry(directory, component);
              validate(child, []);
              return descend(child, writeProperty(directory, component, child, unobserved));
            });
        };
        return permissions ? evaluateBranches(access.get(selected)!.searchable, branch, traverse,
          denied => finish({ error: "EACCES" }, denied)) : traverse(branch);
      });
    const root = getProperties(state, context).root;
    const components = path.split("/").filter(part => part.length > 0);
    if (path[0] === "/") return walk(root, components, [], context, checkAccess, path.endsWith("/"), found);
    // Relative lookup starts at the already-held cwd directory, not at root.
    // Resolving its structural identity must not demand access to its ancestors.
    return walk(root, cwd.split("/").filter(Boolean), [], context, false, true, (location, branch) => {
      if ("error" in location) return unsupported("invalid cwd state");
      return walk(location.node, components, location.parents, branch, checkAccess, path.endsWith("/"), found);
    });
  };
  // Cwd is declared environment state, not a guessed success. Check every
  // feasible setup path using the same choice/knowledge machinery as reads.
  const [cwdValid] = lookup(cwd, ExecutionContext({}), (result, branch) =>
    [ESBoolean("node" in result && entries.get(result.node) === "directory"), branch], false);
  if (resolveBoolean(cwdValid as ReturnType<typeof ESBoolean>) !== true) {
    throw new Error("Filesystem cwd must exist as a directory on every setup path");
  }

  initializingCwd = false;

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
  module.properties.readdirSync = createOpaqueHostFunction("fs.readdirSync");
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
        // Outside this bounded path domain, kernel name validation can precede
        // descriptor exhaustion. Never turn that analysis gap into EMFILE.
        validatePathDomain(path);
        // Linux copies/validates the pathname before allocating an fd; Darwin
        // allocates first. Select the environment explicitly, not from the host.
        if (!path && platform === "linux") return [systemError("ENOENT", "open", path), afterPath];
        return evaluateBranches(getProperties(state, afterPath).fileDescriptorsAvailable as TESBoolean, afterPath,
          available => lookup(path, available, (result, after) => {
            if ("error" in result) return [systemError(result.error, "open", path), after];
            return evaluateBranches(access.get(result.node)!.readable, after, readable => {
              if (entries.get(result.node) === "directory") return [systemError("EISDIR", "read"), readable];
              let text = getProperties(result.node, readable).text;
              let afterContents = readable;
              if (isESString(text) && typeof text.value !== "string") {
                if (!observeContents) return unsupported("unobserved file contents");
                const contents = observeContents(result.node);
                if (typeof contents !== "string" || utf8(contents) !== contents) return unsupported("invalid captured UTF-8 contents");
                text = ESString(contents);
                afterContents = writeProperty(result.node, "text", text, readable);
              }
              if (!isESString(text) || typeof text.value !== "string") return unsupported("invalid file text state");
              if (!encoded) return [createBufferValue(Array.from(Buffer.from(text.value, "utf8"))), afterContents];
              return [text, afterContents];
            }, denied => [systemError("EACCES", "open", path), denied]);
          }), exhausted => [systemError("EMFILE", "open", path), exhausted]);
      });
    }));
  return { module, state, inspectRoot: (context: TExecutionContext) => getProperties(state, context).root,
    inspectFileDescriptorsAvailable: (context: TExecutionContext) => getProperties(state, context).fileDescriptorsAvailable as TESBoolean };
}
