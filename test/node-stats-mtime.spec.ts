import { execFileSync } from "child_process";
import { join } from "path";
import { createCommonJSLoader, createFileSystemModel, evaluateCode, fileSystemDirectory, fileSystemFile,
  fileSystemUnobservedFile, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { effectPaths } from "../src/effects";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ownPropertyPresence, writeProperty } from "../src/execution-context/Heap";
import { ESObject } from "../src/Object";
import { Any, ESNumber, isThrownValue, Undefined } from "../src/types";
import { assertPinnedNode, withModuleGraphFixture } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

// Bounded Node Stats.mtime: a declared observation carried by a bounded Date
// instance. Contents never imply an mtime; only explicit declarations do.
const fixtureFiles = {
  "site/index.txt": "hello\n", "site/empty.txt": "", "site/nested/keep.txt": "keep",
  "site/unicode.txt": "café 😀\0tail"
};

function tree(mtimeMs: number, extra: { [name: string]: Any } = {}) {
  return fileSystemDirectory({ sandbox: fileSystemDirectory({ site: fileSystemDirectory({
    "index.txt": fileSystemFile(fixtureFiles["site/index.txt"], { mtimeMs }),
    "empty.txt": fileSystemFile("", { mtimeMs }),
    nested: fileSystemDirectory({ "keep.txt": fileSystemFile("keep") }), ...extra
  }) }) });
}

function source(body: string) {
  return `const fs = require("node:fs"); const base = __dirname + "/site";\n${body}`;
}

function load(body: string, inputs: { [name: string]: Any } = {}, root: Any = tree(0)) {
  const model = createFileSystemModel({ root, cwd: "/sandbox/site" });
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...inputs }) });
  const [value, context] = createCommonJSLoader({ "/sandbox/entry.cjs": source(body) },
    { builtins: { fs: model.module } }).load("/sandbox/entry.cjs", initial);
  return { model, value, context, initial };
}

function native(body: string) {
  return withModuleGraphFixture({ "entry.cjs": source(body), ...fixtureFiles }, (_files, directory) => {
    assertPinnedNode();
    return JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
      ["--no-global-search-paths", "-e", "process.stdout.write(JSON.stringify(require(process.argv[1])));", join(directory, "entry.cjs")],
      { cwd: join(directory, "site"), encoding: "utf8", timeout: 10000,
        env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }, stdio: ["ignore", "pipe", "pipe"] }));
  });
}

// The native control checks the host semantics being modeled: Date clipping
// and UTC formatting of a concrete millisecond count. The filesystem path
// (declaration, persistence, precedence) is a VM fact checked directly.
function compareDate(mtimeMs: number, expression: string) {
  const expected = native(`module.exports = new Date(${mtimeMs}).${expression};`);
  const result = load(`module.exports = fs.statSync("index.txt").mtime.${expression};`, {}, tree(mtimeMs));
  expect(isThrownValue(result.value)).toBe(false);
  expect(isForkedCompletion(result.value)).toBe(false);
  expect(result.value).toMatchObject({ value: expected });
  return expected;
}

test("mtime.toUTCString matches native UTC formatting across the Date range", () => {
  for (const mtimeMs of [0, 1, -1, 1767223845000, 951782400000, -86400000,
    253402300799999, -62135596800000, -62167219200001, 8.64e15, -8.64e15]) {
    expect(typeof compareDate(mtimeMs, "toUTCString()")).toBe("string");
  }
});

test("mtime.getTime returns the clipped integral millisecond count, matching native", () => {
  compareDate(1767223845678.9, "getTime()");
  compareDate(-0.5, "getTime()");
  compareDate(8.64e15, "getTime()");
});

test("repeated and aliased reads return the same persisted bounded Date", () => {
  const result = load(`const stat = fs.statSync("index.txt"); const alias = stat;
    module.exports = stat.mtime === stat.mtime && alias.mtime === stat.mtime &&
    stat.mtime.toUTCString() === alias.mtime.toUTCString();`, {}, tree(1767223845000));
  expect(result.value).toMatchObject({ value: true });
});

