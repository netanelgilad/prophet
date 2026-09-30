import { execFileSync } from "child_process";
import { createCommonJSLoader, createLegacyURLModel, evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { ESObject, isESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { resolveBoolean } from "../src/symbolic";
import { Any, ESNumber, isThrownValue } from "../src/types";
import { assertPinnedNode, nodeModuleObservation, withModuleFixture, withModuleGraphFixture } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

const fields = ["protocol", "slashes", "auth", "host", "port", "hostname", "hash", "search", "query", "pathname", "path", "href"];

function source(body: string) { return `const url = require("node:url");\n${body}`; }

function load(body: string, inputs: { [name: string]: Any } = {}, filename = "/app/url.cjs") {
  const model = createLegacyURLModel();
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...inputs }) });
  const [value, context] = createCommonJSLoader({ [filename]: source(body) },
    { builtins: { url: model.module, process: model.process } }).load(filename, initial);
  expect(isThrownValue(value)).toBe(false);
  expect(isForkedCompletion(value)).toBe(false);
  return { model, value, context, initial };
}

function encoded(value: string | boolean | number | null) {
  return value === null ? { type: "null" } : {
    type: typeof value, value: typeof value === "number" ? String(value) : value
  };
}

function compare(body: string, expected: string | boolean) {
  withModuleFixture(source(body), filename => {
    expect(nodeModuleObservation(filename)).toEqual({ kind: "return", value: encoded(expected) });
  });
  const result = load(body);
  expect(result.value).toMatchObject({ type: typeof expected, value: expected });
  return result;
}

function compareFields(input: string, expected: { [name: string]: string | null }, flags = "") {
  const body = `module.exports = url.parse(${JSON.stringify(input)}${flags});`;
  const complete: { [name: string]: string | null } = {};
  for (const field of fields) complete[field] = null;
  Object.assign(complete, expected);
  withModuleFixture(source(body), filename => {
    expect(nodeModuleObservation(filename)).toEqual({ kind: "return", value: { type: "object",
      entries: fields.slice().sort().map(name => [name, encoded(complete[name])]) } });
  });
  const result = load(body);
  if (!isESObject(result.value)) throw new Error("Expected Url instance");
  const properties = getProperties(result.value, result.context);
  expect(Object.keys(properties)).toEqual(fields);
  for (const field of fields) expect(properties[field]).toMatchObject(complete[field] === null ?
    { type: "null" } : { type: "string", value: complete[field] });
  const pending = result.model.warnings.inspectPending(result.context);
  expect(pending).toHaveLength(1);
  expect(pending[0].warnings).toHaveLength(1);
  expect(pending[0].warnings[0].code).toMatchObject({ value: "DEP0169" });
  return result;
}

for (const [input, pathname, search, query, hash, href] of [
  ["/index.html", "/index.html", null, null, null, "/index.html"],
  ["/a/../b?x=%2F#frag", "/a/../b", "?x=%2F", "x=%2F", "#frag", "/a/../b?x=%2F#frag"],
  ["", null, null, null, null, ""], ["?", null, "?", "", null, "?"], ["#", null, null, null, "#", "#"],
  ["relative", "relative", null, null, null, "relative"],
  ["/a#fragment?still-fragment", "/a", null, null, "#fragment?still-fragment", "/a#fragment?still-fragment"],
  ["//host/x", "//host/x", null, null, null, "//host/x"],
  ["///x", "///x", null, null, null, "///x"],
  ["/bad%escape%2f", "/bad%escape%2f", null, null, null, "/bad%escape%2f"],
  ["\0 \t/x\r\n", "/x", null, null, null, "/x"],
  ["\u00a0\ufeff/x\ufeff", "/x", null, null, null, "/x"],
  ["/a\0b", "/a\0b", null, null, null, "/a\0b"],
  ["/café/😀/\ud800", "/café/😀/\ud800", null, null, null, "/café/😀/\ud800"],
  ["/a b", "/a%20b", null, null, null, "/a%20b"],
  ["/a'b", "/a'b", null, null, null, "/a'b"],
  ["a'b", "a%27b", null, null, null, "a%27b"],
  ["/a'b#x", "/a%27b", null, null, "#x", "/a%27b#x"],
  ["/a\\b?x=\\y#\\z", "/a/b", "?x=%5Cy", "x=%5Cy", "#%5Cz", "/a/b?x=%5Cy#%5Cz"]
] as Array<[string, string | null, string | null, string | null, string | null, string]>) {
  test(`legacy path parsing preserves all returned fields for ${JSON.stringify(input)}`, () => {
    compareFields(input, { pathname, search, query, hash, href,
      path: pathname !== null || search !== null ? (pathname || "") + (search || "") : null });
  });
}

