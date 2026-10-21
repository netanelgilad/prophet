// Root review probes on the partial parser draft. Public VM initialization
// lets these reach parser behavior; the worker's direct-import suite separately
// exercises the currently broken standalone import order.
import "../src/index";
import * as fs from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { removeSync } from "fs-extra";
import { parseEnvironment } from "../src/cli/environment";

let directory: string;
beforeEach(() => { directory = fs.mkdtempSync(join(tmpdir(), "prophet-parser-review-")); });
afterEach(() => { removeSync(directory); });
function input(value: unknown): string {
  const path = join(directory, "initial.json");
  fs.writeFileSync(path, JSON.stringify(value));
  return path;
}
function parse(value: unknown) {
  return parseEnvironment({ path: input(value), cwd: directory });
}

test("forward reference types are resolved before consumer type validation", () => {
  const environment = parse({ version: 1,
    values: { alias: { ref: "available" }, available: { symbolic: "boolean" } },
    filesystem: { descriptorAvailable: { ref: "alias" } } });
  expect(environment.filesystem.descriptorAvailable).toBe(environment.state.values.get("available"));
  expect(environment.state.values.get("alias")).toBe(environment.state.values.get("available"));
});

test("a named Boolean can select named strings without being treated as an untyped expression", () => {
  const environment = parse({ version: 1,
    values: { flag: { symbolic: "boolean" }, yes: "/yes", no: "/no" },
    http: { requests: { method: "GET", url: { select: {
      condition: { ref: "flag" }, then: { ref: "yes" }, else: { ref: "no" }
    } } } } });
  expect(environment.requestInput!().url.type).toBe("string");
});

test("aggregate literal budget includes concrete header values", () => {
  const headers: Record<string, string> = Object.create(null);
  for (let i = 0; i < 10; i++) headers["x-" + i] = "a".repeat(7000);
  expect(() => parse({ version: 1, http: { requests: { method: "GET", url: "/", headers } } }))
    .toThrow(/literal|budget|limit/i);
});

test("expanded work rejection is reached for a compact repeated reference DAG", () => {
  const values: Record<string, unknown> = { v0: { symbolic: "string" } };
  for (let i = 1; i <= 12; i++) values["v" + i] = { select: {
    condition: { symbolic: "boolean" }, then: { ref: "v" + (i - 1) }, else: { ref: "v" + (i - 1) }
  } };
  expect(() => parse({ version: 1, values })).toThrow(/expanded work/i);
});

test("seven shared-DAG levels remain inside the declared 4096-work domain", () => {
  const values: Record<string, unknown> = { v0: { symbolic: "boolean" } };
  // w0=1; wn=4+2*w(n-1). Sum(w0..w7)=1243, not 3^7.
  for (let i = 1; i <= 7; i++) values["v" + i] = { select: {
    condition: { symbolic: "boolean" }, then: { ref: "v" + (i - 1) }, else: { ref: "v" + (i - 1) }
  } };
  const environment = parse({ version: 1, values });
  expect(environment.state.values.get("v7")).toBe(environment.state.values.get("v0"));
});

test("the opened size is checked before allocation and the descriptor closes on rejection", () => {
  const path = input({ version: 1 });
  const observed = fs.statSync(path);
  const larger = Object.assign(Object.create(Object.getPrototypeOf(observed)), observed, { size: 262145 });
  // Babel's namespace import is a wrapper; mock the actual shared fs module.
  const actualFS: typeof fs = require("fs");
  const stat = jest.spyOn(actualFS, "fstatSync").mockReturnValueOnce(larger);
  const allocate = jest.spyOn(Buffer, "alloc");
  const close = jest.spyOn(actualFS, "closeSync");
  try {
    expect(() => parseEnvironment({ path, cwd: directory })).toThrow(/size after open/i);
    expect(stat).toHaveBeenCalledTimes(1);
    expect(allocate).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  } finally { stat.mockRestore(); allocate.mockRestore(); close.mockRestore(); }
});

test("a legal escaped string is bounded by its decoded length", () => {
  const path = join(directory, "initial.json");
  fs.writeFileSync(path, '{"version":1,"values":{"text":"' + "\\u0061".repeat(16000) + '"}}');
  const environment = parseEnvironment({ path, cwd: directory });
  expect(environment.state.values.get("text")).toMatchObject({ type: "string", value: "a".repeat(16000) });
});
