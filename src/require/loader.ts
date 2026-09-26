import { dirname, extname, isAbsolute, normalize, resolve, sep } from "path";
import { ESObject, TESObject } from "../Object";
import { ESFunction } from "../Function/Function";
import { ESString } from "../string/String";
import { ESBoolean } from "../boolean/ESBoolean";
import { Any, FunctionBinding, ThrownValue, Undefined, WithProperties,
  isESString, isThrownValue, isUndefined } from "../types";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { getProperties, writeProperty } from "../execution-context/Heap";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { mapCompletions } from "../evaluate";
import { choiceOf } from "../symbolic";
import { executeCommonJS } from "./commonjs";

export type CommonJSLoader = {
  load(filename: string, context: TExecutionContext): BranchResult;
};

function loaderError(name: string, code: string) {
  // Do not fabricate concrete diagnostic strings or silently erase Node's
  // additional fields while the full Error model is still incomplete.
  const error: TESObject = {
    ...ESObject({ name: ESString(name), code: ESString(code) }),
    unknownProperties: "CommonJS loader error fields"
  };
  return ThrownValue(error);
}

function exactFilename(filename: string): string {
  if (!isAbsolute(filename) || extname(filename) !== ".cjs" || filename.endsWith(sep)) {
    throw new Error("CommonJS loader needs an absolute .cjs filename; broader resolution is not yet supported");
  }
  return normalize(filename);
}

/**
 * A closed, immutable snapshot of CommonJS .cjs source files, without symlinks,
 * package metadata, or other file types. No host files are read during analysis.
 * Source and cache identities are shared; cache CONTENTS live only in each
 * execution context's persistent heap, so forks and snapshots stay independent.
 */
export function createCommonJSLoader(files: { readonly [filename: string]: string }): CommonJSLoader {
  const sources = new Map<string, string>();
  for (const filename of Object.keys(files)) {
    const path = exactFilename(filename);
    if (sources.has(path)) throw new Error(`Duplicate CommonJS source path: ${path}`);
    if (typeof files[filename] !== "string") throw new Error("CommonJS module source must be a string");
    sources.set(path, files[filename]);
  }
  sources.forEach((_, filename) => {
    for (let parent = dirname(filename); parent !== dirname(parent); parent = dirname(parent)) {
      if (sources.has(parent)) throw new Error(`CommonJS source path is both a file and a directory: ${parent}`);
    }
  });
  const cache = ESObject();

  const requireFrom = (request: Any, parent: string, context: TExecutionContext): BranchResult => {
    const choice = choiceOf(request);
    if (choice) return evaluateBranches(choice.condition, context,
      branch => requireFrom(choice.consequent, parent, branch),
      branch => requireFrom(choice.alternate, parent, branch));
    if (!isESString(request)) {
      return [loaderError("TypeError", "ERR_INVALID_ARG_TYPE"), context];
    }
    if (typeof request.value !== "string") {
      throw new Error("CommonJS require needs a concrete path or a finite choice of paths");
    }
    if (request.value === "") {
      return [loaderError("TypeError", "ERR_INVALID_ARG_VALUE"), context];
    }
    if (!isAbsolute(request.value) && !request.value.startsWith("./") && !request.value.startsWith("../")) {
      throw new Error("CommonJS package and builtin resolution is not yet supported");
    }
    // Restrict the request before normalizing: a trailing separator denotes a
    // directory search, even if its last component happens to end in .cjs.
    if (extname(request.value) !== ".cjs" || request.value.endsWith(sep)) {
      throw new Error("CommonJS extension and directory resolution is not yet supported; use an exact .cjs path");
    }
    return load(resolve(dirname(parent), request.value), context);
  };

  const initialize = (filename: string, source: string, context: TExecutionContext): BranchResult => {
    const scopedRequire: FunctionBinding = {
      ...ESFunction(function*(_self, args, caller) {
        return requireFrom(args.length ? args[0] : Undefined, filename, caller);
      }),
      properties: {}, unknownProperties: "CommonJS require API"
    };
    const module: TESObject = {
      ...ESObject({ exports: ESObject(), id: ESString(filename), filename: ESString(filename),
        path: ESString(dirname(filename)), loaded: ESBoolean(false) }),
      unknownProperties: "CommonJS module metadata",
      unmodeledPropertyWrites: ["id", "filename", "path", "loaded"]
    };
    // Cache the module record, not its (possibly undefined) exports. A cycle
    // sees that same record and whatever exports have been assigned so far.
    const entered = writeProperty(cache, filename, module, context);
    return mapCompletions(executeCommonJS(source, filename, entered, module, scopedRequire), (value, after) => {
      if (isThrownValue(value)) {
        // Keep effects and completed dependencies. Only this failed module
        // loses its cache entry; a later require retries with a fresh record.
        return [value, writeProperty(cache, filename, Undefined, after)];
      }
      return [value, writeProperty(module, "loaded", ESBoolean(true), after)];
    });
  };

  const cachedOrInitialize = (
    entry: Any, filename: string, source: string, context: TExecutionContext
  ): BranchResult => {
    const choice = choiceOf(entry);
    if (choice) return evaluateBranches(choice.condition, context,
      branch => cachedOrInitialize(choice.consequent, filename, source, branch),
      branch => cachedOrInitialize(choice.alternate, filename, source, branch));
    return isUndefined(entry)
      ? initialize(filename, source, context)
      : [getProperties(entry as WithProperties, context).exports, context];
  };

  const load = (filename: string, context: TExecutionContext): BranchResult => {
    const path = exactFilename(filename);
    const source = sources.get(path);
    if (source === undefined) {
      return [loaderError("Error", "MODULE_NOT_FOUND"), context];
    }
    const entries = getProperties(cache, context);
    const entry = Object.prototype.hasOwnProperty.call(entries, path) ? entries[path] : Undefined;
    return cachedOrInitialize(entry, path, source, context);
  };
  return { load };
}