test("falsy query flags preserve string queries and a true slashes flag changes the path fast path", () => {
  compareFields("/a'b?x=y", { pathname: "/a'b", search: "?x=y", query: "x=y", path: "/a'b?x=y", href: "/a'b?x=y" }, ", null, 0");
  compareFields("/a'b?x=y", { pathname: "/a%27b", search: "?x=y", query: "x=y", path: "/a%27b?x=y", href: "/a%27b?x=y" }, ", false, true");
});

test("Url results own exactly the ordinary fields, stay mutable, and keep identity when parsed again", () => {
  const { model, initial, context } = compare(`
    const parsed = url.parse("/before?x=1#part");
    const fresh = url.parse("/before?x=1#part");
    parsed.pathname = "/changed";
    parsed.extra = "custom";
    const copy = { ...parsed };
    module.exports = parsed !== fresh && url.parse(parsed, true, true) === parsed &&
      parsed.pathname === "/changed" && parsed.path === "/before?x=1" && parsed.href === "/before?x=1#part" &&
      fresh.pathname === "/before" && copy.pathname === "/changed" && copy.extra === "custom" &&
      Object.prototype.hasOwnProperty.call(parsed, "pathname") &&
      Object.keys(fresh).join(",") === ${JSON.stringify(fields.join(","))};
  `, true);
  expect(model.warnings.inspectPending(initial)[0].warnings).toHaveLength(0);
  expect(model.warnings.inspectPending(context)[0].warnings).toHaveLength(1);
});

test("module identity, parse metadata, detached calls and call receivers follow Node", () => {
  compare(`
    const parse = url.parse;
    module.exports = url === require("url") && parse.name === "urlParse" && parse.length === 3 &&
      parse("/one").pathname === "/one" && parse.call(null, "/two").pathname === "/two" &&
      parse.call({}, "/three").pathname === "/three";
  `, true);
});

test("constructing the legacy parser is an explicit gap despite Node allowing it", () => {
  withModuleFixture(source('module.exports = new url.parse("/constructed").pathname;'), filename => {
    expect(nodeModuleObservation(filename)).toEqual({ kind: "return", value: encoded("/constructed") });
  });
  expect(() => load('new url.parse("/constructed");')).toThrow(/url\.parse construction/);
});

for (const [argument, detail] of [
  ["undefined", "undefined"], ["null", "null"], ["1", "type number (1)"],
  ["-0", "type number (-0)"], ["NaN", "type number (NaN)"], ["false", "type boolean (false)"]
]) {
  test(`primitive argument failure retains its exact diagnostic and the already scheduled warning: ${argument}`, () => {
    const { model, context } = compare(`
      let result = "missing error";
      try { url.parse(${argument}, true, true); }
      catch (error) { result = error.name + ":" + error.code + ":" + error.message; }
      url.parse("/later");
      module.exports = result;
    `, `TypeError:ERR_INVALID_ARG_TYPE:The "url" argument must be of type string. Received ${detail}`);
    expect(model.warnings.inspectPending(context)[0].warnings).toHaveLength(1);
  });
}

