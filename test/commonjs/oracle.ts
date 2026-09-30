import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync, realpathSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { evaluateCode, evaluateCommonJS, nodeInitialExecutionContext } from "../../src";
import { isForkedCompletion } from "../../src/execution-context/Completion";
import { getProperties } from "../../src/execution-context/Heap";
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
      ? { kind: "throw", error: error.name }
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
    const error = completion.value as { type: string } & WithProperties;
    if (error.type === "object") {
      const name = getProperties(error, context).name;
      if (name) return { kind: "throw", error: concretePrimitive(name) };
    }
    return { kind: "throw", value: encode(completion.value, context) };
  }
  return { kind: "return", value: encode(completion, context) };
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
  return JSON.parse(execFileSync(nodeBinary, ["-e", oracle, filename, observe], {
    encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" }, stdio: ["ignore", "pipe", "pipe"]
  }));
}

export function compareModule(
  source: string,
  observe = "",
  initial: TExecutionContext = nodeInitialExecutionContext
) {
  return withModuleFixture(source, filename => {
    const expected = nodeModuleObservation(filename, observe);
    const [loaded, moduleContext] = evaluateCommonJS(source, filename, initial);
    let actual;
    if (observe && !isThrownValue(loaded) && !isForkedCompletion(loaded)) {
      const [completion, observed] = evaluateCode(
        `var result = (${observe});`,
        setVariablesInScope(moduleContext, { loaded })
      );
      actual = isThrownValue(completion) || isForkedCompletion(completion)
        ? observation(completion, observed)
        : observation(observed.value.scope.result, observed);
    } else {
      actual = observation(loaded, moduleContext);
    }
    expect(actual).toEqual(expected);
    return { loaded, context: moduleContext, actual, filename };
  });
}
