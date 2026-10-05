import "../src";
import { execFileSync } from "child_process";
import { chmodSync, mkdtempSync, mkdirSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from "fs";
import { removeSync } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { createCommonJSLoader, createFileSystemModel, fileSystemDirectory, fileSystemUnobservedFile, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { captureFileSystem } from "../src/cli/filesystem-capture";
import { ExecutionContext, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { ESObject } from "../src/Object";
import { resolveBoolean } from "../src/symbolic";
import { assertPinnedNode } from "./commonjs/oracle";

const fs: typeof import("fs") = require("fs");
let directory: string;
beforeAll(assertPinnedNode);
beforeEach(() => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), "prophet-fs-capture-")));
  mkdirSync(join(directory, "docs"));
  writeFileSync(join(directory, "index.txt"), "hello 😀\0tail");
});
afterEach(() => { removeSync(directory); });

function captured(options: Partial<Parameters<typeof captureFileSystem>[0]> = {}) {
  return captureFileSystem({ cwd: directory, fileDescriptorsAvailable: ESBoolean(true), ...options });
}
function run(capture: ReturnType<typeof captureFileSystem>, body: string, context = nodeInitialExecutionContext) {
  return createCommonJSLoader({ "/entry.cjs": 'const fs = require("fs"); ' + body },
    { builtins: { fs: capture.module } }).load("/entry.cjs", context);
}
function compare(body: string) {
  const native = execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ["--no-global-search-paths", "-e", 'const fs = require("fs"); ' + body + '; process.stdout.write(JSON.stringify(module.exports));'],
    { cwd: directory, encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  const capture = captured();
  const [value, context] = run(capture, body);
  expect(value).toMatchObject({ type: "boolean", value: JSON.parse(native) });
  expect(JSON.parse(native)).toBe(true);
  return { capture, context };
}
function at(capture: ReturnType<typeof captureFileSystem>, path: string, context: TExecutionContext) {
  let node = capture.inspectRoot(context) as ReturnType<typeof ESObject>;
  for (const component of path.split("/").filter(Boolean)) node = getProperties(node, context)[component] as typeof node;
  return node;
}

test("observed UTF8 files and missing entries support concrete Node reads, stat and existence", () => {
  compare(`module.exports = fs.existsSync("index.txt") && fs.statSync("index.txt").isFile() &&
    fs.readFileSync("index.txt", "utf8") === "hello 😀\\0tail" &&
    fs.readFileSync("index.txt").toString("utf8") === "hello 😀\\0tail" && !fs.existsSync("missing");`);
});

test("directory and missing default file preserve native EISDIR and ENOENT", () => {
  compare(`let directoryError; let missingError;
    try { fs.readFileSync("docs"); } catch (error) { directoryError = error.code; }
    try { fs.readFileSync("docs/index.html"); } catch (error) { missingError = error.code + ":" + error.syscall + ":" + error.path; }
    module.exports = fs.statSync("docs").isDirectory() && directoryError === "EISDIR" && missingError === "ENOENT:open:docs/index.html";`);
});

test("absolute and relative spellings share identity without erasing missing or non-directory prefixes", () => {
  compare(`let missing; let notDirectory;
    try { fs.statSync("missing/../index.txt"); } catch (error) { missing = error.code; }
    try { fs.statSync("index.txt/../docs"); } catch (error) { notDirectory = error.code; }
    module.exports = fs.readFileSync("docs/../index.txt", "utf8") === fs.readFileSync(${JSON.stringify(join(directory, "index.txt"))}, "utf8") && missing === "ENOENT" && notDirectory === "ENOTDIR";`);
});

test("first positive, negative and content observations are stable across branches and later host changes", () => {
  const capture = captured();
  const [first, context] = run(capture, 'module.exports = fs.readFileSync("index.txt", "utf8") === "hello 😀\\0tail" && !fs.existsSync("missing");');
  expect(first).toMatchObject({ value: true });
  writeFileSync(join(directory, "index.txt"), "changed");
  writeFileSync(join(directory, "missing"), "later");
  const [second] = run(capture, 'module.exports = fs.readFileSync("./index.txt", "utf8") === "hello 😀\\0tail" && !fs.existsSync("missing");');
  expect(second).toMatchObject({ value: true });
  const before = getProperties(at(capture, directory, nodeInitialExecutionContext), nodeInitialExecutionContext);
  const after = getProperties(at(capture, directory, context), context);
  expect(before["index.txt"]).toBeUndefined();
  expect(before.missing).toBeUndefined();
  expect(after["index.txt"]).toBeDefined();
  expect(after.missing).toMatchObject({ type: "null" });
});

test("uncaptured siblings stay open and later real positives are acquired instead of fabricated absent", () => {
  const capture = captured();
  run(capture, 'module.exports = fs.existsSync("missing");');
  writeFileSync(join(directory, "later"), "new observation");
  const [value] = run(capture, 'module.exports = fs.readFileSync("later", "utf8") === "new observation";');
  expect(value).toMatchObject({ value: true });
  const cwd = at(capture, directory, nodeInitialExecutionContext);
  expect((cwd.hostSlots!["node.fs.entry"] as ReturnType<typeof ESObject>).properties.complete).toMatchObject({ value: false });
});

test("captured cwd/platform and unknown descriptor availability are actual model state", () => {
  const capture = captureFileSystem({ cwd: directory });
  expect(capture.state.properties.cwd).toMatchObject({ value: directory });
  expect(capture.state.properties.platform).toMatchObject({ value: process.platform });
  expect(resolveBoolean(capture.inspectFileDescriptorsAvailable(nodeInitialExecutionContext))).toBeUndefined();
});

test("binary bytes permit metadata observations but reject text/Buffer reads without UTF8 replacement", () => {
  writeFileSync(join(directory, "binary"), Buffer.from([0xff]));
  const capture = captured();
  expect(run(capture, 'module.exports = fs.existsSync("binary") && fs.statSync("binary").isFile();')[0]).toMatchObject({ value: true });
  expect(() => run(capture, 'fs.readFileSync("binary");')).toThrow(/UTF-8/);
});

test("disappearance after a positive observation is a capture failure, never an invented target ENOENT", () => {
  const capture = captured();
  run(capture, 'fs.statSync("index.txt");');
  unlinkSync(join(directory, "index.txt"));
  expect(() => run(capture, 'fs.readFileSync("index.txt");')).toThrow(/changed|acquisition/);
});

test("symlink ancestors and special files retain explicit capture boundaries", () => {
  symlinkSync(join(directory, "docs"), join(directory, "link"));
  expect(() => run(captured(), 'fs.existsSync("link/missing");')).toThrow(/symlink/i);
  execFileSync("mkfifo", [join(directory, "pipe")]);
  expect(() => run(captured(), 'fs.readFileSync("pipe");')).toThrow(/regular file|nonregular/i);
});

test.each(["EACCES", "EIO", "EMFILE"])("unexpected probe error %s remains an acquisition failure", code => {
  const capture = captured();
  const probe = jest.spyOn(fs, "lstatSync").mockImplementationOnce(() => { throw Object.assign(new Error(code), { code }); });
  try { expect(() => run(capture, 'fs.existsSync("missing");')).toThrow(code); }
  finally { probe.mockRestore(); }
});

test("effective denied file read is a modeled EACCES while stat remains available", () => {
  const capture = captured();
  const access = jest.spyOn(fs, "accessSync").mockImplementationOnce(() => { throw Object.assign(new Error("EACCES"), { code: "EACCES" }); });
  try {
    expect(run(capture, 'let code; try { fs.readFileSync("index.txt"); } catch (error) { code = error.code; } module.exports = code === "EACCES" && fs.statSync("index.txt").isFile();')[0]).toMatchObject({ value: true });
  } finally { access.mockRestore(); }
});

test("capture count and byte budgets stop without truncation or cached absence", () => {
  expect(() => captured({ maxEntries: 1 })).toThrow(/budget/);
  expect(() => run(captured({ maxFileBytes: 2 }), 'fs.readFileSync("index.txt");')).toThrow(/budget/);
  expect(() => run(captured({ maxTotalBytes: 2 }), 'fs.readFileSync("index.txt");')).toThrow(/budget/);
});

test("symbolic path choices keep both captured observations without changing earlier contexts", () => {
  const choice = ESBoolean();
  const context = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, choice }) });
  const capture = captured();
  const [value, after] = run(capture, 'const path = choice ? "index.txt" : "missing"; const result = fs.existsSync(path); module.exports = result === choice && fs.existsSync("index.txt") && !fs.existsSync("missing");', context);
  expect(resolveBoolean(value as ReturnType<typeof ESBoolean>, after.value.knowledge)).toBe(true);
});


