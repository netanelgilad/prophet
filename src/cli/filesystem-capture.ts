import { accessSync, closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync, Stats } from "fs";
import { dirname, join, resolve, sep } from "path";
import { ESBoolean } from "../boolean/ESBoolean";
import { createFileSystemModel, fileSystemDirectory, fileSystemUnobservedFile } from "../node/filesystem";
import { TESObject } from "../Object";
import { Any, ESNull, TESBoolean } from "../types";
import { UnsupportedAnalysisError } from "../execution-context/analysis-failure";

// Local typing for the newer public API; the repository retains older Node typings.
const directoryAPI: { opendirSync(path: string, options: { encoding: string; bufferSize: number }): {
  readSync(): { name: Buffer } | null; closeSync(): void;
} } = require("fs");

export type FileSystemCaptureOptions = {
  cwd: string;
  maxEntries?: number;
  maxFileBytes?: number;
  maxTotalBytes?: number;
  fileDescriptorsAvailable?: TESBoolean;
};

/**
 * Read-only, demand-driven environment acquisition. First observations are
 * memoized across symbolic paths, while reached facts enter persistent VM state.
 * This is neither an atomic snapshot nor a sandbox or race-resistant walk.
 */
export function captureFileSystem(options: FileSystemCaptureOptions) {
  const fail = (detail: string): never => { throw new Error(`Filesystem acquisition is not yet supported: ${detail}`); };
  if (sep !== "/" || (process.platform !== "linux" && process.platform !== "darwin")) return fail("platform");
  if ((process.getuid && process.geteuid && process.getuid() !== process.geteuid()) ||
      (process.getgid && process.getegid && process.getgid() !== process.getegid())) return fail("different real/effective credentials");
  const limit = (value: number | undefined, fallback: number) => {
    const result = value === undefined ? fallback : value;
    if (!Number.isSafeInteger(result) || result <= 0) throw new Error("Filesystem capture budgets must be positive safe integers");
    return result;
  };
  const maxEntries = limit(options.maxEntries, 4096);
  const maxFileBytes = limit(options.maxFileBytes, 1024 * 1024);
  const maxTotalBytes = limit(options.maxTotalBytes, 8 * 1024 * 1024);
  // Resolve only the already-held cwd identity. Guest path components are walked
  // by the model and never normalized through missing prefixes or symlinks.
  const cwd = realpathSync(resolve(options.cwd));
  const nodes = new Map<string, Any>();
  const paths = new WeakMap<object, string>();
  const metadata = new Map<string, Stats>();
  const contents = new Map<string, string>();
  const directoryNames = new Map<string, ReadonlyArray<string>>();
  const failures = new Map<string, Error>();
  let observations = 0;
  let totalBytes = 0;
  const attempt = <T>(key: string, operation: () => T): T => {
    if (failures.has(key)) throw failures.get(key)!;
    try { return operation(); }
    catch (error) {
      const Failure = error instanceof UnsupportedAnalysisError ? UnsupportedAnalysisError : Error;
      const failure = new Failure(`Filesystem acquisition failed for ${key}: ${error.message || String(error)}`);
      failures.set(key, failure);
      throw failure;
    }
  };
  const allowed = (path: string, mode: number): TESBoolean => {
    try { accessSync(path, mode); return ESBoolean(true); }
    catch (error) {
      if (error.code === "EACCES") return ESBoolean(false);
      throw error;
    }
  };
  const inspect = (path: string): Stats | undefined => {
    if (++observations > maxEntries) return fail("entry acquisition budget exceeded");
    let stat: Stats;
    try { stat = lstatSync(path); }
    catch (error) {
      if (error.code === "ENOENT") return undefined;
      // ENOTDIR here contradicts an observed directory ancestor. The model
      // itself handles known non-directory traversal without reaching this hook.
      throw error;
    }
    if (stat.isSymbolicLink()) return fail("symlink path component");
    if (!stat.isFile() && !stat.isDirectory()) return fail("nonregular filesystem entry");
    if (realpathSync(path) !== path) return fail("filesystem filename aliases");
    metadata.set(path, stat);
    return stat;
  };
  const makeNode = (path: string, stat: Stats, children: { [name: string]: Any } = {}): TESObject => {
    const readable = allowed(path, constants.R_OK);
    const node = stat.isDirectory()
      ? fileSystemDirectory(children, { readable, searchable: allowed(path, constants.X_OK), complete: false })
      : fileSystemUnobservedFile({ readable });
    paths.set(node, path);
    nodes.set(path, node);
    return node;
  };
  // Build the cwd chain eagerly so resolving the initial directory does not
  // acquire and then discard facts in the model's structural setup check.
  const ancestors: string[] = [];
  for (let path = cwd;; path = dirname(path)) {
    ancestors.unshift(path);
    if (path === "/") break;
  }
  for (const path of ancestors) attempt(`stat ${path}`, () => {
    const stat = inspect(path);
    if (!stat || !stat.isDirectory()) return fail("cwd ancestor changed or is not a directory");
  });
  let root: TESObject | undefined;
  for (let index = ancestors.length - 1; index >= 0; index--) {
    const path = ancestors[index];
    const children = root ? { [ancestors[index + 1].slice(path === "/" ? 1 : path.length + 1)]: root } : {};
    root = attempt(`access ${path}`, () => makeNode(path, metadata.get(path)!, children));
  }
  const observeEntry = (directory: TESObject, name: string): Any => {
    const parent = paths.get(directory);
    if (!parent) return fail("unrecognized directory identity");
    const path = join(parent, name);
    if (nodes.has(path)) return nodes.get(path)!;
    const knownNames = directoryNames.get(parent);
    if (knownNames && !knownNames.includes(name)) { nodes.set(path, ESNull); return ESNull; }
    return attempt(`stat ${path}`, () => {
      const stat = inspect(path);
      if (!stat && knownNames) throw new Error("Filesystem child changed after complete directory enumeration");
      const node = stat ? makeNode(path, stat) : ESNull;
      nodes.set(path, node);
      return node;
    });
  };
  const observeDirectoryNames = (directory: TESObject): ReadonlyArray<string> => {
    const path = paths.get(directory);
    if (!path) return fail("unrecognized directory identity");
    if (directoryNames.has(path)) return directoryNames.get(path)!;
    return attempt(`enumerate ${path}`, () => {
      const expected = metadata.get(path)!;
      const sameDirectory = (current: Stats) => current.isDirectory() && expected.dev === current.dev &&
        expected.ino === current.ino && expected.mode === current.mode && expected.mtimeMs === current.mtimeMs && expected.ctimeMs === current.ctimeMs;
      if (!sameDirectory(lstatSync(path)) || realpathSync(path) !== path) throw new Error("Directory changed before enumeration");
      const names: string[] = [];
      // Public readdirSync allocates the whole directory before returning. Use a
      // bounded iterator for acquisition, then reproduce scandir's byte sorting.
      // This is not an atomic snapshot or a race-resistant component walk.
      const stream = directoryAPI.opendirSync(path, { encoding: "buffer", bufferSize: 1 });
      try {
        for (;;) {
          const item = stream.readSync();
          if (!item) break;
          if (++observations > maxEntries) throw new UnsupportedAnalysisError("directory name acquisition budget exceeded");
          const bytes = item.name as unknown as Buffer;
          if (!Buffer.isBuffer(bytes)) throw new Error("Directory acquisition did not preserve filename bytes");
          if (bytes.length > 255) throw new UnsupportedAnalysisError("overlong directory entry name");
          const name = bytes.toString("utf8");
          if (!Buffer.from(name, "utf8").equals(bytes)) throw new UnsupportedAnalysisError("directory names require valid UTF-8 bytes");
          names.push(name);
        }
      } finally { stream.closeSync(); }
      if (!sameDirectory(lstatSync(path))) throw new Error("Directory changed during enumeration");
      for (const [childPath, child] of nodes) {
        if (childPath === path || dirname(childPath) !== path) continue;
        const present = names.includes(childPath.slice(path === "/" ? 1 : path.length + 1));
        if (present === (child === ESNull)) throw new Error("Directory enumeration contradicts an earlier child observation");
      }
      names.sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
      const result = Object.freeze(names);
      directoryNames.set(path, result);
      return result;
    });
  };
  const sameFile = (first: Stats, current: Stats): boolean => current.isFile() &&
    first.dev === current.dev && first.ino === current.ino && first.size === current.size &&
    first.mtimeMs === current.mtimeMs && first.ctimeMs === current.ctimeMs && first.mode === current.mode;
  const observeContents = (file: TESObject): string => {
    const path = paths.get(file);
    if (!path) return fail("unrecognized file identity");
    if (contents.has(path)) return contents.get(path)!;
    return attempt(`read ${path}`, () => {
      const expected = metadata.get(path)!;
      if (expected.size > maxFileBytes || expected.size > maxTotalBytes - totalBytes) return fail("content acquisition budget exceeded");
      // O_NOFOLLOW protects the final component, not the whole walk. fstat
      // comparisons reject detected changes; they do not establish atomicity.
      const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      let bytes: Buffer;
      try {
        if (!sameFile(expected, fstatSync(fd))) return fail("file changed after metadata observation");
        const capacity = Math.min(maxFileBytes, maxTotalBytes - totalBytes, expected.size) + 1;
        const buffer = Buffer.alloc(capacity);
        let used = 0;
        while (used < capacity) {
          const count = readSync(fd, buffer, used, capacity - used, used);
          if (!count) break;
          used += count;
          totalBytes += count;
        }
        if (used !== expected.size || !sameFile(expected, fstatSync(fd))) return fail("file changed during content acquisition");
        bytes = buffer.slice(0, used);
      } finally { closeSync(fd); }
      const text = bytes.toString("utf8");
      if (!Buffer.from(text, "utf8").equals(bytes)) return fail("file contents require valid UTF-8 bytes");
      contents.set(path, text);
      return text;
    });
  };
  return createFileSystemModel({ root: root!, cwd, platform: process.platform,
    fileDescriptorsAvailable: options.fileDescriptorsAvailable === undefined ? ESBoolean() : options.fileDescriptorsAvailable,
    observeEntry, observeContents, observeDirectoryNames });
}
