import { basename, dirname, extname, isAbsolute, join, normalize, resolve, sep } from "path";
import { readPackageConfig } from "./package-config";
import { resolvePackageExport } from "./package-exports";
import { isBuiltinRequest } from "./builtin-names";

export type ModuleFormat = "commonjs" | "ambiguous" | "json";

export class ModuleResolutionError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function directoryRequest(request: string): boolean {
  // Preserve this before normalization: /folder/. and /folder/.. are directory
  // searches, even when a neighboring folder.js file exists.
  return request.endsWith(sep) || /(?:^|\/)\.{1,2}$/.test(request);
}

/** A complete, immutable virtual filesystem. Only supplied files exist. */
export function createModuleResolver(files: { readonly [filename: string]: string }) {
  const sources = new Map<string, string>();
  const directories = new Set<string>();
  for (const filename of Object.keys(files)) {
    if (!isAbsolute(filename) || filename.endsWith(sep) || filename.includes("\0")) {
      throw new Error("CommonJS source files need absolute filenames without trailing separators or null bytes");
    }
    const path = normalize(filename);
    if (sources.has(path)) throw new Error(`Duplicate CommonJS source path: ${path}`);
    if (typeof files[filename] !== "string") throw new Error("CommonJS module source must be a string");
    sources.set(path, files[filename]);
    let parent = dirname(path);
    for (;;) {
      directories.add(parent);
      if (parent === dirname(parent)) break;
      parent = dirname(parent);
    }
  }
  directories.forEach(path => {
    if (sources.has(path)) throw new Error(`CommonJS source path is both a file and a directory: ${path}`);
  });

  const extensions = (base: string) => {
    for (const extension of [".js", ".json", ".node"]) {
      if (sources.has(base + extension)) return base + extension;
    }
    return undefined;
  };
  const file = (path: string) => sources.has(path) ? path : undefined;
  const nearestPackage = (filename: string) => {
    let parent = dirname(filename);
    while (parent !== dirname(parent) && basename(parent) !== "node_modules") {
      const source = sources.get(join(parent, "package.json"));
      if (source !== undefined) return { directory: parent, config: readPackageConfig(source) };
      parent = dirname(parent);
    }
    return undefined;
  };
  const directory = (path: string): string | undefined => {
    if (!directories.has(path)) return undefined;
    const source = sources.get(join(path, "package.json"));
    const main = source === undefined ? undefined : readPackageConfig(source).main;
    if (main) {
      if (main.includes("\0")) throw new Error("CommonJS package main with null bytes is not yet supported");
      const target = resolve(path, main);
      // main-directory/package.json is deliberately not consulted by Node's
      // legacy local-directory algorithm. Only its index candidates are tried.
      const found = file(target) || extensions(target) || extensions(join(target, "index"));
      if (found) return found;
    }
    // Node may emit DEP0128 when a nonempty main falls back to this index.
    // Diagnostic events are not yet modeled; file choice and errors are.
    const index = extensions(join(path, "index"));
    // A broken explicit main is an error, while an empty package directory
    // permits bare-package lookup to continue to the next node_modules path.
    if (main && !index) throw new ModuleResolutionError("MODULE_NOT_FOUND");
    return index;
  };
  const local = (path: string, request: string) =>
    (!directoryRequest(request) && (file(path) || extensions(path))) || directory(path) || undefined;

  const exported = (value: unknown, subpath: string, directory: string): string => {
    const target = resolvePackageExport(value, subpath, directory);
    if (target === undefined) throw new ModuleResolutionError("ERR_PACKAGE_PATH_NOT_EXPORTED");
    // Exports targets are exact. Neither extensions/directories nor another
    // array target/ancestor package can replace a selected missing file.
    if (!sources.has(target)) throw new ModuleResolutionError("MODULE_NOT_FOUND");
    return target;
  };

  const selfReference = (request: string, parent: string): string | undefined => {
    const self = nearestPackage(parent);
    if (self && self.config.name !== undefined && self.config.exports !== undefined &&
        (request === self.config.name || request.startsWith(self.config.name + "/"))) {
      return exported(self.config.exports, "." + request.slice(self.config.name.length), self.directory);
    }
    return undefined;
  };

  const packageRequest = (request: string, parent: string): string | undefined => {
    const match = /^((?:@[^/\\%]+\/)?[^./\\%][^/\\%]*)(\/.*)?$/.exec(request);
    if (!match) throw new Error("CommonJS nonstandard package request forms are not yet supported");
    const name = match[1];
    const subpath = "." + (match[2] || "");
    let current = dirname(parent);
    for (;;) {
      if (basename(current) !== "node_modules") {
        const search = join(current, "node_modules");
        if (directories.has(search)) {
          const packageDirectory = join(search, name);
          const source = sources.get(join(packageDirectory, "package.json"));
          const config = source === undefined ? undefined : readPackageConfig(source);
          if (config && config.exports != null) return exported(config.exports, subpath, packageDirectory);
          const found = local(resolve(search, request), request);
          if (found) return found;
        }
      }
      if (current === dirname(current)) break;
      current = dirname(current);
    }
    return undefined;
  };
  const resolveRequest = (request: string, parent?: string): string | undefined => {
    if (request.includes("\0")) throw new Error("CommonJS requests with null bytes are not yet supported");
    if (!parent && !isAbsolute(request)) {
      throw new Error("CommonJS entry loading requires an absolute path");
    }
    if (isBuiltinRequest(request)) throw new Error("CommonJS builtin loading is not yet supported");
    if (request.startsWith("node:")) throw new ModuleResolutionError("ERR_UNKNOWN_BUILTIN_MODULE");
    if (request.startsWith("#")) throw new Error("CommonJS package imports are not yet supported");
    // Node consults the caller's scope for every non-builtin request, even
    // relative/absolute ones. Unusual package names can self-match those too.
    const self = parent && selfReference(request, parent);
    if (self) return self;
    if (!isAbsolute(request) && request !== "." && request !== ".." &&
        !request.startsWith("./") && !request.startsWith("../")) {
      return packageRequest(request, parent!);
    }
    const path = parent ? resolve(dirname(parent), request) : resolve(request);
    return local(path, request);
  };
  const format = (filename: string): ModuleFormat => {
    const extension = extname(filename);
    // Node's default JS handler checks suffixes even for hidden basenames
    // such as .cjs and .js, whose path.extname is empty. Hidden .json instead
    // reaches that default handler and must not be parsed as JSON data.
    if (filename.endsWith(".cjs")) return "commonjs";
    if (extension === ".json") return "json";
    if (filename.endsWith(".mjs")) throw new Error("CommonJS loading of ES modules is not yet supported");
    if (filename.endsWith(".js")) {
      // The pinned Node package-scope search stops at node_modules and before
      // the filesystem root. A nearer manifest shadows all ancestor manifests.
      const scope = nearestPackage(filename);
      if (scope) {
        if (scope.config.type === "module") throw new Error("CommonJS loading of ES modules is not yet supported");
        return scope.config.type === "commonjs" ? "commonjs" : "ambiguous";
      }
      return "ambiguous";
    }
    if (extension === "") return "ambiguous";
    throw new Error(`CommonJS loading of '${extension}' files is not yet supported`);
  };
  return { sources, resolve: resolveRequest, format };
}
