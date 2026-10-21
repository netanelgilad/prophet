import { evaluateCode, nodeInitialExecutionContext } from '../src';
import { createNetModel } from '../src/node/net';
import { createEventEmitterModel } from '../src/node/events';
import { createJobQueue } from '../src/jobs';
import { createExternalEvents } from '../src/external-events';
import { createHostFunction, effectPaths, HostModel } from '../src/effects';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { setVariablesInScope } from '../src/execution-context/ExecutionContext';
import { BranchResult } from '../src/execution-context/branches';
import { isExecutionBoundary, isForkedCompletion } from '../src/execution-context/Completion';
import { getArrayElements, getProperties } from '../src/execution-context/Heap';
import { ESObject, TESObject } from '../src/Object';
import { ESString } from '../src/string/String';
import { resolveBoolean } from '../src/symbolic';
import { Any, isThrownValue, TESBoolean, ThrownValue, Undefined } from '../src/types';

const outcome=(success=true,readable=true,writable=true)=>ESObject({success:ESBoolean(success),readable:ESBoolean(readable),writable:ESBoolean(writable)});
const known=(success=true,readable=true,writable=true):HostModel=>(_call,context)=>[outcome(success,readable,writable),context];
function setup(completion?:HostModel) {
  const queue=createJobQueue(), externalEvents=createExternalEvents();
  const model=createNetModel(createEventEmitterModel(),{nextTick:queue,externalEvents,completion,submit:(_call,context)=>[ESBoolean(true),context]});
  const initial=setVariablesInScope(nodeInitialExecutionContext,{net:model.module,
    record:createHostFunction('record',(_call,context)=>[Undefined,context]),
    tick:createHostFunction('tick',(call,context)=>queue.enqueue(call.args[0],[],context))});
  return {queue,externalEvents,initial};
}
function normal(result:BranchResult){expect(isExecutionBoundary(result[0])||isForkedCompletion(result[0])||isThrownValue(result[0])).toBe(false);return result[1];}
function leaves(result:BranchResult):BranchResult[]{return isForkedCompletion(result[0])?leaves(result[0].consequent).concat(leaves(result[0].alternate)):[result];}
function state(socket:TESObject,result:BranchResult){return getProperties(socket.hostSlots!['node.net.socket'] as TESObject,result[1]);}
function arm(socket:TESObject,result:BranchResult){return getProperties(socket.hostSlots!['node.net.timeout'] as TESObject,result[1]).arm as TESObject;}
function events(result:BranchResult){return effectPaths(result[1].value.effects,result[1].value.knowledge)[0].events;}
function marks(result:BranchResult){return events(result).filter(event=>event.kind==='call'&&event.call.operation==='record').map(event=>(event.call.args[0] as any).value);}
const connect="var socket=net.connect(80,'127.0.0.1');";

test('completion outcome is lazy at horizon zero and waiting preserves pending facts',()=>{
  const completion=jest.fn(known());const {queue,externalEvents,initial}=setup(completion);
  const started=evaluateCode(connect,initial);normal(started);const socket=started[1].value.scope.socket as TESObject;
  const ready=queue.drain(started[1],100);normal(ready);
  expect(completion).not.toHaveBeenCalled();normal(externalEvents.explore(ready[1],0));expect(completion).not.toHaveBeenCalled();
  expect(state(socket,ready).completion).toBe(Undefined);
  const all=leaves(externalEvents.explore(ready[1],1));expect(completion).toHaveBeenCalledTimes(1);expect(all).toHaveLength(2);
  const waiting=all.find(([value])=>!isExecutionBoundary(value))!;normal(waiting);
  expect(state(socket,waiting)).toMatchObject({phase:{value:'submitted'},completionPending:{value:true},completion:Undefined});
});

test('default completion retains failure, both partial flag frontiers, full success and waiting',()=>{
  const {queue,externalEvents,initial}=setup();const started=evaluateCode(connect+"socket.on('connect',function(){record('connect');});socket.on('ready',function(){record('ready');});",initial);
  const ready=queue.drain(normal(started),100);normal(ready);const socket=started[1].value.scope.socket as TESObject;
  const all=leaves(externalEvents.explore(ready[1],1));expect(all).toHaveLength(5);
  const stopped=all.filter(([value])=>isExecutionBoundary(value));expect(stopped).toHaveLength(4);
  const records=stopped.map(result=>state(socket,result).completion);expect(new Set(records).size).toBe(1);
  for(const result of stopped){
    const facts=getProperties(state(socket,result).completion as TESObject,result[1]);
    const success=resolveBoolean(facts.success as TESBoolean,result[1].value.knowledge);
    expect(state(socket,result).phase).toMatchObject({value:success?'connected':'connection-failed'});
    expect(state(socket,result).completionPending).toMatchObject({value:false});expect(getProperties(socket,result[1]).connecting).toMatchObject({value:false});
    const full=success&&resolveBoolean(facts.readable as TESBoolean,result[1].value.knowledge)&&resolveBoolean(facts.writable as TESBoolean,result[1].value.knowledge);
    expect(marks(result)).toEqual(full?['connect','ready']:[]);
    expect(getProperties(externalEvents.state,result[1]).active).not.toBe(Undefined);
    expect(events(result).filter(event=>event.call.operation==='net.socket.completion').map(event=>event.kind)).toEqual(['call','return']);
    expect(events(result).filter(event=>event.call.operation==='net.socket.complete').map(event=>event.kind)).toEqual(['call']);
  }
});

