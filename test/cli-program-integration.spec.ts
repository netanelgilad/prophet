import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "fs";
import { removeSync } from "fs-extra";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { effectPaths, isExecutionBoundary, isForkedCompletion } from "../src";

let directory: string;
beforeEach(() => { directory = realpathSync(mkdtempSync(join(tmpdir(), "prophet-program-identities-"))); });
afterEach(() => { removeSync(directory); });
function fixture(filename: string, contents: string | Buffer): string {
  const path = join(directory, filename);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  return path;
}
// Inspection decoder preserves map/reference identity. It does not resume code.
function decodeGraph(graph: any): any {
  const objects = new Map<string, any>();
  for (const node of graph.nodes) objects.set(node.id, node.kind === "map" ? new Map() :
    node.kind === "array" ? new Array(node.length) : node.kind === "execution-context"
      ? { type: "ExecutionContext", value: Object.create(null) } : Object.create(null));
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
  for (const node of graph.nodes) for (const [key, value] of node.entries || []) {
    const target = objects.get(node.id);
    if (node.kind === "map") target.set(decode(key), decode(value));
    else (node.kind === "execution-context" ? target.value : target)[key] = decode(value);
  }
  const roots: any = {};
  for (const key of Object.keys(graph.roots)) roots[key] = decode(graph.roots[key]);
  return roots;
}
function invokeCLI(script = "entry.cjs", args: string[] = [], flags: string[] = []) {
  return spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    [resolve("bin/prophet.js"), ...flags, "--", script, ...args], {
      cwd: directory, encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }
    });
}
function run(script = "entry.cjs", args: string[] = [], expectedStatus = 0) {
  const child = invokeCLI(script, args);
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(expectedStatus);
  if (expectedStatus === 0) expect(child.stderr).toBe("");
  else expect(child.stderr).toMatch(/^prophet: /);
  const graph = JSON.parse(child.stdout);
  expect(Object.keys(graph).sort()).toEqual(["nodes", "roots"]);
  const roots = decodeGraph(graph);
  expect(roots.program).toBeDefined();
  roots.program.sources.forEach((identity: any) => {
    expect(Object.keys(identity).sort()).toEqual(["byteLength", "sha256"]);
    expect(Number.isSafeInteger(identity.byteLength)).toBe(true);
    expect(identity.byteLength).toBeGreaterThanOrEqual(0);
    expect(identity.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  return { roots, graph, child };
}
function expectIdentity(identity: any, filename: string) {
  const bytes = readFileSync(filename);
  expect(Object.keys(identity).sort()).toEqual(["byteLength", "sha256"]);
  expect(identity).toEqual({ byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex") });
}
function outcomes(result: any[]): any[][] {
  return isForkedCompletion(result[0]) ? outcomes(result[0].consequent).concat(outcomes(result[0].alternate)) : [result];
}

test("real CLI publishes exact original UTF8/BOM entry bytes and source alias without source text", () => {
  const filename = fixture("entry.cjs", '\uFEFF// café 😀\nmodule.exports = "ready";\n');
  const { roots } = run("entry.cjs", ["ordinary", "héllo😀"]);
  const program = roots.program;
  expect(Object.keys(program).sort()).toEqual(["args", "cwd", "filename", "paths", "runtime", "source", "sources"]);
  expect(program.runtime).toBe("node@24.21.0");
  expect(program.filename).toBe(filename);
  expect(program.cwd).toBe(directory);
  expect(program.args).toEqual(["ordinary", "héllo😀"]);
  expect(program.sources).toBeInstanceOf(Map);
  expect(program.paths).toBeInstanceOf(Map);
  expect(program.source).toBe(program.sources.get(filename));
  expectIdentity(program.source, filename);
  expect(program.paths.get(filename)).toBe("file");
  expect(roots.initial.value.global.hostSlots["node.program"]).toBeUndefined();
});

test("real CLI links nested package/helper effects to acquired file identities and resolver observations", () => {
  const entry = fixture("entry.cjs", `const run = require('pkg'); run();
    module.exports = require('./settings.json');
    function uncalled() { require('./uncalled.cjs'); }`);
  const packageJSON = fixture("node_modules/pkg/package.json", JSON.stringify({ name: "pkg", version: "1.2.3", main: "src/main.js" }));
  const main = fixture("node_modules/pkg/src/main.js", `const helper = require('./helper');
    module.exports = function run() { helper(); };`);
  const helper = fixture("node_modules/pkg/src/helper.js", `module.exports = function helper() { console.log('dependency'); };`);
  const settings = fixture("settings.json", '{"message":"café 😀"}\n');
  const uncalled = fixture("uncalled.cjs", "throw 'must not run';");
  const { roots } = run();
  for (const filename of [entry, packageJSON, main, helper, settings]) {
    expectIdentity(roots.program.sources.get(filename), filename);
    expect(roots.program.paths.get(filename)).toBe("file");
  }
  expect(roots.program.paths.get(join(directory, "node_modules/pkg/src/helper"))).toBe("missing");
  expect(roots.program.paths.get(join(directory, "node_modules/pkg"))).toBe("directory");
  expect(roots.program.sources.has(uncalled)).toBe(false);
  expect(roots.program.paths.has(uncalled)).toBe(false);
  const logs = effectPaths(roots.current.value.effects).map(path => path.events.filter(event =>
    event.kind === "call" && event.call.operation === "console.log"));
  expect(logs).toHaveLength(1); expect(logs[0]).toHaveLength(1);
  const origin = logs[0][0].call.origin;
  expect(origin.sourceFile).toBe(helper);
  expectIdentity(roots.program.sources.get(origin.sourceFile), helper);
  const ancestry: string[] = [];
  for (let frame = origin.activation; frame; frame = frame.parent) {
    ancestry.push(frame.sourceFile!);
    expect(roots.program.sources.has(frame.sourceFile)).toBe(true);
  }
  expect(ancestry).toEqual([helper, main, entry]);
});

test("program observations union branch acquisitions without claiming both imports execute on one history", () => {
  const entry = fixture("entry.cjs", `if (Math.random() < 0.5) require('./left'); else require('./right');
    function unused() { require('./unused'); }`);
  const left = fixture("left.js", "console.log('left');");
  const right = fixture("right.js", "console.log('right');");
  const unused = fixture("unused.js", "console.log('unused');");
  const { roots } = run();
  for (const filename of [entry, left, right]) expectIdentity(roots.program.sources.get(filename), filename);
  expect(roots.program.sources.has(unused)).toBe(false);
  const messages = effectPaths(roots.current.value.effects).map(path => path.events
    .filter(event => event.kind === "call" && event.call.operation === "console.log")
    .map(event => (event.call.args[0] as { value: string }).value));
  expect(messages).toEqual([["left"], ["right"]]);
  expect(roots.initial.value.effects).toBeUndefined();
  expect(roots.initial.value).not.toHaveProperty("program");
  expect(roots.current.value).not.toHaveProperty("program");
});

for (const [operation, typed] of [["require('fs').writeFileSync('never-created', 'no')", true],
  ["console.warn('unsupported')", false]] as Array<[string, boolean]>) {
  test(`partial CLI output publishes known source subset (typed=${typed})`, () => {
    const entry = fixture("entry.cjs", `console.log('before'); ${operation}; require('./later.cjs');`);
    const later = fixture("later.cjs", "console.log('later');");
    const { roots } = run("entry.cjs", [], 2);
    expectIdentity(roots.program.source, entry);
    expect(roots.program.sources.has(later)).toBe(false);
    expect(roots.program.paths.has(later)).toBe(false);
    if (typed) expect(isExecutionBoundary(roots.completion)).toBe(true);
    else expect(roots).not.toHaveProperty("completion");
    const messages = effectPaths(roots.current.value.effects).map(path => path.events
      .filter(event => event.kind === "call" && event.call.operation === "console.log")
      .map(event => (event.call.args[0] as { value: string }).value));
    expect(messages).toEqual([["before"]]);
  });
}

test("a reached positive file probe without a valid UTF8 read stays a file observation, not a fabricated source identity", () => {
  const entry = fixture("entry.cjs", "require('./broken.js'); require('./later.cjs');");
  const broken = fixture("broken.js", Buffer.from([0xff, 0xfe]));
  const later = fixture("later.cjs", "module.exports = true;");
  const { roots, child } = run("entry.cjs", [], 2);
  expect(child.stderr).toMatch(/UTF-8/);
  expectIdentity(roots.program.source, entry);
  expect(roots.program.paths.get(broken)).toBe("file");
  expect(roots.program.sources.has(broken)).toBe(false);
  expect(roots.program.sources.has(later)).toBe(false);
  expect(roots.program.paths.has(later)).toBe(false);
});

test("a symbolic stopped sibling publishes acquired union while retaining the distinct normal history", () => {
  const entry = fixture("entry.cjs", `if (Math.random() < 0.5) require('./stopped.cjs'); else require('./normal.cjs');`);
  const stopped = fixture("stopped.cjs", "require('fs').writeFileSync('never-created', 'no');");
  const normal = fixture("normal.cjs", "console.log('normal');");
  const { roots } = run("entry.cjs", [], 2);
  for (const filename of [entry, stopped, normal]) expectIdentity(roots.program.sources.get(filename), filename);
  const leaves = outcomes([roots.completion, roots.current]);
  expect(leaves.some(([completion]) => isExecutionBoundary(completion))).toBe(true);
  expect(leaves.some(([completion, context]) => !isExecutionBoundary(completion) &&
    effectPaths(context.value.effects, context.value.knowledge).some(path => path.events.some(event =>
      event.kind === "call" && event.call.operation === "console.log")))).toBe(true);
});

test("a program throw still publishes the captured entry and helper identities", () => {
  const entry = fixture("entry.cjs", "require('./throwing.cjs');");
  const helper = fixture("throwing.cjs", "throw 'guest failure';");
  const { roots } = run();
  expect(roots.completion).toMatchObject({ type: "ThrownValue", value: { value: "guest failure" } });
  expectIdentity(roots.program.source, entry);
  expectIdentity(roots.program.sources.get(helper), helper);
});

for (const invalidEnvironment of [false, true]) test(`entry validation failures publish no partial graph (environment=${invalidEnvironment})`, () => {
  if (invalidEnvironment) fixture("environment.json", "{");
  else fixture("entry.cjs", Buffer.from([0xff]));
  const child = invalidEnvironment
    ? invokeCLI("nonexistent.cjs", [], ["--environment", "environment.json"])
    : invokeCLI();
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(1);
  expect(child.stdout).toBe("");
  expect(child.stderr).toMatch(invalidEnvironment ? /environment|JSON|Expected/i : /UTF-8/);
});

test("real CLI admits the argument publication boundary and rejects overflow without truncated stdout", () => {
  fixture("entry.cjs", "module.exports = true;");
  const accepted = run("entry.cjs", new Array(4096).fill("x"));
  expect(accepted.roots.program.args).toHaveLength(4096);
  const child = invokeCLI("entry.cjs", new Array(4097).fill("x"));
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(1);
  expect(child.stdout).toBe("");
  expect(child.stderr).toMatch(/argument|args|4096/i);
});
