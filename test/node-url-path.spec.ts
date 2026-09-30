import { createCommonJSLoader, createLegacyURLModel, createPosixPathModel, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { ESObject, isESObject } from "../src/Object";
import { resolveBoolean } from "../src/symbolic";
import { isThrownValue, TESBoolean } from "../src/types";
import { nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";

const functionSource = `
  const url = require("url");
  const path = require("path");
  function requestPath(target) {
    return path.join("/site", path.normalize(url.parse(target).pathname));
  }
`;

function analyze(body: string) {
  const flag = ESBoolean();
  const url = createLegacyURLModel();
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, flag }) });
  const [value, context] = createCommonJSLoader({ "/app/paths.cjs": functionSource + body },
    { builtins: { url: url.module, path: createPosixPathModel().module } }).load("/app/paths.cjs", initial);
  expect(isThrownValue(value)).toBe(false);
  if (!isESObject(value)) throw new Error("Expected proof observations");
  return { url, context, properties: getProperties(value, context) };
}

function nativeProof(body: string) {
  for (const flag of [true, false]) withModuleFixture(`const flag = ${flag};\n${functionSource}${body}
    module.exports = module.exports.proved;`, filename => {
      expect(nodeModuleObservation(filename)).toEqual({ kind: "return", value: { type: "boolean", value: true } });
    });
}

test("a URL-to-path function preserves symbolic routing while removing query and fragment text", () => {
  // Domain: either of two path-only targets, POSIX paths, unchanged intrinsics,
  // an eligible application source, default warning configuration. No file I/O.
  const body = `
    const file = requestPath(flag ? "/public/../file?token=secret#section" : "/other?download=1");
    module.exports = { proved: flag ? file === "/site/file" : file === "/site/other",
      uncertain: file === "/site/file" };
  `;
  nativeProof(body);
  const { url, context, properties } = analyze(body);
  expect(resolveBoolean(properties.proved as TESBoolean, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.uncertain as TESBoolean, context.value.knowledge)).toBeUndefined();
  expect(url.warnings.inspectPending(context)[0].warnings).toHaveLength(1);
  expect(url.warnings.inspectOutput(context)[0].chunks).toHaveLength(0);
});

test("the same function keeps a missing pathname's TypeError correlated with the empty input", () => {
  const body = `
    let failed = false;
    let file;
    try { file = requestPath(flag ? "" : "/file"); }
    catch (error) { failed = error.name === "TypeError" && error.code === "ERR_INVALID_ARG_TYPE"; }
    module.exports = { proved: flag ? failed : !failed && file === "/site/file", uncertain: failed };
  `;
  nativeProof(body);
  const { context, properties } = analyze(body);
  expect(resolveBoolean(properties.proved as TESBoolean, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.uncertain as TESBoolean, context.value.knowledge)).toBeUndefined();
});
