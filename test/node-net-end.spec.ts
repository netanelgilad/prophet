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
import { isThrownValue, Undefined } from '../src/types';

function setup(completion?:HostModel) {
  const queue=createJobQueue(), externalEvents=createExternalEvents();
  const model=createNetModel(createEventEmitterModel(),{nextTick:queue,externalEvents,
    completion:completion||((_call,context)=>[ESObject({success:ESBoolean(true),readable:ESBoolean(true),writable:ESBoolean(true)}),context]),
    submit:(_call,context)=>[ESBoolean(true),context]});
  const initial=setVariablesInScope(nodeInitialExecutionContext,{net:model.module,
    record:createHostFunction('record',(_call,context)=>[Undefined,context]),
    tick:createHostFunction('tick',(call,context)=>queue.enqueue(call.args[0],[],context))});
  return {queue,externalEvents,initial};
}
function normal(result:BranchResult){expect(isExecutionBoundary(result[0])||isForkedCompletion(result[0])||isThrownValue(result[0])).toBe(false);return result[1];}
function leaves(result:BranchResult):BranchResult[]{return isForkedCompletion(result[0])?leaves(result[0].consequent).concat(leaves(result[0].alternate)):[result];}
function slot(socket:TESObject,result:BranchResult,name:string){return getProperties(socket.hostSlots![name] as TESObject,result[1]);}
function events(result:BranchResult){return effectPaths(result[1].value.effects,result[1].value.knowledge)[0].events;}
function marks(result:BranchResult){return events(result).filter(event=>event.kind==='call'&&event.call.operation==='record').map(event=>(event.call.args[0] as any).value);}
const connect="var socket=net.connect(80,'127.0.0.1');";
function delivered(source:string,completion?:HostModel){
  const runtime=setup(completion),started=evaluateCode(connect+source,runtime.initial);
  const ready=runtime.queue.drain(normal(started),100);normal(ready);
  const all=leaves(runtime.externalEvents.explore(ready[1],1));
  return {...runtime,started,ready,all,socket:started[1].value.scope.socket as TESObject,
    stopped:all.find(([value])=>isExecutionBoundary(value)||isThrownValue(value))!};
}
const fresh={constructed:{value:true},ending:{value:false},ended:{value:false},finalCalled:{value:false},finalPending:{value:false},prefinished:{value:false},finished:{value:false}};
const pending={constructed:{value:true},ending:{value:true},ended:{value:true},finalCalled:{value:true},finalPending:{value:true},prefinished:{value:false},finished:{value:false}};

test('first empty end returns the socket after pending shutdown, then connect/ready continue before read frontier',()=>{
  const run=delivered("socket.setTimeout(100);socket.on('connect',function(){record(socket.writable);var same=socket.end();record(same===socket);record(socket.writable);record(socket.writableEnded);record(socket.writableFinished);tick(function(){record('tick');});});socket.on('ready',function(){record('ready');});");
  expect(run.stopped[0]).toMatchObject({kind:'unsupported',message:expect.stringMatching(/read\(0\)/)});
  expect(marks(run.stopped)).toEqual([true,true,false,true,false,'ready']);
  expect(slot(run.socket,run.ready,'node.stream.writable')).toMatchObject(fresh);
  expect(slot(run.socket,run.stopped,'node.stream.writable')).toMatchObject(pending);
  expect(slot(run.socket,run.stopped,'node.net.shutdown')).toMatchObject({pending:{value:true}});
  expect(getProperties(run.socket,run.stopped[1])).toMatchObject({connecting:{value:false},destroyed:{value:false},writable:{value:false},writableEnded:{value:true},writableFinished:{value:false}});
  expect(getArrayElements(getProperties(run.queue.state,run.stopped[1]).pending as any,run.stopped[1])).toHaveLength(1);
  const calls=events(run.stopped).filter(event=>event.call.operation==='net.socket.end'||event.call.operation==='net.socket.shutdown');
  expect(calls.map(event=>[event.kind,event.call.operation])).toEqual([['call','net.socket.end'],['call','net.socket.shutdown'],['return','net.socket.shutdown'],['return','net.socket.end']]);
  expect(calls.every(event=>event.call.receiver===run.socket&&event.call.args.length===0)).toBe(true);
  expect(calls[1].call.origin!.activation).toBe(calls[0].call.origin!.activation);
  expect(calls[1].call).toBe(calls[2].call);expect(calls[0].call).toBe(calls[3].call);
  expect(calls[2].kind==='return'&&calls[2].value).toMatchObject({value:0});expect(calls[3].kind==='return'&&calls[3].value).toBe(run.socket);
  const submitting={value:{...run.stopped[1].value,heap:calls[1].heap}};
  expect(getProperties(run.socket,submitting)).toMatchObject({writable:{value:false},writableEnded:{value:true},writableFinished:{value:false}});
  expect(getProperties(run.socket.hostSlots!['node.stream.writable'] as TESObject,submitting)).toMatchObject({...pending,ended:{value:false}});
  expect(getProperties(run.socket.hostSlots!['node.net.shutdown'] as TESObject,submitting)).toMatchObject({pending:{value:false}});
  const waiting=run.all.find(([value])=>!isExecutionBoundary(value))!;normal(waiting);
  expect(slot(run.socket,waiting,'node.stream.writable')).toMatchObject(fresh);
  expect(slot(run.socket,waiting,'node.net.shutdown')).toMatchObject({pending:{value:false}});
});

