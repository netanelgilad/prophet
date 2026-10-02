import { createCommonJSLoader, createFileSystemModel, fileSystemDirectory, fileSystemFile,
  isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { effectPaths } from "../src/effects";
import { ExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { ESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { resolveBoolean, selectValue } from "../src/symbolic";
import { Any, ESNull, ESNumber, isThrownValue, TESBoolean, WithProperties } from "../src/types";

// These inputs are stable effective-access and descriptor-availability facts,
// not Unix mode bits or a simulated user/group database. Names and contents are
// closed, with no symlinks, namespace races, or failures after a successful open.
function analyze(root: Any, globals: { [name: string]: Any }, source: string,
  environment: { cwd?: string; fileDescriptorsAvailable?: TESBoolean; platform?: "linux" | "darwin" } = {}) {
  const filesystem = createFileSystemModel({ root, ...environment });
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...globals }) });
  const [value, context] = createCommonJSLoader({ "/app/check.cjs": `const fs = require("fs");\n${source}` },
    { builtins: { fs: filesystem.module } }).load("/app/check.cjs", initial);
  expect(isThrownValue(value)).toBe(false);
  expect(isForkedCompletion(value)).toBe(false);
  return { properties: getProperties(value as WithProperties, context), context, initial, filesystem };
}

function expectProof(result: ReturnType<typeof analyze>, names = ["proved"]) {
  for (const name of names) {
    expect(resolveBoolean(result.properties[name] as TESBoolean, result.context.value.knowledge)).toBe(true);
  }
}

test("an unreadable file still exists and can be statted, but each read throws its own EACCES error", () => {
  const root = fileSystemDirectory({ secret: fileSystemFile("private", { readable: ESBoolean(false) }) });
  const result = analyze(root, {}, `
    let first, second;
    try { fs.readFileSync("/secret", "utf8"); } catch (error) { first = error; }
    try { fs.readFileSync("/secret"); } catch (error) { second = error; }
    module.exports = { proved: fs.existsSync("/secret") && fs.statSync("/secret").isFile() &&
      first !== second && first.name === "Error" && first.code === "EACCES" && first.errno === -13 &&
      first.syscall === "open" && first.path === "/secret" &&
      first.message === "EACCES: permission denied, open '/secret'" &&
      second.code === "EACCES" && second.syscall === "open" };
  `);
  expectProof(result);
  const events = effectPaths(result.context.value.effects, result.context.value.knowledge)[0].events;
  expect(events.filter(event => event.call.operation === "fs.readFileSync").map(event => event.kind))
    .toEqual(["call", "throw", "call", "throw"]);
  expect(result.initial.value.effects).toBeUndefined();
  expect(result.filesystem.inspectRoot(result.initial)).toBe(root);
  expect(result.filesystem.inspectRoot(result.context)).toBe(root);
});

test("directory read permission is checked before the directory-only read error", () => {
  const root = fileSystemDirectory({ locked: fileSystemDirectory({ file: fileSystemFile("child remains accessible") },
    { readable: ESBoolean(false) }) });
  const result = analyze(root, {}, `
    let caught = false;
    try { fs.readFileSync("/locked", "utf8"); }
    catch (error) { caught = error.code === "EACCES" && error.syscall === "open" &&
      error.path === "/locked" && error.errno === -13; }
    module.exports = { proved: caught && fs.existsSync("/locked") && fs.statSync("/locked").isDirectory() &&
      fs.readFileSync("/locked/file", "utf8") === "child remains accessible" };
  `);
  expectProof(result);
});

test("a directory's own search permission does not prevent statting it or opening it for reading", () => {
  const root = fileSystemDirectory({ sealed: fileSystemDirectory({}, { searchable: ESBoolean(false) }) });
  const result = analyze(root, {}, `
    let caught = false;
    try { fs.readFileSync("/sealed", "utf8"); }
    catch (error) { caught = error.code === "EISDIR" && error.syscall === "read" && error.path === undefined; }
    module.exports = { proved: caught && fs.existsSync("/sealed") && fs.statSync("/sealed").isDirectory() };
  `);
  expectProof(result);
});

