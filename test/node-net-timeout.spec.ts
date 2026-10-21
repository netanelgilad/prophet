import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { createNetModel } from "../src/node/net";
import { createEventEmitterModel } from "../src/node/events";
import { createJobQueue } from "../src/jobs";
import { effectPaths } from "../src/effects";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { BranchResult } from "../src/execution-context/branches";
import { isExecutionBoundary, isForkedCompletion } from "../src/execution-context/Completion";
import { getProperties } from "../src/execution-context/Heap";
import { TESObject } from "../src/Object";
import { ESNumber, isThrownValue, Undefined } from "../src/types";

function setup() {
  const queue = createJobQueue(), events = createEventEmitterModel();
  const net = createNetModel(events, {nextTick:queue, submit:(_call,context)=>[ESBoolean(true),context]});
  const initial = setVariablesInScope(nodeInitialExecutionContext,{net:net.module});
  return {queue, initial};
}
function normal(result: BranchResult) {
  expect(isExecutionBoundary(result[0]) || isForkedCompletion(result[0]) || isThrownValue(result[0])).toBe(false);
  return result[1];
}
function socketOf(result: BranchResult) { return result[1].value.scope.socket as TESObject; }
function timer(socket: TESObject, result: BranchResult) {
  return getProperties(socket.hostSlots!["node.net.timeout"] as TESObject,result[1]);
}
function arm(socket: TESObject, result: BranchResult) { return timer(socket,result).arm as TESObject; }
const options = "{host:'127.0.0.1',port:80}";

test("positional connect preserves public arguments and returns a socket with no timeout", () => {
  const {queue,initial}=setup();
  const result=evaluateCode("var socket=net.createConnection(-0,'127.0.0.1',function(){throw 'pending';});",initial);
  normal(result);
  const socket=socketOf(result);
  expect(getProperties(socket,result[1]).timeout).toBe(Undefined);
  expect(timer(socket,result).arm).toBe(Undefined);
  const after=queue.drain(result[1],100);normal(after);
  const events=effectPaths(after[1].value.effects)[0].events;
  const publicCalls=events.filter(event=>event.kind==='call'&&event.call.operation==='net.connect');
  expect(publicCalls).toHaveLength(1);
  expect(Object.is((publicCalls[0].call.args[0] as any).value,-0)).toBe(true);
  expect(publicCalls[0].call.args[1]).toMatchObject({value:'127.0.0.1'});
  expect(getProperties(socket.hostSlots!['node.net.socket'] as TESObject,after[1]).port).toMatchObject({value:0});
  expect(Object.is((getProperties(socket.hostSlots!['node.net.socket'] as TESObject,after[1]).port as any).value,-0)).toBe(false);
});

test("timeout reset/cancel/rearm preserves snapshots and abstract schedule identities", () => {
  const {queue,initial}=setup();
  const first=evaluateCode(`var socket=net.connect(${options}); if(socket.setTimeout(100)!==socket)throw 'identity';`,initial);
  normal(first);const socket=socketOf(first),oldArm=arm(socket,first);
  expect(getProperties(oldArm,first[1])).toMatchObject({active:{value:true},delay:{value:100},refed:{value:false}});
  const reset=evaluateCode('socket.setTimeout(200);',first[1]);normal(reset);
  const newArm=arm(socket,reset);expect(newArm).not.toBe(oldArm);
  expect(getProperties(oldArm,reset[1]).active).toMatchObject({value:false});
  expect(getProperties(oldArm,first[1]).active).toMatchObject({value:true});
  expect(getProperties(newArm,reset[1])).toMatchObject({active:{value:true},delay:{value:200},refed:{value:false}});
  const canceled=evaluateCode('socket.setTimeout(-0);',reset[1]);normal(canceled);
  expect(arm(socket,canceled)).toBe(newArm);
  expect(getProperties(newArm,canceled[1]).active).toMatchObject({value:false});
  expect(Object.is((getProperties(socket,canceled[1]).timeout as any).value,-0)).toBe(true);
  const rearmed=evaluateCode('socket.setTimeout(50);',canceled[1]);normal(rearmed);
  const currentArm=arm(socket,rearmed);expect(currentArm).not.toBe(newArm);
  const drained=queue.drain(rearmed[1],100);normal(drained);
  expect(arm(socket,drained)).toBe(currentArm);
  expect(getProperties(currentArm,drained[1])).toMatchObject({active:{value:true},delay:{value:50}});
});

test("queued destroy cancels the timer without changing public timeout or delivering futures",()=>{
  const {queue,initial}=setup();
  const first=evaluateCode(`var socket=net.connect(${options},function(){throw 'connected';});socket.setTimeout(100);`,initial);
  normal(first);const socket=socketOf(first),currentArm=arm(socket,first);
  const canceled=evaluateCode("socket.on('close',function(){throw 'closed';});socket.destroy();",first[1]);normal(canceled);
  const drained=queue.drain(canceled[1],100);normal(drained);
  expect(arm(socket,drained)).toBe(currentArm);
  expect(getProperties(currentArm,drained[1]).active).toMatchObject({value:false});
  expect(getProperties(socket,drained[1]).timeout).toMatchObject({value:100});
  expect(getProperties(socket.hostSlots!['node.net.socket'] as TESObject,drained[1]).closePending).toMatchObject({value:true});
  expect(effectPaths(drained[1].value.effects)[0].events.some(event=>event.call.operation==='net.socket.submit')).toBe(false);
});

