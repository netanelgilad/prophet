import { isForkedCompletion } from "../src";
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "fs";
import { removeSync } from "fs-extra";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { runFile } from "../src/cli/runtime";
import { effectPaths } from "../src/effects";
import { TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { WithProperties } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

let directory: string;
beforeEach(() => { directory = realpathSync(mkdtempSync(join(tmpdir(), "prophet-cli-imports-"))); });
afterEach(() => { removeSync(directory); });

function write(files: { [name: string]: string }) {
  for (const name of Object.keys(files)) {
    const filename = join(directory, name);
    mkdirSync(dirname(filename), { recursive: true });
    writeFileSync(filename, files[name]);
  }
}

function run(files: { [name: string]: string }, entry = "entry.cjs") {
  write(files);
  return runFile({ script: entry, args: [], maxSteps: 100000, runtime: "node@24.21.0" }, directory);
}

function outputs(context: TExecutionContext): string[][] {
  return effectPaths(context.value.effects, context.value.knowledge).map(path => path.events
    .filter(event => event.kind === "return" && event.call.operation === "console.stdout.write")
    .map(event => (event.call.args[0] as { value: string }).value));
}

function nativeOutput(entry = "entry.cjs"): string {
  assertPinnedNode();
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ["--no-global-search-paths", join(directory, entry)],
    { encoding: "utf8", timeout: 10000, cwd: directory,
      env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
  expect(child.stderr).toBe("");
  return child.stdout;
}

test("automatic acquisition interprets a local dependency reached through a computed saved require", () => {
  const result = run({
    "entry.cjs": `const load = require; const name = "./" + "dependency.cjs";
      module.exports = load(name)(41); console.log(module.exports === 42 ? "ok" : "bad");`,
    "dependency.cjs": `module.exports = function(value) { return value + 1; };`
  });
  expect(result.status).toBe("evaluated");
  expect(result.completion).toMatchObject({ type: "number", value: 42 });
  expect(outputs(result.current)).toEqual([["ok\n"]]);
  expect(outputs(result.current)[0].join("")).toBe(nativeOutput());
});

test("nested and parent-relative imports, JSON and a package main share ordinary Node resolution", () => {
  const result = run({
    "entry.cjs": `module.exports = require("./nested/left"); console.log(module.exports === 42 ? "ok" : "bad");`,
    "nested/left.js": `module.exports = require("../config.json").answer + require("tiny").offset;`,
    "config.json": `{"answer":40}`,
    "node_modules/tiny/package.json": `{"main":"src/value.cjs"}`,
    "node_modules/tiny/src/value.cjs": `exports.offset = 2;`
  });
  expect(result.status).toBe("evaluated");
  expect(result.completion).toMatchObject({ type: "number", value: 42 });
  expect(outputs(result.current)[0].join("")).toBe(nativeOutput());
});

test("package exports selects its require condition instead of its legacy main", () => {
  const result = run({
    "entry.cjs": `module.exports = require("tiny"); console.log(module.exports === "selected" ? "ok" : "bad");`,
    "node_modules/tiny/package.json": `{"main":"legacy.cjs","exports":{"require":"./selected.cjs","default":"./fallback.cjs"}}`,
    "node_modules/tiny/selected.cjs": `module.exports = "selected";`,
    "node_modules/tiny/legacy.cjs": `throw "wrong main";`,
    "node_modules/tiny/fallback.cjs": `throw "wrong condition";`
  });
  expect(result.status).toBe("evaluated");
  expect(result.completion).toMatchObject({ type: "string", value: "selected" });
  expect(outputs(result.current)[0].join("")).toBe(nativeOutput());
});

test("conditional and repeated require preserve identity and initialize once on each symbolic path", () => {
  const result = run({
    "entry.cjs": `const selected = Math.random() < 0.5;
      let first;
      if (selected) first = require("./counter.cjs");
      const second = require("./counter.cjs");
      module.exports = selected ? first === second : first === undefined;
      console.log("done");`,
    "counter.cjs": `console.log("initialized"); module.exports = {};`
  });
  expect(result.status).toBe("evaluated");
  expect(result.completion).toMatchObject({ type: "boolean", value: true });
  expect(outputs(result.current)).toEqual([["initialized\n", "done\n"], ["initialized\n", "done\n"]]);
  expect(outputs(result.initial)).toEqual([[]]);
});

test("a finite symbolic module name acquires both alternatives and caches each only on its own path", () => {
  const result = run({
    "entry.cjs": `const name = Math.random() < 0.5 ? "./left.cjs" : "./right.cjs";
      const first = require(name); module.exports = first === require(name); console.log("done");`,
    "left.cjs": `console.log("left"); module.exports = {};`,
    "right.cjs": `console.log("right"); module.exports = {};`
  });
  expect(result.status).toBe("evaluated");
  expect(result.completion).toMatchObject({ type: "boolean", value: true });
  expect(outputs(result.current)).toEqual([["left\n", "done\n"], ["right\n", "done\n"]]);
});

test("a dependency cycling back to the process main observes its partial exports and main id", () => {
  const result = run({
    "entry.cjs": `exports.phase = "starting"; exports.id = module.id;
      const child = require("./child.cjs"); exports.phase = "finished";
      exports.same = child.entry === exports; exports.during = child.during;
      console.log(exports.same && child.during === "starting" && child.id === "." ? "ok" : "bad");`,
    "child.cjs": `exports.entry = require("./entry.cjs"); exports.during = exports.entry.phase; exports.id = exports.entry.id;`
  });
  expect(result.status).toBe("evaluated");
  expect(getProperties(result.completion as WithProperties, result.current)).toMatchObject({
    phase: { value: "finished" }, id: { value: "." }, same: { value: true }, during: { value: "starting" }
  });
  expect(outputs(result.current)[0].join("")).toBe(nativeOutput());
});

test.each(["./absent", "./plain/child.cjs"])("a verified unavailable local module is a catchable MODULE_NOT_FOUND completion: %s", request => {
  const result = run({
    "entry.cjs": `let missing = false;
      try { require(${JSON.stringify(request)}); } catch (error) { missing = error.code === "MODULE_NOT_FOUND"; }
      module.exports = missing; console.log(missing ? "caught" : "bad");`,
    "plain": "this is a regular file rather than a directory"
  });
  expect(result.status).toBe("evaluated");
  expect(result.completion).toMatchObject({ type: "boolean", value: true });
  expect(outputs(result.current)).toEqual([["caught\n"]]);
  expect(outputs(result.current)[0].join("")).toBe(nativeOutput());
});

test("a reached unmodeled builtin in a dependency stops outside application catch and retains preceding output", () => {
  const result = run({
    "entry.cjs": `console.log("entry"); try { require("./dependency.cjs"); }
      catch (error) { console.log("caught"); } console.log("after");`,
    "dependency.cjs": `console.log("dependency"); require("net"); console.log("unreachable");`
  });
  expect(result.status).toBe("analysis-stop");
  expect(result.completion).toBeUndefined();
  expect(result.diagnostic).toMatch(/net/);
  expect(outputs(result.current)).toEqual([["entry\n", "dependency\n"]]);
});

test("an unresolved bare package cannot claim absence while global lookup sources are uncaptured", () => {
  const result = run({
    "entry.cjs": `console.log("before"); try { require("prophet-uncaptured-package-that-does-not-exist"); }
      catch (error) { console.log("caught"); } console.log("after");`
  });
  expect(result.status).toBe("analysis-stop");
  expect(result.completion).toBeUndefined();
  expect(result.diagnostic).toMatch(/NODE_PATH\/global/);
  expect(outputs(result.current)).toEqual([["before\n"]]);
});

test("a failed initializer is retried while its successfully initialized child remains cached", () => {
  const result = run({
    "entry.cjs": `let caught = 0;
      try { require("./failed.cjs"); } catch (error) { if (error === "init") caught = caught + 1; }
      try { require("./failed.cjs"); } catch (error) { if (error === "init") caught = caught + 1; }
      module.exports = caught === 2; console.log(module.exports ? "caught twice" : "bad");`,
    "failed.cjs": `require("./stable.cjs"); console.log("attempt"); throw "init";`,
    "stable.cjs": `console.log("stable"); module.exports = {};`
  });
  expect(result.status).toBe("evaluated");
  expect(result.completion).toMatchObject({ type: "boolean", value: true });
  expect(outputs(result.current)).toEqual([["stable\n", "attempt\n", "attempt\n", "caught twice\n"]]);
  expect(outputs(result.current)[0].join("")).toBe(nativeOutput());
});

test("a captured CommonJS dependency syntax error stays catchable program behavior", () => {
  const result = run({
    "entry.cjs": `let caught = false;
      try { require("./broken.cjs"); } catch (error) { caught = error.name === "SyntaxError"; }
      module.exports = caught; console.log(caught ? "syntax" : "bad");`,
    "broken.cjs": `const value = ;`
  });
  expect(result.status).toBe("evaluated");
  expect(result.completion).toMatchObject({ type: "boolean", value: true });
  expect(outputs(result.current)).toEqual([["syntax\n"]]);
  expect(outputs(result.current)[0].join("")).toBe(nativeOutput());
});

test("unchanged pico startup follows its original imports and retains ready and unhandled-bind-failure paths", () => {
  const packagePath = resolve("test/fixtures/pico-static-server-3.0.3/package");
  const result = runFile({ script: join(packagePath, "examples/pico-http-server.js"), args: [],
    maxSteps: 100000, runtime: "node@24.21.0" }, process.cwd());
  expect(result.status).toBe("evaluated");
  expect(result.diagnostic).toBeUndefined();
  expect(isForkedCompletion(result.completion)).toBe(true);
  expect(outputs(result.current)).toEqual([["Static server is listening http requests on port 8080\n"], []]);
  expect(result.input.sources.has(realpathSync(join(packagePath, "index.js")))).toBe(true);
  expect(effectPaths(result.current.value.effects).every(path =>
    !path.events.some(event => event.call.operation === "http.server.request"))).toBe(true);
});

test.each([
  ["dependency.mjs", `export default 1;`],
  ["dependency.node", "not a native addon"],
  ["esm/index.js", "module.exports = 1;"]
])("unsupported acquired dependency format stops without turning into a missing module: %s", (name, source) => {
  const result = run({
    "entry.cjs": `console.log("before"); try { require(${JSON.stringify("./" + name)}); }
      catch (error) { console.log("caught"); } console.log("after");`,
    [name]: source,
    "esm/package.json": `{"type":"module"}`
  });
  expect(result.status).toBe("analysis-stop");
  expect(result.completion).toBeUndefined();
  expect(result.diagnostic).toMatch(name.endsWith(".node") ? /\.node|native/i : /ES module|ESM/i);
  expect(outputs(result.current)).toEqual([["before\n"]]);
});

test("an existing dependency outside the capture encoding domain is not reported as absent", () => {
  write({ "entry.cjs": `console.log("before"); try { require("./invalid.cjs"); }
    catch (error) { console.log("caught"); } console.log("after");` });
  writeFileSync(join(directory, "invalid.cjs"), Buffer.from([0xff]));
  const result = runFile({ script: "entry.cjs", args: [], maxSteps: 100000, runtime: "node@24.21.0" }, directory);
  expect(result.status).toBe("analysis-stop");
  expect(result.diagnostic).toMatch(/UTF-8/i);
  expect(outputs(result.current)).toEqual([["before\n"]]);
});

test("a symlinked dependency stops explicitly instead of treating the link as absent", () => {
  write({
    "entry.cjs": `console.log("before"); try { require("./linked.cjs"); }
      catch (error) { console.log("caught"); } console.log("after");`,
    "actual.cjs": `console.log("must not execute"); module.exports = true;`
  });
  symlinkSync(join(directory, "actual.cjs"), join(directory, "linked.cjs"));
  const result = runFile({ script: "entry.cjs", args: [], maxSteps: 100000, runtime: "node@24.21.0" }, directory);
  expect(result.status).toBe("analysis-stop");
  expect(result.diagnostic).toMatch(/symlink|symbolic link/i);
  expect(outputs(result.current)).toEqual([["before\n"]]);
});

test("acquired dependency code is never executed by native require", () => {
  const marker = join(directory, "marker");
  writeFileSync(marker, "unchanged");
  const result = run({
    "entry.cjs": `require("./dependency.cjs");`,
    "dependency.cjs": `require("fs").writeFileSync(${JSON.stringify(marker)}, "changed");`
  });
  expect(result.status).toBe("analysis-stop");
  expect(result.diagnostic).toMatch(/writeFileSync/);
  expect(readFileSync(marker, "utf8")).toBe("unchanged");
});

test("the actual CLI returns the bare result graph after acquiring a local import", () => {
  write({ "entry.cjs": `module.exports = require("./value.cjs");`, "value.cjs": `module.exports = 42;` });
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    [resolve("bin/prophet.js"), "--", join(directory, "entry.cjs")],
    { encoding: "utf8", timeout: 30000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
  expect(child.stderr).toBe("");
  const graph = JSON.parse(child.stdout);
  expect(Object.keys(graph).sort()).toEqual(["nodes", "roots"]);
  expect(Object.keys(graph.roots).sort()).toEqual(["completion", "current", "initial"]);
  const completion = graph.nodes.find((node: { id: string }) => node.id === graph.roots.completion.ref);
  expect(completion.kind).toBe("record");
  expect(completion.entries).toEqual(expect.arrayContaining([["type", "number"], ["value", 42]]));
  expect(existsSync(join(directory, "entry.cjs"))).toBe(true);
}, 40000);