test('full success refreshes old active delay, emits connect then ready, and leaves nested ticks pending',()=>{
  const {queue,externalEvents,initial}=setup(known());
  const started=evaluateCode("var socket=net.connect(80,'127.0.0.1',function(){record('first');tick(function(){record('tick');});});socket.setTimeout(100);try{socket.setTimeout(-1);}catch(e){}socket.on('connect',function(){record('second');});socket.on('ready',function(){record('ready');});",initial);
  const ready=queue.drain(normal(started),100);normal(ready);const socket=started[1].value.scope.socket as TESObject,oldArm=arm(socket,ready);
  const result=leaves(externalEvents.explore(ready[1],1,context=>queue.drain(context,100))).find(([value])=>isExecutionBoundary(value))!;
  expect(marks(result)).toEqual(['first','second','ready']);expect(result[0]).toMatchObject({kind:'unsupported',message:expect.stringMatching(/read\(0\)/)});
  const newArm=arm(socket,result);expect(newArm).not.toBe(oldArm);expect(getProperties(oldArm,result[1]).active).toMatchObject({value:false});
  expect(getProperties(oldArm,ready[1]).active).toMatchObject({value:true});expect(getProperties(newArm,result[1])).toMatchObject({active:{value:true},delay:{value:100},refed:{value:false}});
  expect(getProperties(socket,result[1]).timeout).toMatchObject({value:-1});
  expect(getArrayElements(getProperties(queue.state,result[1]).pending as any,result[1])).toHaveLength(1);
});

test.each([[false,true,true],[true,false,true],[true,true,false]])('completion flags %s/%s/%s stop before timer refresh',(success,readable,writable)=>{
  const {queue,externalEvents,initial}=setup(known(success,readable,writable));const started=evaluateCode(connect+'socket.setTimeout(100);',initial);
  const ready=queue.drain(normal(started),100);normal(ready);const socket=started[1].value.scope.socket as TESObject,oldArm=arm(socket,ready);
  const stopped=leaves(externalEvents.explore(ready[1],1)).find(([value])=>isExecutionBoundary(value))!;
  expect(arm(socket,stopped)).toBe(oldArm);expect(getProperties(oldArm,stopped[1]).active).toMatchObject({value:true});
});

test('canceled timer stays inactive after successful connection completion',()=>{
  const {queue,externalEvents,initial}=setup(known());const started=evaluateCode(connect+'socket.setTimeout(100);socket.setTimeout(0);',initial);
  const ready=queue.drain(normal(started),100);normal(ready);const socket=started[1].value.scope.socket as TESObject,oldArm=arm(socket,ready);
  const stopped=leaves(externalEvents.explore(ready[1],1)).find(([value])=>isExecutionBoundary(value))!;
  expect(arm(socket,stopped)).toBe(oldArm);expect(getProperties(oldArm,stopped[1]).active).toMatchObject({value:false});
});

test('guest callback throw consumes completion, prevents ready and cannot deliver again',()=>{
  const {queue,externalEvents,initial}=setup(known());const started=evaluateCode(connect+"socket.on('connect',function(){throw 'stop';});socket.on('ready',function(){record('ready');});",initial);
  const ready=queue.drain(normal(started),100);normal(ready);const socket=started[1].value.scope.socket as TESObject;
  const thrown=leaves(externalEvents.explore(ready[1],1)).find(([value])=>isThrownValue(value))!;
  expect(thrown).toBeDefined();expect(marks(thrown)).toEqual([]);expect(state(socket,thrown).completionPending).toMatchObject({value:false});
  expect(getProperties(externalEvents.state,thrown[1]).active).toBe(Undefined);
  const after=externalEvents.explore(thrown[1],1);normal(after);
  expect(events(after).filter(event=>event.kind==='call'&&event.call.operation==='net.socket.completion')).toHaveLength(1);
});

test('post-submission prototype alteration stops completion before changing socket facts',()=>{
  const {queue,externalEvents,initial}=setup(known());const started=evaluateCode(connect,initial);const ready=queue.drain(normal(started),100);normal(ready);
  const changed=evaluateCode('Object.prototype.extra=true;',ready[1]);normal(changed);const socket=started[1].value.scope.socket as TESObject;
  const stopped=leaves(externalEvents.explore(changed[1],1)).find(([value])=>isExecutionBoundary(value))!;
  expect(state(socket,stopped).completion).toBe(Undefined);expect(getProperties(socket,stopped[1]).connecting).toMatchObject({value:true});
});

test.each([ESString('bad'),ThrownValue(ESString('bad')),ESObject({success:ESBoolean(true)}),ESObject({success:ESBoolean(true),readable:ESBoolean(true),writable:ESString('yes')})])('invalid completion model result is a configuration error',(value:Any)=>{
  const {queue,externalEvents,initial}=setup((_call,context)=>[value,context]);const started=evaluateCode(connect,initial);const ready=queue.drain(normal(started),100);normal(ready);
  expect(()=>externalEvents.explore(ready[1],1)).toThrow(/completion.*Boolean/i);
});

test('completion model without an external registry is rejected',()=>{
  expect(()=>createNetModel(createEventEmitterModel(),{nextTick:createJobQueue(),completion:known()})).toThrow(/registry/i);
});

test('completion records with hidden extra fields are rejected without reading getters',()=>{
  let reads=0;const value=outcome();Object.defineProperty(value.properties,'hidden',{get(){reads++;return ESBoolean(true);},enumerable:false});
  const {queue,externalEvents,initial}=setup((_call,context)=>[value,context]);const started=evaluateCode(connect,initial);const ready=queue.drain(normal(started),100);normal(ready);
  expect(()=>externalEvents.explore(ready[1],1)).toThrow(/completion.*Boolean/i);expect(reads).toBe(0);
});
