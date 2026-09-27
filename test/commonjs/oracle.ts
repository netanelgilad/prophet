import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync, realpathSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { dirname, isAbsolute, join, relative, resolve } from "path";
import {
  createCommonJSLoader, evaluateCode, evaluateCommonJS, nodeInitialExecutionContext
} from "../../src";
import { isForkedCompletion } from "../../src/execution-context/Completion";
import { getProperties } from "../../src/execution-context/Heap";
import { readMember } from "../../src/ASTResolvers";
import {
  setVariablesInScope, TExecutionContext
} from "../../src/execution-context/ExecutionContext";
import { Any, isThrownValue, WithProperties } from "../../src/types";
import { concretePrimitive } from "../test262/runner";

export const nodeVersion = "v24.21.0";
const nodeBinary = process.env.PROPHET_NODE_BINARY || process.execPath;
let versionChecked = false;

export function assertPinnedNode() {
  if (versionChecked) return;
  const actual = execFileSync(nodeBinary, ["--version"], { encoding: "utf8" }).trim();
  if (actual !== nodeVersion) {
    throw new Error(
      `CommonJS compatibility requires Node ${nodeVersion}; ${nodeBinary} is ${actual}. ` +
      "Run Jest with the pinned release or set PROPHET_NODE_BINARY to that release's executable."
    );
  }
  versionChecked = true;
}

// The child loads an actual temporary file through Node's public require API.
// There is no Node execution fallback in the interpreted path below.
const oracle = `
  function encode(value) {
    if (value === null) return { type: "null" };
    if (typeof value === "undefined") return { type: "undefined" };
    if (typeof value === "number") {
      return { type: "number", value: Object.is(value, -0) ? "-0" : String(value) };
    }
    if (typeof value === "boolean" || typeof value === "string") {
      return { type: typeof value, value: value };
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      return { type: "object", entries: Object.keys(value).sort().map(function(key) {
        return [key, encode(value[key])];
      }) };
    }
    throw new Error("The compatibility observation must contain only primitives and plain objects");
  }
  let observation;
  try {
    const loaded = require(process.argv[1]);
    const value = process.argv[2]
      ? Function("loaded", "return (" + process.argv[2] + ");")(loaded)
      : loaded;
    observation = { kind: "return", value: encode(value) };
  } catch (error) {
    observation = error instanceof Error
      ? Object.assign({ kind: "throw", error: error.name },
          error.code === undefined ? {} : { code: error.code })
      : { kind: "throw", value: encode(error) };
  }
  process.stdout.write(JSON.stringify(observation));
`;

function encode(value: Any, context: TExecutionContext): object {
  const tagged = value as { type: string; expression?: { kind: string } };
  if (tagged.expression && tagged.expression.kind === "select") {
    throw new Error("Concrete compatibility observation contains a symbolic selection");
  }
  if (tagged.type === "object") {
    const properties = getProperties(value as WithProperties, context);
    return {
      type: "object",
      entries: Object.keys(properties).sort().map(key => [key, encode(properties[key], context)])
    };
  }
  const primitive = concretePrimitive(value);
  if (primitive === null) return { type: "null" };
  if (primitive === undefined) return { type: "undefined" };
  if (typeof primitive === "number") {
    return { type: "number", value: Object.is(primitive, -0) ? "-0" : String(primitive) };
  }
  return { type: typeof primitive, value: primitive };
}

function observation(completion: Any, context: TExecutionContext): object {
  if (isForkedCompletion(completion)) {
    throw new Error("Concrete CommonJS execution produced a symbolic completion");
  }
  if (isThrownValue(completion)) {
    const error = completion.value as { type: string; errorData?: boolean } & WithProperties;
    if (error.type === "object") {
      const properties = getProperties(error, context);
      // Error instances inherit their name. Partial loader errors carry an
      // explicit marker until their complete Error model is implemented.
      // A plain thrown object merely named "Error" remains a thrown value.
      if (error.errorData || error.unknownProperties === "CommonJS loader error fields") {
        const [name] = readMember(error, "name", context);
        if (isThrownValue(name) || isForkedCompletion(name)) {
          throw new Error("Concrete CommonJS error-name observation did not complete normally");
        }
        return {
          kind: "throw", error: concretePrimitive(name),
          // Do not read an absent code through a partial host error's guard.
          ...(properties.code ? { code: concretePrimitive(properties.code) } : {})
        };
      }
    }
    return { kind: "throw", value: encode(completion.value, context) };
  }
  return { kind: "return", value: encode(completion, context) };
}

