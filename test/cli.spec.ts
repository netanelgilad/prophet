import { spawnSync } from "child_process";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { effectPaths, isForkedCompletion } from "../src";
import { getArrayElements, getProperties } from "../src/execution-context/Heap";
import { isThrownValue, TESBoolean, WithProperties, isUndefined } from "../src/types";
import { TESString } from "../src/string/String";
import { assertPinnedNode } from "./commonjs/oracle";
import { choiceOf, resolveBoolean } from "../src/symbolic";

// Decode only the documented transport containers for inspection, never native
// implementations. Maps, aliases and references survive the JSON boundary.
function decodeGraph(graph: any): any {
  const objects = new Map<string, any>();
  graph.nodes.forEach((node: any) => objects.set(node.id,
    node.kind === "map" ? new Map() : node.kind === "array" ? new Array(node.length) :
      node.kind === "execution-context" ? { type: "ExecutionContext", value: Object.create(null) } :
        Object.create(null)));
  const decode = (value: any): any => {
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
  };
  graph.nodes.forEach((node: any) => {
    const target = objects.get(node.id);
    for (const [key, value] of node.entries || []) {
      if (node.kind === "map") target.set(decode(key), decode(value));
      else (node.kind === "execution-context" ? target.value : target)[key] = decode(value);
    }
  });
  const roots: any = {};
  Object.keys(graph.roots).forEach(key => roots[key] = decode(graph.roots[key]));
  return roots;
}

