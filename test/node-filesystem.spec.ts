import { execFileSync } from "child_process";
import { join } from "path";
import { createCommonJSLoader, createFileSystemModel, fileSystemDirectory, fileSystemFile,
  isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { effectPaths } from "../src/effects";
import { ExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { ESObject, isESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { resolveBoolean, selectValue } from "../src/symbolic";
import { Any, ESNull, isThrownValue } from "../src/types";
import { assertPinnedNode, withModuleGraphFixture } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

const fixtureFiles = {
  "site/index.txt": "hello\n", "site/empty.txt": "", "site/nested/keep.txt": "keep",
  "site/unicode.txt": "café 😀\0tail"
};

function tree(extra: { [name: string]: Any } = {}) {
  return fileSystemDirectory({ sandbox: fileSystemDirectory({ site: fileSystemDirectory({
    "index.txt": fileSystemFile(fixtureFiles["site/index.txt"]),
    "empty.txt": fileSystemFile(""), "unicode.txt": fileSystemFile(fixtureFiles["site/unicode.txt"]),
    nested: fileSystemDirectory({ "keep.txt": fileSystemFile("keep") }), ...extra
  }) }) });
}

function source(body: string) {
  return `const fs = require("node:fs"); const base = __dirname + "/site";\n${body}`;
}

function load(body: string, inputs: { [name: string]: Any } = {}, root: Any = tree()) {
  const model = createFileSystemModel({ root, cwd: "/sandbox/site" });
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...inputs }) });
  const [value, context] = createCommonJSLoader({ "/sandbox/entry.cjs": source(body) },
    { builtins: { fs: model.module } }).load("/sandbox/entry.cjs", initial);
  expect(isThrownValue(value)).toBe(false);
  expect(isForkedCompletion(value)).toBe(false);
  return { model, value, context, initial };
}

// The same complete module runs with an explicit VM tree and with real files in
// an isolated pinned-Node child. Only this oracle writes its temporary fixtures.
function native(body: string) {
  return withModuleGraphFixture({ "entry.cjs": source(body), ...fixtureFiles }, (_files, directory) => {
    assertPinnedNode();
    return JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
      ["--no-global-search-paths", "-e", "process.stdout.write(JSON.stringify(require(process.argv[1])));", join(directory, "entry.cjs")],
      { cwd: join(directory, "site"), encoding: "utf8", timeout: 10000,
        env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }, stdio: ["ignore", "pipe", "pipe"] }));
  });
}

function compare(body: string, expected: boolean | string) {
  expect(native(body)).toBe(expected);
  const result = load(body);
  expect(result.value).toMatchObject({ type: typeof expected, value: expected });
  return result;
}

test("existence comes from one closed tree for files, directories, empty paths and missing entries", () => {
  compare(`module.exports = fs.existsSync(base + "/index.txt") && fs.existsSync(base + "/nested") &&
    fs.existsSync("index.txt") && fs.existsSync(".") && !fs.existsSync(base + "/missing") && !fs.existsSync("");`, true);
});

test("UTF8 reads decode complete contents, including empty files, Unicode and NUL", () => {
  compare(`module.exports = fs.readFileSync(base + "/index.txt", "utf8") === "hello\\n" &&
    fs.readFileSync("empty.txt", "utf-8") === "" &&
    fs.readFileSync(base + "/unicode.txt", "utf8") === "café 😀\\0tail";`, true);
});

test("Stats methods are shared, receiver-sensitive, and ordinary method shadows remain observable", () => {
  compare(`
    const file = fs.statSync(base + "/index.txt");
    const directory = fs.statSync(base + "/nested");
    const isDirectory = file.isDirectory;
    const same = isDirectory === directory.isDirectory && file.isFile === directory.isFile;
    const borrowed = isDirectory.call(directory) && !isDirectory.call(file);
    file.isDirectory = function() { return "replacement"; };
    module.exports = same && borrowed && file.isDirectory() === "replacement" &&
      directory.isDirectory() && !directory.isFile() && file.isFile();
  `, true);
});

for (const [path, expected] of [
  ["nested/../index.txt", "file"], ["./nested//keep.txt", "file"],
  ["missing/../index.txt", "ENOENT"], ["index.txt/../empty.txt", "ENOTDIR"],
  ["index.txt/", "ENOTDIR"], ["index.txt/.", "ENOTDIR"]
]) {
  test(`filesystem component traversal precedes dot-segment simplification: ${path}`, () => {
    compare(`
      const path = ${JSON.stringify(path)};
      let result;
      try { result = fs.statSync(path).isFile() ? "file" : "directory"; }
      catch (error) { result = error.code; }
      module.exports = result === ${JSON.stringify(expected)} && fs.existsSync(path) === ${expected === "file"};
    `, true);
  });
}

