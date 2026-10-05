import { createCommonJSLoader, createPosixPathModel, evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { readMember } from "../src/ASTResolvers";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ExecutionContext, setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { ESObject, isESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { resolveBoolean } from "../src/symbolic";
import { Any, ESNumber, isESString, isThrownValue, isUndefined } from "../src/types";
import { assertPinnedNode, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

const fields = ["root", "dir", "base", "ext", "name"];
function source(body: string) { return `const path = require("node:path/posix");\n${body}`; }

function load(body: string, inputs: { [name: string]: Any } = {}) {
  const model = createPosixPathModel();
  const filename = "/app/path-parse.cjs";
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...inputs }) });
  const [value, context] = createCommonJSLoader({ [filename]: source(body) },
    { builtins: { path: model.module, "path/posix": model.module } }).load(filename, initial);
  expect(isThrownValue(value)).toBe(false);
  expect(isForkedCompletion(value)).toBe(false);
  return { model, value, context, initial };
}

function encoded(value: string | boolean) { return { type: typeof value, value }; }

// The same complete CommonJS source runs in Prophet and pinned Node. The
// interpreted path receives only our declared POSIX host module.
function compare(body: string, expected: string | boolean) {
  withModuleFixture(source(body), filename => {
    expect(nodeModuleObservation(filename)).toEqual({ kind: "return", value: encoded(expected) });
  });
  const result = load(body);
  expect(result.value).toMatchObject({ type: typeof expected, value: expected });
  return result;
}

function compareFields(input: string, expected: string[]) {
  const body = `module.exports = path.parse(${JSON.stringify(input)});`;
  withModuleFixture(source(body), filename => {
    expect(nodeModuleObservation(filename)).toEqual({ kind: "return", value: { type: "object",
      entries: fields.map((name, index) => [name, encoded(expected[index])]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) } });
  });
  const result = load(body);
  if (!isESObject(result.value)) throw new Error("Expected path.parse object");
  const properties = getProperties(result.value, result.context);
  expect(Object.keys(properties)).toEqual(fields);
  fields.forEach((field, index) => expect(properties[field]).toMatchObject(encoded(expected[index])));
}

// Every row supplies the entire observable result: root, dir, base, ext, name.
// parse splits spelling; it does not normalize away '.', '..' or repeated '/'.
for (const [input, ...expected] of [
  ["", "", "", "", "", ""],
  ["/", "/", "/", "", "", ""],
  ["//", "/", "/", "", "", ""],
  ["///", "/", "/", "", "", ""],
  ["file", "", "", "file", "", "file"],
  ["file.txt", "", "", "file.txt", ".txt", "file"],
  ["archive.tar.gz", "", "", "archive.tar.gz", ".gz", "archive.tar"],
  ["/file.txt", "/", "/", "file.txt", ".txt", "file"],
  ["/dir/file.txt", "/", "/dir", "file.txt", ".txt", "file"],
  ["dir/file.txt", "", "dir", "file.txt", ".txt", "file"],
  ["dir/file.txt/", "", "dir", "file.txt", ".txt", "file"],
  ["dir/file.txt///", "", "dir", "file.txt", ".txt", "file"],
  ["//dir///file.txt//", "/", "//dir//", "file.txt", ".txt", "file"],
  ["//file.txt", "/", "/", "file.txt", ".txt", "file"],
  ["///file.txt", "/", "//", "file.txt", ".txt", "file"],
  [".", "", "", ".", "", "."],
  ["..", "", "", "..", "", ".."],
  ["...", "", "", "...", ".", ".."],
  ["....", "", "", "....", ".", "..."],
  ["./", "", "", ".", "", "."],
  ["../", "", "", "..", "", ".."],
  ["/.", "/", "/", ".", "", "."],
  ["/..", "/", "/", "..", ".", "."],
  ["/../", "/", "/", "..", ".", "."],
  ["//..", "/", "/", "..", "", ".."],
  ["/.config", "/", "/", ".config", "", ".config"],
  [".config.json", "", "", ".config.json", ".json", ".config"],
  ["..config", "", "", "..config", ".config", "."],
  [".config.", "", "", ".config.", ".", ".config"],
  ["file.", "", "", "file.", ".", "file"],
  ["file..", "", "", "file..", ".", "file."],
  ["a.b/c", "", "a.b", "c", "", "c"],
  ["a/../b.txt", "", "a/..", "b.txt", ".txt", "b"],
  ["a/./b.txt", "", "a/.", "b.txt", ".txt", "b"],
  ["a/..", "", "a", "..", "", ".."],
  ["a/...", "", "a", "...", ".", ".."],
  ["a//b", "", "a/", "b", "", "b"],
  ["a\\b.txt", "", "", "a\\b.txt", ".txt", "a\\b"],
  ["C:\\dir\\file.txt", "", "", "C:\\dir\\file.txt", ".txt", "C:\\dir\\file"],
  ["a\0b/c\0d.txt", "", "a\0b", "c\0d.txt", ".txt", "c\0d"],
  ["/café/😀.txt", "/", "/café", "😀.txt", ".txt", "😀"],
  ["\ud800/\udc00.\ud800", "", "\ud800", "\udc00.\ud800", ".\ud800", "\udc00"],
  ["/a/file.txt?query#fragment", "/", "/a", "file.txt?query#fragment", ".txt?query#fragment", "file"],
  ["file．txt", "", "", "file．txt", "", "file．txt"],
  [" file.txt ", "", "", " file.txt ", ".txt ", " file"]
]) {
  test(`parse preserves all five fields for ${JSON.stringify(input)}`, () => compareFields(input, expected));
}