test("denied directory search hides children from exists and makes stat/read fail on the original path", () => {
  const root = fileSystemDirectory({ sealed: fileSystemDirectory({ file: fileSystemFile("private") },
    { searchable: ESBoolean(false) }) });
  const result = analyze(root, {}, `
    let stat = false, read = false;
    try { fs.statSync("sealed/file"); }
    catch (error) { stat = error.code === "EACCES" && error.syscall === "stat" &&
      error.path === "sealed/file" && error.errno === -13; }
    try { fs.readFileSync("sealed/file", "utf8"); }
    catch (error) { read = error.code === "EACCES" && error.syscall === "open" &&
      error.path === "sealed/file" && error.errno === -13; }
    module.exports = { proved: !fs.existsSync("sealed/file") && !fs.existsSync("sealed/missing") && stat && read };
  `);
  expectProof(result);
});

test("directory search is required before traversing a parent component", () => {
  const root = fileSystemDirectory({ visible: fileSystemFile("public"),
    sealed: fileSystemDirectory({}, { searchable: ESBoolean(false) }) });
  const result = analyze(root, {}, `
    let denied = false;
    try { fs.readFileSync("/sealed/../visible", "utf8"); }
    catch (error) { denied = error.code === "EACCES" && error.path === "/sealed/../visible"; }
    module.exports = { proved: denied && !fs.existsSync("/sealed/../visible") &&
      fs.readFileSync("/visible", "utf8") === "public" };
  `);
  expectProof(result);
});

test("a final slash checks that the final entry is a directory without traversing an explicit dot", () => {
  const root = fileSystemDirectory({ sealed: fileSystemDirectory({}, { searchable: ESBoolean(false) }) });
  const result = analyze(root, {}, `
    let slash = false, dot = false;
    try { fs.readFileSync("/sealed/", "utf8"); }
    catch (error) { slash = error.code === "EISDIR" && error.syscall === "read"; }
    try { fs.statSync("/sealed/."); }
    catch (error) { dot = error.code === "EACCES" && error.syscall === "stat" && error.path === "/sealed/."; }
    module.exports = { proved: slash && dot && fs.existsSync("/sealed/") &&
      fs.statSync("/sealed/").isDirectory() && !fs.existsSync("/sealed/.") };
  `);
  expectProof(result);
});

test("cwd declaration checks the tree structure even when that directory cannot be searched", () => {
  const root = fileSystemDirectory({ public: fileSystemFile("outside"),
    sealed: fileSystemDirectory({ file: fileSystemFile("inside") }, { searchable: ESBoolean(false) }) });
  const result = analyze(root, {}, `
    let denied = false;
    try { fs.readFileSync("file", "utf8"); }
    catch (error) { denied = error.code === "EACCES" && error.path === "file"; }
    module.exports = { proved: denied && !fs.existsSync("file") &&
      fs.statSync("/sealed").isDirectory() && fs.readFileSync("/public", "utf8") === "outside" };
  `, { cwd: "/sealed" });
  expectProof(result);
});

test("relative paths begin at cwd and do not require search access to its ancestors", () => {
  const root = fileSystemDirectory({ cwd: fileSystemDirectory({ file: fileSystemFile("reachable relatively") }) },
    { searchable: ESBoolean(false) });
  const result = analyze(root, {}, `
    let denied = false;
    try { fs.readFileSync("/cwd/file", "utf8"); }
    catch (error) { denied = error.code === "EACCES"; }
    module.exports = { proved: denied && !fs.existsSync("/cwd/file") &&
      fs.existsSync("file") && fs.statSync("file").isFile() &&
      fs.readFileSync("file", "utf8") === "reachable relatively" && fs.statSync("/").isDirectory() };
  `, { cwd: "/cwd" });
  expectProof(result);
});

