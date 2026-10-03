// Initialize the existing mutually dependent VM built-ins in their public-entry
// order before importing individual constructors.
import "../index";
import { createHash } from "crypto";
import { readFileSync, realpathSync, statSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { ESBoolean } from "../boolean/ESBoolean";
import { mapCompletions } from "../evaluate";
import { analysisFailureContext } from "../execution-context/analysis-failure";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { ESInitialGlobal } from "../execution-context/ESInitialGlobal";
import { ExecutionContext, TExecutionContext } from "../execution-context/ExecutionContext";
import { writeProperty } from "../execution-context/Heap";
import { ESBuiltinFunction } from "../Function/Function";
import { Math as ESMath } from "../math/Math";
import { createConsoleModel } from "../node/console";
import { ESObject } from "../Object";
import { executeCommonJS } from "../require/commonjs";
import { createModuleResolver } from "../require/resolution";
import { ESString } from "../string/String";
import { choiceOf } from "../symbolic";
import { Any, FunctionBinding, isESString, isThrownValue, Undefined } from "../types";

type CapturedSource = { text: string; sha256: string };
type PackageScope = { filename: string; source?: CapturedSource };

export type RuntimeOptions = {
  script: string;
  args: string[];
  maxSteps: number;
  runtime: "node@24.21.0";
};

export type FileExecution = {
  input: {
    runtime: "node@24.21.0";
    filename: string;
    args: string[];
    cwd: string;
    source: CapturedSource;
    packageScopes: PackageScope[];
  };
  initial: TExecutionContext;
  current: TExecutionContext;
  completion?: Any;
  status: "evaluated" | "analysis-stop";
  diagnostic?: string;
};

function capture(filename: string): CapturedSource {
  if (!statSync(filename).isFile()) throw new Error("CLI source acquisition requires a regular file");
  const bytes = readFileSync(filename);
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) {
    throw new Error("CLI source acquisition currently requires valid UTF-8 bytes");
  }
  return { text, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function capturePackageScopes(filename: string): PackageScope[] {
  if (!filename.endsWith(".js")) return [];
  const scopes: PackageScope[] = [];
  // Match the existing pinned-Node resolver's package-scope boundary. These are
  // read-only acquisition records, not a claim that all other files are absent.
  for (let directory = dirname(filename);
       directory !== dirname(directory) && basename(directory) !== "node_modules";
       directory = dirname(directory)) {
    const manifest = join(directory, "package.json");
    try {
      scopes.push({ filename: manifest, source: capture(manifest) });
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      scopes.push({ filename: manifest });
    }
  }
  return scopes;
}

/** Acquire one entry, then execute it entirely inside Prophet's shared VM. */
export function runFile(options: RuntimeOptions, cwd: string): FileExecution {
  const filename = realpathSync(resolve(cwd, options.script));
  const source = capture(filename);
  const packageScopes = capturePackageScopes(filename);
  const input = { runtime: options.runtime, filename, args: options.args.slice(),
    cwd: resolve(cwd), source, packageScopes };
  const consoleModel = createConsoleModel();
  const math = Object.assign(ESObject({
    random: Object.assign(ESBuiltinFunction(ESMath.properties.random.implementation), {
      unknownProperties: "Math.random function API", modeledInheritedProperties: ["call"]
    })
  }, "unmodeled"), { unknownProperties: "Math API" });
  const global = Object.assign(ESObject({
    ...ESInitialGlobal.properties, Math: math, console: consoleModel.module
  }, "unmodeled"), { unknownProperties: "Node globals not captured by the automatic starting environment" });
  Object.assign(global.properties, { global, globalThis: global });
  const initial = ExecutionContext({ global, thisValue: global,
    evaluationBudget: { remaining: options.maxSteps } });
  try {
    if (!filename.endsWith(".cjs") && !filename.endsWith(".js")) {
      throw new Error("CLI entry formats other than .cjs and .js are not yet supported");
    }
    const files: { [filename: string]: string } = { [filename]: source.text };
    for (const scope of packageScopes) if (scope.source) files[scope.filename] = scope.source.text;
    const format = createModuleResolver(files).format(filename);
    const requireFrom = (request: Any, context: TExecutionContext): BranchResult => {
      const choice = choiceOf(request);
      if (choice) return evaluateBranches(choice.condition, context,
        branch => requireFrom(choice.consequent, branch), branch => requireFrom(choice.alternate, branch));
      if (isESString(request) && (request.value === "console" || request.value === "node:console")) {
        return [consoleModel.module, context];
      }
      throw new Error("CLI module loading beyond console and node:console is not yet supported; uncaptured modules are not known absent");
    };
    const require: FunctionBinding = Object.assign(ESBuiltinFunction(function*(_self, args, context) {
      return requireFrom(args.length ? args[0] : Undefined, context);
    }), { unknownProperties: "CommonJS require API" });
    const module = Object.assign(ESObject({ exports: ESObject(), id: ESString("."),
      filename: ESString(filename), path: ESString(dirname(filename)), loaded: ESBoolean(false) }), {
      unknownProperties: "CommonJS module metadata",
      unmodeledPropertyWrites: ["id", "filename", "path", "loaded"]
    });
    // The evaluator consumes its budget in place. Keep that runner bookkeeping
    // separate so the retained initial state still records the initial budget.
    const started = ExecutionContext({ ...initial.value, evaluationBudget: { remaining: options.maxSteps } });
    const execution = executeCommonJS(source.text, filename, started, module, require, format === "ambiguous");
    const [completion, current] = mapCompletions(execution, (value, context) =>
      [value, isThrownValue(value) ? context : writeProperty(module, "loaded", ESBoolean(true), context)]);
    return { input, initial, current, completion, status: "evaluated" };
  } catch (error) {
    return { input, initial, current: analysisFailureContext(error) || initial,
      status: "analysis-stop", diagnostic: error.message || String(error) };
  }
}
