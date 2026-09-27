import { normalize, resolve, sep } from "path";
import { fileURLToPath, pathToFileURL, URL } from "url";

export class PackageExportError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = code === "ERR_INVALID_MODULE_SPECIFIER" ? "TypeError" : "Error";
  }
}

// Node v24.21.0's default CommonJS conditions. Custom --conditions, --no-addons,
// and --no-require-module environments are outside this loader's current scope.
const conditions = new Set(["node", "require", "node-addons", "module-sync", "default"]);

// The pinned resolver rejects dot/node_modules path segments, including their
// percent-encoded spellings, before URL normalization can erase that evidence.
const invalidSegment = /(^|\\|\/)((\.|%2e)(\.|%2e)?|(n|%6e|%4e)(o|%6f|%4f)(d|%64|%44)(e|%65|%45)(_|%5f)(m|%6d|%4d)(o|%6f|%4f)(d|%64|%44)(u|%75|%55)(l|%6c|%4c)(e|%65|%45)(s|%73|%53))(\\|\/|$)/i;

function isIndexKey(key: string): boolean {
  const number = +key;
  // This deliberately matches Node's test, including canonical fractions.
  return String(number) === key && number >= 0 && number < 0xffffffff;
}

/**
 * Resolve exact package exports without consulting the filesystem. A returned
 * path is final: a missing file must not try another target or legacy main.
 * Null and undefined stay distinct inside conditions/arrays, then collapse to
 * no exported subpath at this boundary. The caller supplies the package error.
 */
export function resolvePackageExport(
  exports: unknown, subpath: string, packageDirectory: string
): string | undefined {
  const packageURL = pathToFileURL(resolve(packageDirectory) + sep);

  const targetString = (target: string): string => {
    if (!target.startsWith("./") || invalidSegment.test(target.slice(2))) {
      throw new PackageExportError("ERR_INVALID_PACKAGE_TARGET");
    }
    const url = new URL(target, packageURL);
    if (!url.pathname.startsWith(packageURL.pathname)) {
      throw new PackageExportError("ERR_INVALID_PACKAGE_TARGET");
    }
    // Node's CJS finalizer checks the complete URL, including query/hash.
    if (/%2f|%5c/i.test(url.href)) {
      throw new PackageExportError("ERR_INVALID_MODULE_SPECIFIER");
    }
    let filename: string;
    try {
      filename = fileURLToPath(url);
    } catch (_) {
      throw new Error("CommonJS package export malformed URL encodings are not yet supported");
    }
    if (filename.includes("\0")) {
      throw new Error("CommonJS package export paths with null bytes are not yet supported");
    }
    return normalize(filename);
  };

  const target = (value: unknown): string | null | undefined => {
    if (typeof value === "string") return targetString(value);
    if (Array.isArray(value)) {
      if (value.length === 0) return null;
      let lastFailure: PackageExportError | null | undefined;
      for (const item of value) {
        let selected: string | null | undefined;
        try {
          selected = target(item);
        } catch (error) {
          if (!(error instanceof PackageExportError) || error.code !== "ERR_INVALID_PACKAGE_TARGET") throw error;
          lastFailure = error;
          continue;
        }
        if (selected === undefined) continue;
        if (selected === null) {
          lastFailure = null;
          continue;
        }
        return selected;
      }
      if (lastFailure instanceof PackageExportError) throw lastFailure;
      return lastFailure;
    }
    if (value !== null && typeof value === "object") {
      const record = value as { [key: string]: unknown };
      const keys = Object.getOwnPropertyNames(record);
      if (keys.some(isIndexKey)) throw new PackageExportError("ERR_INVALID_PACKAGE_CONFIG");
      for (const key of keys) {
        if (!conditions.has(key)) continue;
        const selected = target(record[key]);
        if (selected !== undefined) return selected;
      }
      return undefined;
    }
    if (value === null) return null;
    throw new PackageExportError("ERR_INVALID_PACKAGE_TARGET");
  };

  let map: { [key: string]: unknown };
  if (typeof exports === "string" || Array.isArray(exports)) {
    map = { ".": exports };
  } else if (typeof exports === "object" && exports !== null) {
    const record = exports as { [key: string]: unknown };
    const keys = Object.getOwnPropertyNames(record);
    const conditional = keys.length > 0 && !keys[0].startsWith(".");
    if (keys.some(key => !key.startsWith(".") !== conditional)) {
      throw new PackageExportError("ERR_INVALID_PACKAGE_CONFIG");
    }
    map = conditional ? { ".": exports } : record;
  } else {
    // Primitive exports fields have no exported subpaths. The package reader
    // ordinarily ignores them before external lookup reaches this operation.
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(map, subpath) && !subpath.includes("*") && !subpath.endsWith("/")) {
    const selected = target(map[subpath]);
    return selected === null ? undefined : selected;
  }
  if (Object.getOwnPropertyNames(map).some(key => key.includes("*"))) {
    throw new Error("CommonJS package export patterns are not yet supported");
  }
  return undefined;
}