test("all short paths over slash, dot and a letter match the pinned parser", () => {
  // This is a bounded spelling matrix, not a second parsing algorithm. One
  // complete straight-line module is shared with Node, avoiding 121 processes.
  const paths = [""];
  let level = [""];
  for (let length = 1; length <= 4; length++) {
    level = level.reduce<string[]>((next, prefix) => next.concat([".", "/", "a"].map(char => prefix + char)), []);
    paths.push(...level);
  }
  expect(paths).toHaveLength(121);
  const body = `module.exports = { ${paths.map((input, index) => `case${index}: path.parse(${JSON.stringify(input)})`).join(",")} };`;
  const expected = withModuleFixture(source(body), filename => nodeModuleObservation(filename));
  const { value, context } = load(body);
  if (!isESObject(value)) throw new Error("Expected path matrix");
  const properties = getProperties(value, context);
  const actual = { kind: "return", value: { type: "object", entries: Object.keys(properties).sort().map(key => {
    const parsed = properties[key];
    if (!isESObject(parsed)) throw new Error("Expected parsed path");
    const parsedFields = getProperties(parsed, context);
    expect(Object.keys(parsedFields)).toEqual(fields);
    return [key, { type: "object", entries: fields.slice().sort().map(field => {
      const value = parsedFields[field];
      if (!isESString(value)) throw new Error("Expected string path field");
      return [field, { type: value.type, value: value.value }];
    }) }];
  }) } };
  expect(actual).toEqual(expected);
});

test("parse returns fresh ordinary mutable objects with Node's own-key order", () => {
  compare(`
    const parsed = path.parse("/site/file.txt");
    const other = path.parse("/site/file.txt");
    parsed.base = "changed";
    parsed.extra = "added";
    const spread = { ...parsed };
    module.exports = parsed !== other && parsed instanceof Object && other.base === "file.txt" &&
      parsed.base === "changed" && parsed.name === "file" && spread.base === "changed" && spread.extra === "added" &&
      Object.prototype.hasOwnProperty.call(other, "root") && Object.prototype.hasOwnProperty.call(other, "dir") &&
      Object.prototype.hasOwnProperty.call(other, "base") && Object.prototype.hasOwnProperty.call(other, "ext") &&
      Object.prototype.hasOwnProperty.call(other, "name") &&
      Object.keys(other).join(",") === "root,dir,base,ext,name" &&
      Object.keys(parsed).join(",") === "root,dir,base,ext,name,extra";
  `, true);
});