test.each([-1,-0.5,NaN,Infinity,-Infinity])("numeric duration %s writes public timeout then throws, preserving prior timer", value=>{
  const {queue,initial}=setup();
  const first=evaluateCode(`var socket=net.connect(${options});socket.setTimeout(100);`,initial);
  normal(first);const socket=socketOf(first),currentArm=arm(socket,first),argument=ESNumber(value);
  const failed=evaluateCode('socket.setTimeout(duration);',setVariablesInScope(first[1],{duration:argument}));
  expect(isThrownValue(failed[0])).toBe(true);
  if(!isThrownValue(failed[0]))throw Error('Expected duration error');
  expect(getProperties(failed[0].value as TESObject,failed[1])).toMatchObject({code:{value:'ERR_OUT_OF_RANGE'},
    message:{value:`The value of "msecs" is out of range. It must be a non-negative finite number. Received ${value}`}});
  expect(getProperties(socket,failed[1]).timeout).toBe(argument);
  expect(arm(socket,failed)).toBe(currentArm);
  expect(getProperties(currentArm,failed[1])).toMatchObject({active:{value:true},delay:{value:100}});
  normal(queue.drain(failed[1],100));
});

test.each(['0','2147483647'])("duration %s is an admitted boundary",value=>{
  const {initial}=setup();const result=evaluateCode(`var socket=net.connect(${options});socket.setTimeout(${value});`,initial);
  normal(result);const socket=socketOf(result);
  if(value==='0')expect(timer(socket,result).arm).toBe(Undefined);
  else expect(getProperties(arm(socket,result),result[1])).toMatchObject({active:{value:true},delay:{value:2147483647},refed:{value:false}});
});

test.each(['0.5','2147483648',"'100'",'100,function(){}',''])('unsupported duration/overload %s leaves timer state unchanged',args=>{
  const {initial}=setup();const first=evaluateCode(`var socket=net.connect(${options});socket.setTimeout(100);`,initial);
  normal(first);const socket=socketOf(first),currentArm=arm(socket,first);
  const stopped=evaluateCode(`socket.setTimeout(${args});`,first[1]);expect(isExecutionBoundary(stopped[0])).toBe(true);
  expect(arm(socket,stopped)).toBe(currentArm);expect(getProperties(currentArm,stopped[1]).active).toMatchObject({value:true});
  expect(getProperties(socket,stopped[1]).timeout).toMatchObject({value:100});
});

test("prototype mutation after socket creation stops setter before timeout changes",()=>{
  const {initial}=setup();const first=evaluateCode(`var socket=net.connect(${options});socket.setTimeout(100);`,initial);
  normal(first);const socket=socketOf(first),currentArm=arm(socket,first);
  const stopped=evaluateCode('Object.prototype.extra=true;socket.setTimeout(200);',first[1]);expect(isExecutionBoundary(stopped[0])).toBe(true);
  expect(arm(socket,stopped)).toBe(currentArm);expect(getProperties(socket,stopped[1]).timeout).toMatchObject({value:100});
});

test.each(["socket.timeout=200;","socket.setTimeout=function(){};","socket.on('timeout',function(){});"])("protected timer surface: %s",source=>{
  const {initial}=setup();const first=evaluateCode(`var socket=net.connect(${options});socket.setTimeout(100);`,initial);normal(first);
  const stopped=evaluateCode(source,first[1]);expect(isExecutionBoundary(stopped[0])).toBe(true);
});

test("positional hostname validates invalid numeric port before DNS boundary",()=>{
  const {initial}=setup();const result=evaluateCode("net.connect(-1,'fixture.invalid');",initial);
  expect(isThrownValue(result[0])).toBe(true);
  if(!isThrownValue(result[0]))throw Error('Expected bad port');
  expect(getProperties(result[0].value as TESObject,result[1]).code).toMatchObject({value:'ERR_SOCKET_BAD_PORT'});
});

test.each([[-4294967297,'-4_294_967_297'],[-1e21,'-1e_+21']])('large negative integer duration %s preserves pinned Node error formatting',(value,formatted)=>{
  const {initial}=setup();const result=evaluateCode(`var socket=net.connect(${options});socket.setTimeout(duration);`,
    setVariablesInScope(initial,{duration:ESNumber(value as number)}));
  expect(isThrownValue(result[0])).toBe(true);if(!isThrownValue(result[0]))throw Error('Expected duration error');
  expect(getProperties(result[0].value as TESObject,result[1]).message).toMatchObject({value:`The value of "msecs" is out of range. It must be a non-negative finite number. Received ${formatted}`});
});
