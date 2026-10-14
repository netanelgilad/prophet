import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, lstatSync, writeFileSync } from "fs";
import { copySync, removeSync } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { runFile } from "../src/cli/runtime";
import { effectPaths } from "../src/effects";
import { isESFunction } from "../src/Function/Function";
import { hasExecutionBoundary, isForkedCompletion, ForkedCompletion } from "../src/execution-context/Completion";
import { Any, isThrownValue, WithProperties } from "../src/types";
import { getProperties } from "../src/execution-context/Heap";
import { assertPinnedNode } from "./commonjs/oracle";

const packages = [
  { fixture: "sirv-3.0.2", name: "sirv", version: "3.0.2", count: 6 },
  { fixture: "mrmime-2.0.1", name: "mrmime", version: "2.0.1", count: 6 },
  { fixture: "totalist-3.0.1", name: "totalist", version: "3.0.1", count: 9 },
  { fixture: "polka-url-1.0.0-next.29", name: "@polka/url", version: "1.0.0-next.29", count: 5 }
];

let directory: string;
beforeEach(() => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), "prophet-sirv-")));
  for (const item of packages) {
    copySync(join(__dirname, "fixtures", item.fixture, "package"), join(directory, "node_modules", item.name));
  }
  mkdirSync(join(directory, "site"));
  writeFileSync(join(directory, "site", "hello.txt"), "hello from sirv\n");
  writeFileSync(join(directory, "entry.cjs"), 'module.exports = require("sirv");');
});
afterEach(() => { removeSync(directory); });

for (const item of packages) {
  test(`the complete ${item.name}@${item.version} fixture retains its published file set and bytes`, () => {
    const fixture = join(__dirname, "fixtures", item.fixture);
    const manifest = JSON.parse(readFileSync(join(fixture, "integrity.json"), "utf8"));
    expect(manifest).toMatchObject({ name: item.name, version: item.version });
    expect(manifest.archiveIntegrity).toMatch(/^sha512-/);
    const paths: string[] = [];
    function collect(parent: string) {
      for (const name of readdirSync(join(fixture, parent))) {
        const path = parent + "/" + name;
        const info = lstatSync(join(fixture, path));
        expect(info.isSymbolicLink()).toBe(false);
        if (info.isDirectory()) collect(path);
        else { expect(info.isFile()).toBe(true); paths.push(path); }
      }
    }
    collect("package");
    expect(paths).toHaveLength(item.count);
    expect(paths.sort()).toEqual(Object.keys(manifest.files).sort());
    for (const path of paths) expect(createHash("sha256").update(readFileSync(join(fixture, path))).digest("hex"))
      .toBe(manifest.files[path]);
    const metadata = JSON.parse(readFileSync(join(fixture, "package/package.json"), "utf8"));
    expect(metadata).toMatchObject({ name: item.name, version: item.version, license: "MIT" });
  });
}

test("the unchanged sirv dependency graph imports through the assembled CLI environment", () => {
  const result = runFile({ script: "entry.cjs", args: [], maxSteps: 100000, runtime: "node@24.21.0" }, directory);
  expect(result.status).toBe("evaluated");
  expect(isESFunction(result.completion!)).toBe(true);
  expect(effectPaths(result.current.value.effects).every(path => !path.events.some(event =>
    /^(fs\.|http\.)/.test(event.call.operation)))).toBe(true);
  // Actual conditional exports selected build.js; no source rewrite or loader bypass.
  expect(result.input.sources.has(join(directory, "node_modules/sirv/package.json"))).toBe(true);
  expect(result.input.sources.get(join(directory, "node_modules/sirv/build.js"))!.text)
    .toBe(readFileSync(join(directory, "node_modules/sirv/build.js"), "utf8"));
  for (const dependency of ['totalist/sync/index.js', '@polka/url/build.js', 'mrmime/index.js']) {
    expect(result.input.sources.has(join(directory, 'node_modules', dependency))).toBe(true);
  }
});