test("a supplied current own mtime still wins over the declared fact", () => {
  const model = createFileSystemModel({ root: fileSystemDirectory({ "index.txt":
    fileSystemFile("hello\n", { mtimeMs: 1767223845000 }) }), cwd: "/" });
  const [setupDone, state] = evaluateCode('const stat = fs.statSync("/index.txt");',
    setVariablesInScope(nodeInitialExecutionContext, { fs: model.module }));
  expect(setupDone).toBe(Undefined);
  const stat = state.value.scope.stat as any;
  const seeded = writeProperty(stat, "mtime", ESNumber(99), state);
  const [done, after] = evaluateCode("const answer = stat.mtime;", seeded);
  expect(done).toBe(Undefined);
  expect(after.value.scope.answer).toMatchObject({ value: 99 });
  expect(ownPropertyPresence(stat, "mtime", after)).toMatchObject({ value: true });
});

test("directory and undeclared file mtimes remain a typed boundary", () => {
  for (const body of ['fs.statSync("nested").mtime;', 'fs.statSync("unobserved.txt").mtime;']) {
    const { value } = load(body, {}, tree(0, { "unobserved.txt": fileSystemUnobservedFile() }));
    expect(value).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported",
      message: "Unmodeled host property 'mtime': Node Stats fields" });
  }
});

test("an observed unobserved-contents file uses its declared mtime and persists it", () => {
  const model = createFileSystemModel({ root: fileSystemDirectory({ "raw.bin":
    fileSystemUnobservedFile({ size: 4097, mtimeMs: 1767223845678.9 }) }), cwd: "/" });
  const [done, state] = evaluateCode(
    'const stat = fs.statSync("/raw.bin"); const answer = stat.mtime.getTime();',
    setVariablesInScope(nodeInitialExecutionContext, { fs: model.module }));
  expect(done).toBe(Undefined);
  expect(state.value.scope.answer).toMatchObject({ value: 1767223845678 });
  expect(ownPropertyPresence(state.value.scope.stat as any, "mtime", state)).toMatchObject({ value: true });
  const [againDone, again] = evaluateCode('const repeated = stat.mtime.toUTCString();', state);
  expect(againDone).toBe(Undefined);
  expect(again.value.scope.repeated).toMatchObject({ value: native("module.exports = new Date(1767223845678.9).toUTCString();") });
});

test("declared mtimes are validated as finite milliseconds in the Date range", () => {
  for (const mtimeMs of [NaN, Infinity, -Infinity, 8.64e15 + 1, -8.64e15 - 1, "123"]) {
    expect(() => fileSystemUnobservedFile({ mtimeMs: mtimeMs as any })).toThrow(/Date/);
    expect(() => fileSystemFile("x", { mtimeMs: mtimeMs as any })).toThrow(/Date/);
  }
});

test("a conditional mtime read completes on both symbolic branches and preserves correlations", () => {
  const model = createFileSystemModel({ root: fileSystemDirectory({ "index.txt":
    fileSystemFile("hello\n", { mtimeMs: 0 }) }), cwd: "/" });
  const selected = ESBoolean();
  const [done, merged] = evaluateCode(
    'let mark = 0, stamp = ""; if (selected) { mark = 1; stamp = fs.statSync("/index.txt").mtime.toUTCString(); } else { mark = 2; }',
    setVariablesInScope(nodeInitialExecutionContext, { fs: model.module, selected }));
  expect(done).toBe(Undefined);
  const [checkDone, checked] = evaluateCode(
    'const answer = selected ? (mark === 1 && stamp === "Thu, 01 Jan 1970 00:00:00 GMT") : (mark === 2 && stamp === "");', merged);
  if (isForkedCompletion(checkDone)) {
    for (const leaf of [checkDone.consequent, checkDone.alternate]) {
      expect(leaf[1].value.scope.answer).toMatchObject({ value: true });
    }
  } else {
    expect(checkDone).toBe(Undefined);
    expect(checked.value.scope.answer).toMatchObject({ value: true });
  }
  expect(effectPaths(merged.value.effects).length).toBeGreaterThan(0);
});

test("unmodeled Date methods and writes stop as retained typed boundaries", () => {
  const { value } = load('const stat = fs.statSync("index.txt"); module.exports = stat.mtime.getFullYear();', {}, tree(0));
  expect(value).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported" });
});
