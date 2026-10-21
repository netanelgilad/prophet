// Root-authored probes prepared separately from the worker-owned suite.
// Integrated after the owner-directed Codex takeover; authoring syntax
// expectations and console formatting were corrected before execution.
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createHash } from "crypto";
import { spawnSync } from "child_process";
import { removeSync } from "fs-extra";
import { runFile } from "../src/cli/runtime";
import { encodeGraph, EncodedGraph } from "../src/cli/graph";
import { effectPaths } from "../src/effects";
import { HostEffect } from "../src/effects";
import { isForkedCompletion } from "../src/execution-context/Completion";
import { BranchResult } from "../src/execution-context/branches";
import { isThrownValue, isESString } from "../src/types";
import { getProperties } from "../src/execution-context/Heap";
import { TESObject } from "../src/Object";

let directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "prophet-environment-review-")); });
afterEach(() => { removeSync(directory); });
const ref = (name: string) => ({ ref: name });
const select = (condition: unknown, yes: unknown, no: unknown) =>
  ({ select: { condition, then: yes, else: no } });
function run(source: string, environment: unknown, maxEvents = 1) {
  writeFileSync(join(directory, "entry.cjs"), source);
  writeFileSync(join(directory, "initial.json"), JSON.stringify(environment));
  const options = { script: "entry.cjs", args: [], maxSteps: 100000, maxEvents,
    environment: "initial.json", runtime: "node@24.21.0" as "node@24.21.0" };
  return runFile(options, directory);
}
function leaves(result: BranchResult): BranchResult[] {
  return isForkedCompletion(result[0])
    ? leaves(result[0].consequent).concat(leaves(result[0].alternate)) : [result];
}
function decode(graph: EncodedGraph): any {
  const objects = new Map<string, any>();
  graph.nodes.forEach(node => objects.set(node.id,
    node.kind === "map" ? new Map() : node.kind === "array" ? [] : Object.create(null)));
  const value = (encoded: any): any => {
    if (!encoded || typeof encoded !== "object") return encoded;
    if (encoded.ref) return objects.get(encoded.ref);
    if (encoded.primitive === "undefined") return undefined;
    if (encoded.primitive === "NaN") return NaN;
    if (encoded.primitive === "Infinity") return Infinity;
    if (encoded.primitive === "-Infinity") return -Infinity;
    if (encoded.primitive === "-0") return -0;
    throw new Error("Unexpected primitive in environment review graph");
  };
  graph.nodes.forEach(node => {
    const target = objects.get(node.id);
    if (node.kind === "map") node.entries.forEach(([key, item]) => target.set(value(key), value(item)));
    else node.entries.forEach(([key, item]) => target[key] = value(item));
  });
  const result: any = Object.create(null);
  Object.keys(graph.roots).forEach(key => result[key] = value(graph.roots[key]));
  return result;
}

test("unused forward aliases, escaped UTF-16 data, and template provenance survive zero arrivals", () => {
  const environment = { version: 1, values: {
    alias: ref("later"), unused: "\ud800\u0000", later: { symbolic: "boolean" }
  }, filesystem: { descriptorAvailable: ref("alias") },
  http: { requests: { method: "GET", url: select(ref("later"), "/a", "/b") } } };
  const result = run("module.exports = 3;", environment, 0);
  expect(result.status).toBe("evaluated");
  const graph = decode(encodeGraph({ initial: result.initial, current: result.current }));
  const state = graph.initial.global.hostSlots["node.environment"];
  expect(graph.current.global.hostSlots["node.environment"]).toBe(state);
  expect(state.values.get("alias")).toBe(state.values.get("later"));
  expect(state.values.get("unused").value).toBe("\ud800\u0000");
  expect(state.requests).toMatchObject({
    method: { kind: "literal", type: "string", value: "GET" },
    url: { kind: "select", type: "string", condition: { kind: "ref", name: "later" },
      then: { kind: "literal", value: "/a" }, else: { kind: "literal", value: "/b" } }
  });
  expect(state.provenance).toMatchObject({ path: join(directory, "initial.json"), version: 1,
    sha256: createHash("sha256").update(readFileSync(join(directory, "initial.json"))).digest("hex") });
  const fsState = result.initial.value.global.hostSlots!["node.fs"] as TESObject;
  const inputState = result.initial.value.global.hostSlots!["node.environment"] as any;
  expect(getProperties(fsState, result.initial).fileDescriptorsAvailable).toBe(inputState.values.get("later"));
});

test.each([
  { version: 1, values: { unused: select(false, ref("missing"), "valid") } },
  { version: 1, values: { unused: select(true, "valid", false) } },
  { version: 1, values: { unused: { symbolic: "boolean", ignored: true } } },
  { version: 1, http: { requests: { method: "GET", url: "/", ignored: true } } }
])("invalid unused branches and nested keys reject before a missing target: %#", environment => {
  writeFileSync(join(directory, "initial.json"), JSON.stringify(environment));
  const options = { script: "does-not-exist.cjs", args: [], maxSteps: 100000, maxEvents: 0,
    environment: "initial.json", runtime: "node@24.21.0" as "node@24.21.0" };
  let failure: Error | undefined;
  try { runFile(options, directory); } catch (error) { failure = error; }
  expect(failure).toBeDefined();
  expect(failure!.message).not.toMatch(/ENOENT|does-not-exist/);
});