test("the unchanged sirv factory returns its request handler", () => {
  writeFileSync(join(directory, "entry.cjs"), 'module.exports = require("sirv")("./site");');
  const result = runFile({ script: "entry.cjs", args: [], maxSteps: 100000, runtime: "node@24.21.0" }, directory);
  expect(result.status).toBe("evaluated");
  // Both flagless filters execute on the unmodified filename. Stats.size and
  // Stats.mtime complete with the observed byte count (16) and declared
  // mtime, header preparation (Content-Length, Content-Type from unchanged
  // mrmime substring, Last-Modified) finishes, the ASCII filename normalize
  // is the identity, the no-backslash replace is the identity, and
  // viaCache.bind captures the completed FILES table. The factory returns
  // its request handler closure; the filesystem failure sibling still throws.
  expect(isForkedCompletion(result.completion)).toBe(true);
  expect(hasExecutionBoundary(result.completion as Any)).toBe(false);
  const forked = result.completion as ForkedCompletion;
  const returned = [forked.consequent, forked.alternate].find(leaf => !isThrownValue(leaf[0]))!;
  expect(isESFunction(returned[0])).toBe(true);
  const failed = [forked.consequent, forked.alternate].find(leaf => isThrownValue(leaf[0]))!;
  if (!isThrownValue(failed[0])) throw new Error("expected filesystem throw");
  expect(getProperties(failed[0].value as WithProperties, failed[1]).code).toMatchObject({ value: "EMFILE" });
  // Completed mrmime and toHeaders activations persist in the returned state.
  const records = Array.from(returned[1].value.environments.values());
  const mimeRecord = records.find(record => record.has("tmp") && record.has("idx"))!;
  expect(mimeRecord.get("tmp")!.value).toMatchObject({value: "hello.txt"});
  expect(mimeRecord.get("idx")!.value).toMatchObject({value: 6});
  const headersRecord = records.find(record => record.has("ctype") && record.has("headers"))!;
  expect(headersRecord.get("ctype")!.value).toMatchObject({value: "text/plain"});
  expect(headersRecord.get("headers")!.value).toBeDefined();
  // Both descriptor histories retain the reached enumeration and its outcome.
  for (const leaf of [returned, failed]) {
    const kind = leaf === returned ? "return" : "throw";
    const histories = effectPaths(leaf[1].value.effects);
    expect(histories.length).toBeGreaterThan(0);
    for (const history of histories) {
      const events = history.events.filter(event => event.call.operation === "fs.readdirSync");
      expect(events.map(event => event.kind)).toEqual(["call", kind]);
      expect(events[0].call).toBe(events[1].call);
    }
  }
  expect(effectPaths(returned[1].value.effects).some(path => path.events.some(event =>
    event.call.operation === "fs.statSync"))).toBe(true);
});

test("pinned Node serves GET, HEAD and missing-file requests through unchanged sirv and its dependencies", () => {
  assertPinnedNode();
  const driver = `
    const http = require('node:http');
    const sirv = require('./entry.cjs');
    const server = http.createServer(sirv('./site'));
    const observed = [];
    const cases = [['GET', '/hello.txt'], ['HEAD', '/hello.txt'], ['GET', '/missing']];
    server.on('error', error => { throw error; });
    server.listen(0, '127.0.0.1', () => next());
    function next() {
      if (!cases.length) return server.close(() => console.log(JSON.stringify(observed)));
      const [method, path] = cases.shift();
      const req = http.request({ host: '127.0.0.1', port: server.address().port, method, path, agent: false }, res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => body += chunk);
        res.on('error', error => { throw error; });
        res.on('end', () => {
          observed.push({ method, path, status: res.statusCode, body });
          next();
        });
      });
      req.on('error', error => { throw error; });
      req.end();
    }
  `;
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ["--no-global-search-paths", "-e", driver], { cwd: directory, encoding: "utf8", timeout: 10000,
      env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
  expect(child.stderr).toBe("");
  expect(JSON.parse(child.stdout)).toEqual([
    { method: "GET", path: "/hello.txt", status: 200, body: "hello from sirv\n" },
    { method: "HEAD", path: "/hello.txt", status: 200, body: "" },
    { method: "GET", path: "/missing", status: 404, body: "" }
  ]);
});

test("the real CLI serializes the unchanged sirv import and nested literal definitions", () => {
  assertPinnedNode();
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    [join(__dirname, "../bin/prophet.js"), "--", "entry.cjs"], {
      cwd: directory, encoding: "utf8", timeout: 60000, maxBuffer: 40 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }
    });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
  expect(child.stderr).toBe("");
  const graph = JSON.parse(child.stdout);
  expect(Object.keys(graph).sort()).toEqual(["nodes", "roots"]);
  expect(graph.roots.completion).toBeDefined();
  const literals = graph.nodes.filter((node: any) => node.kind === "record" &&
    node.entries.some(([name]: [string]) => name === "regex"));
  expect(literals.length).toBeGreaterThan(0);
  for (const literal of literals) expect(literal.entries).toContainEqual(["value", null]);
  expect(graph.nodes.some((node: any) => node.definition)).toBe(true);
});