test("mutating a parsed result preserves the earlier symbolic heap snapshot", () => {
  const { value, context } = load('module.exports = path.parse("/site/file.txt");');
  if (!isESObject(value)) throw new Error("Expected parse result");
  const previous = setVariablesInScope(context, { parsed: value });
  const [completion, changed] = evaluateCode('parsed.base = "changed"; parsed.extra = "added";', previous);
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(getProperties(value, previous).base).toMatchObject({ value: "file.txt" });
  expect(getProperties(value, previous)).not.toHaveProperty("extra");
  expect(getProperties(value, changed).base).toMatchObject({ value: "changed" });
  expect(getProperties(value, changed).extra).toMatchObject({ value: "added" });
});

test("parse metadata, detached calls and arbitrary receivers match Node", () => {
  compare(`
    const parse = path.parse;
    module.exports = parse.name === "parse" && parse.length === 1 &&
      parse("one.txt").name === "one" && parse.call(null, "/two").base === "two" &&
      parse.call({ parse: function() { throw "wrong receiver"; } }, "three.js").ext === ".js";
  `, true);
});

test("parse is not constructible and its already evaluated arguments keep their effects", () => {
  compare(`
    let trace = "";
    function input() { trace = trace + "A"; return "file.txt"; }
    let caught = false;
    try { new path.parse(input()); } catch (error) { caught = error.name === "TypeError"; }
    module.exports = caught && trace === "A";
  `, true);
});

for (const [args, detail] of [
  ["", "undefined"], ["undefined", "undefined"], ["null", "null"],
  ["1", "type number (1)"], ["-0", "type number (-0)"], ["NaN", "type number (NaN)"],
  ["Infinity", "type number (Infinity)"], ["-Infinity", "type number (-Infinity)"],
  ["true", "type boolean (true)"], ["false", "type boolean (false)"]
]) {
  test(`parse rejects invalid primitive input with Node's exact diagnostic: ${args || "no argument"}`, () => {
    compare(`
      let observed = "no error";
      try { path.parse(${args}); }
      catch (error) { observed = error.name + ":" + error.code + ":" + error.message; }
      module.exports = observed;
    `, `TypeError:ERR_INVALID_ARG_TYPE:The "path" argument must be of type string. Received ${detail}`);
  });
}

test("all argument expressions run before validation, while extra argument values are ignored", () => {
  compare(`
    let trace = "";
    function argument(label, value) { trace = trace + label; return value; }
    let caught = false;
    try { path.parse(argument("A", null), argument("B", {})); }
    catch (error) { caught = error.code === "ERR_INVALID_ARG_TYPE"; trace = trace + "C"; }
    const parsed = path.parse(argument("D", "file.txt"), argument("E", {}));
    module.exports = caught && trace === "ABCDE" && parsed.name === "file";
  `, true);
});

test("an argument-expression throw takes precedence over parse's argument validation", () => {
  compare(`
    function fail() { throw "argument failed"; }
    let caught = false;
    try { path.parse(null, fail()); } catch (error) { caught = error === "argument failed"; }
    module.exports = caught;
  `, true);
});

test("parse uses string primordials and does not consult mutable normalize or the posix alias", () => {
  compare(`
    const parse = path.parse;
    path.normalize = function() { throw "not normalization"; };
    path.posix = { parse: function() { throw "wrong module"; } };
    String.prototype.charCodeAt = function() { throw "not primordial"; };
    String.prototype.slice = function() { throw "not primordial"; };
    module.exports = parse("/a/../b.txt").dir === "/a/.." && parse("file.tar.gz").name === "file.tar";
  `, true);
});

test("the exported parse remains replaceable by ordinary interpreted code", () => {
  const { model, initial, context } = compare(`
    const intrinsic = path.parse;
    const returned = {};
    let observation = "";
    path.parse = function(input) { observation = input + ":" + (this === path); return returned; };
    module.exports = path.parse("item") === returned && observation === "item:true" &&
      intrinsic("/original.txt").base === "original.txt";
  `, true);
  expect(getProperties(model.module, context).parse).not.toBe(getProperties(model.module, initial).parse);
});

