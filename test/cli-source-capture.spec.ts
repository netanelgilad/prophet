import { mkdtempSync, mkdirSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { removeSync } from "fs-extra";
import { captureModuleSources } from "../src/cli/source-capture";

const fs: typeof import("fs") = require("fs");

let directory: string;
beforeEach(() => { directory = realpathSync(mkdtempSync(join(tmpdir(), "prophet-capture-"))); });
afterEach(() => { removeSync(directory); });

test("captured source bytes and missing candidates remain stable across later lookups", () => {
  const capture = captureModuleSources();
  const present = join(directory, "present.cjs");
  const absent = join(directory, "absent.cjs");
  writeFileSync(present, "module.exports = 1;");
  expect(capture.source.readFile(present)).toBe("module.exports = 1;");
  expect(capture.source.isFile(absent)).toBe(false);
  writeFileSync(present, "module.exports = 2;");
  writeFileSync(absent, "module.exports = 3;");
  expect(capture.source.readFile(present)).toBe("module.exports = 1;");
  expect(capture.source.readFile(absent)).toBeUndefined();
  expect(capture.files.get(present)!.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(capture.paths.get(absent)).toBe("missing");
});

test("disappearance after a successful file probe stops instead of proving absence", () => {
  const capture = captureModuleSources();
  const filename = join(directory, "entry.cjs");
  writeFileSync(filename, "module.exports = true;");
  expect(capture.source.isFile(filename)).toBe(true);
  unlinkSync(filename);
  expect(() => capture.source.readFile(filename)).toThrow();
});

test("non-directory ancestors establish a missing candidate without reading through them", () => {
  const capture = captureModuleSources();
  const filename = join(directory, "file");
  writeFileSync(filename, "not a directory");
  expect(capture.source.isFile(join(filename, "entry.cjs"))).toBe(false);
  expect(capture.source.readFile(join(filename, "entry.cjs"))).toBeUndefined();
});

test("source acquisition rejects symlinks at a directory component even for missing descendants", () => {
  const capture = captureModuleSources();
  mkdirSync(join(directory, "real"));
  symlinkSync(join(directory, "real"), join(directory, "link"));
  expect(() => capture.source.isFile(join(directory, "link", "absent.cjs"))).toThrow(/symlink/i);
});

test("a directory in place of a manifest and invalid UTF-8 are acquisition stops", () => {
  const capture = captureModuleSources();
  mkdirSync(join(directory, "package.json"));
  writeFileSync(join(directory, "invalid.cjs"), Buffer.from([0xff]));
  expect(() => capture.source.readFile(join(directory, "package.json"))).toThrow(/regular file/i);
  expect(() => capture.source.readFile(join(directory, "invalid.cjs"))).toThrow(/UTF-8/);
});

test.each(["EACCES", "EIO", "EMFILE"])("host acquisition failure %s never becomes a cached absence", code => {
  const capture = captureModuleSources();
  capture.source.isDirectory(directory);
  const filename = join(directory, "entry.cjs");
  const error = Object.assign(new Error(code), { code });
  const probe = jest.spyOn(fs, "lstatSync").mockImplementationOnce(() => { throw error; });
  try {
    expect(() => capture.source.isFile(filename)).toThrow(error);
    expect(capture.paths.has(filename)).toBe(false);
  } finally {
    probe.mockRestore();
  }
});
