import { createCommonJSLoader, createLegacyURLModel, createWarningModel, isExecutionBoundary, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { Array as ESArray } from "../src/array/Array";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { createHostFunction, effectPaths } from "../src/effects";
import { BranchResult } from "../src/execution-context/branches";
import { ExecutionContext, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getArrayElements, getProperties, writeProperty } from "../src/execution-context/Heap";
import { createJobQueue } from "../src/jobs";
import { createConsoleModel } from "../src/node/console";
import { createPosixPathModel } from "../src/node/path";
import { ESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { resolveBoolean } from "../src/symbolic";
import { Any, isThrownValue, Undefined } from "../src/types";

function setup(source: string, inputs: { [name: string]: Any } = {}) {
  const queue = createJobQueue(), warnings = createWarningModel({ pid: 123, nextTick: queue });
  const url = createLegacyURLModel(warnings), path = createPosixPathModel(), console = createConsoleModel();
  const selected = ESBoolean();
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties,
      selected, open: ESString(), process: warnings.process, console: console.module, ...inputs }) });
  const result = createCommonJSLoader({ "/app/entry.cjs": `
    const url = require("url"), path = require("path");
    ${source}
  ` }, { builtins: { url: url.module, path: path.module, process: warnings.process } }).load("/app/entry.cjs", initial);
  return { result, queue, warnings, url, path, selected, initial };
}

function leaves(result: BranchResult): BranchResult[] {
  return isForkedCompletion(result[0]) ? leaves(result[0].consequent).concat(leaves(result[0].alternate)) : [result];
}
function output(context: TExecutionContext) {
  return effectPaths(context.value.effects).map(path => path.events.filter(event => event.kind === "return" &&
    event.call.operation === "console.stdout.write").map(event => (event.call.args[0] as { value: string }).value.trim()));
}

for (const operation of ['url.parse(open)', 'path.join("/root", open)', 'process.emitWarning("message", open)']) {
  for (const stoppedFirst of [true, false]) test(`${operation} retains both branch orders (${stoppedFirst}) without guest recovery`, () => {
    const { result, selected } = setup(`
      console.log("before");
      try { if (${stoppedFirst ? "selected" : "!selected"}) ${operation}; else console.log("normal"); }
      catch (error) { console.log("caught"); }
      finally { console.log("finally"); }
      console.log("after"); module.exports = 42;
    `);
    expect(result[0]).toMatchObject({ type: "ForkedCompletion", state: "partial" });
    const outcomes = leaves(result);
    expect(outcomes).toHaveLength(2);
    const stopped = outcomes.find(([value]) => isExecutionBoundary(value))!;
    const finished = outcomes.find(([value]) => !isExecutionBoundary(value))!;
    expect(stopped[0]).toMatchObject({ kind: "unsupported" });
    expect(resolveBoolean(selected, stopped[1].value.knowledge)).toBe(stoppedFirst);
    expect(output(stopped[1])).toEqual([["before"]]);
    expect(output(finished[1])).toEqual([["before", "normal", "finally", "after"]]);
    expect(finished[0]).toMatchObject({ value: 42 });
    if (!isExecutionBoundary(stopped[0])) throw new Error("Expected boundary");
    expect(stopped[0].frames.some(frame => frame.sourceFile === "/app/entry.cjs")).toBe(true);
    expect(stopped[0].pendingStatements.some(tail => tail.sourceFile === "/app/entry.cjs")).toBe(true);
    const calls = effectPaths(stopped[1].value.effects)[0].events;
    const attempted = calls.filter(event => event.kind === "call").find(event => event.call.operation ===
      (operation.startsWith("url") ? "url.parse" : operation.startsWith("path") ? "path.posix.join" : "process.emitWarning"));
    expect(attempted).toBeDefined();
    expect(calls.some(event => event.kind === "return" && event.call === attempted!.call)).toBe(false);
  });
}

