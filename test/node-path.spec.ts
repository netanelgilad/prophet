import { createCommonJSLoader, createPosixPathModel, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { ESObject, isESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { resolveBoolean } from "../src/symbolic";
import { Any, ESNumber, isThrownValue } from "../src/types";
import { assertPinnedNode, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

function source(body: string) {
  return `const path = require("node:path/posix");\n${body}`;
}

function load(body: string, inputs: { [name: string]: Any } = {}) {
  const model = createPosixPathModel();
  const filename = "/app/path.cjs";
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...inputs }) });
  const [value, context] = createCommonJSLoader({ [filename]: source(body) },
    { builtins: { path: model.module, "path/posix": model.module } }).load(filename, initial);
  expect(isThrownValue(value)).toBe(false);
  expect(isForkedCompletion(value)).toBe(false);
  return { model, value, context, initial };
}

// The same complete module runs through the supplied VM builtin and a real
// pinned Node process. POSIX lexical path operations do not touch the filesystem.
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

for (const [input, expected] of [
  ["", "."], [".", "."], ["./", "./"], ["a/..", "."], ["a/../", "./"],
  ["///a//./b/../", "/a/"], ["/../../a", "/a"], ["../../a/../b", "../../b"],
  ["//", "/"], ["a\\b/../c", "c"], ["a\0b/./c", "a\0b/c"],
  ["\ud800/./x/../\udc00", "\ud800/\udc00"], ["café/😀/..", "café"],
  ["..foo", "..foo"], ["...", "..."], ["../..", "../.."], ["/a/../../", "/"], ["a/./..//", "./"]
]) {
  test(`POSIX normalize preserves lexical semantics for ${JSON.stringify(input)}`, () => {
    compare(`module.exports = path.normalize(${JSON.stringify(input)});`, expected);
  });
}

test("join handles a long concrete argument list without recursive argument collection", () => {
  const args = Array.from({ length: 3000 }, (_unused, index) => index % 2 ? '".."' : '"a"');
  compare(`module.exports = path.join(${args.join(",")});`, ".");
});

for (const [args, expected] of [
  [[], "."], [["", "", ""], "."], [["a", "/b", "..", "c/"], "a/c/"],
  [["/a", "../../b"], "/b"], [["a", "", "b"], "a/b"],
  [["a/..", ""], "."], [[".", "./"], "./"], [["//", "x"], "/x"],
  [["a\0", "\ud800", "b\\c"], "a\0/\ud800/b\\c"]
] as Array<[string[], string]>) {
  test(`POSIX join concatenates before normalization: ${JSON.stringify(args)}`, () => {
    compare(`module.exports = path.join(${args.map(arg => JSON.stringify(arg)).join(", ")});`, expected);
  });
}

test("POSIX aliases, separators and callable metadata match the declared Node environment", () => {
  compare(`
    module.exports = path === require("path") && path === require("node:path") &&
      path === require("path/posix") && path.posix === path && path.sep === "/" && path.delimiter === ":" &&
      path.normalize.name === "normalize" && path.normalize.length === 1 &&
      path.join.name === "join" && path.join.length === 0;
  `, true);
});

test("detached methods ignore caller receivers and cannot be used as constructors", () => {
  compare(`
    const normalize = path.normalize;
    const join = path.join;
    let normalizedRejected = false;
    let joinedRejected = false;
    try { new normalize("a"); } catch (error) { normalizedRejected = error.name === "TypeError"; }
    try { new join("a"); } catch (error) { joinedRejected = error.name === "TypeError"; }
    module.exports = normalize("a/../b") === "b" && normalize.call(null, "/a/../b") === "/b" &&
      join("a", "b") === "a/b" && join.call({ normalize: function() { throw "wrong receiver"; } }, "a", "b") === "a/b" &&
      normalizedRejected && joinedRejected;
  `, true);
});

