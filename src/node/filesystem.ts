import { ESBoolean } from "../boolean/ESBoolean";
import { Array as ESArray, TArray } from "../array/Array";
import { withValue } from "../conversion/toString";
import { createHostFunction, HostModel } from "../effects";
import { createError } from "../error/Error";
import { ExecutionContext, TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { markUnsupportedBoundaryObject, UnsupportedAnalysisError } from "../execution-context/analysis-failure";
import { getArrayElements, getProperties, ownPropertyPresence, writeProperty } from "../execution-context/Heap";
import { ESObject, isESObject, TESObject } from "../Object";
import { invoke, readMember } from "../ASTResolvers";
import { bindNormal } from "../evaluate";
import { createEventEmitterModel } from "./events";
import { getObjectPrototype, hasProperty } from "../Object/prototype";
import { ESString } from "../string/String";
import { choiceOf, resolveBoolean } from "../symbolic";
import { Any, ESNull, ESNumber, isESBoolean, isESNull, isESString, isThrownValue, isUndefined, isFunction, TESBoolean, ThrownValue, Undefined } from "../types";
import { isESFunction } from "../Function/Function";
import { createBufferValue } from "./buffer";
import { boundedDate, validateDateMilliseconds } from "../date/Date";

const entries = new WeakMap<object, "directory" | "file">();
const fileSizes = new WeakMap<object, number>();
const fileMtimes = new WeakMap<object, number>();
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
      complete: ESBoolean(options.complete !== false), names: Undefined } : {})
  }) }) });
  return Object.freeze(node);
}

/** Embedding input: regular UTF-8 file with concrete or symbolic effective read access. */
export function fileSystemFile(contents: string, options: { readable?: TESBoolean; mtimeMs?: number } = {}): TESObject {
  if (typeof contents !== "string") return unsupported("open file contents or non-text setup");
  const text = utf8(contents);
  const node = entry("file", { text: ESString(text) }, options);
  // Node's Stats.size counts bytes on disk. Declared concrete contents fix
  // exactly those bytes, so the byte length is a fact, not a host inference.
  fileSizes.set(node, Buffer.byteLength(text, "utf8"));
  // An mtime, unlike a size, is never implied by contents; only an explicit
  // observation declares it.
  if (options.mtimeMs !== undefined) fileMtimes.set(node, validateDateMilliseconds(options.mtimeMs));
  return node;
}

