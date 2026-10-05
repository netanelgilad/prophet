import { createCommonJSLoader, createPosixPathModel, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { ESObject, isESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { resolveBoolean } from "../src/symbolic";
import { Any } from "../src/types";
import { assertPinnedNode, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

function source(body: string) {
  return `const path = require("node:path/posix"); const process = require("node:process");
    process.cwd = function() { return "/declared/cwd"; }; ${body}`;
}
function load(body: string, inputs: { [name: string]: Any } = {}, declared = true) {
  const process = ESObject();
  const model = createPosixPathModel(declared ? { process } : {});
  const global = ESObject({ ...nodeInitialExecutionContext.value.global.properties, process, ...inputs });
  Object.assign(global.properties, { global, globalThis: global });
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value, global });
  const [value, context] = createCommonJSLoader({ "/app/path.cjs": source(body) },
    { builtins: { "path/posix": model.module, process } }).load("/app/path.cjs", initial);
  return { value, context, model, process, initial };
}
function compare(body: string, expected: string | boolean | number) {
  withModuleFixture(source(body), filename => {
    expect(nodeModuleObservation(filename)).toEqual({ kind: "return", value: {
      type: typeof expected, value: typeof expected === "number" ? String(expected) : expected
    } });
  });
  const result = load(body);
  expect(result.value).toMatchObject({ type: typeof expected, value: expected });
  return result;
}

for (const [args, expected] of [
  [[], "/declared/cwd"], [[""], "/declared/cwd"], [["."], "/declared/cwd"],
  [["", ""], "/declared/cwd"], [["../file/"], "/declared/file"],
  [["a", "..", "./b//"], "/declared/cwd/b"], [["/var/lib", "../", "file/"], "/var/file"],
  [["/var/lib", "/../", "file/"], "/file"], [["/ignore", "/absolute/", "leaf"], "/absolute/leaf"],
  [["/../../"], "/"], [["//server///share//"], "/server/share"],
  [["C:\\windows\\name"], "/declared/cwd/C:\\windows\\name"],
  [["/nul\0", "\ud800", "😀"], "/nul\0/\ud800/😀"]
] as Array<[string[], string]>) {
  test(`resolve follows POSIX lexical semantics: ${JSON.stringify(args)}`, () => {
    compare(`module.exports = path.resolve(${args.map(value => JSON.stringify(value)).join(",")});`, expected);
  });
}

test("absolute arguments bypass cwd and all arguments to their left, but expressions already evaluated", () => {
  compare(`let trace = ""; process.cwd = function() { throw "cwd must not run"; };
    function input(value) { trace = trace + "E"; return value; }
    module.exports = path.resolve(input(null), input({}), input("/absolute"), input("child")) === "/absolute/child" && trace === "EEEE";`, true);
  expect(load('module.exports = path.resolve(unknown, "/absolute", "x");', { unknown: ESString() }, false).value)
    .toMatchObject({ value: "/absolute/x" });
});

for (const [args, detail] of [
  ['"/absolute", undefined', 'paths[1]" argument must be of type string. Received undefined'],
  ['null, "relative"', 'paths[0]" argument must be of type string. Received null'],
  ['true, 42, "relative"', 'paths[1]" argument must be of type string. Received type number (42)'],
  ['false', 'paths[0]" argument must be of type string. Received type boolean (false)']
]) {
  test(`resolve validates right-to-left with indexed primitive diagnostics: ${args}`, () => {
    compare(`let message; process.cwd = function() { throw "cwd must not run"; };
      try { path.resolve(${args}); } catch (error) { message = error.name + ":" + error.code + ":" + error.message; }
      module.exports = message;`, 'TypeError:ERR_INVALID_ARG_TYPE:The "' + detail);
  });
}

test("resolve fast paths return the exact absolute cwd string without normalization", () => {
  compare(`process.cwd = function() { return "//raw/../cwd//"; };
    module.exports = path.resolve() === "//raw/../cwd//" && path.resolve("") === "//raw/../cwd//" &&
      path.resolve(".") === "//raw/../cwd//" && path.resolve("", "") === "/cwd";`, true);
});

test("a relative cwd fast-path result causes another current cwd invocation with its effects", () => {
  compare(`let calls = 0;
    process.cwd = function() { calls = calls + 1; process.cwd = function() { calls = calls + 1; return "/second/../actual"; }; return "relative"; };
    module.exports = path.resolve() === "/actual" && calls === 2;`, true);
  compare(`let calls = 0; process.cwd = function() { calls = calls + 1; return ""; };
    module.exports = path.resolve("") === "." && calls === 2;`, true);
  compare(`let calls = 0; process.cwd = function() { calls = calls + 1; return "relative/../cwd"; };
    module.exports = path.resolve("file") === "cwd/file" && calls === 1;`, true);
});

test("cwd method replacements retain the captured process receiver, effects, and throws", () => {
  const { process, context, initial } = compare(`let trace = "";
    process.cwd = function() { trace = trace + (this === process ? "C" : "X"); return "/first"; };
    const first = path.resolve("file");
    process.cwd = function() { trace = trace + "T"; throw "cwd failure"; };
    let caught = false; try { path.resolve("other"); } catch (error) { caught = error === "cwd failure"; }
    module.exports = first === "/first/file" && caught && trace === "CT";`, true);
  expect(getProperties(process, context).cwd).not.toBe(getProperties(process, initial).cwd);
  compare(`process.cwd = null; let message;
    try { path.resolve("relative"); } catch (error) { message = error.name + ":" + error.message; }
    module.exports = message;`, "TypeError:process.cwd is not a function");
});

test("detaching resolve or replacing normalize and posix does not redirect the captured algorithm", () => {
  compare(`const resolve = path.resolve; path.normalize = function() { throw "wrong normalize"; };
    path.posix = {}; String.prototype.charCodeAt = function() { throw "wrong charCodeAt"; };
    String.prototype.slice = function() { throw "wrong slice"; };
    let constructed = false; try { new resolve("/a"); } catch (error) { constructed = error.name === "TypeError"; }
    module.exports = resolve.call({ cwd: function() { throw "wrong receiver"; } }, "a/../b") === "/declared/cwd/b" &&
      resolve.name === "resolve" && resolve.length === 0 && constructed;`, true);
});

test("symbolic paths retain the absolute branch and the invalid-left-argument failure branch", () => {
  const selected = ESBoolean();
  const result = load(`const right = selected ? "/absolute" : "relative"; let output; let caught = false;
    try { output = path.resolve(null, right); } catch (error) { caught = true; output = error.code; }
    module.exports = { proof: selected ? !caught && output === "/absolute" : caught && output === "ERR_INVALID_ARG_TYPE", unknown: caught };`, { selected });
  if (!isESObject(result.value)) throw new Error("Expected proof object");
  const values = getProperties(result.value, result.context);
  expect(resolveBoolean(values.proof as ReturnType<typeof ESBoolean>, result.context.value.knowledge)).toBe(true);
  expect(resolveBoolean(values.unknown as ReturnType<typeof ESBoolean>, result.context.value.knowledge)).toBeUndefined();
});

test("symbolic cwd results and fast-path eligibility preserve state and mandatory unknowns", () => {
  const selected = ESBoolean();
  const result = load(`let calls = 0; process.cwd = function() { calls = calls + 1; return selected ? "/chosen" : "relative"; };
    const resolved = path.resolve(selected ? "." : "file");
    module.exports = { proof: selected ? resolved === "/chosen" && calls === 1 : resolved === "relative/file" && calls === 1,
      unknown: resolved === "/chosen" };`, { selected });
  if (!isESObject(result.value)) throw new Error("Expected proof object");
  const values = getProperties(result.value, result.context);
  expect(resolveBoolean(values.proof as ReturnType<typeof ESBoolean>, result.context.value.knowledge)).toBe(true);
  expect(resolveBoolean(values.unknown as ReturnType<typeof ESBoolean>, result.context.value.knowledge)).toBeUndefined();
});

test("a symbolic cwd return may throw on one branch without losing the successful result", () => {
  const selected = ESBoolean();
  const result = load(`process.cwd = function() { if (selected) return "/ok"; throw "failure"; };
    let output; try { output = path.resolve("file"); } catch (error) { output = error; }
    module.exports = selected ? output === "/ok/file" : output === "failure";`, { selected });
  expect(resolveBoolean(result.value as ReturnType<typeof ESBoolean>, result.context.value.knowledge)).toBe(true);
});

test("undeclared cwd, open strings, nonstring cwd results and Win32 stay explicit boundaries", () => {
  expect(load('path.resolve("relative");', {}, false).value).toMatchObject({ type: 'ExecutionBoundary', message: expect.stringMatching(/cwd environment/) });
  expect(load('path.resolve();', {}, false).value).toMatchObject({ type: 'ExecutionBoundary', message: expect.stringMatching(/cwd environment/) });
  expect(load('path.resolve(unknown);', { unknown: ESString() }).value).toMatchObject({ type: 'ExecutionBoundary', message: expect.stringMatching(/open symbolic path/) });
  expect(load('process.cwd = function() { return unknown; }; path.resolve("file");', { unknown: ESString() }).value).toMatchObject({ type: 'ExecutionBoundary', message: expect.stringMatching(/symbolic cwd/) });
  expect(load('process.cwd = function() { return {}; }; path.resolve("file");').value).toMatchObject({ type: 'ExecutionBoundary', message: expect.stringMatching(/non-string cwd/) });
  expect(() => load('path.resolve({});')).toThrow(/object\/function argument diagnostics/);
  expect(load('path.win32.resolve("C:\\\\file");').value).toMatchObject({ type: 'ExecutionBoundary', message: expect.stringMatching(/Node POSIX path API/) });
});

test("resolve handles long concrete argument lists iteratively", () => {
  const args = Array.from({ length: 3000 }, (_unused, index) => index % 2 ? '".."' : '"a"');
  compare(`module.exports = path.resolve(${args.join(",")});`, "/declared/cwd");
});


test("the second cwd call after a failed fast path preserves a replacement's throw", () => {
  compare(`let calls = 0;
    process.cwd = function() { calls = calls + 1; process.cwd = function() { calls = calls + 1; throw "second call"; }; return "relative"; };
    let caught = false; try { path.resolve("."); } catch (error) { caught = error === "second call"; }
    module.exports = caught && calls === 2;`, true);
});

test("replacing global process leaves the captured original process identity in use", () => {
  compare(`globalThis.process = { cwd: function() { throw "replacement global"; } };
    const retained = path.resolve("file") === "/declared/cwd/file";
    globalThis.process = process; module.exports = retained;`, true);
});

test("factory options cannot later redirect the captured process object", () => {
  const process = ESObject();
  const options = { process };
  const model = createPosixPathModel(options);
  options.process = ESObject();
  const [value] = createCommonJSLoader({ "/app/path.cjs": source('module.exports = path.resolve("file");') },
    { builtins: { "path/posix": model.module, process } }).load("/app/path.cjs", nodeInitialExecutionContext);
  expect(value).toMatchObject({ value: "/declared/cwd/file" });
});

test("cwd property choices preserve invocation or catchable non-callable failure", () => {
  const selected = ESBoolean();
  const result = load(`process.cwd = selected ? function() { return "/yes"; } : null;
    let value; let caught = false; try { value = path.resolve("file"); } catch (error) { caught = error.name === "TypeError"; }
    module.exports = selected ? value === "/yes/file" && !caught : caught;`, { selected });
  expect(resolveBoolean(result.value as ReturnType<typeof ESBoolean>, result.context.value.knowledge)).toBe(true);
});


test("symbolic fast-path cwd results retain one versus two calls on their original conditions", () => {
  const selected = ESBoolean();
  const result = load(`let calls = 0; process.cwd = function() { calls = calls + 1; return selected ? "//absolute//" : "relative"; };
    const result = path.resolve("");
    module.exports = selected ? result === "//absolute//" && calls === 1 : result === "relative" && calls === 2;`, { selected });
  expect(resolveBoolean(result.value as ReturnType<typeof ESBoolean>, result.context.value.knowledge)).toBe(true);
});