test("the real CLI factory graph retains the returned handler and filesystem throw", () => {
  assertPinnedNode();
  writeFileSync(join(directory, "entry.cjs"), 'module.exports = require("sirv")("./site");');
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    [join(__dirname, "../bin/prophet.js"), "--", "entry.cjs"], {
      cwd: directory, encoding: "utf8", timeout: 60000, maxBuffer: 80 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }
    });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
  expect(child.stderr).toBe("");
  const graph = JSON.parse(child.stdout);
  expect(Object.keys(graph).sort()).toEqual(["nodes", "roots"]);
  const nodes = new Map<string, any>(graph.nodes.map((node: any) => [node.id, node]));
  const field = (reference: any, key: string) => {
    const pair = nodes.get(reference.ref).entries.find(([name]: [string]) => name === key);
    return pair && pair[1];
  };
  const fork = graph.roots.completion;
  expect(field(fork, "type")).toBe("ForkedCompletion");
  const leaves = [field(fork, "consequent"), field(fork, "alternate")];
  const values = leaves.map(leaf => field(leaf, "0"));
  // The healthy leaf is the returned request handler closure; the filesystem
  // failure sibling still throws EMFILE.
  expect(values.map(value => field(value, "type")).sort()).toEqual(["ThrownValue", "function"]);
  const failed = values.find(value => field(value, "type") === "ThrownValue");
  expect(field(field(field(field(failed, "value"), "properties"), "code"), "value")).toBe("EMFILE");
  const handler = values.find(value => field(value, "type") === "function");
  expect(field(handler, "function")).toBeDefined();
  // Inspect the public environment records, not the private flattened scope view.
  const returned = leaves.find(leaf => field(field(leaf, "0"), "type") === "function");
  const state = field(returned, "1");
  const environments = nodes.get(field(state, "environments").ref).entries;
  let tmp: any, idx: any;
  for (const [, record] of environments) {
    for (const name of ["tmp", "idx"]) {
      const binding = nodes.get(record.ref).entries.find(([key]: [string]) => key === name);
      if (binding) { if (name === "tmp") tmp = field(binding[1], "value"); else idx = field(binding[1], "value"); }
    }
    if (tmp && idx) break;
  }
  // ctype persists in the completed toHeaders activation, outside the chain.
  let ctype: any;
  for (const [, record] of environments) {
    const binding = nodes.get(record.ref).entries.find(([key]: [string]) => key === "ctype");
    if (binding) { ctype = binding; break; }
  }
  expect(ctype).toBeDefined();
  expect(field(field(ctype[1], "value"), "value")).toBe("text/plain");
  expect(tmp).toBeDefined();
  expect(field(tmp, "value")).toBe("hello.txt");
  expect(field(idx, "value")).toBe(6);
  expect(graph.nodes.some((node: any) => (node.entries || []).some(([name, value]: [string, any]) =>
    name === "operation" && value === "fs.readdirSync"))).toBe(true);
});
