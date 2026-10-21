import { createHash } from "crypto";
import { mkdtempSync, realpathSync, writeFileSync } from "fs";
import { removeSync } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { snapshotProgram } from "../src/cli/program";
import { captureModuleSources, CapturedSource } from "../src/cli/source-capture";

function input() {
  const filename = "/entry.cjs";
  const source: CapturedSource = { text: "module.exports = 1;", sha256: "a".repeat(64), byteLength: 19 };
  return { runtime: "node@24.21.0" as "node@24.21.0", filename, cwd: "/", args: [] as string[], source,
    sources: new Map([[filename, source]]), paths: new Map<string, "file" | "directory" | "missing">([[filename, "file"]]) };
}
function stringBytes(value: ReturnType<typeof input>) {
  let size = [value.runtime, value.filename, value.cwd, ...value.args].reduce((n, text) => n + Buffer.byteLength(text, "utf8"), 0);
  value.sources.forEach((source, path) => size += Buffer.byteLength(path, "utf8") + Buffer.byteLength(source.sha256, "utf8"));
  value.paths.forEach((kind, path) => size += Buffer.byteLength(path, "utf8") + Buffer.byteLength(kind, "utf8"));
  return size;
}

test("program snapshot preserves entry aliases while isolating every published mutable container", () => {
  const value = input(); value.args.push("--target", "argument");
  const snapshot = snapshotProgram(value);
  expect(Object.keys(snapshot).sort()).toEqual(["args", "cwd", "filename", "paths", "runtime", "source", "sources"]);
  expect(snapshot.source).toBe(snapshot.sources.get(value.filename));
  expect(snapshot.source).toEqual({ sha256: "a".repeat(64), byteLength: 19 });
  expect(snapshot.source).not.toBe(value.source);
  expect(Object.keys(snapshot.source).sort()).toEqual(["byteLength", "sha256"]);
  value.args[0] = "changed"; value.source.sha256 = "b".repeat(64);
  value.sources.clear(); value.paths.clear();
  expect(snapshot.args).toEqual(["--target", "argument"]);
  expect(snapshot.sources.size).toBe(1); expect(snapshot.paths.size).toBe(1);
  expect(snapshot.source.sha256).toBe("a".repeat(64));
  for (const object of [snapshot, snapshot.source, snapshot.args, snapshot.sources, snapshot.paths]) expect(Object.isFrozen(object)).toBe(true);
  for (const map of [snapshot.sources, snapshot.paths]) {
    expect(() => (map as Map<any, any>).set("new", "value")).toThrow(/immutable/i);
    expect(() => (map as Map<any, any>).delete("/entry.cjs")).toThrow(/immutable/i);
    expect(() => (map as Map<any, any>).clear()).toThrow(/immutable/i);
  }
});

test("program publication never consults source text and preserves positive probes without captured bytes", () => {
  const value = input();
  Object.defineProperty(value.source, "text", { get() { throw Error("text must not be read"); } });
  value.paths.set("/unread.cjs", "file"); value.paths.set("/missing.cjs", "missing");
  const snapshot = snapshotProgram(value);
  expect(snapshot.paths.get("/unread.cjs")).toBe("file");
  expect(snapshot.sources.has("/unread.cjs")).toBe(false);
  expect(snapshot.paths.get("/missing.cjs")).toBe("missing");
});

test("source byte length and hash describe original BOM, CRLF and multibyte bytes", () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "prophet-program-")));
  try {
    const filename = join(directory, "entry.cjs"), bytes = Buffer.from('\ufeff// héllo\r\nmodule.exports = 1;\r\n', "utf8");
    writeFileSync(filename, bytes);
    const captured = captureModuleSources();
    expect(captured.source.readFile(filename)).toBe(bytes.toString("utf8"));
    expect(captured.files.get(filename)).toEqual({ text: bytes.toString("utf8"), byteLength: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex") });
  } finally { removeSync(directory); }
});

test.each(["sources", "paths", "args"])("program publication admits the exact %s count cap and rejects one beyond", kind => {
  const value = input();
  if (kind === "sources") for (let index = 1; index < 4096; index++) {
    const path = `/source${index}.cjs`; value.sources.set(path, value.source); value.paths.set(path, "file");
  }
  if (kind === "paths") for (let index = 1; index < 16384; index++) value.paths.set(`/missing${index}`, "missing");
  if (kind === "args") value.args = Array(4096).fill("");
  expect(() => snapshotProgram(value)).not.toThrow();
  if (kind === "sources") value.sources.set("/overflow.cjs", value.source);
  if (kind === "paths") value.paths.set("/overflow", "missing");
  if (kind === "args") value.args.push("");
  expect(() => snapshotProgram(value)).toThrow(new RegExp(kind, "i"));
});

test("metadata byte budget counts all occurrences, admits exact UTF8 boundary and rejects the next byte", () => {
  const value = input(), limit = 4 * 1024 * 1024;
  const remaining = limit - stringBytes(value);
  value.args = ["é".repeat(Math.floor(remaining / 2)) + (remaining % 2 ? "x" : "")];
  expect(stringBytes(value)).toBe(limit);
  expect(() => snapshotProgram(value)).not.toThrow();
  value.args[0] += "x";
  expect(() => snapshotProgram(value)).toThrow(/metadata.*byte/i);
});

test.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("invalid byteLength rejects without silently repairing identity: %s", byteLength => {
  const value = input(); value.source.byteLength = byteLength;
  expect(() => snapshotProgram(value)).toThrow(/byteLength/);
});

test("program publication rejects a missing entry identity and malformed digest", () => {
  const missing = input(); missing.sources.clear();
  expect(() => snapshotProgram(missing)).toThrow(/entry/i);
  const malformed = input(); malformed.source.sha256 = "not a digest";
  expect(() => snapshotProgram(malformed)).toThrow(/sha256/i);
});
