import { join } from "path";
import { createCommonJSLoader, createLegacyURLModel, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ExecutionContext } from "../src/execution-context/ExecutionContext";
import { ESObject } from "../src/Object";
import { resolveBoolean } from "../src/symbolic";
import { isThrownValue } from "../src/types";
import { assertPinnedNode, nodeModuleObservation, withModuleGraphFixture } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

const imports = 'const url = require("url"); const process = require("process");\n';

function compare(sources: { [name: string]: string }, entry = "entry.cjs") {
  return withModuleGraphFixture(sources, (files, directory) => {
    const filename = join(directory, entry);
    expect(nodeModuleObservation(filename)).toEqual({ kind: "return", value: { type: "boolean", value: true } });
    const model = createLegacyURLModel();
    const [value, context] = createCommonJSLoader(files,
      { builtins: { url: model.module, process: model.process } }).load(filename, nodeInitialExecutionContext);
    expect(value).toMatchObject({ type: "boolean", value: true });
    expect(isThrownValue(value)).toBe(false);
    expect(isForkedCompletion(value)).toBe(false);
    return { model, context };
  });
}

test("a throwing emitWarning replacement consumes url.parse's once flag before input validation", () => {
  const { model, context } = compare({ "entry.cjs": imports + `
    const original = process.emitWarning;
    let correctCall = false;
    let caught = false;
    process.emitWarning = function(message, type, code) {
      correctCall = this === process && type === "DeprecationWarning" && code === "DEP0169" &&
        message === '\`url.parse()\` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for \`url.parse()\` vulnerabilities.';
      throw "warning failed";
    };
    try { url.parse(null); } catch (error) { caught = error === "warning failed"; }
    process.emitWarning = original;
    module.exports = correctCall && caught && url.parse("/next").pathname === "/next";
  ` });
  expect(model.warnings.inspectPending(context)[0].warnings).toHaveLength(0);
});

test("a noncallable emitWarning throws a TypeError and also consumes the once flag", () => {
  const { model, context } = compare({ "entry.cjs": imports + `
    const original = process.emitWarning;
    process.emitWarning = null;
    let caught = false;
    try { url.parse(null); } catch (error) {
      caught = error.name === "TypeError" && error.message === "process.emitWarning is not a function";
    }
    process.emitWarning = original;
    module.exports = caught && url.parse("/next").pathname === "/next";
  ` });
  expect(model.warnings.inspectPending(context)[0].warnings).toHaveLength(0);
});

test("url.parse ignores an emitWarning replacement's return value", () => {
  const { model, context } = compare({ "entry.cjs": imports + `
    let calls = 0;
    process.emitWarning = function() { calls = calls + 1; return { pathname: "/replacement" }; };
    const parsed = url.parse("/actual");
    module.exports = parsed.pathname === "/actual" && url.parse(parsed) === parsed && calls === 1;
  ` });
  expect(model.warnings.inspectPending(context)[0].warnings).toHaveLength(0);
});

test("suppressed dependency calls leave the once flag available to a later eligible caller", () => {
  const { model, context } = compare({
    "entry.cjs": imports + `
      let calls = 0;
      process.emitWarning = function() { calls = calls + 1; };
      const dependency = require("./node_modules/pkg/index.cjs");
      const suppressed = dependency() && calls === 0;
      let rejected = false;
      try { url.parse(null); } catch (error) { rejected = error.code === "ERR_INVALID_ARG_TYPE"; }
      const later = dependency() && url.parse("/next").pathname === "/next";
      module.exports = suppressed && rejected && later && calls === 1;
    `,
    "node_modules/pkg/index.cjs": `
      const url = require("url");
      module.exports = function() {
        try { url.parse(null); } catch (error) { return error.code === "ERR_INVALID_ARG_TYPE"; }
        return false;
      };
    `
  });
  expect(model.warnings.inspectPending(context)[0].warnings).toHaveLength(0);
});

test("a source file named node_modules is eligible because the name is not a directory segment", () => {
  compare({ "node_modules": imports + `
    let calls = 0;
    process.emitWarning = function() { calls = calls + 1; };
    module.exports = url.parse("/path").pathname === "/path" && calls === 1;
  ` }, "node_modules");
});

test("conditional warning replacement preserves both failure and once-only scheduling", () => {
  const body = imports + `
    if (flag) process.emitWarning = function() { throw "warning failed"; };
    let caught = false;
    try { url.parse("/first"); } catch (error) { caught = error === "warning failed"; }
    const next = url.parse("/next");
    module.exports = caught === flag && next.pathname === "/next";
  `;
  for (const flag of [true, false]) compare({ "entry.cjs": `const flag = ${flag};\n${body}` });
  const flag = ESBoolean();
  const model = createLegacyURLModel();
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, flag }) });
  const [value, context] = createCommonJSLoader({ "/app/entry.cjs": body },
    { builtins: { url: model.module, process: model.process } }).load("/app/entry.cjs", initial);
  expect(value).toMatchObject({ value: true });
  for (const path of model.warnings.inspectPending(context)) {
    const failed = resolveBoolean(flag, path.knowledge);
    expect(failed).not.toBeUndefined();
    expect(path.warnings).toHaveLength(failed ? 0 : 1);
  }
});
