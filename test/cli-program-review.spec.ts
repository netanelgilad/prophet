import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { mkdtempSync, realpathSync, writeFileSync } from "fs";
import { removeSync } from "fs-extra";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { snapshotProgram } from "../src/cli/program";
import { encodeGraph } from "../src/cli/graph";
import { runFile } from "../src/cli/runtime";
import { assertPinnedNode } from "./commonjs/oracle";

const LIMIT = 4 * 1024 * 1024;
beforeAll(() => assertPinnedNode());
let directory: string;
beforeEach(() => { directory = realpathSync(mkdtempSync(join(tmpdir(), "prophet-program-review-"))); });
afterEach(() => { removeSync(directory); });
function input() {
  const filename = "/entrée😀.cjs";
  const source = { text: "ignored", sha256: "a".repeat(64), byteLength: 7 };
  return { runtime: "node@24.21.0" as "node@24.21.0", filename, cwd: "/répertoire😀", args: ["é😀"], source,
    sources: new Map([[filename, source], ["/shared😀.json", { ...source }]]),
    paths: new Map<string, "file" | "directory" | "missing">([
      [filename, "file"], ["/shared😀.json", "file"], ["/répertoire😀", "directory"], ["/absent😀", "missing"]]) };
}
function metadataBytes(value: ReturnType<typeof input>): number {
  const strings = [value.runtime, value.filename, value.cwd, ...value.args];
  for (const [path, source] of value.sources) strings.push(path, source.sha256);
  for (const [path, kind] of value.paths) strings.push(path, kind);
  return strings.reduce((sum, text) => sum + Buffer.from(text, "utf8").length, 0);
}
function run(source: string) {
  const filename = join(directory, "entry.cjs");
  writeFileSync(filename, source);
  const result = runFile({ script: filename, args: ["argument"], maxSteps: 10000, runtime: "node@24.21.0" }, directory);
  return { filename, result };
}
function invoke(args: string[]) {
  return spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    [resolve("bin/prophet.js"), ...args], { cwd: directory, encoding: "utf8", timeout: 30000,
      maxBuffer: 32 * 1024 * 1024, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
}

test("independent accounting includes repeated keys, digest and path-kind bytes at the exact UTF8 ceiling", () => {
  const value = input();
  const available = LIMIT - metadataBytes(value);
  value.args.push("😀".repeat(Math.floor(available / 4)) + "x".repeat(available % 4));
  expect(metadataBytes(value)).toBe(LIMIT);
  const snapshot = snapshotProgram(value);
  expect(snapshot.sources.size).toBe(2);
  expect(snapshot.paths.size).toBe(4);
  expect(snapshot.args).toEqual(value.args);
  value.args[1] += "x";
  expect(metadataBytes(value)).toBe(LIMIT + 1);
  expect(() => snapshotProgram(value)).toThrow(/metadata.*byte/i);
});

test("a large multibyte string below the code-unit ceiling still exceeds the UTF8 budget", () => {
  const value = input();
  value.args = ["😀".repeat(LIMIT / 4)];
  expect(value.args[0].length).toBe(LIMIT / 2);
  expect(metadataBytes(value)).toBeGreaterThan(LIMIT);
  expect(() => snapshotProgram(value)).toThrow(/metadata.*byte/i);
});

test("public snapshot retains original BOM bytes and graph aliases after mutable native input is replaced", () => {
  const text = '\ufeff// café 😀\r\nmodule.exports = 42;\r\n';
  const { filename, result } = run(text);
  expect(result.status).toBe("evaluated");
  expect(result.completion).toBeDefined();
  const snapshot = snapshotProgram(result.input);
  expect(snapshot.source).toEqual({ sha256: createHash("sha256").update(Buffer.from(text)).digest("hex"), byteLength: Buffer.from(text).length });
  const before = encodeGraph({ program: snapshot });
  result.input.source.text = "changed";
  result.input.source.byteLength = 0;
  result.input.source.sha256 = "b".repeat(64);
  result.input.args.push("new");
  result.input.sources.set(filename, { text: "new", sha256: "c".repeat(64), byteLength: 3 });
  result.input.paths.set(filename, "missing");
  expect(encodeGraph({ program: snapshot })).toEqual(before);
  expect(snapshot.source).toBe(snapshot.sources.get(filename));
  expect(snapshot.paths.get(filename)).toBe("file");
  for (const map of [snapshot.sources, snapshot.paths]) {
    expect(() => (map as Map<any, any>).set("/new", {})).toThrow();
    expect(() => (map as Map<any, any>).delete(filename)).toThrow();
    expect(() => (map as Map<any, any>).clear()).toThrow();
  }
  expect(encodeGraph({ program: snapshot })).toEqual(before);
});

test("invalid UTF8 after a positive dependency probe publishes the known subset without claiming bytes", () => {
  const dependency = join(directory, "bad.cjs");
  writeFileSync(dependency, Buffer.from([0xff]));
  const { filename, result } = run('module.exports = require("./bad.cjs");');
  expect(result.status).toBe("analysis-stop");
  expect(result.diagnostic).toMatch(/UTF-8/);
  const snapshot = snapshotProgram(result.input);
  expect(snapshot.source).toBe(snapshot.sources.get(filename));
  expect(snapshot.paths.get(dependency)).toBe("file");
  expect(snapshot.sources.has(dependency)).toBe(false);
  expect(snapshot.sources.size).toBe(1);
});

test("real CLI publication failure rejects excess arguments with no partial stdout graph", () => {
  writeFileSync(join(directory, "entry.cjs"), "module.exports = 1;");
  const child = invoke(["--", "entry.cjs", ...Array(4097).fill("")]);
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(1);
  expect(child.stdout).toBe("");
  expect(child.stderr).toMatch(/^prophet: .*args/i);
});