for (const [operation, path, code, syscall, errno] of [
  ["statSync", "missing", "ENOENT", "stat", -2],
  ["statSync", "index.txt/child", "ENOTDIR", "stat", -20],
  ["readFileSync", "missing", "ENOENT", "open", -2],
  ["readFileSync", "index.txt/child", "ENOTDIR", "open", -20]
] as Array<[string, string, string, string, number]>) {
  test(`${operation} preserves ${code} code, syscall, original path and errno`, () => {
    compare(`
      let caught = false;
      try { fs.${operation}(${JSON.stringify(path)}); }
      catch (error) { caught = error.name === "Error" && error.code === ${JSON.stringify(code)} &&
        error.syscall === ${JSON.stringify(syscall)} && error.path === ${JSON.stringify(path)} && error.errno === ${errno}; }
      module.exports = caught;
    `, true);
  });
}

for (const encoding of ["", ', "utf8"']) {
  test(`reading a directory throws EISDIR before any successful Buffer result (${encoding || "default"})`, () => {
    compare(`let caught = false;
      try { fs.readFileSync("nested"${encoding}); }
      catch (error) { caught = error.code === "EISDIR" && error.syscall === "read" &&
        error.errno === -21 && error.path === undefined && error.message === "EISDIR: illegal operation on a directory, read"; }
      module.exports = caught;`, true);
  });
}

test("filesystem calls keep their ordering and earlier state when a read throws", () => {
  const { context, initial } = compare(`
    let trace = "";
    function path(label, value) { trace = trace + label; return value; }
    const exists = fs.existsSync(path("E", "index.txt"));
    const directory = fs.statSync(path("S", "nested")).isDirectory();
    try { fs.readFileSync(path("R", "missing")); trace = trace + "wrong"; }
    catch (error) { trace = trace + error.code; }
    module.exports = exists && directory && trace === "ESRENOENT";
  `, true);
  expect(effectPaths(context.value.effects!)[0].events.filter(event => event.kind === "call" &&
    ["fs.existsSync", "fs.statSync", "fs.readFileSync"].includes(event.call.operation)).map(event => event.call.operation))
    .toEqual(["fs.existsSync", "fs.statSync", "fs.readFileSync"]);
  expect(initial.value.effects).toBeUndefined();
});