test("one symbolic file permission stays correlated across repeated encoded and Buffer reads", () => {
  const readable = ESBoolean();
  const root = fileSystemDirectory({ file: fileSystemFile("café 😀", { readable }) });
  const result = analyze(root, { readable }, `
    function read(encoded) {
      try { const value = encoded ? fs.readFileSync("/file", "utf8") : fs.readFileSync("/file");
        return encoded ? value === "café 😀" : value.length === 10; }
      catch (error) { return error.code === "EACCES" ? false : "unexpected"; }
    }
    const first = read(true), second = read(false);
    module.exports = { proved: fs.existsSync("/file") && fs.statSync("/file").isFile() &&
      (readable ? first && second : !first && !second), uncertain: first, again: first === second };
  `);
  expectProof(result, ["proved", "again"]);
  expect(resolveBoolean(result.properties.uncertain as TESBoolean, result.context.value.knowledge)).toBeUndefined();
  expect(resolveBoolean(readable, result.context.value.knowledge)).toBeUndefined();
  const paths = effectPaths(result.context.value.effects, result.context.value.knowledge);
  expect(paths).toHaveLength(2);
  for (const path of paths) {
    const permitted = resolveBoolean(readable, path.knowledge);
    expect(permitted).not.toBeUndefined();
    expect(path.events.filter(event => event.call.operation === "fs.readFileSync").map(event => event.kind))
      .toEqual(["call", permitted ? "return" : "throw", "call", permitted ? "return" : "throw"]);
  }
  expect(result.initial.value.effects).toBeUndefined();
});

test("a symbolic directory search decision is shared by exists, stat and reading", () => {
  const searchable = ESBoolean();
  const root = fileSystemDirectory({ dir: fileSystemDirectory({ file: fileSystemFile("hello") }, { searchable }) });
  const result = analyze(root, { searchable }, `
    const exists = fs.existsSync("/dir/file");
    let stat = false, read = false, statDenied = false, readDenied = false;
    try { stat = fs.statSync("/dir/file").isFile(); }
    catch (error) { statDenied = error.code === "EACCES"; }
    try { read = fs.readFileSync("/dir/file", "utf8") === "hello"; }
    catch (error) { readDenied = error.code === "EACCES"; }
    module.exports = { proved: fs.existsSync("/dir") && fs.statSync("/dir").isDirectory() &&
      (searchable ? exists && stat && read && !statDenied && !readDenied :
        !exists && !stat && !read && statDenied && readDenied), uncertain: exists };
  `);
  expectProof(result);
  expect(resolveBoolean(result.properties.uncertain as TESBoolean, result.context.value.knowledge)).toBeUndefined();
  expect(effectPaths(result.context.value.effects, result.context.value.knowledge)).toHaveLength(2);
});

test("file presence and read permission remain independent symbolic inputs", () => {
  const present = ESBoolean(), readable = ESBoolean();
  const root = fileSystemDirectory({ file: selectValue(present, fileSystemFile("yes", { readable }), ESNull) });
  const result = analyze(root, { present, readable }, `
    const exists = fs.existsSync("/file");
    let content, code;
    try { content = fs.readFileSync("/file", "utf8"); }
    catch (error) { code = error.code; }
    module.exports = { proved: present ? exists && (readable ? content === "yes" && code === undefined : code === "EACCES") :
      !exists && code === "ENOENT", uncertain: content === "yes" };
  `);
  expectProof(result);
  expect(resolveBoolean(result.properties.uncertain as TESBoolean, result.context.value.knowledge)).toBeUndefined();
  const paths = effectPaths(result.context.value.effects, result.context.value.knowledge);
  expect(paths).toHaveLength(3);
  for (const path of paths) {
    if (resolveBoolean(present, path.knowledge) === false) {
      expect(resolveBoolean(readable, path.knowledge)).toBeUndefined();
    }
  }
});

test("false exists from denied search does not establish whether an independently symbolic child is missing", () => {
  const present = ESBoolean();
  const root = fileSystemDirectory({ sealed: fileSystemDirectory({ file: selectValue(present, fileSystemFile("yes"), ESNull) },
    { searchable: ESBoolean(false) }) });
  const result = analyze(root, { present }, `
    let stat = false, read = false;
    try { fs.statSync("/sealed/file"); } catch (error) { stat = error.code === "EACCES"; }
    try { fs.readFileSync("/sealed/file", "utf8"); } catch (error) { read = error.code === "EACCES"; }
    module.exports = { proved: !fs.existsSync("/sealed/file") && stat && read, uncertain: present };
  `);
  expectProof(result);
  expect(resolveBoolean(result.properties.uncertain as TESBoolean, result.context.value.knowledge)).toBeUndefined();
  for (const path of effectPaths(result.context.value.effects, result.context.value.knowledge)) {
    expect(resolveBoolean(present, path.knowledge)).toBeUndefined();
  }
});

