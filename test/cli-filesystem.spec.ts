import { spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "fs";
import { removeSync } from "fs-extra";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { runFile } from "../src/cli/runtime";
import { encodeGraph } from "../src/cli/graph";
import { effectPaths } from "../src/effects";
import { getProperties } from "../src/execution-context/Heap";
import { ESObject } from "../src/Object";
import { isESString } from "../src/types";
import { resolveBoolean } from "../src/symbolic";

let directory: string;
beforeEach(() => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), "prophet-cli-fs-")));
  mkdirSync(join(directory, "docs"));
  writeFileSync(join(directory, "message.txt"), "hello from captured state\n");
});
afterEach(() => { removeSync(directory); });
function run(source: string) {
  writeFileSync(join(directory, "entry.cjs"), source);
  return runFile({ script: "entry.cjs", args: [], maxSteps: 100000, runtime: "node@24.21.0" }, directory);
}

test("automatic CLI environment supports real observed reads and retains resource failure alternatives", () => {
  const result = run(`const fs = require('node:fs');
    let outcome; try { outcome = fs.readFileSync('message.txt', 'utf8'); }
    catch (error) { outcome = error.code; }
    module.exports = outcome === 'hello from captured state\\n' || outcome === 'EMFILE';`);
  expect(result.status).toBe("evaluated");
  expect(result.completion).toMatchObject({ value: true });
  const paths = effectPaths(result.current.value.effects);
  const reads = paths.map(path => path.events.find(event => event.call.operation === "fs.readFileSync" && event.kind !== "call")!);
  expect(reads).toHaveLength(2);
  expect(reads.some(event => event.kind === "return" && isESString(event.value) && event.value.value === "hello from captured state\n")).toBe(true);
  expect(reads.filter(event => event.kind === "throw")).toMatchObject([{ value: { properties: { code: { value: "EMFILE" } } } }]);
});

test("captured directory existence and missing child produce modeled exceptions through ordinary catch", () => {
  const result = run(`const fs = require('fs'); let outcome;
    try { fs.readFileSync('docs/index.html'); } catch (error) { outcome = error.code; }
    module.exports = fs.existsSync('docs') && !fs.existsSync('missing') &&
      (outcome === 'ENOENT' || outcome === 'EMFILE');`);
  expect(result.status).toBe("evaluated");
  expect(result.completion).toMatchObject({ value: true });
});

test("the graph retains open filesystem state, reached observations and unknown descriptor availability", () => {
  const result = run(`module.exports = require('fs').existsSync('message.txt') && !require('fs').existsSync('missing');`);
  expect(result.status).toBe("evaluated");
  const state = result.current.value.global.hostSlots!["node.fs"] as ReturnType<typeof ESObject>;
  expect(getProperties(state, result.current).cwd).toMatchObject({ value: directory });
  expect(getProperties(state, result.current).platform).toMatchObject({ value: process.platform });
  expect(resolveBoolean(getProperties(state, result.current).fileDescriptorsAvailable as any)).toBeUndefined();
  let node = getProperties(state, result.current).root as ReturnType<typeof ESObject>;
  for (const component of directory.split('/').filter(Boolean)) node = getProperties(node, result.current)[component] as typeof node;
  expect(getProperties(node, result.initial)["message.txt"]).toBeUndefined();
  expect(getProperties(node, result.current).missing).toMatchObject({ type: "null" });
  const file = getProperties(node, result.current)["message.txt"] as typeof node;
  expect(getProperties(file, result.current).text).toMatchObject({ type: "string", value: undefined });
  expect((node.hostSlots!["node.fs.entry"] as typeof node).properties.complete).toMatchObject({ value: false });
  const graph = encodeGraph({ initial: result.initial, current: result.current, completion: result.completion });
  expect(graph.nodes.some(item => item.entries.some(pair => pair[0] === "node.fs"))).toBe(true);
});

test("real CLI stdout serializes captured filesystem observations without printing guest output", () => {
  run(`console.log(require('fs').existsSync('message.txt') ? 'observed' : 'missing');`);
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    [resolve("bin/prophet.js"), "--", "entry.cjs"], { cwd: directory, encoding: "utf8", timeout: 30000,
      env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
  expect(child.stderr).toBe("");
  const graph = JSON.parse(child.stdout);
  expect(Object.keys(graph).sort()).toEqual(["nodes", "roots"]);
  expect(graph.nodes.some((node: any) => node.entries.some((pair: any) => pair[0] === "node.fs"))).toBe(true);
  expect(graph.nodes.some((node: any) => node.entries.some((pair: any) => pair[0] === "value" && pair[1] === "observed\n"))).toBe(true);
});

test("unsupported filesystem writes never execute against the captured host tree", () => {
  const result = run(`require('fs').writeFileSync('message.txt', 'changed');`);
  expect(result.status).toBe("analysis-stop");
  expect(readFileSync(join(directory, "message.txt"), "utf8")).toBe("hello from captured state\n");
});