test('end keeps the currently refreshed timer identity and active delay unchanged',()=>{
  let beforeEnd:BranchResult|undefined;
  const runtime=setup();
  const initial=setVariablesInScope(runtime.initial,{capture:createHostFunction('capture',(_call,context)=>{beforeEnd=[Undefined,context];return [Undefined,context];})});
  const started=evaluateCode(connect+"socket.setTimeout(100);socket.on('connect',function(){capture();socket.end();});",initial);
  const ready=runtime.queue.drain(normal(started),100);normal(ready);const socket=started[1].value.scope.socket as TESObject;
  const stopped=leaves(runtime.externalEvents.explore(ready[1],1)).find(([value])=>isExecutionBoundary(value))!;
  expect(stopped[0]).toMatchObject({message:expect.stringMatching(/read\(0\)/)});expect(beforeEnd).toBeDefined();
  const before=slot(socket,beforeEnd!,'node.net.timeout').arm,after=slot(socket,stopped,'node.net.timeout').arm;
  expect(after).toBe(before);expect(getProperties(after as TESObject,stopped[1])).toMatchObject({active:{value:true},delay:{value:100},refed:{value:false}});
});

test.each(['undefined',"'data'",'function(){}'])('end overload %s stops before writable state changes',args=>{
  const run=delivered(`socket.on('connect',function(){socket.end(${args});record('after');});`);
  expect(run.stopped[0]).toMatchObject({kind:'unsupported',message:expect.stringMatching(/end.*no arguments/)});
  expect(slot(run.socket,run.stopped,'node.stream.writable')).toMatchObject(fresh);
  expect(slot(run.socket,run.stopped,'node.net.shutdown')).toMatchObject({pending:{value:false}});expect(marks(run.stopped)).toEqual([]);
});

test('repeat end stops without duplicate shutdown or resetting established state',()=>{
  const run=delivered("socket.on('connect',function(){socket.end();record('first');socket.end();record('second');});");
  expect(run.stopped[0]).toMatchObject({kind:'unsupported',message:expect.stringMatching(/first.*end|fresh.*writable/)});
  expect(marks(run.stopped)).toEqual(['first']);expect(slot(run.socket,run.stopped,'node.stream.writable')).toMatchObject(pending);
  expect(events(run.stopped).filter(event=>event.kind==='call'&&event.call.operation==='net.socket.shutdown')).toHaveLength(1);
});

test.each(["Object.prototype.extra=true;","Function.prototype.call=function(){};"])('intrinsic alteration inside connect callback stops end before mutation: %s',alteration=>{
  const run=delivered(`socket.on('connect',function(){${alteration}socket.end();});`);
  expect(run.stopped[0]).toMatchObject({kind:'unsupported',message:expect.stringMatching(/prototype/)});
  expect(slot(run.socket,run.stopped,'node.stream.writable')).toMatchObject(fresh);
  expect(slot(run.socket,run.stopped,'node.net.shutdown')).toMatchObject({pending:{value:false}});
});