for (const [call, detail] of [
  ["path.normalize()", "undefined"], ["path.normalize(null)", "null"],
  ["path.join(\"left\", 1)", "type number (1)"], ["path.normalize(-0)", "type number (-0)"],
  ["path.normalize(NaN)", "type number (NaN)"], ["path.normalize(Infinity)", "type number (Infinity)"],
  ["path.join(false)", "type boolean (false)"], ["path.normalize(true)", "type boolean (true)"]
]) {
  test(`invalid primitive arguments throw the exact Node diagnostic: ${call}`, () => {
    compare(`
      let observation = "missing throw";
      try { ${call}; } catch (error) { observation = error.name + ":" + error.code + ":" + error.message; }
      module.exports = observation;
    `, `TypeError:ERR_INVALID_ARG_TYPE:The "path" argument must be of type string. Received ${detail}`);
  });
}

test("argument expressions finish before join validates and normalize ignores extra values", () => {
  compare(`
    let trace = "";
    function argument(label, value) { trace = trace + label; return value; }
    path.normalize = function(value) { trace = trace + "N"; return value; };
    let caught = false;
    try { path.join(argument("A", null), argument("B", "valid")); }
    catch (error) { caught = error.code === "ERR_INVALID_ARG_TYPE"; trace = trace + "C"; }
    module.exports = caught && trace === "ABC";
  `, true);
  compare(`
    let touched = false;
    function extra() { touched = true; return {}; }
    module.exports = path.normalize("a/../b", extra()) === "b" && touched;
  `, true);
});

test("join reads the captured POSIX object's current normalize and preserves its receiver and arbitrary result", () => {
  const { model, initial, context } = compare(`
    const join = path.join;
    const returned = {};
    let seen = "";
    path.normalize = function(value) { seen = value + ":" + (this === path); return returned; };
    path.posix = { normalize: function() { throw "replacement alias must not redirect join"; } };
    const actual = join.call({ normalize: function() { throw "caller must not redirect join"; } }, "a", "", "b");
    module.exports = actual === returned && seen === "a/b:true";
  `, true);
  expect(getProperties(model.module, context).normalize).not.toBe(getProperties(model.module, initial).normalize);
  expect(getProperties(model.module, initial).posix).toBe(model.module);
});

test("empty joins bypass overridden normalize but a nonempty joined string preserves its effects and throw", () => {
  compare(`
    let calls = 0;
    path.normalize = function(value) { calls = calls + 1; throw value; };
    const empty = path.join() === "." && path.join("", "") === "." && calls === 0;
    let caught = false;
    try { path.join("a", ".."); } catch (error) { caught = error === "a/.."; }
    module.exports = empty && caught && calls === 1;
  `, true);
});

test("the intrinsic path operations do not call mutable String methods", () => {
  compare(`
    String.prototype.charCodeAt = function() { throw "not primordial"; };
    String.prototype.slice = function() { throw "not primordial"; };
    module.exports = path.normalize("a/../b") === "b" && path.join("a", "b") === "a/b";
  `, true);
});

test("a non-callable normalize replacement throws a catchable TypeError only when join invokes it", () => {
  compare(`
    path.normalize = null;
    const empty = path.join() === "." && path.join("", "") === ".";
    let caught = false;
    try { path.join("a", "b"); }
    catch (error) { caught = error.name === "TypeError" && error.message === "posix.normalize is not a function"; }
    module.exports = empty && caught;
  `, true);
});