/** An observed regular file whose contents have not yet been acquired. */
export function fileSystemUnobservedFile(options: { readable?: TESBoolean; size?: number; mtimeMs?: number } = {}): TESObject {
  if (options.size !== undefined && (!Number.isSafeInteger(options.size) || options.size < 0)) {
    throw new Error("Filesystem file size observations require nonnegative safe integers");
  }
  const node = entry("file", { text: ESString() }, options);
  if (options.size !== undefined) fileSizes.set(node, options.size);
  if (options.mtimeMs !== undefined) fileMtimes.set(node, validateDateMilliseconds(options.mtimeMs));
  return node;
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

function systemError(code: LookupFailure | "EISDIR" | "EMFILE", syscall: "stat" | "open" | "read" | "scandir", path?: string): Any {
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
  observeDirectoryNames?: (directory: TESObject) => ReadonlyArray<string>;
}) {
  const observeEntry = options.observeEntry;
  const observeContents = options.observeContents;
  const observeDirectoryNames = options.observeDirectoryNames;
  const enumerationUnsupported = (detail: string): never => {
    throw new UnsupportedAnalysisError(`Filesystem enumeration is not yet supported: ${detail}`);
  };
  const metadata = (directory: TESObject) => directory.hostSlots!["node.fs.entry"] as TESObject;
  const sorted = (names: string[]) => names.sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
  // Observation lists describe actual names. A hole or inherited index is not
  // acquired data, even though Array.some/map can skip or visit those slots.
  const hasOwnElements = (values: ReadonlyArray<unknown>): boolean => {
    for (let index = 0; index < values.length; index++) {
      if (!Object.prototype.hasOwnProperty.call(values, index)) return false;
    }
    return true;
  };
  const nameValues = (names: ReadonlyArray<string>) => ESArray(names.map(name => ESString(name)));
  const withNames = (directory: TESObject, context: TExecutionContext,
    next: (names: string[] | undefined, after: TExecutionContext) => BranchResult): BranchResult =>
    withValue(getProperties(metadata(directory), context).names, context, (names, after) => {
      if (isUndefined(names)) return next(undefined, after);
      const elements = getArrayElements(names as TArray<Any>, after);
      if (!elements || !hasOwnElements(elements) || elements.some(name => !isESString(name) || typeof name.value !== "string")) {
        throw new Error("Invalid filesystem directory name state");
      }
      return next(elements.map(name => (name as ReturnType<typeof ESString>).value as string), after);
    });
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
  const validatePathDomain = (path: string, reject: (detail: string) => never = unsupported): void => {
    const absolute = path[0] === "/" ? path : (cwd === "/" ? "/" : cwd + "/") + path;
    // Kernel/filesystem limits vary. Reject outside the common small-path
    // domain rather than falsely concluding that an overlong name is absent.
    if (Buffer.byteLength(absolute, "utf8") >= 1024 || absolute.split("/").some(part => Buffer.byteLength(part, "utf8") > 255)) {
      return reject("overlong paths or components");
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
              return withNames(directory, unobserved, (names, afterNames) => {
                // A captured directory's names do not exclude case-folding or
                // normalization aliases. The adapter must still probe unlisted
                // spellings; only an exact namespace without a hook infers absence.
                if (names && !names.includes(component) && !observeEntry) return descend(ESNull, afterNames);
                if (!observeEntry) return unsupported("unobserved directory entry");
                const child = observeEntry(directory, component);
                validate(child, []);
                const observed = writeProperty(directory, component, child, afterNames);
                return names ? withValue(child, observed, (selected, branch) => {
                  if (names.includes(component) === isESNull(selected)) {
                    throw new Error("Filesystem child observation contradicts complete directory names");
                  }
                  return descend(selected, branch);
                }) : descend(child, observed);
              });
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
    // Marked so reached unmodeled Stats fields stop as retained typed
    // boundaries beside their siblings, never as host failures losing state.
    const result = markUnsupportedBoundaryObject(Object.assign(ESObject(), { prototype: statsPrototype,
      unknownProperties: "Node Stats fields", modeledInheritedProperties: ["isDirectory", "isFile"],
      unmodeledOwnPropertyInspection: "Node Stats descriptors",
      unmodeledPropertyReads: ["mode", "_checkModeProperty"], unmodeledPropertyWrites: ["mode", "_checkModeProperty", "__proto__"],
      // Only classify absent current own size. Supplied data properties use
      // their persistent presence/value, without inferring native Stats fields
      // or substituting inherited metadata. Split conditional presence once.
      propertyAccess: { read(name: string, context: TExecutionContext): BranchResult | undefined {
        if (name !== "size" && name !== "mtime") return undefined;
        return evaluateBranches(ownPropertyPresence(result, name, context), context, branch => {
          const value = getProperties(result, branch)[name];
          // Match ordinary reads of legacy native method values: identity is
          // the implementation object, not a fresh wrapper on every lookup.
          return [isFunction(value) ? { type: "function", id: value, properties: {}, function: value } : value, branch];
        }, absent => {
          // Bounded Stats.size/mtime: declared facts of a regular file,
          // persisted as reached facts on first read. Directory metadata and
          // files without an observed value stay a typed boundary.
          if (name === "size") {
            const size = fileSizes.get(node);
            if (size === undefined) throw new UnsupportedAnalysisError("Unmodeled host property 'size': Node Stats fields");
            return [ESNumber(size), writeProperty(result, name, ESNumber(size), absent)];
          }
          const milliseconds = fileMtimes.get(node);
          if (milliseconds === undefined) throw new UnsupportedAnalysisError("Unmodeled host property 'mtime': Node Stats fields");
          const date = boundedDate(milliseconds);
          return [date, writeProperty(result, name, date, absent)];
        });
      }, write(): undefined { return undefined; } }
    }));
    statsKinds.set(result, entries.get(node)!);
    return result;
  };
  const withPath = (value: Any, context: TExecutionContext,
    next: (path: string, branch: TExecutionContext) => BranchResult,
    reject: (detail: string) => never = unsupported): BranchResult =>
    withValue(value, context, (selected, branch) => {
      if (!isESString(selected)) return reject("non-string paths, file descriptors and argument diagnostics (including DEP0187)");
      if (typeof selected.value !== "string") return reject("open symbolic path strings");
      return next(utf8(selected.value), branch);
    });
  const module = Object.assign(ESObject(), {
    unknownProperties: "Node filesystem API", unmodeledOwnPropertyInspection: "Node filesystem module descriptors",
    // Default readFileSync calls the current exported helpers. Those APIs and
    // their replacement effects require a descriptor/FD model; never ignore it.
    unmodeledPropertyWrites: ["openSync", "fstatSync", "readSync", "closeSync"]
  });
  // A complete list of names is a separate fact from the acquired child table.
  // In particular, listing an open directory neither stats children nor reads files.
  const enumerate = (directory: TESObject, context: TExecutionContext): BranchResult =>
    withNames(directory, context, (previous, branch) => {
      if (previous) return [nameValues(previous), branch];
      let observed: string[] | undefined;
      if (openDirectories.has(directory)) {
        if (!observeDirectoryNames) return enumerationUnsupported("unobserved complete directory names");
        const supplied = observeDirectoryNames(directory);
        if (!Array.isArray(supplied) || !hasOwnElements(supplied) || supplied.some(name => typeof name !== "string" || utf8(name) !== name ||
          !name || name === "." || name === ".." || name.includes("/") || name.includes("\0") || Buffer.byteLength(name, "utf8") > 255) ||
          new Set(supplied).size !== supplied.length) throw new Error("Invalid acquired filesystem directory names");
        observed = sorted(supplied.slice());
      }
      const keys = sorted(Object.keys(getProperties(directory, branch)));
      const finish = (names: string[], current: TExecutionContext): BranchResult => {
        const result = observed || names;
        return [nameValues(result), writeProperty(metadata(directory), "names", nameValues(result), current)];
      };
      const collect = (index: number, names: string[], current: TExecutionContext): BranchResult => {
        const collected = names.slice();
        for (let position = index; position < keys.length; position++) {
          const key = keys[position], presence = ownPropertyPresence(directory, key, current);
          const child = getProperties(directory, current)[key];
          const accept = (value: Any, after: TExecutionContext): BranchResult => {
            if (observed && observed.includes(key) === isESNull(value)) {
              throw new Error("Filesystem name observation contradicts an observed child");
            }
            return collect(position + 1, isESNull(value) ? collected : collected.concat(key), after);
          };
          const exists = resolveBoolean(presence, current.value.knowledge);
          if (exists === false) continue;
          if (exists === undefined || choiceOf(child)) return evaluateBranches(presence, current,
            after => withValue(child, after, accept), after => collect(position + 1, collected, after));
          if (observed && observed.includes(key) === isESNull(child)) {
            throw new Error("Filesystem name observation contradicts an observed child");
          }
          if (!isESNull(child)) collected.push(key);
        }
        return finish(collected, current);
      };
      return collect(0, [], branch);
    });
  module.properties.readdirSync = operation("readdirSync", 2, (call, context) =>
    withValue(call.args[1] || Undefined, context, (option, afterOption) => {
      // Node's omitted/null options use its private empty object. General option
      // objects/strings have additional reads and coercions; do not ignore them.
      if (!isUndefined(option) && !isESNull(option)) return enumerationUnsupported("options, encodings, recursive and withFileTypes");
      return withPath(call.args[0] || Undefined, afterOption, (path, afterPath) => {
        if (path.includes("\0")) return [nullByteError(), afterPath];
        validatePathDomain(path, enumerationUnsupported);
        if (!path && platform === "linux") return [systemError("ENOENT", "scandir", path), afterPath];
        return evaluateBranches(getProperties(state, afterPath).fileDescriptorsAvailable as TESBoolean, afterPath,
          available => lookup(path, available, (result, after) => {
            if ("error" in result) return [systemError(result.error, "scandir", path), after];
            if (entries.get(result.node) !== "directory") return [systemError("ENOTDIR", "scandir", path), after];
            return evaluateBranches(access.get(result.node)!.readable, after,
              readable => enumerate(result.node, readable), denied => [systemError("EACCES", "scandir", path), denied]);
          }), exhausted => [systemError("EMFILE", "scandir", path), exhausted]);
      }, enumerationUnsupported);
    }));
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
  // fs.ReadStream delivery is an explicit embedding operation, matching the
  // http.completeResponse convention: Node delivers stream events
  // asynchronously while guest code continues, so the embedding picks the
  // delivery point instead of the model pretending pipe() reads synchronously.
  const streamEvents = createEventEmitterModel();
  const streamEventsPolicy = {
    restrictedEvents: ["data", "end", "close"],
    // 'open' carries a file descriptor number; descriptor identity is not
    // modeled, so registration fails honestly instead of delivering a fake fd.
    unsupportedRegistrations: ["open", "ready", "readable", "pause", "resume"]
  };
  type ReadStreamFacts = { path: string; node?: TESObject; error?: LookupFailure | "EISDIR" | "EMFILE" };
  const readStreamFacts = new WeakMap<object, ReadStreamFacts>();
  const createdReadStreams: TESObject[] = [];
  const readStreamOf = (receiver: Any): { facts: ReadStreamFacts; state: TESObject } => {
    if (!isESObject(receiver) || !readStreamFacts.has(receiver)) {
      return unsupported("fs ReadStream operations on foreign receivers");
    }
    return { facts: readStreamFacts.get(receiver)!, state: receiver.hostSlots!["node.fs.stream"] as TESObject };
  };
  const pipe = Object.assign(createHostFunction("fs.createReadStream.pipe", (call, context) => {
    readStreamOf(call.receiver);
    return evaluateBranches(getProperties(readStreamOf(call.receiver).state, context).delivered as TESBoolean, context,
      () => unsupported("fs pipe after stream delivery"),
      pending => withValue(call.args[0] || Undefined, pending, (dest, branch) => {
        if (!isESObject(dest)) return unsupported("fs pipe to non-object destinations");
        if (!isUndefined(call.args[1] || Undefined)) return unsupported("fs pipe options");
        return bindNormal(readMember(dest, "on", branch), (onMember, afterOn) => {
          // Pinned Node 24.21.0: pipe requires the destination's 'on' method
          // and throws synchronously when it is absent.
          if (!isESFunction(onMember)) {
            const error = createError("TypeError", ESString("dest.on is not a function"));
            Object.assign(error, { unmodeledPropertyReads: ["stack", "constructor"],
              unmodeledPropertyWrites: ["stack", "constructor"],
              unmodeledOwnPropertyInspection: "Node error descriptors" });
            return [ThrownValue(error), afterOn];
          }
          // Node also registers dest.on("unpipe") and emits 'pipe' on the
          // destination; response destinations gate both surfaces honestly
          // (unsupportedRegistrations), so pipe models only data/end wiring.
          const onData = createHostFunction("fs.pipe.data", (dataCall, dataContext) =>
            bindNormal(readMember(dest, "write", dataContext), (writeMember, afterWrite) =>
              invoke(writeMember, [dataCall.args[0] || Undefined], afterWrite, dest)));
          const onEnd = createHostFunction("fs.pipe.end", (_endCall, endContext) =>
            bindNormal(readMember(dest, "end", endContext), (endMember, afterEnd) =>
              invoke(endMember, [], afterEnd, dest)));
          return bindNormal(streamEvents.register(call.receiver, "data", onData, false, afterOn), (_data, withData) =>
            bindNormal(streamEvents.register(call.receiver, "end", onEnd, false, withData), (_end, registered) =>
              [dest, registered]));
        });
      }));
  }), {
    nonConstructible: false,
    unmodeledConstruct: "fs pipe construction is not yet supported",
    unknownProperties: "Node fs pipe function API",
    modeledInheritedProperties: ["call"],
    unmodeledOwnPropertyInspection: "Node fs pipe function descriptors",
    unmodeledPropertyReads: ["caller", "arguments"],
    unmodeledPropertyWrites: ["name", "length", "caller", "arguments"]
  });
  Object.assign(pipe.properties, { name: ESString("pipe"), length: ESNumber(1) });
  module.properties.createReadStream = operation("createReadStream", 2, (call, context) =>
    withValue(call.args[1] || Undefined, context, (option, afterOption) => {
      // Node accepts undefined or an options object. Range slicing, encodings,
      // flags, fds and the remaining fields are separate gaps; consult the
      // known option names, including inherited fields, before path work.
      if (!isUndefined(option)) {
        if (!isESObject(option)) return unsupported("fs createReadStream non-object options");
        for (const name of ["start", "end", "flags", "encoding", "fd", "mode", "autoClose", "emitClose", "highWaterMark"]) {
          if (resolveBoolean(hasProperty(option, name, afterOption), afterOption.value.knowledge) !== false) {
            return unsupported(`fs createReadStream option '${name}'`);
          }
        }
      }
      return withPath(call.args[0] || Undefined, afterOption, (path, afterPath) => {
        if (path.includes("\0")) return [nullByteError(), afterPath];
        const streamState = ESObject({ delivered: ESBoolean(false) });
        const stream = Object.assign(ESObject({ bytesRead: ESNumber(0), closed: ESBoolean(false),
          path: ESString(path), pipe }), {
          unknownProperties: "Node fs ReadStream API",
          unmodeledOwnPropertyInspection: "Node fs ReadStream descriptors",
          unmodeledPropertyWrites: ["bytesRead", "closed", "path"],
          hostSlots: Object.freeze({ "node.fs.stream": streamState })
        });
        readStreamFacts.set(stream, { path });
        createdReadStreams.push(stream);
        const attached = streamEvents.attach(stream, afterPath, streamEventsPolicy);
        return evaluateBranches(getProperties(state, attached).fileDescriptorsAvailable as TESBoolean, attached,
          available => lookup(path, available, (result, after) => {
            if ("error" in result) {
              readStreamFacts.set(stream, { path, error: result.error });
              return [stream, after];
            }
            return evaluateBranches(access.get(result.node)!.readable, after, readable => {
              if (entries.get(result.node) === "directory") {
                readStreamFacts.set(stream, { path, error: "EISDIR" });
                return [stream, readable];
              }
              readStreamFacts.set(stream, { path, node: result.node });
              return [stream, readable];
            }, denied => {
              readStreamFacts.set(stream, { path, error: "EACCES" });
              return [stream, denied];
            });
          }), exhausted => {
            readStreamFacts.set(stream, { path, error: "EMFILE" });
            return [stream, exhausted];
          });
      });
    }));
  const deliverReadStream = (stream: Any, context: TExecutionContext): BranchResult => {
    const { facts, state: streamState } = readStreamOf(stream);
    return evaluateBranches(getProperties(streamState, context).delivered as TESBoolean, context,
      () => unsupported("repeat fs ReadStream delivery"), pending => {
        if (facts.error) {
          // systemError wraps the error in a ThrownValue completion for fs
          // call sites; the 'error' event payload is the bare error object.
          const completion = systemError(facts.error, facts.error === "EISDIR" ? "read" : "open", facts.path);
          const payload = isThrownValue(completion) ? completion.value : completion;
          return bindNormal(streamEvents.emit(stream, "error", [payload], pending),
            (_value, after) => [stream, after]);
        }
        // Contents are read at delivery, like the native asynchronous read.
        let text = getProperties(facts.node!, pending).text;
        let current = pending;
        if (isESString(text) && typeof text.value !== "string") {
          if (!observeContents) return unsupported("unobserved file contents");
          const contents = observeContents(facts.node!);
          if (typeof contents !== "string" || utf8(contents) !== contents) return unsupported("invalid captured UTF-8 contents");
          text = ESString(contents);
          current = writeProperty(facts.node!, "text", text, current);
        }
        if (!isESString(text) || typeof text.value !== "string") return unsupported("invalid file text state");
        const bytes = Array.from(Buffer.from(text.value, "utf8"));
        // Pinned Node 24.21.0: the default 64 KiB highWaterMark reads files up
        // to that size as one chunk; larger multi-chunk flows are a recorded
        // gap, as is the async 'open' event (descriptor identity is unmodeled).
        if (bytes.length > 65536) return unsupported("multi-chunk fs ReadStream delivery (files over 64 KiB)");
        const delivering = writeProperty(streamState, "delivered", ESBoolean(true), current);
        return bindNormal(streamEvents.emit(stream, "data", [createBufferValue(bytes)], delivering), (_data, afterData) =>
          bindNormal(streamEvents.emit(stream, "end", [], afterData), (_end, afterEnd) =>
            bindNormal(streamEvents.emit(stream, "close", [], afterEnd), (_close, afterClose) => {
              const counted = writeProperty(stream as TESObject, "bytesRead", ESNumber(bytes.length), afterClose);
              return [stream, writeProperty(stream as TESObject, "closed", ESBoolean(true), counted)];
            })));
      });
  };
  return { module, state, deliverReadStream, createdReadStreams,
    inspectRoot: (context: TExecutionContext) => getProperties(state, context).root,
    inspectFileDescriptorsAvailable: (context: TExecutionContext) => getProperties(state, context).fileDescriptorsAvailable as TESBoolean };
}