function exportedObservation(loaded: Any, context: TExecutionContext, observe: string): object {
  if (!observe || isThrownValue(loaded) || isForkedCompletion(loaded)) {
    return observation(loaded, context);
  }
  const [completion, observed] = evaluateCode(
    `var result = (${observe});`, setVariablesInScope(context, { loaded })
  );
  return isThrownValue(completion) || isForkedCompletion(completion)
    ? observation(completion, observed)
    : observation(observed.value.scope.result, observed);
}

export function withModuleFixture<T>(source: string, run: (filename: string) => T): T {
  // The source API takes an already resolved filename; resolving this fixture
  // belongs to test setup, not the VM (e.g. /var -> /private/var on macOS).
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "prophet-commonjs-")));
  const filename = join(directory, "fixture.cjs");
  writeFileSync(filename, source);
  try {
    return run(filename);
  } finally {
    unlinkSync(filename);
    rmdirSync(directory);
  }
}

export function nodeModuleObservation(filename: string, observe = ""): object {
  // Jest 24 can still enter a test body after a failing beforeAll. Guard the
  // oracle itself so an incorrect release never evaluates a fixture.
  assertPinnedNode();
  return JSON.parse(execFileSync(nodeBinary, ["--no-global-search-paths", "-e", oracle, filename, observe], {
    encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }, stdio: ["ignore", "pipe", "pipe"]
  }));
}

export function withModuleGraphFixture<T>(
  sources: { [relativeFilename: string]: string },
  run: (files: { [absoluteFilename: string]: string }, directory: string) => T
): T {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "prophet-commonjs-graph-")));
  const files: { [absoluteFilename: string]: string } = {};
  const writtenFiles: string[] = [];
  const directories = new Set<string>();
  try {
    for (const name of Object.keys(sources)) {
      const filename = resolve(directory, name);
      const within = relative(directory, filename);
      if (isAbsolute(name) || within === ".." || within.startsWith("../") || !within) {
        throw new Error("CommonJS fixture filenames must stay inside their temporary directory");
      }
      let parent = dirname(filename);
      while (parent !== directory) {
        directories.add(parent);
        parent = dirname(parent);
      }
      mkdirSync(dirname(filename), { recursive: true });
      writeFileSync(filename, sources[name]);
      writtenFiles.push(filename);
      files[filename] = sources[name];
    }
    return run(files, directory);
  } finally {
    for (const filename of writtenFiles) unlinkSync(filename);
    for (const path of Array.from(directories).sort((a, b) => b.length - a.length)) rmdirSync(path);
    rmdirSync(directory);
  }
}

export function compareModuleGraph(
  sources: { [relativeFilename: string]: string },
  entry = "entry.cjs",
  observe = "",
  initial: TExecutionContext = nodeInitialExecutionContext
) {
  return withModuleGraphFixture(sources, (files, directory) => {
    const filename = join(directory, entry);
    const expected = nodeModuleObservation(filename, observe);
    const loader = createCommonJSLoader(files);
    const [loaded, moduleContext] = loader.load(filename, initial);
    const actual = exportedObservation(loaded, moduleContext, observe);
    expect(actual).toEqual(expected);
    return { loaded, context: moduleContext, actual, filename, loader };
  });
}

export function compareModule(
  source: string,
  observe = "",
  initial: TExecutionContext = nodeInitialExecutionContext
) {
  return withModuleFixture(source, filename => {
    const expected = nodeModuleObservation(filename, observe);
    const [loaded, moduleContext] = evaluateCommonJS(source, filename, initial);
    const actual = exportedObservation(loaded, moduleContext, observe);
    expect(actual).toEqual(expected);
    return { loaded, context: moduleContext, actual, filename };
  });
}
