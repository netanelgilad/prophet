import { dirname } from "path";
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
import { createModuleResolver, ModuleFormat, ModuleResolutionError } from "./resolution";
import { InvalidPackageConfig } from "./package-config";
import { PackageExportError } from "./package-exports";
import { parseJSONModule } from "./json";

export type CommonJSLoader = {
  load(filename: string, context: TExecutionContext): BranchResult;
};

function loaderError(name: string, code?: string) {
  // Do not fabricate concrete diagnostic strings or silently erase Node's
  // additional fields while the full Error model is still incomplete.
  const error: TESObject = {
    ...ESObject({ name: ESString(name), code: code === undefined ? Undefined : ESString(code) }),
    unknownProperties: "CommonJS loader error fields"
  };
  return ThrownValue(error);
}

/**
 * A closed, immutable snapshot of files, without symlinks or external search
 * paths. No host files are read during analysis. Local CommonJS/JSON loading,
 * node_modules lookup, and exact conditional package exports share one cache.
 * Source and cache identities are shared; cache CONTENTS live only in each
 * execution context's persistent heap, so forks and snapshots stay independent.
 */
export function createCommonJSLoader(files: { readonly [filename: string]: string }): CommonJSLoader {
  const resolver = createModuleResolver(files);
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
    return loadRequest(request.value, context, parent);
  };

  const initialize = (filename: string, source: string, format: ModuleFormat, context: TExecutionContext): BranchResult => {
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
    let result: BranchResult;
    if (format === "json") {
      try {
        const value = parseJSONModule(source);
        result = [value, writeProperty(module, "exports", value, entered)];
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        result = [loaderError("SyntaxError"), entered];
      }
    } else {
      result = executeCommonJS(source, filename, entered, module, scopedRequire, format === "ambiguous");
    }
    return mapCompletions(result, (value, after) => {
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
      ? initialize(filename, source, resolver.format(filename), context)
      : [getProperties(entry as WithProperties, context).exports, context];
  };

  const loadRequest = (request: string, context: TExecutionContext, parent?: string): BranchResult => {
    try {
      const path = resolver.resolve(request, parent);
      if (path === undefined) return [loaderError("Error", "MODULE_NOT_FOUND"), context];
      const source = resolver.sources.get(path)!;
      const entries = getProperties(cache, context);
      const entry = Object.prototype.hasOwnProperty.call(entries, path) ? entries[path] : Undefined;
      return cachedOrInitialize(entry, path, source, context);
    } catch (error) {
      if (error instanceof InvalidPackageConfig) {
        return [loaderError("Error", "ERR_INVALID_PACKAGE_CONFIG"), context];
      }
      if (error instanceof PackageExportError || error instanceof ModuleResolutionError) {
        return [loaderError(error.name, error.code), context];
      }
      throw error;
    }
  };
  return { load: (filename, context) => loadRequest(filename, context) };
}
