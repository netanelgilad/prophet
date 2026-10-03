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
import { createModuleResolver, ModuleFormat, ModuleResolutionError, ModuleResolver } from "./resolution";
import { InvalidPackageConfig } from "./package-config";
import { PackageExportError } from "./package-exports";
import { parseJSONModule } from "./json";
import { canonicalBuiltinName } from "./builtin-names";

export type CommonJSLoader = {
  load(filename: string, context: TExecutionContext): BranchResult;
};

export type CommonJSLoaderOptions = {
  // Optional process entry; dependencies and cycles share its cached record.
  main?: string;
  // Explicit VM modules only; names use the pinned catalog without node:.
  // The map is snapshotted, but supplied values retain their VM identities.
  builtins?: { readonly [canonicalName: string]: Any };
};

const builtinValueTypes = new Set([
  "undefined", "null", "boolean", "number", "string", "object", "array", "function", "choice"
]);

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
export function createCommonJSLoader(
  files: { readonly [filename: string]: string }, options: CommonJSLoaderOptions = {}
): CommonJSLoader {
  return createCommonJSLoaderFromResolver(createModuleResolver(files), options);
}

/** Resolution/acquisition adapters do not replace VM execution or its cache. */
export function createCommonJSLoaderFromResolver(
  resolver: ModuleResolver, options: CommonJSLoaderOptions = {}
): CommonJSLoader {
  const main = options.main;
  const cache = ESObject();
  const builtins = new Map<string, Any>();
  if (options.builtins) for (const name of Object.keys(options.builtins)) {
    if (canonicalBuiltinName("node:" + name) !== name) {
      throw new Error(`CommonJS registry needs a canonical builtin name without node:; received '${name}'`);
    }
    const value = options.builtins[name];
    // A trusted embedding supplies the model, but accidental raw host values
    // must not masquerade as interpreter values at this boundary.
    if (typeof value !== "object" || value === null ||
        !builtinValueTypes.has((value as { type: string }).type)) {
      throw new Error(`CommonJS builtin '${name}' must be a VM value`);
    }
    builtins.set(name, value);
  }

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
      ...ESObject({ exports: ESObject(), id: ESString(filename === main ? "." : filename), filename: ESString(filename),
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
    entry: Any, filename: string, context: TExecutionContext
  ): BranchResult => {
    const choice = choiceOf(entry);
    if (choice) return evaluateBranches(choice.condition, context,
      branch => cachedOrInitialize(choice.consequent, filename, branch),
      branch => cachedOrInitialize(choice.alternate, filename, branch));
    if (!isUndefined(entry)) return [getProperties(entry as WithProperties, context).exports, context];
    const format = resolver.format(filename);
    return initialize(filename, resolver.readSource(filename), format, context);
  };

  const loadRequest = (request: string, context: TExecutionContext, parent?: string): BranchResult => {
    try {
      // Entries retain the absolute-filename contract. Within modules, known
      // builtins precede filesystem/package resolution, including self names.
      const builtin = parent === undefined ? undefined : canonicalBuiltinName(request);
      if (builtin !== undefined) {
        if (builtins.has(builtin)) return [builtins.get(builtin)!, context];
        throw new Error(`CommonJS builtin loading is not yet supported: no model registered for '${request}'`);
      }
      const path = resolver.resolve(request, parent);
      if (path === undefined) return [loaderError("Error", "MODULE_NOT_FOUND"), context];
      const entries = getProperties(cache, context);
      const entry = Object.prototype.hasOwnProperty.call(entries, path) ? entries[path] : Undefined;
      return cachedOrInitialize(entry, path, context);
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