test("escaped duplicate JSON member names are rejected", () => {
  writeFileSync(join(directory, "initial.json"), '{"version":1,"values":{"same":true,"s\\u0061me":false}}');
  writeFileSync(join(directory, "entry.cjs"), "module.exports = 1;");
  const options = { script: "entry.cjs", args: [], maxSteps: 100000,
    environment: "initial.json", runtime: "node@24.21.0" as "node@24.21.0" };
  expect(() => runFile(options, directory)).toThrow(/duplicate/i);
});

test("real CLI rejects an invalid environment before observing a missing target and emits no graph", () => {
  const path = join(directory, "initial.json");
  writeFileSync(path, '{"version":1,"values":{"unused":{"ref":"missing"}}}');
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    [join(__dirname, "../bin/prophet.js"), "--environment", path, "--", join(directory, "missing.cjs")],
    { encoding: "utf8", timeout: 30000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(1);
  expect(child.stdout).toBe("");
  expect(child.stderr).toMatch(/unknown reference missing/);
  expect(child.stderr).not.toMatch(/ENOENT|missing\.cjs/);
});

test.each(["", "quoted\"slash\\end", "\b\f\n\r\t", "\ud800", "\udfff", "\ud83d\ude00", "\u2028\u2029", "a\u0000b"])(
  "JSON string decoding preserves the supplied UTF-16 value: %#", input => {
    const result = run("module.exports = 1;", { version: 1, values: { text: input } }, 0);
    expect(result.status).toBe("evaluated");
    const state = result.initial.value.global.hostSlots!["node.environment"] as any;
    expect(state.values.get("text").value).toBe(input);
  });

test("decoded string budgets do not become an undocumented raw escape-token cap", () => {
  writeFileSync(join(directory, "entry.cjs"), "module.exports = 1;");
  writeFileSync(join(directory, "initial.json"), '{"version":1,"values":{"text":"' + "\\u0061".repeat(16000) + '"}}');
  const options = { script: "entry.cjs", args: [], maxSteps: 100000,
    environment: "initial.json", runtime: "node@24.21.0" as "node@24.21.0" };
  const result = runFile(options, directory);
  expect(result.status).toBe("evaluated");
  const state = result.initial.value.global.hostSlots!["node.environment"] as any;
  expect(state.values.get("text").value).toBe("a".repeat(16000));
});

test("small repeated DAGs cannot bypass expanded-work admission", () => {
  const values: any = { v0: { symbolic: "string" } };
  for (let index = 1; index <= 12; index++) {
    values["v" + index] = select({ symbolic: "boolean" }, ref("v" + (index - 1)), ref("v" + (index - 1)));
  }
  expect(() => run("module.exports = 1;", { version: 1, values }, 0)).toThrow(/work|budget|limit/i);
});

test("legal header constructor and escaped surrogate URL remain data", () => {
  const result = run(`require('http').createServer(function(req, res) {
    if (req.headers.constructor !== 'literal' || req.url !== '\\ud800') throw 'bad data';
    console.log('preserved'); res.end();
  }).listen(8080);`, { version: 1, http: { requests: { method: "GET", url: "\ud800",
    headers: { constructor: "literal" } } } });
  expect(result.status).toBe("evaluated");
  const logs: HostEffect[] = [];
  effectPaths(result.current.value.effects).forEach(path => logs.push(...path.events.filter(event =>
    event.kind === "call" && event.call.operation === "console.log")));
  expect(logs.length).toBeGreaterThan(0);
  logs.forEach(event => expect(event.call.args).toMatchObject([
    { type: "string", value: "preserved" }
  ]));
});

test("cross-resource correlation forbids successful reads on the exhausted branch", () => {
  writeFileSync(join(directory, "data.txt"), "readable");
  const result = run(`const fs = require('fs');
    require('http').createServer(function(req, res) {
      if (req.url === '/read') { fs.readFileSync(__dirname + '/data.txt'); console.log('read succeeded'); }
      else { console.log('skipped'); }
      res.end();
    }).listen(8080);`, { version: 1, values: { available: { symbolic: "boolean" } },
      filesystem: { descriptorAvailable: ref("available") },
      http: { requests: { method: "GET", url: select(ref("available"), "/skip", "/read") } } });
  expect(result.status).toBe("evaluated");
  const outcomes = leaves([result.completion!, result.current]);
  expect(outcomes.some(([completion, context]) => isThrownValue(completion) &&
    getProperties(completion.value as TESObject, context).code &&
    (getProperties(completion.value as TESObject, context).code as any).value === "EMFILE")).toBe(true);
  const logs: HostEffect[] = [];
  effectPaths(result.current.value.effects).forEach(path => logs.push(...path.events.filter(event =>
    event.kind === "call" && event.call.operation === "console.log")));
  expect(logs.some(event => isESString(event.call.args[0]) && (event.call.args[0] as any).value === "skipped")).toBe(true);
  expect(logs.some(event => isESString(event.call.args[0]) && (event.call.args[0] as any).value === "read succeeded")).toBe(false);
});