test("captured effective file and directory denial agrees with independent pinned Node", () => {
  chmodSync(join(directory, "index.txt"), 0);
  chmodSync(join(directory, "docs"), 0);
  try {
    compare(`let readCode; let searchCode;
      try { fs.readFileSync("index.txt"); } catch (error) { readCode = error.code; }
      try { fs.statSync("docs/missing"); } catch (error) { searchCode = error.code; }
      module.exports = fs.existsSync("index.txt") && fs.statSync("docs").isDirectory() &&
        readCode === "EACCES" && searchCode === "EACCES" && !fs.existsSync("docs/missing");`);
  } finally {
    chmodSync(join(directory, "index.txt"), 0o600);
    chmodSync(join(directory, "docs"), 0o700);
  }
});

test("an unexpected content read error remains a repeatable capture failure", () => {
  const capture = captured();
  run(capture, 'fs.statSync("index.txt");');
  const read = jest.spyOn(fs, "readSync").mockImplementationOnce(() => { throw Object.assign(new Error("EIO"), { code: "EIO" }); });
  try { expect(() => run(capture, 'fs.readFileSync("index.txt");')).toThrow(/EIO/); }
  finally { read.mockRestore(); }
  expect(() => run(capture, 'fs.readFileSync("index.txt");')).toThrow(/EIO/);
});


