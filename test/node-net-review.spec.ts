import { spawnSync } from "child_process";
import { evaluateCode, isExecutionBoundary, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { createHostFunction, effectPaths, HostModel } from "../src/effects";
import { bindNormal } from "../src/evaluate";
import { UnsupportedAnalysisError } from "../src/execution-context/analysis-failure";
import { BranchResult } from "../src/execution-context/branches";
import { ExecutionContext, setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getArrayElements, getProperties } from "../src/execution-context/Heap";
import { createJobQueue } from "../src/jobs";
import { createEventEmitterModel } from "../src/node/events";
import { createNetModel } from "../src/node/net";
import { TESObject } from "../src/Object";
import { resolveBoolean } from "../src/symbolic";
import { isThrownValue, TESBoolean, Undefined } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

function setup(submit?: HostModel) {
  const nextTick = createJobQueue();
  const model = createNetModel(createEventEmitterModel(), { nextTick, submit });
  const initial = setVariablesInScope(ExecutionContext({ ...nodeInitialExecutionContext.value,
    sourceFile: "/net-review.cjs", evaluationBudget: { remaining: 10000 } }), {
    net: model.module, choice: ESBoolean(),
    mark: createHostFunction("review.mark", (_call, context) => [Undefined, context]),
    stop: createHostFunction("review.stop", () => { throw new UnsupportedAnalysisError("independent listener stop"); })
  });
  return { nextTick, initial };
}
function leaves(pair: BranchResult): BranchResult[] {
  return isForkedCompletion(pair[0]) ? leaves(pair[0].consequent).concat(leaves(pair[0].alternate)) : [pair];
}
function events(context: TExecutionContext) {
  return effectPaths(context.value.effects, context.value.knowledge).reduce((all, path) => all.concat(path.events), [] as any[]);
}
function calls(context: TExecutionContext, operation: string) {
  return events(context).filter(event => event.kind === "call" && event.call.operation === operation).map(event => event.call);
}
function marks(context: TExecutionContext) {
  return calls(context, "review.mark").map(call => call.args[0].value);
}
function state(name: string, context: TExecutionContext) {
  const socket = context.value.scope[name] as TESObject;
  expect(socket).toBeDefined();
  return getProperties(socket.hostSlots!["node.net.socket"] as TESObject, context);
}
const accepted: HostModel = (_call, context) => [ESBoolean(true), context];
const rejected: HostModel = (_call, context) => [ESBoolean(false), context];
const options = '{ host: "127.0.0.1", port: 1234 }';

test("two default submissions retain independent persistent facts and stop only at each reached failure", () => {
  const { nextTick, initial } = setup();
  const before = evaluateCode(`var first = net.connect(${options}); var second = net.connect(${options}); mark('returned-both');`, initial);
  expect(isExecutionBoundary(before[0]) || isThrownValue(before[0])).toBe(false);
  expect(calls(before[1], "net.socket.submit")).toHaveLength(0);
  const all = leaves(bindNormal(before, (_value, context) => nextTick.drain(context, 20)));
  expect(all).toHaveLength(3);
  const outcomes: string[] = [];
  for (const [value, context] of all) {
    expect(marks(context)).toEqual(["returned-both"]);
    const a = state("first", context), b = state("second", context);
    const acceptedA = resolveBoolean(a.submissionAccepted as TESBoolean, context.value.knowledge);
    const acceptedB = b.submissionAccepted === Undefined ? undefined : resolveBoolean(b.submissionAccepted as TESBoolean, context.value.knowledge);
    if (acceptedA === false) {
      expect(b.phase).toMatchObject({ value: "queued" });
      expect(acceptedB).toBeUndefined();
      expect(calls(context, "net.socket.submit")).toHaveLength(1);
    } else {
      expect(acceptedA).toBe(true);
      expect(a.submissionAccepted).not.toBe(b.submissionAccepted);
      expect(calls(context, "net.socket.submit")).toHaveLength(2);
    }
    const failed = acceptedA === false || acceptedB === false;
    expect(isExecutionBoundary(value)).toBe(failed);
    expect(getProperties(nextTick.state, context).active === Undefined).toBe(!failed);
    outcomes.push(`${acceptedA}/${acceptedB}`);
  }
  expect(outcomes.sort()).toEqual(["false/undefined", "true/false", "true/true"]);
});

test("nonadmitted resource result occurs after caller continuation and cannot be caught around the API call", () => {
  const { nextTick, initial } = setup(rejected);
  const before = evaluateCode(`try { var socket = net.connect(${options}, function () { mark('connect'); }); mark('returned'); }
    catch(e) { mark('caught'); } mark('after');
    socket.on('connectionAttempt', function () { mark('attempt'); });`, initial);
  expect(marks(before[1])).toEqual(["returned", "after"]);
  const pair = bindNormal(before, (_value, context) => nextTick.drain(context, 20));
  expect(pair[0]).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported" });
  expect(marks(pair[1])).toEqual(["returned", "after", "attempt"]);
  expect(state("socket", pair[1]).phase).toMatchObject({ value: "submission-failed" });
  const submitted = events(pair[1]).filter(event => event.call.operation === "net.socket.submit");
  expect(submitted.map(event => event.kind)).toEqual(["call", "return"]);
  expect(getProperties(nextTick.state, pair[1]).active).not.toBe(Undefined);
});

test("listener removal follows EventEmitter snapshot order before submission", () => {
  const { nextTick, initial } = setup(accepted);
  const before = evaluateCode(`var socket = net.connect(${options});
    function later() { mark('later'); }
    socket.on('connectionAttempt', function () { mark('first'); socket.removeListener('connectionAttempt', later); });
    socket.on('connectionAttempt', later); mark('returned');`, initial);
  const pair = bindNormal(before, (_value, context) => nextTick.drain(context, 20));
  expect(isExecutionBoundary(pair[0]) || isThrownValue(pair[0])).toBe(false);
  expect(marks(pair[1])).toEqual(["returned", "first", "later"]);
  expect(calls(pair[1], "net.socket.submit")).toHaveLength(1);
});

test.each([
  ["throw 'listener failure';", "throw"],
  ["stop();", "boundary"],
  ["socket.destroy();", "boundary"],
  ["socket.connecting = false;", "boundary"]
])("attempt listener preserves effects and blocks submission: %s", (action, kind) => {
  const { nextTick, initial } = setup(accepted);
  const before = evaluateCode(`var socket = net.connect(${options}); socket.on('connectionAttempt', function handler() {
    mark('entered'); ${action} mark('unreachable'); }); mark('returned');`, initial);
  const pair = bindNormal(before, (_value, context) => nextTick.drain(context, 20));
  expect(marks(pair[1])).toEqual(["returned", "entered"]);
  expect(calls(pair[1], "net.socket.submit")).toHaveLength(0);
  expect(state("socket", pair[1]).phase).toMatchObject({ value: "initiating" });
  expect(isThrownValue(pair[0])).toBe(kind === "throw");
  expect(isExecutionBoundary(pair[0])).toBe(kind === "boundary");
  if (kind === "boundary") {
    expect(getProperties(nextTick.state, pair[1]).active).not.toBe(Undefined);
    expect((pair[1].value as any).activation).toBeDefined();
  }
});

test("symbolic queued cancellation retains the healthy submission sibling with no cancel-path transport", () => {
  const { nextTick, initial } = setup(accepted);
  const before = evaluateCode(`var socket = net.connect(${options}); if (choice) socket.destroy(); mark('continued');`, initial);
  const all = leaves(bindNormal(before, (_value, context) => nextTick.drain(context, 20)));
  const phaseAndSubmissions: string[] = [];
  for (const [value, context] of all) {
    expect(isThrownValue(value) || isExecutionBoundary(value)).toBe(false);
    for (const path of effectPaths(context.value.effects, context.value.knowledge)) {
      const submissions = path.events.filter(event => event.kind === "call" && event.call.operation === "net.socket.submit").length;
      // Branch values may rejoin; inspect the concrete phase through guest branching below.
      phaseAndSubmissions.push(String(submissions));
    }
  }
  expect(phaseAndSubmissions.sort()).toEqual(["0", "1"]);
});

test.each([
  ['"example.invalid"', "-1", "throw"],
  ['"example.invalid"', "80", "boundary"],
  ["42", "-1", "boundary"],
  ['"127.0.0.1"', "-0", "normal"]
])("host/port admission preserves promised validation precedence: %s %s", (host, port, expected) => {
  const { nextTick, initial } = setup(accepted);
  const pair = evaluateCode(`var socket = net.connect({host: ${host}, port: ${port}});`, initial);
  expect(isThrownValue(pair[0])).toBe(expected === "throw");
  expect(isExecutionBoundary(pair[0])).toBe(expected === "boundary");
  expect(calls(pair[1], "net.socket.submit")).toHaveLength(0);
  if (expected === "normal") expect(Object.is((state("socket", pair[1]).port as any).value, -0)).toBe(false);
  if (expected !== "normal") expect(getArrayElements(getProperties(nextTick.state, pair[1]).pending as any, pair[1])).toEqual([]);
});

test("conditional intrinsic prototype alteration never silently acquires inherited socket options", () => {
  const { nextTick, initial } = setup(accepted);
  const pair = evaluateCode(`if(choice) Object.prototype.noDelay = true;
    var socket = net.connect(${options}); mark('returned');`, initial);
  const all = leaves(bindNormal(pair, (_value, context) => nextTick.drain(context, 20)));
  const stopped = all.filter(([value]) => isExecutionBoundary(value));
  expect(stopped.length).toBeGreaterThan(0);
  for (const [, context] of stopped) expect(calls(context, "net.socket.submit")).toHaveLength(0);
  // The contract permits conservatively stopping both leaves if the joined prototype is not provable.
  for (const [value, context] of all) if (!isExecutionBoundary(value)) {
    expect(isThrownValue(value)).toBe(false);
    expect(resolveBoolean(context.value.scope.choice as TESBoolean, context.value.knowledge)).toBe(false);
  }
});

test("correlated symbolic endpoint values keep numeric validation and unsupported routing on their own paths", () => {
  const { nextTick, initial } = setup(accepted);
  const pair = evaluateCode(`var host = choice ? '127.0.0.1' : 'example.invalid';
    var port = choice ? -1 : 80; var socket = net.connect({host: host, port: port}); mark('unreachable');`, initial);
  const all = leaves(bindNormal(pair, (_value, context) => nextTick.drain(context, 20)));
  expect(all).toHaveLength(2);
  expect(all.filter(([value]) => isThrownValue(value))).toHaveLength(1);
  expect(all.filter(([value]) => isExecutionBoundary(value))).toHaveLength(1);
  for (const [value, context] of all) {
    expect(marks(context)).toEqual([]);
    expect(calls(context, "net.socket.submit")).toHaveLength(0);
    expect(resolveBoolean(context.value.scope.choice as TESBoolean, context.value.knowledge)).toBe(isThrownValue(value));
  }
});

test("finite whole options choice preserves the valid sibling beside an unsupported extra key", () => {
  const { nextTick, initial } = setup(accepted);
  const pair = evaluateCode(`var options = choice ? ${options} : {host:'127.0.0.1',port:1234,timeout:5};
    var socket = net.connect(options); mark('returned');`, initial);
  const all = leaves(bindNormal(pair, (_value, context) => nextTick.drain(context, 20)));
  expect(all).toHaveLength(2);
  for (const [value, context] of all) {
    expect(isThrownValue(value)).toBe(false);
    const stopped = isExecutionBoundary(value);
    expect(calls(context, "net.socket.submit")).toHaveLength(stopped ? 0 : 1);
    expect(marks(context)).toEqual(stopped ? [] : ["returned"]);
    expect(resolveBoolean(context.value.scope.choice as TESBoolean, context.value.knowledge)).toBe(!stopped);
  }
});

test.each(["socket.emit('connect')", "socket.listenerCount('connect')", "socket.emit('end')", "socket.listenerCount('end')"])(
  "incomplete native listener operations retain a typed frontier and healthy sibling: %s", operation => {
    const { nextTick, initial } = setup(accepted);
    const pair = evaluateCode(`var socket = net.connect(${options});
      if (choice) { ${operation}; mark('unreachable'); } else mark('healthy');`, initial);
    const all = leaves(bindNormal(pair, (_value, context) => nextTick.drain(context, 20)));
    expect(all).toHaveLength(2);
    expect(all.filter(([value]) => isExecutionBoundary(value))).toHaveLength(1);
    for (const [value, context] of all) {
      expect(isThrownValue(value)).toBe(false);
      const stopped = isExecutionBoundary(value);
      expect(marks(context)).toEqual(stopped ? [] : ["healthy"]);
      expect(calls(context, "net.socket.submit")).toHaveLength(stopped ? 0 : 1);
    }
  });

test("pinned Node retains an internal end listener on the returned socket before canceled initiation", () => {
  assertPinnedNode();
  const script = `const net = require('net');
    const attempts = [];
    const TCP = process.binding('tcp_wrap').TCP;
    TCP.prototype.connect = function() { attempts.push('IPv4'); throw Error('transport prohibited'); };
    TCP.prototype.connect6 = function() { attempts.push('IPv6'); throw Error('transport prohibited'); };
    process.binding('pipe_wrap').Pipe.prototype.connect = function() { attempts.push('IPC'); throw Error('transport prohibited'); };
    const socket = net.connect({host:'127.0.0.1',port:0});
    const result = { version:process.version, endListeners:socket.listenerCount('end'), connecting:socket.connecting };
    socket.destroy();
    setImmediate(function() { process.stdout.write(JSON.stringify({ ...result, attempts, destroyed:socket.destroyed })); });`;
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath, ["-e", script], {
    encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }
  });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
  expect(child.stderr).toBe("");
  expect(JSON.parse(child.stdout)).toEqual({ version: "v24.21.0", endListeners: 1, connecting: true, attempts: [], destroyed: true });
});