test("a symbolic parse replacement preserves interpreted effects and its conditional throw", () => {
  const selected = ESBoolean();
  const body = `
    let calls = 0;
    if (selected) path.parse = function(input) { calls = calls + 1; throw input; };
    let caught = false;
    let extension = "unset";
    try { extension = path.parse("file.txt").ext; } catch (error) { caught = error === "file.txt"; }
    module.exports = {
      proved: selected ? caught && calls === 1 && extension === "unset" : !caught && calls === 0 && extension === ".txt",
      uncertain: caught
    };
  `;
  for (const choice of [true, false]) compare(`const selected = ${choice};\n${body}\nmodule.exports = module.exports.proved;`, true);
  const { value, context } = load(body, { selected });
  if (!isESObject(value)) throw new Error("Expected replacement proofs");
  const properties = getProperties(value, context);
  expect(resolveBoolean(properties.proved as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("finite symbolic choices preserve relationships between every field without deciding the chosen input", () => {
  const selected = ESBoolean();
  const body = `
    const parsed = path.parse(selected ? "/site/readme.txt" : "assets/.config");
    module.exports = {
      proved: selected ? parsed.root === "/" && parsed.dir === "/site" && parsed.base === "readme.txt" &&
        parsed.ext === ".txt" && parsed.name === "readme" :
        parsed.root === "" && parsed.dir === "assets" && parsed.base === ".config" && parsed.ext === "" && parsed.name === ".config",
      uncertain: parsed.ext === ".txt"
    };
  `;
  for (const choice of [true, false]) compare(`const selected = ${choice};\n${body}\nmodule.exports = module.exports.proved;`, true);
  const { value, context } = load(body, { selected });
  if (!isESObject(value)) throw new Error("Expected field proofs");
  const properties = getProperties(value, context);
  expect(resolveBoolean(properties.proved as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("symbolic mutation changes only the selected parsed object and branch", () => {
  const selected = ESBoolean();
  const body = `
    const parsed = path.parse(selected ? "/one.txt" : "/two.js");
    const untouched = path.parse(selected ? "/one.txt" : "/two.js");
    if (selected) parsed.ext = ".changed";
    module.exports = {
      proved: selected ? parsed.ext === ".changed" && untouched.ext === ".txt" : parsed.ext === ".js" && untouched.ext === ".js",
      uncertain: parsed.ext === ".changed",
      fresh: parsed !== untouched
    };
  `;
  for (const choice of [true, false]) compare(`const selected = ${choice};\n${body}\nmodule.exports = module.exports.proved && module.exports.fresh;`, true);
  const { value, context } = load(body, { selected });
  if (!isESObject(value)) throw new Error("Expected mutation proofs");
  const properties = getProperties(value, context);
  expect(resolveBoolean(properties.proved as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.fresh as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("a symbolic valid-or-invalid input preserves catch behavior and later state on both paths", () => {
  const selected = ESBoolean();
  const body = `
    let trace = "before";
    let caught = false;
    let extension = "unset";
    try { extension = path.parse(selected ? "/file.txt" : null).ext; trace = trace + ":parsed"; }
    catch (error) { caught = error.name === "TypeError" && error.code === "ERR_INVALID_ARG_TYPE"; trace = trace + ":caught"; }
    trace = trace + ":after";
    module.exports = {
      proved: selected ? !caught && extension === ".txt" && trace === "before:parsed:after" :
        caught && extension === "unset" && trace === "before:caught:after",
      uncertain: caught
    };
  `;
  for (const choice of [true, false]) compare(`const selected = ${choice};\n${body}\nmodule.exports = module.exports.proved;`, true);
  const { value, context } = load(body, { selected });
  if (!isESObject(value)) throw new Error("Expected failure proofs");
  const properties = getProperties(value, context);
  expect(resolveBoolean(properties.proved as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("an uncaught symbolic parse failure retains separate completions and branch state", () => {
  const selected = ESBoolean();
  const model = createPosixPathModel();
  const [completion, context] = evaluateCode(`
    let progress = 1;
    const parsed = path.parse(selected ? "file.txt" : null);
    progress = 2;
  `, setVariablesInScope(nodeInitialExecutionContext, { selected, path: model.module }));
  expect(isForkedCompletion(completion)).toBe(true);
  let normal = 0, thrown = 0;
  const inspect = (value: Any, branch: TExecutionContext): void => {
    if (isForkedCompletion(value)) {
      inspect(value.consequent[0], value.consequent[1]);
      inspect(value.alternate[0], value.alternate[1]);
    } else if (isThrownValue(value)) {
      thrown += 1;
      expect(readMember(value.value, "name", branch)[0]).toMatchObject({ value: "TypeError" });
      expect(readMember(value.value, "code", branch)[0]).toMatchObject({ value: "ERR_INVALID_ARG_TYPE" });
      expect(resolveBoolean(selected, branch.value.knowledge)).toBe(false);
      expect(branch.value.scope.progress).toMatchObject({ value: 1 });
      expect(branch.value.scope).not.toHaveProperty("parsed");
    } else {
      normal += 1;
      expect(isUndefined(value)).toBe(true);
      expect(resolveBoolean(selected, branch.value.knowledge)).toBe(true);
      expect(branch.value.scope.progress).toMatchObject({ value: 2 });
      expect(readMember(branch.value.scope.parsed, "ext", branch)[0]).toMatchObject({ value: ".txt" });
    }
  };
  inspect(completion, context);
  expect({ normal, thrown }).toEqual({ normal: 1, thrown: 1 });
});

test("an unknown boolean retains the input-specific primitive error message", () => {
  const flag = ESBoolean();
  const { value, context } = load(`
    let message = "no error";
    try { path.parse(flag); } catch (error) { message = error.message; }
    module.exports = flag ? message === 'The "path" argument must be of type string. Received type boolean (true)' :
      message === 'The "path" argument must be of type string. Received type boolean (false)';
  `, { flag });
  expect(resolveBoolean(value as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
});

test("an open numeric input has a known TypeError but an unknown diagnostic string", () => {
  const { value, context } = load(`
    let caught = false;
    let message = "no error";
    try { path.parse(input); }
    catch (error) { caught = error.name === "TypeError" && error.code === "ERR_INVALID_ARG_TYPE"; message = error.message; }
    module.exports = { caught: caught, message: message };
  `, { input: ESNumber() });
  if (!isESObject(value)) throw new Error("Expected error observation");
  const properties = getProperties(value, context);
  expect(properties.caught).toMatchObject({ value: true });
  expect(properties.message).toMatchObject({ type: "string", value: undefined });
});

for (const body of [
  'path.parse({});', 'path.parse([]);', 'path.parse(function() {});',
  'path.parse({ toString: function() { throw "not string coercion"; } });',
  'try { path.parse(null); } catch (error) { error.stack; }',
  'try { path.parse(null); } catch (error) { error.toString(); }',
  'try { path.parse(null); } catch (error) { error.constructor; }'
]) {
  test(`parse keeps unsupported diagnostics and reflection explicit: ${body}`, () => {
    // Verify the implemented parser before accepting a boundary rejection.
    expect(load('module.exports = path.parse("file.txt").ext;').value).toMatchObject({ value: ".txt" });
    expect(() => load(body)).toThrow(/[Pp]ath|Unmodeled (?:host )?property/);
  });
}

test("an open string is an explicit analysis gap, not an interpreted exception or invented parse result", () => {
  expect(load('module.exports = path.parse("file.txt").ext;').value).toMatchObject({ value: ".txt" });
  expect(load('try { path.parse(input); } catch (error) { module.exports = "caught"; }',
    { input: ESString() }).value).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported",
      message: expect.stringContaining("open symbolic path string") });
});

for (const body of [
  'path.parse.name = "changed";', 'path.parse.length = 2;', 'path.parse.caller;', 'path.parse.arguments;',
  'Object.prototype.hasOwnProperty.call(path.parse, "prototype");'
]) test(`parse metadata remains unfinished without a fabricated result: ${body}`, () => {
  expect(load(body).value).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported" });
});
