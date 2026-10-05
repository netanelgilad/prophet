import { spawnSync } from "child_process";
import { realpathSync } from "fs";
import { createCommonJSLoader, createWarningModel, evaluateCode, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { encodeGraph } from "../src/cli/graph";
import { effectPaths } from "../src/effects";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { getProperties, writeProperty } from "../src/execution-context/Heap";
import { createJobQueue } from "../src/jobs";
import { createProcessModel } from "../src/node/process";
import { ESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { resolveBoolean } from "../src/symbolic";
import { Any, TESBoolean } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

function setup(cwd = "/declared/site", inputs: { [name: string]: Any } = {}) {
  const nextTick = createJobQueue();
  const warnings = createWarningModel({ pid: 123, nextTick });
  const model = createProcessModel({ cwd, warnings });
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, process: model.process, ...inputs }) });
  const load = (source: string) => createCommonJSLoader({ "/app/entry.cjs": source }, {
    builtins: { process: model.process }
  }).load("/app/entry.cjs", initial);
  return { model, initial, nextTick, warnings, load };
}

function native(source: string, cwd: string) {
  assertPinnedNode();
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ["-e", `console.log(JSON.stringify((function() { ${source} })()));`],
    { cwd, encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
  return JSON.parse(child.stdout);
}

for (const directory of ["/", realpathSync(".")]) test(`cwd metadata, receiver and argument behavior match pinned Node at ${directory}`, () => {
  const body = `
    const method = process.cwd;
    let evaluated = false;
    function argument() { evaluated = true; return "ignored"; }
    return method.name === "wrappedCwd" && method.length === 0 &&
      method() === ${JSON.stringify(directory)} && method.call(null, argument()) === ${JSON.stringify(directory)} &&
      method.call({}) === ${JSON.stringify(directory)} && evaluated;
  `;
  expect(native(body, directory)).toBe(true);
  const { load } = setup(directory);
  const [value] = load('module.exports = (function() {' + body + '})();');
  expect(value).toMatchObject({ value: true });
});

test("global/import aliases reuse the warning process and its shared queue", () => {
  const { model, warnings, nextTick, load } = setup();
  const [value, context] = load(`
    process.emitWarning("queued", "Notice", "A");
    module.exports = process === require("process") && process === require("node:process") &&
      process.cwd() === "/declared/site";
  `);
  expect(value).toMatchObject({ value: true });
  expect(model.process).toBe(warnings.process);
  expect(model.warnings).toBe(warnings);
  expect(warnings.inspectOutput(context)[0].chunks).toEqual([]);
  const [, after] = nextTick.drain(context, 10);
  expect(warnings.inspectOutput(after)[0].chunks).toHaveLength(1);
  expect((model.process as any).hostSlots["node.nextTick"]).toBe(nextTick.state);
});

test("mutable cwd method and detached original preserve shared state and receiver semantics", () => {
  const body = `
    const original = process.cwd;
    let seen = false;
    process.cwd = function() { seen = this === process; return "/replacement"; };
    const replaced = process.cwd();
    return replaced === "/replacement" && seen && original.call(null) === ${JSON.stringify(realpathSync("."))};
  `;
  expect(native(body, realpathSync("."))).toBe(true);
  const { load } = setup(realpathSync("."));
  const [value, context] = load('module.exports = (function() {' + body + '})();');
  expect(value).toMatchObject({ value: true });
  const calls = effectPaths(context.value.effects)[0].events.filter(event => event.kind === "call" && event.call.operation === "process.cwd");
  expect(calls).toHaveLength(1);
});

test("cwd calls read the declared persistent state and preserve initial graph identities", () => {
  const { model, initial } = setup();
  const original = getProperties(model.process, initial).cwd;
  const changed = writeProperty(model.state, "cwd", ESString("/later/snapshot"), initial);
  const [, before] = evaluateCode('var observed = method();', setVariablesInScope(initial, { method: original }));
  const [, after] = evaluateCode('var observed = method();', setVariablesInScope(changed, { method: original }));
  expect(before.value.scope.observed).toMatchObject({ value: "/declared/site" });
  expect(after.value.scope.observed).toMatchObject({ value: "/later/snapshot" });
  expect(getProperties(model.state, initial).cwd).toMatchObject({ value: "/declared/site" });
  expect((model.process as any).hostSlots["node.process.environment"]).toBe(model.state);
  const graph = encodeGraph({ initial, after, process: model.process, environment: model.state });
  expect(graph.nodes.some(node => node.kind === "record" && node.entries.some(([name, value]) =>
    name === "node.process.environment" && JSON.stringify(value) === JSON.stringify(graph.roots.environment)))).toBe(true);
});

test("symbolic invocation choices retain correlated results and conditional cwd call effects", () => {
  const selected = ESBoolean();
  const { load } = setup("/declared/site", { selected });
  const [value, context] = load(`
    const original = process.cwd;
    process.cwd = selected ? original : function() { return "/replacement"; };
    const result = process.cwd();
    module.exports = { proof: result === (selected ? "/declared/site" : "/replacement"), uncertain: result === "/declared/site" };
  `);
  const values = getProperties(value as any, context);
  expect(values.proof).toMatchObject({ value: true });
  expect(resolveBoolean(values.uncertain as TESBoolean, context.value.knowledge)).toBeUndefined();
  for (const path of effectPaths(context.value.effects)) {
    const calls = path.events.filter(event => event.kind === "call" && event.call.operation === "process.cwd");
    expect(calls).toHaveLength(resolveBoolean(selected, path.knowledge) ? 1 : 0);
  }
});

test("construction is explicitly unsupported rather than falsely nonconstructible", () => {
  expect(native('const value = new process.cwd(); return typeof value === "object" && value instanceof process.cwd;', "/")).toBe(true);
  const { load } = setup();
  expect(() => load('try { new process.cwd(); } catch (error) { module.exports = "caught"; }')).toThrow(/construction.*not yet supported/);
});

test("canonical cwd declaration and process composition boundaries reject without guessed state", () => {
  for (const cwd of [undefined, null, "", "relative", "/trailing/", "//double", "/dot/./x", "/dot/../x", "/nul\0x", "/lone\ud800"]) {
    expect(() => createProcessModel({ cwd: cwd as any })).toThrow(/cwd/);
  }
  for (const warnings of [null, {}]) {
    expect(() => createProcessModel({ cwd: "/", warnings: warnings as any })).toThrow(/warning process model/);
  }
  const warnings = createWarningModel();
  createProcessModel({ cwd: "/one", warnings });
  expect(() => createProcessModel({ cwd: "/two", warnings })).toThrow(/already|configured/);
  const { load } = setup();
  for (const expression of ['process.chdir("/")', 'process.env', 'process.argv', 'process.execPath',
    'process.cwd.prototype', 'Object.prototype.hasOwnProperty.call(process.cwd, "name")']) {
    expect(() => load(expression)).toThrow(/Unmodeled|not yet supported/);
  }
});