test("unavailable file descriptors fail reads with EMFILE without changing existence or stat", () => {
  const root = fileSystemDirectory({ file: fileSystemFile("available contents") });
  const result = analyze(root, {}, `
    let first, second;
    try { fs.readFileSync("/file", "utf8"); } catch (error) { first = error; }
    try { fs.readFileSync("/file"); } catch (error) { second = error; }
    module.exports = { proved: fs.existsSync("/file") && fs.statSync("/file").isFile() && first !== second &&
      first.name === "Error" && first.code === "EMFILE" && first.syscall === "open" && first.path === "/file" &&
      first.errno === -24 && first.message === "EMFILE: too many open files, open '/file'" && second.code === "EMFILE" };
  `, { fileDescriptorsAvailable: ESBoolean(false) });
  expectProof(result);
});

for (const path of ["/missing", "/unreadable", "/directory"]) {
  test(`descriptor exhaustion precedes path lookup and access checks for ${JSON.stringify(path)}`, () => {
    const root = fileSystemDirectory({ unreadable: fileSystemFile("private", { readable: ESBoolean(false) }),
      directory: fileSystemDirectory({}) });
    const result = analyze(root, {}, `
      let caught = false;
      try { fs.readFileSync(${JSON.stringify(path)}, "utf8"); }
      catch (error) { caught = error.code === "EMFILE" && error.syscall === "open" &&
        error.path === ${JSON.stringify(path)} && error.errno === -24; }
      module.exports = { proved: caught };
    `, { fileDescriptorsAvailable: ESBoolean(false) });
    expectProof(result);
  });
}

for (const platform of [undefined, "linux", "darwin"] as Array<undefined | "linux" | "darwin">) {
  test(`empty-path failure priority follows the declared platform (${platform || "default Linux"})`, () => {
    const expected = platform === "darwin" ? "EMFILE" : "ENOENT";
    const result = analyze(fileSystemDirectory({}), {}, `
      let caught = false;
      try { fs.readFileSync("", "utf8"); }
      catch (error) { caught = error.code === ${JSON.stringify(expected)} && error.syscall === "open" && error.path === ""; }
      module.exports = { proved: caught };
    `, { fileDescriptorsAvailable: ESBoolean(false), platform });
    expectProof(result);
  });
}

test("descriptor availability is one stable symbolic fact across reads and remains unknown without a guard", () => {
  const available = ESBoolean();
  const root = fileSystemDirectory({ file: fileSystemFile("yes") });
  const result = analyze(root, { available }, `
    function canRead() {
      try { return fs.readFileSync("/file", "utf8") === "yes"; }
      catch (error) { return error.code === "EMFILE" ? false : "unexpected"; }
    }
    const first = canRead(), second = canRead();
    module.exports = { proved: fs.existsSync("/file") && fs.statSync("/file").isFile() &&
      (available ? first && second : !first && !second), uncertain: first, again: first === second };
  `, { fileDescriptorsAvailable: available });
  expectProof(result, ["proved", "again"]);
  expect(resolveBoolean(result.properties.uncertain as TESBoolean, result.context.value.knowledge)).toBeUndefined();
  expect(resolveBoolean(available, result.context.value.knowledge)).toBeUndefined();
  expect(effectPaths(result.context.value.effects, result.context.value.knowledge)).toHaveLength(2);
  expect(result.filesystem.inspectFileDescriptorsAvailable(result.initial)).toBe(available);
  expect(result.filesystem.inspectFileDescriptorsAvailable(result.context)).toBe(available);
});