function run(source: string, flags: string[] = [], args: string[] = []) {
  const directory = mkdtempSync(join(tmpdir(), "prophet-cli-"));
  const filename = join(directory, "entry.cjs");
  writeFileSync(filename, source);
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    [resolve("bin/prophet.js"), ...flags, "--", filename, ...args],
    { encoding: "utf8", timeout: 30000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  unlinkSync(filename);
  rmdirSync(directory);
  expect(child.error).toBeUndefined();
  const result = JSON.parse(child.stdout);
  expect(Object.keys(result).sort()).toEqual(["nodes", "roots"]);
  expect([0, 2]).toContain(child.status);
  expect(Object.keys(result.roots).sort()).toEqual(child.status === 0
    ? ["completion", "current", "initial"] : ["current", "initial"]);
  if (child.status === 0) expect(child.stderr).toBe("");
  else expect(child.stderr).toMatch(/^prophet: /);
  return { child, result, roots: decodeGraph(result) };
}

function outputs(context: any): string[][] {
  return effectPaths(context.value.effects, context.value.knowledge).map(path => path.events
    .filter(event => event.kind === "return" && event.call.operation === "console.stdout.write")
    .map(event => {
      const value = (event.call.args[0] as TESString).value;
      if (typeof value !== "string") throw new Error("Expected concrete output in this spec");
      return value;
    }));
}

test("CLI analyzes both random branches and retains one shared continuation in its JSON graph", () => {
  const { child, roots } = run(`
    if (Math.random() < 0.5) console.log("left"); else console.log("right");
    console.log("done");
  `);
  expect(child.status).toBe(0);
  expect(outputs(roots.initial)).toEqual([[]]);
  expect(outputs(roots.current)).toEqual([["left\n", "done\n"], ["right\n", "done\n"]]);
  const paths = effectPaths(roots.current.value.effects);
  expect(paths[0].events[paths[0].events.length - 1]).toBe(paths[1].events[paths[1].events.length - 1]);
  let trace = roots.current.value.effects;
  while (trace.kind === "event") trace = trace.previous;
  expect(trace.kind).toBe("choice");
  expect(trace.condition.expression.kind).toBe("compare");
}, 40000);

test("CLI preserves independent choices rather than correlating two random draws", () => {
  const { roots } = run(`
    if (Math.random() < 0.5) console.log("left"); else console.log("right");
    if (Math.random() < 0.5) console.log("up"); else console.log("down");
  `);
  expect(new Set(outputs(roots.current).map(path => path.join("")))).toEqual(new Set([
    "left\nup\n", "left\ndown\n", "right\nup\n", "right\ndown\n"
  ]));
}, 40000);

test("CLI captures concrete output matching pinned Node without polluting result stdout", () => {
  const source = 'console.log("ready"); console.log("\\ud800");';
  assertPinnedNode();
  const native = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath, ["-e", source],
    { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(native.status).toBe(0);
  const { child, roots } = run(source);
  expect(child.status).toBe(0);
  expect(outputs(roots.current).map(path => path.join(""))).toEqual([native.stdout]);
}, 40000);

test("a program throw remains a modeled completion, separate from a partial analysis stop", () => {
  const thrown = run('console.log("before"); throw "application failure";');
  expect(thrown.child.status).toBe(0);
  expect(isThrownValue(thrown.roots.completion)).toBe(true);
  expect(thrown.roots.completion.value.value).toBe("application failure");
  expect(outputs(thrown.roots.current)).toEqual([["before\n"]]);

  const stopped = run('console.log("before"); console.warn("unsupported"); console.log("after");');
  expect(stopped.child.status).toBe(2);
  expect(stopped.child.stderr).toMatch(/console/i);
  expect(stopped.roots).not.toHaveProperty("completion");
  expect(outputs(stopped.roots.current)).toEqual([["before\n"]]);
}, 80000);

test("CLI does not load an unsupported builtin natively even when source requests a write", () => {
  const marker = join(tmpdir(), `prophet-must-not-write-${process.pid}`);
  expect(existsSync(marker)).toBe(false);
  const { child, roots } = run(`require("fs").writeFileSync(${JSON.stringify(marker)}, "bad");`);
  expect(child.status).toBe(2);
  expect(child.stderr).toMatch(/fs|unmodeled/i);
  expect(roots).not.toHaveProperty("completion");
  expect(existsSync(marker)).toBe(false);
}, 40000);

test("CLI budget exhaustion returns a partial graph and its reached diagnostic on stderr", () => {
  const { child, roots } = run(`
    console.log("before");
    function recurse() { return recurse(); }
    recurse();
    console.log("after");
  `, ["--max-steps", "100"]);
  expect(child.status).toBe(2);
  expect(child.stderr).toMatch(/budget/i);
  expect(roots).not.toHaveProperty("completion");
  expect(outputs(roots.current)).toEqual([["before\n"]]);
}, 40000);

test("program properties are retained even when their names match removed envelope fields", () => {
  const { child, roots } = run(`module.exports = {
    modelDomain: "user model", limitations: "user limitations", execution: "user execution",
    input: "user input", graph: "user graph"
  };`);
  expect(child.status).toBe(0);
  const properties = getProperties(roots.completion, roots.current);
  expect(Object.keys(properties).sort()).toEqual(["execution", "graph", "input", "limitations", "modelDomain"]);
  expect(properties).toMatchObject({
    modelDomain: { type: "string", value: "user model" },
    limitations: { type: "string", value: "user limitations" },
    execution: { type: "string", value: "user execution" },
    input: { type: "string", value: "user input" },
    graph: { type: "string", value: "user graph" }
  });
}, 40000);

test("an undefined CommonJS export retains a normal completion root", () => {
  const { child, roots } = run("module.exports = undefined;");
  expect(child.status).toBe(0);
  expect(roots).toHaveProperty("completion");
  expect(roots.completion).toMatchObject({ type: "undefined" });
}, 40000);

test("normal and throwing alternatives stay distinct after crossing the JSON boundary", () => {
  const { child, roots } = run(`
    if (Math.random() < 0.5) { console.log("throwing"); throw "stop"; }
    console.log("normal");
  `);
  expect(child.status).toBe(0);
  expect(isForkedCompletion(roots.completion)).toBe(true);
  expect(isThrownValue(roots.completion.consequent[0])).toBe(true);
  expect(isThrownValue(roots.completion.alternate[0])).toBe(false);
  expect(outputs(roots.completion.consequent[1])).toEqual([["throwing\n"]]);
  expect(outputs(roots.completion.alternate[1])).toEqual([["normal\n"]]);
}, 40000);

test("CLI usage failure writes diagnostics only to stderr", () => {
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    [resolve("bin/prophet.js"), "--runtime", "node@1", "--", "missing.cjs"],
    { encoding: "utf8", timeout: 30000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(1);
  expect(child.stdout).toBe("");
  expect(child.stderr).toMatch(/node@24\.21\.0/);
}, 40000);

test("CLI delivers both HTTP binding notifications after top-level code and retains correlated state", () => {
  const { child, roots } = run(`
    const http = require("node:http");
    const server = http.createServer(function(req, res) { res.end("hello"); });
    server.on("error", function(error) { console.log("failed"); });
    server.listen(8080, function() { console.log("ready"); });
    console.log("after listen");
    module.exports = server;
  `);
  expect(child.status).toBe(0);
  const server = roots.completion;
  const state = server.hostSlots["node.http.server"];
  const paths = effectPaths(roots.current.value.effects);
  expect(outputs(roots.current)).toEqual([["after listen\n", "ready\n"], ["after listen\n", "failed\n"]]);
  expect(isUndefined(getProperties(state, roots.current).pending)).toBe(true);
  expect(resolveBoolean(getProperties(server, roots.current).listening as TESBoolean, roots.current.value.knowledge))
    .toBeUndefined();
  for (const path of paths) {
    const succeeds = path.events.some(event => event.call.operation === "http.server.listening");
    expect(resolveBoolean(getProperties(server, roots.current).listening as TESBoolean, path.knowledge)).toBe(succeeds);
    expect(path.events.filter(event => event.kind === "call" && event.call.operation === "http.server.bind"))
      .toHaveLength(1);
    expect(path.events.some(event => event.call.operation === "http.server.request")).toBe(false);
  }
  const returned = paths[0].events.find(event => event.kind === "return" && event.call.operation === "http.server.listen")!;
  const beforeDelivery = { ...roots.current, value: { ...roots.current.value, heap: returned.heap } };
  const pending = getProperties(state, beforeDelivery).pending as WithProperties;
  expect(getProperties(pending, beforeDelivery).delivered).toMatchObject({ value: false });
  expect(getProperties(pending, roots.current).delivered).toMatchObject({ value: true });
  expect(choiceOf(getProperties(pending, beforeDelivery).outcome)).toBeDefined();
  const queue = roots.current.value.global.hostSlots["node.nextTick"];
  expect(getArrayElements(getProperties(queue, roots.current).pending as any, roots.current)).toEqual([]);
  expect(getArrayElements(getProperties(queue, roots.initial).pending as any, roots.initial)).toEqual([]);
  expect(isUndefined(getProperties(queue, roots.current).active)).toBe(true);
}, 40000);

test("CLI unhandled startup errors stop their timeline while normal startup preserves module exports", () => {
  const { child, roots } = run(`
    const server = require("http").createServer();
    server.listen(8080, function() { console.log("ready"); });
    console.log("top"); module.exports = "exported";
  `);
  expect(child.status).toBe(0);
  expect(isForkedCompletion(roots.completion)).toBe(true);
  expect(roots.completion.consequent[0]).toMatchObject({ value: "exported" });
  expect(isThrownValue(roots.completion.alternate[0])).toBe(true);
  expect(outputs(roots.completion.consequent[1])).toEqual([["top\n", "ready\n"]]);
  expect(outputs(roots.completion.alternate[1])).toEqual([["top\n"]]);
}, 40000);

test("CLI top-level throws leave queued startup work pending", () => {
  const { child, roots } = run(`
    const server = require("http").createServer();
    server.listen(8080, function() { console.log("must not run"); });
    console.log("top"); throw "entry failed";
  `);
  expect(child.status).toBe(0);
  expect(isThrownValue(roots.completion)).toBe(true);
  expect(outputs(roots.current)).toEqual([["top\n"]]);
  const queue = roots.current.value.global.hostSlots["node.nextTick"];
  expect(getArrayElements(getProperties(queue, roots.current).pending as any, roots.current)).toHaveLength(1);
}, 40000);

test("CLI startup budget exhaustion retains the running callback instead of claiming completion", () => {
  const { child, roots } = run(`
    const server = require("http").createServer();
    server.listen(0, function() {
      console.log("callback"); function again() { return again(); } again();
    });
    console.log("top");
  `, ["--max-steps", "150"]);
  expect(child.status).toBe(2);
  expect(child.stderr).toMatch(/budget/);
  expect(roots).not.toHaveProperty("completion");
  expect(outputs(roots.current)).toEqual([["top\n", "callback\n"]]);
  const queue = roots.current.value.global.hostSlots["node.nextTick"];
  expect(isUndefined(getProperties(queue, roots.current).active)).toBe(false);
}, 40000);


test("CLI runs the unchanged pico startup file through ready and unhandled-error timelines", () => {
  const filename = resolve("test/fixtures/pico-static-server-3.0.3/package/examples/pico-http-server.js");
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    [resolve("bin/prophet.js"), "--", filename],
    { encoding: "utf8", timeout: 30000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
  expect(child.stderr).toBe("");
  const graph = JSON.parse(child.stdout);
  expect(Object.keys(graph).sort()).toEqual(["nodes", "roots"]);
  const roots = decodeGraph(graph);
  expect(isForkedCompletion(roots.completion)).toBe(true);
  const ready = roots.completion.consequent;
  const failed = roots.completion.alternate;
  expect(ready[0]).toMatchObject({ type: "object" });
  expect(isThrownValue(failed[0])).toBe(true);
  expect(failed[0].value).toMatchObject({ type: "object", errorData: true });
  expect(outputs(ready[1])).toEqual([["Static server is listening http requests on port 8080\n"]]);
  expect(outputs(failed[1])).toEqual([[]]);
  const path = effectPaths(ready[1].value.effects, ready[1].value.knowledge)[0];
  const created = path.events.find(event => event.kind === "return" && event.call.operation === "http.createServer")!;
  if (created.kind !== "return") throw new Error("Expected server creation");
  const server = created.value as WithProperties;
  expect(getProperties(server, ready[1]).listening).toMatchObject({ value: true });
  expect(getProperties(server, failed[1]).listening).toMatchObject({ value: false });
  expect(server.hostSlots!["node.events"]).toBeDefined();
  const emitter = server.hostSlots!["node.events"] as WithProperties;
  const listeners = getArrayElements(getProperties(emitter, ready[1])["event:request"] as any, ready[1])!;
  expect(listeners).toHaveLength(1);
  expect(getProperties(listeners[0] as WithProperties, ready[1]).listener).toBe(created.call.args[0]);
  const state = server.hostSlots!["node.http.server"] as WithProperties;
  expect(getProperties(state, ready[1]).phase).toMatchObject({ value: "listening" });
  expect(isUndefined(getProperties(state, ready[1]).pending)).toBe(true);
  const queue = roots.current.value.global.hostSlots["node.nextTick"];
  expect(getArrayElements(getProperties(queue, ready[1]).pending as any, ready[1])).toEqual([]);
  expect(getArrayElements(getProperties(queue, failed[1]).pending as any, failed[1])).toEqual([]);
  expect(path.events.some(event => event.call.operation === "http.server.request")).toBe(false);
  // The original registered function survives the JSON projection, but has
  // not run and has not acquired or inferred any target filesystem state.
  expect(graph.nodes.some((node: any) => node.definition !== undefined)).toBe(true);
}, 40000);