test("generic open trees never turn unobserved children or contents into absent or empty data", () => {
  const model = createFileSystemModel({ root: fileSystemDirectory({ file: fileSystemUnobservedFile() }, { complete: false }) });
  const evaluate = (body: string) => createCommonJSLoader({ "/entry.cjs": 'const fs = require("fs"); ' + body },
    { builtins: { fs: model.module } }).load("/entry.cjs", nodeInitialExecutionContext);
  expect(evaluate('module.exports = fs.statSync("file").isFile();')[0]).toMatchObject({ value: true });
  expect(() => evaluate('fs.existsSync("unobserved");')).toThrow(/unobserved directory entry/);
  expect(() => evaluate('fs.readFileSync("file");')).toThrow(/unobserved file contents/);
  expect(() => createFileSystemModel({ root: fileSystemDirectory({}, { complete: false }), cwd: "/unknown",
    observeEntry: () => fileSystemDirectory({}) })).toThrow(/cwd must already be observed/);
});


test("prototype-looking filenames are ordinary observed children", () => {
  writeFileSync(join(directory, "__proto__"), "ordinary file");
  writeFileSync(join(directory, "constructor"), "another file");
  compare(`module.exports = fs.readFileSync("__proto__", "utf8") === "ordinary file" &&
    fs.readFileSync("constructor", "utf8") === "another file" && !fs.existsSync("toString");`);
});

test("a content observation on one branch remains correlated and can be reused after joining", () => {
  const choice = ESBoolean();
  const context = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, choice }) });
  const capture = captured();
  const [value, after] = run(capture, 'if (choice) fs.readFileSync("index.txt", "utf8"); module.exports = fs.readFileSync("index.txt", "utf8") === "hello 😀\\0tail";', context);
  expect(resolveBoolean(value as ReturnType<typeof ESBoolean>, after.value.knowledge)).toBe(true);
});

test("model acquisition callbacks are captured at construction, not mutated via the caller options", () => {
  const file = fileSystemUnobservedFile();
  const options = { root: fileSystemDirectory({}, { complete: false }),
    observeEntry: () => file, observeContents: () => "first" };
  const model = createFileSystemModel(options);
  options.observeEntry = () => { throw new Error("changed callback"); };
  options.observeContents = () => "changed";
  const [value] = createCommonJSLoader({ "/entry.cjs": 'module.exports = require("fs").readFileSync("file", "utf8") === "first";' },
    { builtins: { fs: model.module } }).load("/entry.cjs", nodeInitialExecutionContext);
  expect(value).toMatchObject({ value: true });
});