test("a selected entry's existence, stat and contents retain the same symbolic condition", () => {
  const selected = ESBoolean();
  const root = tree({ optional: selectValue(selected, fileSystemFile("chosen"), ESNull) });
  const { value, context } = load(`
    const exists = fs.existsSync("optional");
    let content = "absent";
    let file = false;
    if (exists) { file = fs.statSync("optional").isFile(); content = fs.readFileSync("optional", "utf8"); }
    module.exports = { proof: selected ? exists && file && content === "chosen" : !exists && content === "absent", uncertain: exists };
  `, { selected }, root);
  if (!isESObject(value)) throw new Error("Expected filesystem observations");
  const properties = getProperties(value, context);
  expect(resolveBoolean(properties.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("finite path choices correlate a successful read with the alternative caught failure", () => {
  const selected = ESBoolean();
  const { value, context } = load(`
    const path = selected ? "index.txt" : "missing";
    let content;
    let caught = false;
    try { content = fs.readFileSync(path, "utf8"); }
    catch (error) { caught = true; content = error.code; }
    module.exports = { proof: selected ? !caught && content === "hello\\n" : caught && content === "ENOENT", uncertain: caught };
  `, { selected });
  if (!isESObject(value)) throw new Error("Expected filesystem observations");
  const properties = getProperties(value, context);
  expect(resolveBoolean(properties.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("finite whole-tree choices and file-versus-directory entries reuse the same branch knowledge", () => {
  const selected = ESBoolean();
  const root = selectValue(selected,
    tree({ choice: fileSystemFile("file") }), tree({ choice: fileSystemDirectory({}) }));
  const { value, context } = load(`
    const stat = fs.statSync("choice");
    module.exports = { proof: fs.existsSync("choice") && (selected ? stat.isFile() && !stat.isDirectory() :
      !stat.isFile() && stat.isDirectory()), uncertain: stat.isFile() };
  `, { selected }, root);
  if (!isESObject(value)) throw new Error("Expected filesystem observations");
  const properties = getProperties(value, context);
  expect(resolveBoolean(properties.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("null-byte paths return false from exists and throw the interpreted validation error elsewhere", () => {
  compare(`
    let stat = false, read = false;
    try { fs.statSync("bad\\0path"); } catch (error) { stat = error.name === "TypeError" && error.code === "ERR_INVALID_ARG_VALUE"; }
    try { fs.readFileSync("bad\\0path", "utf8"); } catch (error) { read = error.name === "TypeError" && error.code === "ERR_INVALID_ARG_VALUE"; }
    module.exports = !fs.existsSync("bad\\0path") && stat && read;
  `, true);
});

test("stat validates the path before consulting options that otherwise remain unsupported", () => {
  compare(`let caught = false;
    try { fs.statSync("bad\\0path", { bigint: true }); }
    catch (error) { caught = error.code === "ERR_INVALID_ARG_VALUE"; }
    module.exports = caught;`, true);
});

test("undefined stat options and null read options preserve default failure behavior", () => {
  compare(`let caught = false;
    try { fs.readFileSync("missing", null); } catch (error) { caught = error.code === "ENOENT" && error.syscall === "open"; }
    module.exports = caught && fs.statSync("index.txt", undefined).isFile();`, true);
});

test("module aliases, metadata, detached calls and explicit call receivers match Node", () => {
  compare(`
    const exists = fs.existsSync, stat = fs.statSync, read = fs.readFileSync;
    module.exports = fs === require("fs") && exists.name === "existsSync" && exists.length === 1 &&
      stat.name === "statSync" && stat.length === 1 && read.name === "readFileSync" && read.length === 2 &&
      exists.call(null, "index.txt") && stat.call({}, "nested").isDirectory() &&
      read.call(null, "index.txt", "utf8") === "hello\\n" && stat("index.txt") !== stat("index.txt");
  `, true);
});

test("successful default reads keep an explicit Buffer-return boundary", () => {
  expect(native('module.exports = fs.readFileSync("index.txt").toString("utf8") === "hello\\n";')).toBe(true);
  expect(typeof createFileSystemModel).toBe("function");
  expect(() => load('fs.readFileSync("index.txt");')).toThrow(/Buffer|buffer/);
});

test("read options are considered before a null-byte path", () => {
  expect(typeof createFileSystemModel).toBe("function");
  expect(() => load('fs.readFileSync("bad\\0path", { encoding: "utf8" });')).toThrow(/options/);
});

test("invalid existsSync argument types retain an explicit deprecation-warning gap", () => {
  expect(native('module.exports = fs.existsSync(null);')).toBe(false);
  expect(typeof createFileSystemModel).toBe("function");
  expect(() => load('fs.existsSync(null);')).toThrow(/[Ff]ilesystem|[Ff]ile system|path|DEP0187/);
});

for (const body of [
  'fs.statSync("index.txt", { throwIfNoEntry: false });',
  'fs.readFileSync("index.txt", "hex");', 'fs.readFileSync(3, "utf8");', 'fs.statSync({});',
  'fs.statSync("index.txt").size;', 'fs.statSync("index.txt").mode = 0;',
  'fs.statSync("index.txt")._checkModeProperty = function() { return true; };',
  'fs.statSync("index.txt").__proto__ = {};',
  'fs.statSync("index.txt").isDirectory.call({});',
  'fs.openSync = function() { throw "replacement"; }; fs.readFileSync("missing");',
  'Object.prototype.encoding = "hex"; fs.readFileSync("missing");'
]) {
  test(`unmodeled filesystem behavior is an explicit analysis boundary: ${body}`, () => {
    expect(typeof createFileSystemModel).toBe("function");
    expect(() => load(body)).toThrow(/[Ff]ilesystem|[Ff]ile system|Unmodeled|Stats|encoding|options|receiver|helper/);
  });
}

test("constructing the public filesystem functions remains an explicit boundary", () => {
  expect(native(`module.exports = typeof new fs.existsSync("index.txt") === "object" &&
    new fs.statSync("nested").isDirectory() && typeof new fs.readFileSync("index.txt", "utf8") === "object";`)).toBe(true);
  expect(typeof createFileSystemModel).toBe("function");
  for (const call of ['new fs.existsSync("index.txt")', 'new fs.statSync("nested")', 'new fs.readFileSync("index.txt", "utf8")']) {
    expect(() => load(call + ";")).toThrow(/[Cc]onstruct/);
  }
});

test("open symbolic filesystem paths are explicit gaps", () => {
  expect(typeof createFileSystemModel).toBe("function");
  expect(() => load('fs.existsSync(input);', { input: ESString() })).toThrow(/[Ff]ilesystem|[Ff]ile system|symbolic.*path/);
});

test("filesystem setup rejects invalid entry names and names colliding after UTF8 encoding", () => {
  for (const name of ["", ".", "..", "a/b", "a\0b"]) {
    expect(() => fileSystemDirectory({ [name]: fileSystemFile("text") })).toThrow(/single-component names/);
  }
  expect(() => fileSystemDirectory({ ["a".repeat(256)]: fileSystemFile("text") })).toThrow(/overlong/);
  expect(() => fileSystemDirectory({ "\ud800": ESNull, "\ufffd": ESNull })).toThrow(/UTF-8 entry name collision/);
});

test("filesystem setup requires a directory root and an existing canonical cwd on every branch", () => {
  const selected = ESBoolean();
  expect(() => createFileSystemModel({ root: fileSystemFile("text") })).toThrow(/directory roots/);
  expect(() => createFileSystemModel({ root: selectValue(selected, tree(), ESNull) })).toThrow(/directory roots/);
  for (const cwd of ["site", "/sandbox/./site", "/sandbox/site/", "/sandbox/missing", "/sandbox/site/index.txt"]) {
    expect(() => createFileSystemModel({ root: tree(), cwd })).toThrow(/cwd/);
  }
  const root = selectValue(selected, tree(), fileSystemDirectory({}));
  expect(() => createFileSystemModel({ root, cwd: "/sandbox/site" })).toThrow(/cwd/);
});
