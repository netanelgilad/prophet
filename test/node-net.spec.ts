import { createCommonJSLoader, nodeInitialExecutionContext } from "../src";
import { createNetModel } from "../src/node/net";
import { createEventEmitterModel } from "../src/node/events";
import { createJobQueue } from "../src/jobs";
import { createHostFunction, effectPaths, HostModel } from "../src/effects";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ExecutionContext } from "../src/execution-context/ExecutionContext";
import { BranchResult } from "../src/execution-context/branches";
import { isExecutionBoundary, isForkedCompletion } from "../src/execution-context/Completion";
import { getProperties } from "../src/execution-context/Heap";
import { ESObject, TESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { Any, ESNumber, isThrownValue, ThrownValue, Undefined } from "../src/types";

const accepted: HostModel = (_call, context) => [ESBoolean(true), context];
function run(source: string, submit: HostModel | null = accepted, inputs: { [name: string]: Any } = {}) {
  const queue = createJobQueue(), events = createEventEmitterModel();
  const net = createNetModel(events, { nextTick: queue, submit: submit === null ? undefined : submit });
  const record = createHostFunction("record", (_call, context) => [Undefined, context]);
  const result = createCommonJSLoader({ "/entry.cjs": source }, { builtins: { net: net.module, events: events.module } })
    .load("/entry.cjs", ExecutionContext({ ...nodeInitialExecutionContext.value, global: ESObject({ ...nodeInitialExecutionContext.value.global!.properties, record, ...inputs }) }));
  return { queue, net, result };
}
function normal(result: BranchResult) {
  expect(isExecutionBoundary(result[0])).toBe(false);
  expect(isForkedCompletion(result[0])).toBe(false);
  expect(isThrownValue(result[0])).toBe(false);
  return result[1];
}
function leaves(result: BranchResult): BranchResult[] {
  return isForkedCompletion(result[0]) ? leaves(result[0].consequent).concat(leaves(result[0].alternate)) : [result];
}
function state(socket: TESObject, result: BranchResult) {
  return getProperties(socket.hostSlots!["node.net.socket"] as TESObject, result[1]);
}

test("net aliases return a pending socket before deferred submission and preserve endpoint identity", () => {
  const { queue, net, result } = run(`const net = require('net');
    const socket = net.connect({host:'127.0.0.1',port:0}, function() { throw 'must remain pending'; });
    socket.on('connectionAttempt', function(address, port, family) { record(address,port,family,this===socket); });
    record('returned',socket.connecting,socket.destroyed); module.exports=socket;`);
  expect(net.module.properties.connect).toBe(net.module.properties.createConnection);
  const before = normal(result), socket = result[0] as TESObject;
  expect(state(socket,result).phase).toMatchObject({value:'queued'});
  expect(effectPaths(before.value.effects)[0].events.some(event => event.call.operation === 'net.socket.submit')).toBe(false);
  const drained = queue.drain(before,100); normal(drained);
  const calls = effectPaths(drained[1].value.effects)[0].events.filter(event => event.kind === 'call');
  const records = calls.filter(event => event.call.operation === 'record');
  expect(records.map(event => event.call.args)).toMatchObject([
    [{value:'returned'},{value:true},{value:false}], [{value:'127.0.0.1'},{value:0},{value:4},{value:true}]]);
  const submission = calls.find(event => event.call.operation === 'net.socket.submit')!;
  expect(submission.call.receiver).toBe(socket);
  expect(submission.call.args).toMatchObject([{value:'127.0.0.1'},{value:0},{value:4}]);
  expect(state(socket,drained)).toMatchObject({ phase:{value:'submitted'}, submissionAccepted:{value:true}, completionPending:{value:true} });
  expect(state(socket,result).phase).toMatchObject({value:'queued'});
});

test("queued destroy returns the same socket and prevents both attempt event and submission", () => {
  const { queue, result } = run(`const socket = require('net').connect({host:'127.0.0.1',port:80});
    socket.on('connectionAttempt',function(){throw 'attempt';});
    socket.on('close',function(){throw 'close';});
    if(socket.destroy()!==socket)throw 'identity'; module.exports=socket;`);
  const socket = result[0] as TESObject;
  const drained = queue.drain(normal(result),100); normal(drained);
  expect(getProperties(socket,drained[1])).toMatchObject({connecting:{value:false},destroyed:{value:true}});
  expect(state(socket,drained)).toMatchObject({phase:{value:'closing'},closePending:{value:true}});
  expect(effectPaths(drained[1].value.effects)[0].events.some(event => event.call.operation === 'net.socket.submit')).toBe(false);
});

test("symbolic default submission retains accepted pending and a stopped cleanup frontier", () => {
  const { queue, result } = run(`let returned=false; const socket=require('net').connect({host:'127.0.0.1',port:80});
    returned=true; socket.on('connectionAttempt',function(){record(returned);}); module.exports=socket;`, null);
  const socket = result[0] as TESObject, outcomes = leaves(queue.drain(normal(result),100));
  expect(outcomes).toHaveLength(2);
  expect(outcomes.some(([value]) => isExecutionBoundary(value))).toBe(true);
  expect(outcomes.some(([value]) => !isExecutionBoundary(value))).toBe(true);
  for (const outcome of outcomes) {
    expect(isThrownValue(outcome[0])).toBe(false);
    const events = effectPaths(outcome[1].value.effects,outcome[1].value.knowledge)[0].events;
    expect(events.find(event => event.call.operation === 'record')!.call.args[0]).toMatchObject({value:true});
    expect(events.filter(event => event.call.operation === 'net.socket.submit').map(event => event.kind)).toEqual(['call','return']);
    expect(state(socket,outcome).submissionAccepted).toBeDefined();
    if(isExecutionBoundary(outcome[0])) expect(getProperties(queue.state,outcome[1]).active).not.toBe(Undefined);
  }
});

test.each([-1,65536,1.5,NaN,Infinity,-Infinity])("invalid numeric port %s throws before queuing even for a hostname", port => {
  const { queue, result } = run("module.exports=require('net').connect({host:'fixture.invalid',port:port});",accepted,{port:ESNumber(port)});
  expect(isThrownValue(result[0])).toBe(true);
  if(!isThrownValue(result[0])) throw Error('Expected guest error');
  expect(getProperties(result[0].value as TESObject,result[1])).toMatchObject({
    code:{value:'ERR_SOCKET_BAD_PORT'}, message:{value:`Port should be >= 0 and < 65536. Received type number (${port}).`}
  });
  const after = queue.drain(result[1],100); normal(after);
  expect(effectPaths(after[1].value.effects)[0].events.some(event => event.call.operation === 'net.socket.submit')).toBe(false);
});

test.each([
  "{host:'fixture.invalid',port:80}", "{host:'',port:-1}", "{host:'127.0.0.1',port:'80'}",
  "{host:'127.0.0.1',port:80,timeout:1}", "{port:80}", "{host:'127.0.0.1'}"
])("unsupported options remain analysis boundaries: %s", options => {
  const { result } = run(`require('net').connect(${options}); record('after');`);
  expect(isExecutionBoundary(result[0])).toBe(true);
  expect(effectPaths(result[1].value.effects)[0].events.some(event => event.call.operation === 'record')).toBe(false);
});

test.each(["throw 'listener';", "socket.destroy();"])("attempt callback abrupt work prevents submission: %s", body => {
  const { queue, result } = run(`const socket=require('net').connect({host:'127.0.0.1',port:80});
    socket.on('connectionAttempt',function(){${body}});`);
  const after = queue.drain(normal(result),100);
  expect(body.startsWith('throw') ? isThrownValue(after[0]) : isExecutionBoundary(after[0])).toBe(true);
  expect(effectPaths(after[1].value.effects)[0].events.some(event => event.call.operation === 'net.socket.submit')).toBe(false);
});

test.each([(_call: any,context: any)=>[ESString('yes'),context], (_call:any,context:any)=>[ThrownValue(ESString('bad')),context]])(
  "invalid submission model result is not a guest transport exception", submit => {
    const { queue, result } = run("require('net').connect({host:'127.0.0.1',port:80});",submit as HostModel);
    expect(()=>queue.drain(normal(result),100)).toThrow(/Boolean/);
  }
);