test("open URL input retains the once flag, warning queue and pending shared job only on its reached branch", () => {
  const { result, queue, warnings, url, initial } = setup('if (selected) url.parse(open); else module.exports = "normal";');
  const stopped = leaves(result).find(([value]) => isExecutionBoundary(value))!;
  const finished = leaves(result).find(([value]) => !isExecutionBoundary(value))!;
  expect(getProperties(url.state, stopped[1]).warned).toMatchObject({ value: true });
  expect(getProperties(url.state, finished[1]).warned).toMatchObject({ value: false });
  expect(getProperties(url.state, initial).warned).toMatchObject({ value: false });
  expect(warnings.inspectPending(stopped[1])[0].warnings[0].code).toMatchObject({ value: "DEP0169" });
  expect(getArrayElements(getProperties(queue.state, stopped[1]).pending as any, stopped[1])).toHaveLength(1);
  expect(warnings.inspectPending(finished[1])[0].warnings).toEqual([]);
});

for (const operation of [
  'new url.parse("/ok")', 'new process.emitWarning("message")', 'url.URL', 'url.parse("/ok").format()', 'path.win32', 'process.env',
  'url.parse.name = "changed"', 'path.join.caller', 'process.pid = 1',
  'Object.prototype.hasOwnProperty.call(path, "parse")',
  'Object.prototype.hasOwnProperty.call(url.parse, "name")',
  '({ ...process })', 'Object.prototype.toString.call(url)',
  'path instanceof Object', '({}) instanceof url.parse', 'String(url)'
]) test(`partial host metadata preserves normal sibling: ${operation}`, () => {
  const { result } = setup(`if (selected) { ${operation}; } else module.exports = "normal";`);
  const outcomes = leaves(result);
  expect(outcomes).toHaveLength(2);
  expect(outcomes.filter(([value]) => isExecutionBoundary(value))).toHaveLength(1);
  expect(outcomes.find(([value]) => !isExecutionBoundary(value))![0]).toMatchObject({ value: "normal" });
});

test("a stopped warning presentation retains current fields and active job while a normal sibling drains", () => {
  const { result, queue, warnings } = setup(`
    process.emitWarning("first", "Notice", "A"); process.emitWarning("tail", "Notice", "B");
    Error.prototype.toString = function() { this.message = "changed"; if (selected) return {}; return "rendered"; };
  `);
  const outcomes = leaves(queue.drain(result[1], 10));
  const stopped = outcomes.find(([value]) => isExecutionBoundary(value))!;
  const finished = outcomes.find(([value]) => !isExecutionBoundary(value))!;
  expect(stopped[0]).toMatchObject({ message: expect.stringContaining("object conversion") });
  const active = getProperties(queue.state, stopped[1]).active;
  const args = getArrayElements(getProperties(active as any, stopped[1]).args as any, stopped[1])!;
  expect(getProperties(args[0] as any, stopped[1]).message).toMatchObject({ value: "changed" });
  expect(warnings.inspectPending(stopped[1])[0].warnings).toHaveLength(1);
  expect(getArrayElements(getProperties(queue.state, stopped[1]).pending as any, stopped[1])).toHaveLength(1);
  expect(warnings.inspectOutput(stopped[1])[0].chunks).toEqual([]);
  expect(finished[0]).toBe(Undefined);
  expect(warnings.inspectOutput(finished[1])[0].chunks).toHaveLength(2);
});

test("guest throws remain catchable while stopped URL siblings skip catch and finally", () => {
  const { result } = setup(`
    try { if (selected) url.parse(open); else throw "guest"; }
    catch (error) { console.log(error); throw "unhandled"; }
    finally { console.log("finally"); }
  `);
  const outcomes = leaves(result);
  expect(outcomes.filter(([value]) => isExecutionBoundary(value))).toHaveLength(1);
  const throwing = outcomes.find(([value]) => isThrownValue(value))!;
  expect(output(throwing[1])).toEqual([["guest", "finally"]]);
});

for (const error of [new Error("Legacy URL analysis is not yet supported: unrelated host failure"), new TypeError("unexpected type failure")]) {
  test(`${error.name} from a host model is not classified by message or guest catch`, () => {
    const fail = createHostFunction("fail", () => { throw error; });
    expect(() => setup('try { if (selected) fail(); } catch (error) {} finally {}', { fail })).toThrow(error);
  });
}

test("private warning queue invariant failures remain engine errors", () => {
  const { result, warnings, queue } = setup('process.emitWarning("pending");');
  const corrupt = writeProperty(warnings.state, "queue", ESArray(), result[1]);
  expect(() => queue.drain(corrupt, 10)).toThrow("Invalid private warning queue");
});