test("finite input choices preserve field correlation and leave the actual path unknown", () => {
  const selected = ESBoolean();
  const body = `
    const parsed = url.parse(selected ? "/one?x=1#first" : "/two?x=2#second");
    module.exports = { proved: selected ? parsed.pathname === "/one" && parsed.query === "x=1" && parsed.hash === "#first" :
      parsed.pathname === "/two" && parsed.query === "x=2" && parsed.hash === "#second", uncertain: parsed.pathname === "/one" };
  `;
  for (const choice of [true, false]) compare(`const selected = ${choice};\n${body}\nmodule.exports = module.exports.proved;`, true);
  const { value, context } = load(body, { selected });
  if (!isESObject(value)) throw new Error("Expected proof object");
  const properties = getProperties(value, context);
  expect(resolveBoolean(properties.proved as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("a conditional call keeps its warning absent on the other path and does not mutate an earlier context", () => {
  const selected = ESBoolean();
  const { model, initial, context } = load('if (selected) url.parse("/selected"); module.exports = true;', { selected });
  const paths = model.warnings.inspectPending(context);
  expect(paths).toHaveLength(2);
  for (const path of paths) {
    const chosen = resolveBoolean(selected, path.knowledge);
    expect(chosen).not.toBeUndefined();
    expect(path.warnings).toHaveLength(chosen ? 1 : 0);
  }
  expect(model.warnings.inspectPending(initial)[0].warnings).toHaveLength(0);
});

test("argument-expression failure does not enter parse or schedule a warning", () => {
  const { model, context } = compare(`
    function input() { throw "before parse"; }
    let caught = false;
    try { url.parse(input()); } catch (error) { caught = error === "before parse"; }
    module.exports = caught;
  `, true);
  expect(model.warnings.inspectPending(context)[0].warnings).toHaveLength(0);
});

function nativeWarnings(body: string, insideNodeModules: boolean) {
  const relative = insideNodeModules ? "node_modules/pkg/index.cjs" : "entry.cjs";
  return withModuleGraphFixture({ [relative]: source(body) }, files => {
    const filename = Object.keys(files)[0];
    const oracle = `
      const warnings = [];
      process.on("warning", function(warning) { warnings.push({ name: warning.name, code: warning.code }); });
      require(process.argv[1]);
      const immediate = warnings.length;
      setImmediate(function() { process.stdout.write(JSON.stringify({ immediate: immediate, warnings: warnings })); });
    `;
    assertPinnedNode();
    return JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
      ["--no-global-search-paths", "-e", oracle, filename], { encoding: "utf8", timeout: 10000,
        env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }, stdio: ["ignore", "pipe", "pipe"] }));
  });
}

for (const insideNodeModules of [false, true]) {
  test(`warning eligibility follows the actual source location (${insideNodeModules ? "node_modules" : "application"})`, () => {
    const body = 'try { url.parse(null); } catch (error) {} url.parse("/one"); url.parse("/two"); module.exports = true;';
    expect(nativeWarnings(body, insideNodeModules)).toEqual({ immediate: 0,
      warnings: insideNodeModules ? [] : [{ name: "DeprecationWarning", code: "DEP0169" }] });
    const { model, context } = load(body, {}, insideNodeModules ? "/app/node_modules/pkg/index.js" : "/app/url.cjs");
    expect(model.warnings.inspectPending(context)[0].warnings).toHaveLength(insideNodeModules ? 0 : 1);
  });
}

test("a call without source metadata cannot invent warning eligibility", () => {
  const model = createLegacyURLModel();
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value, sourceFile: undefined,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, url: model.module }) });
  expect(() => evaluateCode('url.parse("/path");', initial)).toThrow(/known source filename/);
});

for (const body of [
  'url.parse("http://example.test/path");', 'url.parse("mailto:user@example.test");',
  'url.parse("//host/path", false, true);', 'url.parse("//user@host/path");',
  'url.parse("/path?x=1", true);', 'url.parse({});', 'url.parse(function() {});',
  'url.parse("/path").format();', 'url.parse("/path").parse("/other");', 'url.parse("/path").constructor;',
  'url.Url;', 'url.URL;', 'url.parse.name = "changed";',
  'String.prototype.charCodeAt = function() { throw "changed"; }; url.parse("/path");',
  'String.prototype.slice = function() { throw "changed"; }; url.parse(" /path");',
  'try { url.parse(null); } catch (error) { error.toString(); }'
]) {
  test(`unmodeled URL domains and observable mutation remain explicit gaps: ${body}`, () => {
    expect(typeof createLegacyURLModel).toBe("function");
    expect(() => load(body)).toThrow(/URL|[Uu]rl|Unmodeled (?:host )?property/);
  });
}

test("arbitrary open URL strings remain an explicit parser gap", () => {
  expect(typeof createLegacyURLModel).toBe("function");
  expect(() => load("url.parse(input);", { input: ESString() })).toThrow(/URL|[Uu]rl/);
});

test("a conditional String prototype mutation cannot be ignored on the affected path", () => {
  expect(typeof createLegacyURLModel).toBe("function");
  expect(() => load(`
    if (selected) String.prototype.charCodeAt = function() { throw "changed"; };
    url.parse("/path");
  `, { selected: ESBoolean() })).toThrow(/URL|[Uu]rl/);
});

test("unknown numeric input still has a certain TypeError with an unknown diagnostic", () => {
  const { value, context } = load(`
    let caught = false;
    let message = "not reached";
    try { url.parse(input); } catch (error) { caught = error.name === "TypeError" && error.code === "ERR_INVALID_ARG_TYPE"; message = error.message; }
    module.exports = { caught: caught, message: message };
  `, { input: ESNumber() });
  if (!isESObject(value)) throw new Error("Expected error observations");
  const properties = getProperties(value, context);
  expect(properties.caught).toMatchObject({ value: true });
  expect(properties.message).toMatchObject({ type: "string", value: undefined });
});
