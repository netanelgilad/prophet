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

// Bounded Node Stats.size: UTF-8 byte length of a declared regular file.
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

function compare(body: string, expected: boolean | number | string) {
  expect(native(body)).toBe(expected);
  const result = load(body);
  expect(isThrownValue(result.value)).toBe(false);
  expect(isForkedCompletion(result.value)).toBe(false);
  expect(result.value).toMatchObject({ type: typeof expected, value: expected });
  return result;
}

test("concrete file sizes match native byte counts, including empty and UTF-8 multibyte contents", () => {
  compare(`module.exports = fs.statSync("index.txt").size;`, 6);
  compare(`module.exports = fs.statSync("empty.txt").size;`, 0);
  compare(`module.exports = fs.statSync("unicode.txt").size;`, 15);
});

test("size is a nonnegative number and the UTF-8 byte count, not the UTF-16 length", () => {
  compare(`const size = fs.statSync("unicode.txt").size;
    module.exports = typeof size === "number" && size >= 0 && size === 15 &&
    size !== "café 😀\\0tail".length && "café 😀\\0tail".length === 12;`, true);
});

test("repeated and aliased reads return the same persisted size", () => {
  compare(`const stat = fs.statSync("index.txt"); const alias = stat;
    module.exports = stat.size === 6 && alias.size === 6 && stat.size === fs.statSync("index.txt").size;`, true);
});

test("a supplied current own size still wins over the modeled file size", () => {
  const model = createFileSystemModel({ root: fileSystemDirectory({ "index.txt": fileSystemFile("hello\n") }), cwd: "/" });
  const [setupDone, state] = evaluateCode('const stat = fs.statSync("/index.txt");',
    setVariablesInScope(nodeInitialExecutionContext, { fs: model.module }));
  expect(setupDone).toBe(Undefined);
  const stat = state.value.scope.stat as any;
  const seeded = writeProperty(stat, "size", ESNumber(99), state);
  const [done, after] = evaluateCode("const answer = stat.size;", seeded);
  expect(done).toBe(Undefined);
  expect(after.value.scope.answer).toMatchObject({ value: 99 });
  expect(ownPropertyPresence(stat, "size", after)).toMatchObject({ value: true });
});

test("directory and undeclared file sizes remain a typed boundary", () => {
  for (const body of ['fs.statSync("nested").size;', 'fs.statSync("unobserved.txt").size;']) {
    const { value } = load(body, {}, tree({ "unobserved.txt": fileSystemUnobservedFile() }));
    expect(value).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported",
      message: "Unmodeled host property 'size': Node Stats fields" });
  }
});

test("an observed unobserved-contents file uses its declared size and persists it", () => {
  const model = createFileSystemModel({ root: fileSystemDirectory({ "raw.bin": fileSystemUnobservedFile({ size: 4097 }) }), cwd: "/" });
  const [done, state] = evaluateCode('const stat = fs.statSync("/raw.bin"); const answer = stat.size;',
    setVariablesInScope(nodeInitialExecutionContext, { fs: model.module }));
  expect(done).toBe(Undefined);
  expect(state.value.scope.answer).toMatchObject({ value: 4097 });
  expect(ownPropertyPresence(state.value.scope.stat as any, "size", state)).toMatchObject({ value: true });
  const [againDone, again] = evaluateCode('const repeated = stat.size;', state);
  expect(againDone).toBe(Undefined);
  expect(again.value.scope.repeated).toMatchObject({ value: 4097 });
});

test("declared sizes are validated as nonnegative safe integers", () => {
  for (const size of [-1, 1.5, NaN, Infinity, -Infinity, 2 ** 53]) {
    expect(() => fileSystemUnobservedFile({ size })).toThrow(/[Ss]ize/);
  }
});

test("a conditional size read completes on both symbolic branches and preserves correlations", () => {
  const model = createFileSystemModel({ root: fileSystemDirectory({ "index.txt": fileSystemFile("hello\n") }), cwd: "/" });
  const selected = ESBoolean();
  const [done, merged] = evaluateCode(
    'let mark = 0, size = -1; if (selected) { mark = 1; size = fs.statSync("/index.txt").size; } else { mark = 2; }',
    setVariablesInScope(nodeInitialExecutionContext, { fs: model.module, selected }));
  expect(done).toBe(Undefined);
  const [checkDone, checked] = evaluateCode(
    'const answer = selected ? (mark === 1 && size === 6) : (mark === 2 && size === -1);', merged);
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
