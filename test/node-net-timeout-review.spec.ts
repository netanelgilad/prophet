import { spawnSync } from "child_process";
import { evaluateCode, isExecutionBoundary, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { createHostFunction, effectPaths, HostModel } from "../src/effects";
import { bindNormal } from "../src/evaluate";
import { BranchResult } from "../src/execution-context/branches";
import { ExecutionContext, setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { createJobQueue } from "../src/jobs";
import { createEventEmitterModel } from "../src/node/events";
import { createNetModel } from "../src/node/net";
import { TESObject } from "../src/Object";
import { resolveBoolean } from "../src/symbolic";
import { Any, ESNumber, isThrownValue, TESBoolean, Undefined } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

const accepted: HostModel = (_call, context) => [ESBoolean(true), context];
function setup(submit?: HostModel, inputs: { [name: string]: Any } = {}) {
  const queue = createJobQueue();
  const net = createNetModel(createEventEmitterModel(), { nextTick: queue, submit });
  const initial = setVariablesInScope(ExecutionContext({ ...nodeInitialExecutionContext.value,
    evaluationBudget: { remaining: 10000 }, sourceFile: "/timeout-review.cjs" }), {
    net: net.module, choice: ESBoolean(),
    mark: createHostFunction("review.mark", (_call, context) => [Undefined, context]), ...inputs
  });
  return { queue, initial };
}
function leaves(pair: BranchResult): BranchResult[] {
  return isForkedCompletion(pair[0]) ? leaves(pair[0].consequent).concat(leaves(pair[0].alternate)) : [pair];
}
function normal(pair: BranchResult) {
  expect(isThrownValue(pair[0]) || isExecutionBoundary(pair[0]) || isForkedCompletion(pair[0])).toBe(false);
  return pair[1];
}
function socket(context: TExecutionContext): TESObject { return context.value.scope.socket as TESObject; }
function arm(context: TExecutionContext): Any {
  const target = socket(context);
  expect(target.hostSlots!["node.net.timeout"]).toBeDefined();
  return getProperties(target.hostSlots!["node.net.timeout"] as TESObject, context).arm;
}
function armFields(value: Any, context: TExecutionContext) { return getProperties(value as TESObject, context); }
function calls(context: TExecutionContext, operation: string) {
  return effectPaths(context.value.effects, context.value.knowledge).reduce((result, path) =>
    result.concat(path.events.filter(event => event.kind === "call" && event.call.operation === operation).map(event => event.call)), [] as any[]);
}
const open = "var socket = net.connect({host:'127.0.0.1',port:23053});";

test("positional connect preserves its original public arguments and only one API invocation", () => {
  const { initial } = setup(accepted);
  const context = normal(evaluateCode(`function callback() { mark('future'); }
    var socket = net.createConnection(23053,'127.0.0.1',callback);
    var initialTimeout = socket.timeout; var same = socket.setTimeout(100) === socket;`, initial));
  expect(context.value.scope.initialTimeout).toBe(Undefined);
  expect(context.value.scope.same).toMatchObject({ value: true });
  const publicCalls = calls(context, "net.connect");
  expect(publicCalls).toHaveLength(1);
  expect(publicCalls[0].args).toHaveLength(3);
  expect(publicCalls[0].args.slice(0, 2)).toMatchObject([{type:"number", value:23053}, {type:"string", value:"127.0.0.1"}]);
  expect(publicCalls[0].args[2]).toBe(context.value.scope.callback);
  expect(calls(context, "net.socket.submit")).toHaveLength(0);
  expect(armFields(arm(context), context)).toMatchObject({ delay: {value:100}, active:{value:true}, refed:{value:false} });
});

test.each([-1, -0.5, NaN, Infinity, -Infinity])("invalid numeric timeout %s writes public value but retains old active arm", delay => {
  const { initial } = setup(accepted, { invalid: ESNumber(delay) });
  const before = normal(evaluateCode(`${open} socket.setTimeout(100);`, initial));
  const oldArm = arm(before);
  const after = normal(evaluateCode("try { socket.setTimeout(invalid); mark('unreachable'); } catch (e) { var code = e.code; }", before));
  expect(after.value.scope.code).toMatchObject({ value: "ERR_OUT_OF_RANGE" });
  expect(Object.is((getProperties(socket(after), after).timeout as any).value, delay)).toBe(true);
  expect(arm(after)).toBe(oldArm);
  expect(armFields(oldArm, after)).toMatchObject({ delay:{value:100}, active:{value:true}, refed:{value:false} });
  expect(getProperties(socket(before), before).timeout).toMatchObject({ value:100 });
  expect(calls(after, "review.mark")).toHaveLength(0);
});

test("reset, negative zero and destroy update current arms without mutating earlier snapshots", () => {
  const { queue, initial } = setup(accepted);
  const first = normal(evaluateCode(`${open} socket.setTimeout(100);`, initial));
  const a = arm(first);
  const second = normal(evaluateCode("socket.setTimeout(200);", first)), b = arm(second);
  expect(a).not.toBe(b);
  expect(armFields(a, first).active).toMatchObject({ value:true });
  expect(armFields(a, second).active).toMatchObject({ value:false });
  const disabled = normal(evaluateCode("socket.setTimeout(-0);", second));
  expect(Object.is((getProperties(socket(disabled), disabled).timeout as any).value, -0)).toBe(true);
  expect(arm(disabled)).toBe(b);
  expect(armFields(b, disabled).active).toMatchObject({ value:false });
  expect(armFields(b, second).active).toMatchObject({ value:true });
  const rearmed = normal(evaluateCode("socket.setTimeout(300);", disabled)), c = arm(rearmed);
  expect(c).not.toBe(b);
  const destroyed = normal(evaluateCode("socket.destroy();", rearmed));
  expect(arm(destroyed)).toBe(c);
  expect(armFields(c, destroyed)).toMatchObject({ active:{value:false}, delay:{value:300} });
  expect(getProperties(socket(destroyed), destroyed).timeout).toMatchObject({ value:300 });
  const drained = normal(queue.drain(destroyed, 20));
  expect(calls(drained, "net.socket.submit")).toHaveLength(0);
  expect(armFields(c, rearmed).active).toMatchObject({ value:true });
});

test("symbolic valid and numeric-error durations preserve branch-local arm state and public write", () => {
  const { initial } = setup(accepted);
  const before = normal(evaluateCode(`${open} socket.setTimeout(50);`, initial)), oldArm = arm(before);
  const pair = evaluateCode("socket.setTimeout(choice ? 100 : -1);", before);
  const all = leaves(pair);
  expect(all).toHaveLength(2);
  for (const [value, context] of all) {
    expect(isExecutionBoundary(value)).toBe(false);
    const failed = isThrownValue(value);
    expect(resolveBoolean(context.value.scope.choice as TESBoolean, context.value.knowledge)).toBe(!failed);
    expect(getProperties(socket(context), context).timeout).toMatchObject({ value: failed ? -1 : 100 });
    expect(arm(context) === oldArm).toBe(failed);
    expect(armFields(oldArm, context).active).toMatchObject({ value:failed });
  }
});

test("unsupported positive-fraction sibling stops before public timeout or prior timer changes", () => {
  const { initial } = setup(accepted);
  const before = normal(evaluateCode(`${open} socket.setTimeout(50);`, initial)), oldArm = arm(before);
  const all = leaves(evaluateCode("socket.setTimeout(choice ? 100 : 0.5); mark('after');", before));
  expect(all).toHaveLength(2);
  for (const [value, context] of all) {
    const stopped = isExecutionBoundary(value);
    expect(isThrownValue(value)).toBe(false);
    expect(resolveBoolean(context.value.scope.choice as TESBoolean, context.value.knowledge)).toBe(!stopped);
    expect(getProperties(socket(context), context).timeout).toMatchObject({ value:stopped ? 50 : 100 });
    expect(arm(context) === oldArm).toBe(stopped);
    expect(calls(context, "review.mark")).toHaveLength(stopped ? 0 : 1);
  }
});

test("a prototype change after connect cannot bypass timer admission, while its healthy sibling proceeds", () => {
  const { initial } = setup(accepted);
  const before = normal(evaluateCode(`${open} socket.setTimeout(50);`, initial)), oldArm = arm(before);
  const pair = evaluateCode(`if (choice) { Object.prototype.timeout = 7; socket.setTimeout(100); }
    else socket.setTimeout(200);`, before);
  const all = leaves(pair);
  expect(all).toHaveLength(2);
  expect(all.filter(([value]) => isExecutionBoundary(value))).toHaveLength(1);
  for (const [value, context] of all) {
    const stopped = isExecutionBoundary(value);
    expect(getProperties(socket(context), context).timeout).toMatchObject({ value:stopped ? 50 : 200 });
    expect(arm(context) === oldArm).toBe(stopped);
  }
});

test.each(["socket.timeout = 12", "socket.setTimeout = function() {}", "socket.setTimeout.call({},100)"])(
  "protected timeout operation retains old state: %s", action => {
    const { initial } = setup(accepted);
    const before = normal(evaluateCode(`${open} socket.setTimeout(50);`, initial)), oldArm = arm(before);
    const pair = evaluateCode(action, before);
    expect(pair[0]).toMatchObject({ type:"ExecutionBoundary", kind:"unsupported" });
    expect(arm(pair[1])).toBe(oldArm);
    expect(getProperties(socket(pair[1]), pair[1]).timeout).toMatchObject({ value:50 });
  });

test("pending unrefed timer is neither refreshed nor deactivated by accepted or stopped submission", () => {
  const { queue, initial } = setup();
  const before = normal(evaluateCode(`${open} socket.setTimeout(100);`, initial)), configured = arm(before);
  const all = leaves(queue.drain(before, 20));
  expect(all).toHaveLength(2);
  expect(all.filter(([value]) => isExecutionBoundary(value))).toHaveLength(1);
  for (const [, context] of all) {
    expect(arm(context)).toBe(configured);
    expect(armFields(configured, context)).toMatchObject({ delay:{value:100}, active:{value:true}, refed:{value:false} });
    expect(calls(context, "net.socket.setTimeout")).toHaveLength(1);
    expect(calls(context, "net.socket.submit")).toHaveLength(1);
  }
});

test("setTimeout reached during connectionAttempt stops before altering the configured arm", () => {
  const { queue, initial } = setup(accepted);
  const before = normal(evaluateCode(`${open} socket.setTimeout(50);
    socket.on('connectionAttempt', function() { socket.setTimeout(100); });`, initial)), oldArm = arm(before);
  const pair = bindNormal([Undefined, before], (_value, context) => queue.drain(context, 20));
  expect(pair[0]).toMatchObject({ type:"ExecutionBoundary", kind:"unsupported" });
  expect(arm(pair[1])).toBe(oldArm);
  expect(getProperties(socket(pair[1]), pair[1]).timeout).toMatchObject({ value:50 });
  expect(calls(pair[1], "net.socket.submit")).toHaveLength(0);
});

test("pinned native numeric errors match complete messages and preserve the old unrefed schedule", () => {
  assertPinnedNode();
  const values = [-1, -0.5, NaN, Infinity, -Infinity, -4294967296, -4294967297, -1e21, -Number.MAX_VALUE];
  const source = `const net=require('net'); const values=[-1,-0.5,NaN,Infinity,-Infinity,-4294967296,-4294967297,-1e21,-Number.MAX_VALUE];
    const rows=values.map(function(value){ const socket=new net.Socket(); socket.setTimeout(100);
      const key=Object.getOwnPropertySymbols(socket).find(function(key){return key.description==='timeout';});
      const timer=socket[key]; let row;
      try { socket.setTimeout(value); throw Error('expected duration error'); }
      catch(error) { row={name:error.name,code:error.code,message:error.message,rawSame:Object.is(socket.timeout,value),
        sameTimer:socket[key]===timer,active:!timer._destroyed,refed:timer.hasRef()}; }
      socket.destroy(); return row; });
    process.stdout.write(JSON.stringify({version:process.version,rows}));`;
  // These unconnected sockets allocate no transport; all timers are canceled synchronously.
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath, ["-e", source], {
    encoding:"utf8",timeout:10000,env:{...process.env,NODE_OPTIONS:"",NODE_PATH:""}
  });
  expect(child.error).toBeUndefined(); expect(child.status).toBe(0); expect(child.stderr).toBe("");
  const native = JSON.parse(child.stdout);
  expect(native.version).toBe("v24.21.0"); expect(native.rows).toHaveLength(values.length);
  for (let index=0; index<values.length; index++) {
    expect(native.rows[index]).toMatchObject({name:"RangeError",code:"ERR_OUT_OF_RANGE",rawSame:true,sameTimer:true,active:true,refed:false});
    const {initial}=setup(accepted,{duration:ESNumber(values[index])});
    const before=normal(evaluateCode(`${open} socket.setTimeout(100);`,initial)),oldArm=arm(before);
    const result=evaluateCode("socket.setTimeout(duration);",before);
    expect(isThrownValue(result[0])).toBe(true);
    if(!isThrownValue(result[0])) throw Error("Expected guest duration error");
    expect(getProperties(result[0].value as TESObject,result[1]).message).toMatchObject({value:native.rows[index].message});
    expect(arm(result[1])).toBe(oldArm);
    expect(armFields(oldArm,result[1])).toMatchObject({active:{value:true},refed:{value:false},delay:{value:100}});
  }
});