test.each(["socket.writable=true;","socket.writableEnded=false;","socket.writableFinished=true;","socket.end=function(){};","socket._writableState;","Object.keys(socket);"])('stream private/protected surface remains guarded: %s',source=>{
  const run=delivered(`socket.on('connect',function(){socket.end();${source}});`);
  expect(isExecutionBoundary(run.stopped[0])).toBe(true);expect(slot(run.socket,run.stopped,'node.stream.writable')).toMatchObject(pending);
});

test('queued and destroyed end stop before finalization; queued destroy updates writable only',()=>{
  const {initial}=setup();const started=evaluateCode(connect,initial);normal(started);const socket=started[1].value.scope.socket as TESObject;
  expect(getProperties(socket,started[1])).toMatchObject({writable:{value:true},writableEnded:{value:false},writableFinished:{value:false}});
  const early=evaluateCode('socket.end();',started[1]);expect(isExecutionBoundary(early[0])).toBe(true);expect(slot(socket,early,'node.stream.writable')).toMatchObject(fresh);
  const destroyed=evaluateCode('socket.destroy();',started[1]);normal(destroyed);
  expect(getProperties(socket,destroyed[1])).toMatchObject({writable:{value:false},writableEnded:{value:false},writableFinished:{value:false}});
  const late=evaluateCode('socket.end();',destroyed[1]);expect(isExecutionBoundary(late[0])).toBe(true);expect(slot(socket,late,'node.stream.writable')).toMatchObject(fresh);
});

test.each([[false,true,true],[true,false,true],[true,true,false]])('failed/partial completion %s/%s/%s cannot admit end even on checkpoint inspection',(success,readable,writable)=>{
  const run=delivered('',(_call,context)=>[ESObject({success:ESBoolean(success),readable:ESBoolean(readable),writable:ESBoolean(writable)}),context]);
  const attempt=evaluateCode('socket.end();',run.stopped[1]);expect(isExecutionBoundary(attempt[0])).toBe(true);
  expect(slot(run.socket,attempt,'node.stream.writable')).toMatchObject(fresh);
  expect(events(attempt).some(event=>event.call.operation==='net.socket.shutdown')).toBe(false);
});

test('guest throw after end preserves pending shutdown and prevents ready',()=>{
  const run=delivered("socket.on('connect',function(){socket.end();throw 'guest';});socket.on('ready',function(){record('ready');});");
  expect(isThrownValue(run.stopped[0])).toBe(true);expect(slot(run.socket,run.stopped,'node.stream.writable')).toMatchObject(pending);expect(marks(run.stopped)).toEqual([]);
});

test('selected completion ends only its socket and preserves the other waiting writable',()=>{
  const runtime=setup();
  const started=evaluateCode(connect+"var second=net.connect(81,'127.0.0.1');socket.on('connect',function(){socket.end();});second.on('connect',function(){second.end();});",runtime.initial);
  const ready=runtime.queue.drain(normal(started),100);normal(ready);
  const first=started[1].value.scope.socket as TESObject,second=started[1].value.scope.second as TESObject;
  const all=leaves(runtime.externalEvents.explore(ready[1],1));expect(all).toHaveLength(3);
  const outcomes=all.filter(([value])=>isExecutionBoundary(value));expect(outcomes).toHaveLength(2);
  for(const result of outcomes){
    expect(result[0]).toMatchObject({message:expect.stringMatching(/read\(0\)/)});
    const calls=events(result).filter(event=>event.kind==='call'&&event.call.operation==='net.socket.end');expect(calls).toHaveLength(1);
    const ended=calls[0].call.receiver as TESObject,waiting=ended===first?second:first;
    expect(slot(ended,result,'node.stream.writable')).toMatchObject(pending);
    expect(slot(waiting,result,'node.stream.writable')).toMatchObject(fresh);
    expect(slot(waiting,result,'node.net.shutdown')).toMatchObject({pending:{value:false}});
  }
});
