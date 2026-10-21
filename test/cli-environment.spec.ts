import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { copySync, removeSync } from "fs-extra";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { effectPaths, isExecutionBoundary, isForkedCompletion } from "../src";
import { runFile } from "../src/cli/runtime";
import { BranchResult } from "../src/execution-context/branches";
import { getProperties } from "../src/execution-context/Heap";
import { ESString } from "../src/string/String";
import { resolveBoolean, strictEquality } from "../src/symbolic";
import { isESString, isThrownValue, TESBoolean, WithProperties } from "../src/types";

let directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "prophet-environment-scenarios-")); });
afterEach(() => { removeSync(directory); });
const picoFixture = resolve(__dirname, "fixtures/pico-static-server-3.0.3");
const picoEntry = join(picoFixture, "package/examples/pico-http-server.js");

function writeEnvironment(environment: object): string {
  const filename = join(directory, "environment.json");
  writeFileSync(filename, JSON.stringify(environment));
  return filename;
}
function run(source: string, environment: object, maxEvents = 1) {
  writeFileSync(join(directory, "entry.cjs"), source);
  const options = { script: "entry.cjs", args: [], runtime: "node@24.21.0" as "node@24.21.0",
    maxSteps: 100000, maxEvents, environment: writeEnvironment(environment) };
  return runFile(options, directory);
}
function leaves(result: BranchResult): BranchResult[] {
  return isForkedCompletion(result[0])
    ? leaves(result[0].consequent).concat(leaves(result[0].alternate)) : [result];
}
function flatten<T>(values: T[][]): T[] { return ([] as T[]).concat(...values); }
function outcomes(result: { completion?: any; current: any }): BranchResult[] {
  expect(result.completion).toBeDefined();
  return leaves([result.completion!, result.current]);
}
function isArmedFailure([value]: BranchResult) {
  return isThrownValue(value) && isESString(value.value) && value.value.value === "armed failure";
}
// Transport inspection only: this does not implement snapshot resumption.
function decodeGraph(graph: any): any {
  const objects = new Map<string, any>();
  for (const node of graph.nodes) objects.set(node.id, node.kind === "map" ? new Map() :
    node.kind === "array" ? new Array(node.length) : node.kind === "execution-context"
      ? { type: "ExecutionContext", value: Object.create(null) } : Object.create(null));
  function decode(value: any): any {
    if (!value || typeof value !== "object") return value;
    if (value.ref !== undefined) {
      if (!objects.has(value.ref)) throw new Error("Dangling graph reference");
      return objects.get(value.ref);
    }
    switch (value.primitive) {
      case "undefined": return undefined;
      case "NaN": return NaN;
      case "Infinity": return Infinity;
      case "-Infinity": return -Infinity;
      case "-0": return -0;
      default: throw new Error("Unknown graph primitive");
    }
  }
  for (const node of graph.nodes) {
    const target = objects.get(node.id);
    for (const [key, value] of node.entries || []) {
      if (node.kind === "map") target.set(decode(key), decode(value));
      else (node.kind === "execution-context" ? target.value : target)[key] = decode(value);
    }
  }
  const roots: any = {};
  for (const [key, value] of Object.entries(graph.roots)) roots[key] = decode(value);
  return roots;
}
function cli(script: string, environment: object, maxEvents = 1) {
  const filename = writeEnvironment(environment);
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    [resolve("bin/prophet.js"), "--environment", filename, "--max-events", String(maxEvents), "--", script],
    { encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
  expect(child.stderr).toBe("");
  const graph = JSON.parse(child.stdout);
  expect(Object.keys(graph).sort()).toEqual(["nodes", "roots"]);
  return { roots: decodeGraph(graph), filename };
}
const concreteRequest = (url: string, descriptorAvailable = true) => ({ version: 1,
  filesystem: { descriptorAvailable }, http: { requests: { method: "GET", url } } });

for (const [url, status] of [["/otherfile.html", 200], ["/", 200], ["/absent.html", 404]] as Array<[string, number]>) {
  test(`real CLI supplies ${url} to unchanged pico and preserves waiting/bind failures`, () => {
    const { roots } = cli(picoEntry, concreteRequest(url));
    const all = outcomes(roots);
    expect(all.some(([value]) => isThrownValue(value))).toBe(true);
    const calls = flatten(all.map(([, context]) => effectPaths(context.value.effects, context.value.knowledge)
      .map(path => path.events.filter(event => event.kind === "call"))));
    const responding = calls.filter(path => path.some(event => event.call.operation === "http.response.writeHead"));
    expect(responding.length).toBeGreaterThan(0);
    for (const path of responding) {
      expect(path.filter(event => event.call.operation === "http.response.writeHead")
        .map(event => event.call.args[0])).toMatchObject([{ value: status }]);
      expect(path.filter(event => event.call.operation === "http.server.request")).toHaveLength(1);
      expect(path.some(event => event.call.operation === "http.response.end")).toBe(true);
      // End is an application call, not a delivered/finished transport outcome.
      expect(path.some(event => event.call.operation === "http.response.finish")).toBe(false);
      expect(path.some(event => event.call.operation === "fs.readFileSync")).toBe(status === 200);
    }
    if (status === 200) {
      const filename = url === "/" ? "defaultfile.html" : "otherfile.html";
      const expected = Array.from(readFileSync(join(picoFixture, "package/examples/static", filename)));
      let checkedBodies = 0;
      for (const [, context] of all) for (const path of effectPaths(context.value.effects, context.value.knowledge)) {
        for (const event of path.events.filter(event => event.kind === "call" && event.call.operation === "http.response.write")) {
          const properties = getProperties(event.call.args[0] as WithProperties, context);
          expect(expected.map((_byte, index) => (properties[String(index)] as { value: number }).value)).toEqual(expected);
          checkedBodies++;
        }
      }
      expect(checkedBodies).toBeGreaterThan(0);
    }
    expect(calls.some(path => path.some(event => event.call.operation === "http.server.listening") &&
      !path.some(event => event.call.operation === "http.server.request"))).toBe(true);
    for (const path of calls.filter(path => path.some(event => event.call.operation === "http.server.error"))) {
      expect(path.some(event => event.call.operation === "http.server.request")).toBe(false);
    }
  }, 40000);
}

test("real CLI explores finite method and URL choices through unchanged pico", () => {
  const { roots } = cli(picoEntry, { version: 1, filesystem: { descriptorAvailable: true },
    http: { requests: {
      method: { select: { condition: { symbolic: "boolean" }, then: "GET", else: "POST" } },
      url: { select: { condition: { symbolic: "boolean" }, then: "/otherfile.html", else: "/absent.html" } }
    } } });
  const statuses = new Set<number>();
  for (const [, context] of outcomes(roots)) for (const path of effectPaths(context.value.effects, context.value.knowledge)) {
    const request = path.events.find(event => event.kind === "call" && event.call.operation === "http.server.request");
    const response = path.events.find(event => event.kind === "call" && event.call.operation === "http.response.writeHead");
    if (!response) continue;
    expect(request).toBeDefined();
    const status = (response.call.args[0] as { value: number }).value;
    statuses.add(status);
    const properties = getProperties(request!.call.args[1] as WithProperties, context);
    expect(resolveBoolean(strictEquality(properties.method, ESString(status === 405 ? "POST" : "GET"), path.knowledge), path.knowledge)).toBe(true);
    if (status !== 405) {
      expect(resolveBoolean(strictEquality(properties.url, ESString(status === 200 ? "/otherfile.html" : "/absent.html"), path.knowledge), path.knowledge)).toBe(true);
    }
  }
  expect(statuses).toEqual(new Set([200, 404, 405]));
}, 40000);

test("real CLI keeps unchanged pico's missing-index ENOENT as an uncaught program throw without a fabricated response", () => {
  copySync(join(picoFixture, "package"), join(directory, "package"));
  mkdirSync(join(directory, "package/examples/static/empty"));
  const manifest = JSON.parse(readFileSync(join(picoFixture, "integrity.json"), "utf8"));
  for (const [filename, hash] of Object.entries(manifest.sha256)) {
    expect(createHash("sha256").update(readFileSync(join(directory, filename))).digest("hex")).toBe(hash);
  }
  const { roots } = cli(join(directory, "package/examples/pico-http-server.js"), concreteRequest("/empty/"));
  const missing = outcomes(roots).filter(([value, context]) => isThrownValue(value) &&
    isESString(getProperties(value.value as WithProperties, context).code) &&
    (getProperties(value.value as WithProperties, context).code as { value: string }).value === "ENOENT");
  expect(missing.length).toBeGreaterThan(0);
  for (const [value, context] of missing) {
    expect(isExecutionBoundary(value)).toBe(false);
    for (const path of effectPaths(context.value.effects, context.value.knowledge)) {
      expect(path.events.some(event => event.kind === "throw" && event.call.operation === "fs.readFileSync")).toBe(true);
      expect(path.events.some(event => event.call.operation.startsWith("http.response."))).toBe(false);
    }
  }
}, 40000);

test("real CLI descriptor exhaustion retains pico's EMFILE without inventing EACCES or a response", () => {
  const { roots } = cli(picoEntry, concreteRequest("/otherfile.html", false));
  const requests = outcomes(roots).filter(([, context]) => effectPaths(context.value.effects, context.value.knowledge)
    .some(path => path.events.some(event => event.call.operation === "http.server.request")));
  expect(requests.length).toBeGreaterThan(0);
  for (const [value, context] of requests) {
    expect(isThrownValue(value)).toBe(true);
    if (!isThrownValue(value)) throw new Error("Expected EMFILE completion");
    expect(getProperties(value.value as WithProperties, context).code).toMatchObject({ value: "EMFILE" });
    expect(effectPaths(context.value.effects, context.value.knowledge).every(path =>
      !path.events.some(event => event.call.operation.startsWith("http.response.")))).toBe(true);
  }
}, 40000);

test("initial and current CLI graphs retain unused shared values, aliases, provenance and request template without arrivals", () => {
  const script = join(directory, "entry.cjs");
  writeFileSync(script, "module.exports = true;");
  const { roots, filename } = cli(script, { version: 1,
    values: { alias: { ref: "unused" }, unused: { symbolic: "boolean" } },
    filesystem: { descriptorAvailable: { ref: "unused" } },
    http: { requests: { method: "GET", url: "/never-delivered" } } }, 0);
  const initial = roots.initial.value.global.hostSlots["node.environment"];
  expect(initial).toBe(roots.current.value.global.hostSlots["node.environment"]);
  expect(initial.values).toBeInstanceOf(Map);
  expect(initial.values.size).toBe(2);
  expect(initial.values.get("alias")).toBe(initial.values.get("unused"));
  expect(initial.requests).toMatchObject({ method: { kind: "literal", value: "GET" },
    url: { kind: "literal", value: "/never-delivered" } });
  expect(initial.provenance).toEqual({ path: filename, version: 1,
    sha256: createHash("sha256").update(readFileSync(filename)).digest("hex") });
  expect(roots.initial.value.global.hostSlots["node.fs"].properties.fileDescriptorsAvailable)
    .toBe(initial.values.get("unused"));
  expect(effectPaths(roots.current.value.effects).every(path =>
    !path.events.some(event => event.call.operation === "http.server.request"))).toBe(true);
}, 40000);

test("one shared Boolean correlates filesystem resource failure with a request URL choice", () => {
  writeFileSync(join(directory, "data.txt"), "contents");
  const result = run(`const fs = require('fs'); require('http').createServer(function(req, res) {
    if (req.url === '/read') { try { fs.readFileSync(__dirname + '/data.txt'); console.log('read'); }
      catch (error) { console.log(error.code); } }
    else console.log('skip'); res.end();
  }).listen(8080);`, { version: 1, values: { available: { symbolic: "boolean" } },
    filesystem: { descriptorAvailable: { ref: "available" } },
    http: { requests: { method: "GET", url: { select: {
      condition: { ref: "available" }, then: "/skip", else: "/read" } } } } });
  expect(result.status).toBe("evaluated");
  const shared = (result.initial.value.global.hostSlots!["node.environment"] as any).values.get("available") as TESBoolean;
  const logs: string[][] = [];
  for (const [, context] of outcomes(result)) for (const path of effectPaths(context.value.effects, context.value.knowledge)) {
    const messages = path.events.filter(event => event.kind === "call" && event.call.operation === "console.log")
      .map(event => (event.call.args[0] as { value: string }).value);
    logs.push(messages);
    if (messages.includes("skip")) expect(resolveBoolean(shared, path.knowledge)).toBe(true);
    if (messages.includes("EMFILE")) expect(resolveBoolean(shared, path.knowledge)).toBe(false);
  }
  expect(logs).toEqual(expect.arrayContaining([["skip"], ["EMFILE"]]));
  expect(logs.some(path => path.includes("read"))).toBe(false);
});

const armedSource = `let armed = false; require('http').createServer(function(req, res) {
  if (req.url === '/fire' && armed) throw 'armed failure';
  if (req.url === '/arm') armed = true;
  res.end('ok');
}).listen(8080);`;
const finiteURL = { select: { condition: { symbolic: "boolean" }, then: "/arm", else: "/fire" } };

test("fresh per-arrival finite choices reach a second-only armed failure while preserving shorter histories", () => {
  const environment = { version: 1, http: { requests: { method: "GET", url: finiteURL } } };
  const one = run(armedSource, environment, 1), two = run(armedSource, environment, 2);
  expect(one.status).toBe("evaluated"); expect(two.status).toBe("evaluated");
  expect(outcomes(one).some(isArmedFailure)).toBe(false);
  const fired = outcomes(two).filter(isArmedFailure);
  expect(fired.length).toBeGreaterThan(0);
  for (const [, context] of fired) for (const path of effectPaths(context.value.effects, context.value.knowledge)) {
    const requests = path.events.filter(event => event.kind === "call" && event.call.operation === "http.server.request");
    expect(requests).toHaveLength(2);
    for (const [index, url] of ["/arm", "/fire"].entries()) {
      const request = requests[index].call.args[1] as WithProperties;
      expect(resolveBoolean(strictEquality(getProperties(request, context).url, ESString(url), path.knowledge), path.knowledge)).toBe(true);
    }
  }
  const counts = flatten(outcomes(two).map(([, context]) => effectPaths(context.value.effects, context.value.knowledge)
    .map(path => path.events.filter(event => event.kind === "call" && event.call.operation === "http.server.request").length)));
  expect(counts).toEqual(expect.arrayContaining([0, 1, 2]));
  expect(counts.every(count => count <= 2)).toBe(true);
});

test("a shared named URL cannot fabricate an arm-then-fire sequence across two arrivals", () => {
  const result = run(armedSource, { version: 1, values: { url: finiteURL },
    http: { requests: { method: "GET", url: { ref: "url" } } } }, 2);
  expect(result.status).toBe("evaluated");
  expect(outcomes(result).some(isArmedFailure)).toBe(false);
  let repeated = 0;
  for (const [, context] of outcomes(result)) for (const path of effectPaths(context.value.effects, context.value.knowledge)) {
    const requests = path.events.filter(event => event.kind === "call" && event.call.operation === "http.server.request");
    if (requests.length !== 2) continue;
    repeated++;
    const first = getProperties(requests[0].call.args[1] as WithProperties, context).url;
    const second = getProperties(requests[1].call.args[1] as WithProperties, context).url;
    expect(first).toBe(second);
  }
  expect(repeated).toBeGreaterThan(0);
});

test("the same template reaches each eligible server and later arrivals honor listener replacement", () => {
  const result = run(`const http = require('http');
    http.createServer(function() { throw 'unbound'; });
    const first = http.createServer(function once(req, res) {
      if (req.url !== '/declared' || req.headers['x-fixture'] !== 'shared-domain') throw 'wrong first input'; console.log('first'); first.off('request', once);
      first.on('request', function(req, res) { if (req.url !== '/declared' || req.headers['x-fixture'] !== 'shared-domain') throw 'wrong replacement input'; console.log('replacement'); res.end(); });
      res.end();
    }); first.listen(8080);
    http.createServer(function(req, res) { if (req.url !== '/declared' || req.headers['x-fixture'] !== 'shared-domain') throw 'wrong second input'; console.log('second'); res.end(); }).listen(8081);
  `, { version: 1, http: { requests: { method: "GET", url: "/declared", headers: { "x-fixture": "shared-domain" } } } }, 2);
  expect(result.status).toBe("evaluated");
  const histories: string[][] = [];
  for (const [value, context] of outcomes(result)) {
    expect(isThrownValue(value) && isESString(value.value)).toBe(false);
    for (const path of effectPaths(context.value.effects, context.value.knowledge)) {
      const logs = path.events.filter(event => event.kind === "call" && event.call.operation === "console.log");
      histories.push(logs.map(event => (event.call.args[0] as { value: string }).value));
    }
  }
  expect(histories).toEqual(expect.arrayContaining([[], ["first"], ["second"], ["first", "replacement"], ["first", "second"], ["second", "first"]]));
  expect(histories.some(path => path.join() === "first,first")).toBe(false);
});

test("unknown request strings retain reached unsupported siblings alongside completed histories", () => {
  const result = run(`require('http').createServer(function(req, res) {
    if (req.url === '/unsupported') require('https').request('x'); res.end('ok');
  }).listen(8080);`, { version: 1, http: { requests: { method: "GET", url: { symbolic: "string" } } } }, 2);
  expect(result.status).toBe("analysis-stop");
  const all = outcomes(result), stopped = all.filter(([value]) => isExecutionBoundary(value));
  expect(stopped.length).toBeGreaterThan(0);
  for (const [, context] of stopped) for (const path of effectPaths(context.value.effects, context.value.knowledge)) {
    const calls = path.events.filter(event => event.kind === "call");
    const lastRequest = calls.map(event => event.call.operation).lastIndexOf("http.server.request");
    expect(lastRequest).toBeGreaterThan(-1);
    expect(calls.slice(lastRequest + 1).some(event => event.call.operation === "http.response.end")).toBe(false);
  }
  expect(all.filter(([value]) => !isExecutionBoundary(value)).some(([, context]) =>
    effectPaths(context.value.effects, context.value.knowledge).some(path =>
      path.events.filter(event => event.kind === "call" && event.call.operation === "http.response.end").length === 2))).toBe(true);
});