test("descriptor availability, file presence and permission preserve their independent conditions", () => {
  const available = ESBoolean(), present = ESBoolean(), readable = ESBoolean();
  const root = fileSystemDirectory({ file: selectValue(present, fileSystemFile("yes", { readable }), ESNull) });
  const result = analyze(root, { available, present, readable }, `
    let content, code;
    try { content = fs.readFileSync("/file", "utf8"); }
    catch (error) { code = error.code; }
    module.exports = { proved: available ? (present ? (readable ? content === "yes" && code === undefined :
      code === "EACCES") : code === "ENOENT") : code === "EMFILE", uncertain: content === "yes" };
  `, { fileDescriptorsAvailable: available });
  expectProof(result);
  expect(resolveBoolean(result.properties.uncertain as TESBoolean, result.context.value.knowledge)).toBeUndefined();
  const paths = effectPaths(result.context.value.effects, result.context.value.knowledge);
  expect(paths).toHaveLength(4);
  for (const path of paths) {
    if (resolveBoolean(available, path.knowledge) === false) {
      expect(resolveBoolean(present, path.knowledge)).toBeUndefined();
      expect(resolveBoolean(readable, path.knowledge)).toBeUndefined();
    }
  }
});

test("null-byte path validation happens before descriptor acquisition", () => {
  const result = analyze(fileSystemDirectory({}), {}, `
    let caught = false;
    try { fs.readFileSync("bad\\0path", "utf8"); }
    catch (error) { caught = error.name === "TypeError" && error.code === "ERR_INVALID_ARG_VALUE"; }
    module.exports = { proved: caught && !fs.existsSync("bad\\0path") };
  `, { fileDescriptorsAvailable: ESBoolean(false) });
  expectProof(result);
});

test("permission setup snapshots its options rather than retaining a mutable host configuration", () => {
  const permissions = { readable: ESBoolean(false) };
  const directoryPermissions = { readable: ESBoolean(true), searchable: ESBoolean(false) };
  const root = fileSystemDirectory({ file: fileSystemFile("secret", permissions),
    dir: fileSystemDirectory({ child: fileSystemFile("secret") }, directoryPermissions) });
  permissions.readable = ESBoolean(true);
  directoryPermissions.searchable = ESBoolean(true);
  const result = analyze(root, {}, `
    let denied = false;
    try { fs.readFileSync("/file", "utf8"); } catch (error) { denied = error.code === "EACCES"; }
    module.exports = { proved: denied && !fs.existsSync("/dir/child") };
  `);
  expectProof(result);
});

test("permission metadata does not reserve directory entry names", () => {
  const root = fileSystemDirectory({ readable: fileSystemFile("first"), searchable: fileSystemFile("second") },
    { readable: ESBoolean(false), searchable: ESBoolean(true) });
  const result = analyze(root, {}, `
    module.exports = { proved: fs.readFileSync("/readable", "utf8") === "first" &&
      fs.readFileSync("/searchable", "utf8") === "second" };
  `);
  expectProof(result);
});

test("permission and descriptor configuration reject values other than VM booleans", () => {
  for (const invalid of [ESString("true"), ESNumber(1), ESNull, true, false, null]) {
    const value = invalid as unknown as TESBoolean;
    expect(() => fileSystemFile("text", { readable: value })).toThrow(/[Bb]oolean|permission|readable/);
    expect(() => fileSystemDirectory({}, { readable: value })).toThrow(/[Bb]oolean|permission|readable/);
    expect(() => fileSystemDirectory({}, { searchable: value })).toThrow(/[Bb]oolean|permission|searchable/);
    expect(() => createFileSystemModel({ root: fileSystemDirectory({}), fileDescriptorsAvailable: value }))
      .toThrow(/[Bb]oolean|descriptor|available/);
  }
});

test("descriptor exhaustion does not silently accept paths outside the modeled length domain", () => {
  for (const path of ["/" + "a".repeat(256), "/a".repeat(512)]) {
    expect(() => analyze(fileSystemDirectory({}), {}, `fs.readFileSync(${JSON.stringify(path)}, "utf8");`,
      { fileDescriptorsAvailable: ESBoolean(false) })).toThrow(/overlong/);
  }
});

test("filesystem setup rejects unmodeled platform selections", () => {
  for (const invalid of ["win32", "freebsd", "", null]) {
    expect(() => createFileSystemModel({ root: fileSystemDirectory({}), platform: invalid as unknown as "linux" }))
      .toThrow(/[Pp]latform/);
  }
});
