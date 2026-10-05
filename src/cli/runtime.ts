// Initialize the existing mutually dependent VM built-ins in their public-entry
// order before importing individual constructors.
import "../index";
import { realpathSync } from "fs";
import { isAbsolute, resolve } from "path";
import { executionBoundaries } from "../execution-context/Completion";
import { analysisFailureContext, markUnsupportedBoundaryObject } from "../execution-context/analysis-failure";
import { ESInitialGlobal } from "../execution-context/ESInitialGlobal";
import { ExecutionContext, TExecutionContext } from "../execution-context/ExecutionContext";
import { ESBuiltinFunction } from "../Function/Function";
import { bindNormal } from "../evaluate";
import { createExternalEvents } from "../external-events";
import { createJobQueue } from "../jobs";
import { Math as ESMath } from "../math/Math";
import { createConsoleModel } from "../node/console";
import { symbolicTCPBind } from "../node/bind";
import { createHTTPModel } from "../node/http";
import { createOpaqueBuiltinModule } from "../node/opaque";
import { createPosixPathModel } from "../node/path";
import { createProcessModel } from "../node/process";
import { createLegacyURLModel } from "../node/url";
import { createWarningModel } from "../node/warnings";
import { ESObject } from "../Object";
import { createCommonJSLoaderFromResolver } from "../require/loader";
import { createModuleResolverFromSource } from "../require/resolution";
import { Any, isESString } from "../types";
import { CapturedSource, captureModuleSources } from "./source-capture";
import { captureFileSystem } from "./filesystem-capture";

export type RuntimeOptions = {
  script: string;
  args: string[];
  maxSteps: number;
  maxEvents?: number;
  runtime: "node@24.21.0";
};

export type FileExecution = {
  input: {
    runtime: "node@24.21.0";
    filename: string;
    args: string[];
    cwd: string;
    source: CapturedSource;
    sources: Map<string, CapturedSource>;
    paths: Map<string, "file" | "directory" | "missing">;
  };
  initial: TExecutionContext;
  current: TExecutionContext;
  completion?: Any;
  status: "evaluated" | "analysis-stop";
  diagnostic?: string;
};

/** Capture reached imports and execute them entirely inside Prophet's shared VM. */
export function runFile(options: RuntimeOptions, cwd: string): FileExecution {
  const maxEvents = options.maxEvents === undefined ? 0 : options.maxEvents;
  if (maxEvents !== 0 && maxEvents !== 1 && maxEvents !== 2) throw new Error("Incoming event bounds other than 0, 1 or 2 are not yet supported");
  const filename = realpathSync(resolve(cwd, options.script));
  const captured = captureModuleSources();
  if (captured.source.readFile(filename) === undefined) {
    throw new Error("CLI entry disappeared before source acquisition");
  }
  const source = captured.files.get(filename)!;
  const input = { runtime: options.runtime, filename, args: options.args.slice(),
    cwd: resolve(cwd), source, sources: captured.files, paths: captured.paths };
  const filesystem = captureFileSystem({ cwd });
  const consoleModel = createConsoleModel();
  const nextTick = createJobQueue();
  const warnings = createWarningModel({ nextTick });
  const cwdValue = filesystem.state.properties.cwd;
  if (!isESString(cwdValue) || typeof cwdValue.value !== "string") {
    throw new Error("Automatic filesystem acquisition did not capture a concrete cwd");
  }
  const processModel = createProcessModel({ cwd: cwdValue.value, warnings });
  const path = createPosixPathModel({ process: processModel.process });
  const url = createLegacyURLModel(warnings);
  markUnsupportedBoundaryObject(filesystem.module);
  const externalEvents = createExternalEvents();
  const http = createHTTPModel(undefined, { bind: symbolicTCPBind, nextTick, externalEvents });
  const math = Object.assign(ESObject({
    random: Object.assign(ESBuiltinFunction(ESMath.properties.random.implementation), {
      unknownProperties: "Math.random function API", modeledInheritedProperties: ["call"]
    })
  }, "unmodeled"), { unknownProperties: "Math API" });
  const global = Object.assign(ESObject({
    ...ESInitialGlobal.properties, Math: math, console: consoleModel.module, process: processModel.process
  }, "unmodeled"), { unknownProperties: "Node globals not captured by the automatic starting environment" });
  Object.assign(global.properties, { global, globalThis: global });
  Object.assign(global, { hostSlots: Object.freeze({ "node.nextTick": nextTick.state,
    "node.fs": filesystem.state, "node.url.deprecation": url.state, externalEvents: externalEvents.state }) });
  const initial = ExecutionContext({ global, thisValue: global,
    evaluationBudget: { remaining: options.maxSteps } });
  try {
    if (!filename.endsWith(".cjs") && !filename.endsWith(".js")) {
      throw new Error("CLI entry formats other than .cjs and .js are not yet supported");
    }
    const resolver = createModuleResolverFromSource(captured.source);
    const loader = createCommonJSLoaderFromResolver({ ...resolver,
      resolve(request, parent) {
        const path = resolver.resolve(request, parent);
        if (path === undefined && parent !== undefined && !isAbsolute(request) &&
            request !== "." && request !== ".." &&
            !request.startsWith("./") && !request.startsWith("../")) {
          throw new Error("CLI unresolved package lookup needs uncaptured NODE_PATH/global search paths");
        }
        return path;
      }
    }, { main: filename, builtins: {
      console: consoleModel.module, http: http.module, events: http.eventsModule,
      // Public Node models share identities and one persistent job queue.
      // Filesystem facts are acquired separately from program source.
      https: createOpaqueBuiltinModule("https"), fs: filesystem.module,
      url: url.module, path: path.module, "path/posix": path.module, process: processModel.process,
      querystring: createOpaqueBuiltinModule("querystring")
    } });
    // The evaluator consumes its budget in place. Keep that runner bookkeeping
    // separate so the retained initial state still records the initial budget.
    const started = ExecutionContext({ ...initial.value, evaluationBudget: { remaining: options.maxSteps } });
    const [completion, current] = bindNormal(loader.load(filename, started), (exports, afterEntry) =>
      bindNormal(nextTick.drain(afterEntry, options.maxSteps), (_value, afterJobs) =>
        bindNormal(externalEvents.explore(afterJobs, maxEvents,
          afterEvent => nextTick.drain(afterEvent, options.maxSteps)), (_event, current) => [exports, current])));
    const stopped = executionBoundaries(completion);
    return { input, initial, current, completion, status: stopped.length ? "analysis-stop" : "evaluated",
      diagnostic: stopped.length ? Array.from(new Set(stopped.map(boundary => boundary.message))).join("; ") : undefined };
  } catch (error) {
    return { input, initial, current: analysisFailureContext(error) || initial,
      status: "analysis-stop", diagnostic: error.message || String(error) };
  }
}
