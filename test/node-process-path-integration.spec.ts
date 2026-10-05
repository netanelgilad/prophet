import { spawnSync } from "child_process";
import { createCommonJSLoader, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { effectPaths } from "../src/effects";
import { ExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { createPosixPathModel } from "../src/node/path";
import { createProcessModel } from "../src/node/process";
import { ESObject } from "../src/Object";
import { resolveBoolean } from "../src/symbolic";
import { Any, TESBoolean } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

function load(source: string, inputs: { [name: string]: Any } = {}) {
  const environment = createProcessModel({ cwd: "/" });
  const path = createPosixPathModel({ process: environment.process });
  const context = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, process: environment.process, ...inputs }) });
  return createCommonJSLoader({ "/app/entry.cjs": source }, {
    builtins: { process: environment.process, path: path.module }
  }).load("/app/entry.cjs", context);
}

test("path.resolve uses the declared shared process and current mutable cwd method", () => {
  const source = `
    const path = require("path");
    const initial = path.resolve("child") === "/child";
    let correct = false;
    process.cwd = function() { correct = this === process; return "/replacement"; };
    const changed = path.resolve("child") === "/replacement/child" && correct;
    process.cwd = function() { throw "cwd failed"; };
    const absolute = path.resolve("/absolute") === "/absolute";
    let caught = false;
    try { path.resolve("relative"); } catch (error) { caught = error === "cwd failed"; }
    module.exports = initial && changed && absolute && caught && process === require("node:process");
  `;
  assertPinnedNode();
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ["-e", source + '; console.log(JSON.stringify(module.exports));'],
    { cwd: "/", encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(child.status).toBe(0);
  expect(child.stdout.trim()).toBe("true");
  const [value, context] = load(source);
  expect(value).toMatchObject({ value: true });
  expect(effectPaths(context.value.effects)[0].events.filter(event => event.kind === "call" && event.call.operation === "process.cwd")).toHaveLength(1);
});

test("path.resolve keeps symbolic cwd method choices correlated without guessing one directory", () => {
  const [value, context] = load(`
    const path = require("path");
    const original = process.cwd;
    process.cwd = selected ? original : function() { return "/replacement"; };
    const resolved = path.resolve("child");
    module.exports = { proof: resolved === (selected ? "/child" : "/replacement/child"), unknown: resolved === "/child" };
  `, { selected: ESBoolean() });
  const fields = getProperties(value as any, context);
  expect(fields.proof).toMatchObject({ value: true });
  expect(resolveBoolean(fields.unknown as TESBoolean, context.value.knowledge)).toBeUndefined();
});