test("finite symbolic path choices retain correlation, with both proofs and unknown results", () => {
  const selected = ESBoolean();
  const body = `
    const normalized = path.normalize(selected ? "/safe/../one" : "/safe/../two");
    const joined = path.join(selected ? "one" : "two", "..", selected ? "one" : "two");
    module.exports = {
      normalized: selected ? normalized === "/one" : normalized === "/two",
      joined: selected ? joined === "one" : joined === "two",
      uncertain: normalized === "/one"
    };
  `;
  for (const choice of [true, false]) compare(`const selected = ${choice};\n${body}\nmodule.exports = module.exports.normalized && module.exports.joined;`, true);
  const { value, context } = load(body, { selected });
  if (!isESObject(value)) throw new Error("Expected proof object");
  const properties = getProperties(value, context);
  expect(resolveBoolean(properties.normalized as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.joined as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("a small path-building function proves escape for one declared input choice without deciding the unknown choice", () => {
  const parentPath = ESBoolean();
  const body = `
    function servePath(relative) { return path.join("/site", relative); }
    const result = servePath(parentPath ? "../secret" : "asset");
    module.exports = { correlated: parentPath ? result === "/secret" : result === "/site/asset",
      uncertain: result === "/secret" };
  `;
  for (const choice of [true, false]) compare(`const parentPath = ${choice};\n${body}\nmodule.exports = module.exports.correlated;`, true);
  const { value, context } = load(body, { parentPath });
  if (!isESObject(value)) throw new Error("Expected path proof");
  const properties = getProperties(value, context);
  expect(resolveBoolean(properties.correlated as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("conditional normalize replacement preserves interpreted state and throws on only its own path", () => {
  const selected = ESBoolean();
  const { value, context } = load(`
    let calls = 0;
    if (selected) path.normalize = function(value) { calls = calls + 1; throw "stop"; };
    let caught = false;
    let result = "";
    try { result = path.join("a", "b"); } catch (error) { caught = error === "stop"; }
    module.exports = { correlated: caught === selected && (selected ? calls === 1 : calls === 0 && result === "a/b"), uncertain: caught };
  `, { selected });
  if (!isESObject(value)) throw new Error("Expected proof object");
  const properties = getProperties(value, context);
  expect(resolveBoolean(properties.correlated as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("unknown boolean argument errors retain the input-specific diagnostic", () => {
  const flag = ESBoolean();
  const { value, context } = load(`
    let message = "";
    try { path.normalize(flag); } catch (error) { message = error.message; }
    module.exports = flag ? message === 'The "path" argument must be of type string. Received type boolean (true)' :
      message === 'The "path" argument must be of type string. Received type boolean (false)';
  `, { flag });
  expect(resolveBoolean(value as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
});

test("an open symbolic number still throws the known argument error while its message remains unknown", () => {
  const { value, context } = load(`
    let caught = false;
    let message = "no error";
    try { path.normalize(input); }
    catch (error) { caught = error.name === "TypeError" && error.code === "ERR_INVALID_ARG_TYPE"; message = error.message; }
    module.exports = { caught: caught, message: message };
  `, { input: ESNumber() });
  if (!isESObject(value)) throw new Error("Expected error observation");
  const properties = getProperties(value, context);
  expect(properties.caught).toMatchObject({ value: true });
  expect(properties.message).toMatchObject({ type: "string", value: undefined });
});

for (const body of [
  'path.win32;',
  'path.normalize.name = "changed";', 'path.join.length = 1;',
  'path.normalize.caller;', 'path.join.arguments;',
  'Object.prototype.hasOwnProperty.call(path.normalize, "prototype");',
]) {
  test(`unmodeled path APIs and diagnostic/descriptor cases remain explicit gaps: ${body}`, () => {
    // Fail outside the expected error assertion if the model itself is absent.
    expect(typeof createPosixPathModel).toBe("function");
    expect(load(body).value).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported" });
  });
}

for (const [body, input] of [
  ['path.normalize(input);', ESString()], ['path.join("prefix", input);', ESString()]
] as Array<[string, Any]>) {
  test(`open symbolic string remains an explicit analysis gap: ${body}`, () => {
    expect(typeof createPosixPathModel).toBe("function");
    expect(load(body, { input }).value).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported", message: expect.stringContaining("open symbolic path") });
  });
}

for (const body of [
  'path.normalize({});', 'path.join("valid", []);', 'path.normalize(function() {});',
  'try { path.normalize(null); } catch (error) { error.toString(); }',
  'try { path.normalize(null); } catch (error) { error.stack; }',
  'try { path.normalize(null); } catch (error) { error.constructor; }'
]) test(`legacy path diagnostic guard remains an engine failure: ${body}`, () => {
  expect(() => load(body)).toThrow(/[Pp]ath|Unmodeled (?:host )?property/);
});
