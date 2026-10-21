import { evaluateCode, isExecutionBoundary, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { invoke } from "../src/ASTResolvers";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { createHostFunction, effectPaths, HostModel } from "../src/effects";
import { createExternalEvents } from "../src/external-events";
import { UnsupportedAnalysisError } from "../src/execution-context/analysis-failure";
import { BranchResult } from "../src/execution-context/branches";
import { ExecutionContext, setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getArrayElements, getProperties, writeProperty } from "../src/execution-context/Heap";
import { createJobQueue } from "../src/jobs";
import { createEventEmitterModel } from "../src/node/events";
import { createNetModel } from "../src/node/net";
import { ESObject, TESObject } from "../src/Object";
import { resolveBoolean } from "../src/symbolic";
import { ESNumber, isThrownValue, TESBoolean, ThrownValue, Undefined } from "../src/types";

const full: HostModel = (_call, context) => [ESObject({success:ESBoolean(true),readable:ESBoolean(true),writable:ESBoolean(true)}),context];
function setup(completion?: HostModel) {
  const queue=createJobQueue(), external=createExternalEvents();
  const net=createNetModel(createEventEmitterModel(), {nextTick:queue,externalEvents:external,completion,
    submit:(_call:any, context:TExecutionContext)=>[ESBoolean(true),context]} as any);
  const initial=setVariablesInScope(ExecutionContext({...nodeInitialExecutionContext.value,
    evaluationBudget:{remaining:20000},sourceFile:'/completion-review.cjs'}),{net:net.module,
    mark:createHostFunction('review.mark',(_call,context)=>[Undefined,context]),
    stop:createHostFunction('review.stop',()=>{throw new UnsupportedAnalysisError('independent completion stop');})});
  return {queue,external,initial};
}
function normal(pair:BranchResult) {
  expect(isExecutionBoundary(pair[0])||isForkedCompletion(pair[0])||isThrownValue(pair[0])).toBe(false);return pair[1];
}
function leaves(pair:BranchResult):BranchResult[] {return isForkedCompletion(pair[0])?leaves(pair[0].consequent).concat(leaves(pair[0].alternate)):[pair];}
function events(context:TExecutionContext):any[] {return effectPaths(context.value.effects,context.value.knowledge).reduce((all,path)=>all.concat(path.events),[] as any[]);}
function calls(context:TExecutionContext,name:string) {return events(context).filter(event=>event.kind==='call'&&event.call.operation===name).map(event=>event.call);}
function marks(context:TExecutionContext) {return calls(context,'review.mark').map(call=>call.args[0].value);}
function socket(context:TExecutionContext,name='socket') {return context.value.scope[name] as TESObject;}
function state(context:TExecutionContext,name='socket') {return getProperties(socket(context,name).hostSlots!['node.net.socket'] as TESObject,context);}
function arm(context:TExecutionContext) {return getProperties(socket(context).hostSlots!['node.net.timeout'] as TESObject,context).arm;}
function ready(env:ReturnType<typeof setup>,source:string) {return normal(env.queue.drain(normal(evaluateCode(source,env.initial)),30));}
const open="var socket=net.connect(1234,'127.0.0.1');";

test('outcomes are lazy and one default arrival retains four correlated frontiers plus waiting',()=>{
  const env=setup();const before=ready(env,open);
  expect(state(before).completion).toBe(Undefined);
  expect(calls(before,'net.socket.completion')).toHaveLength(0);
  const zero=normal(env.external.explore(before,0));expect(state(zero).completion).toBe(Undefined);
  const all=leaves(env.external.explore(before,1));expect(all).toHaveLength(5);
  const kinds:string[]=[];
  for(const [value,context] of all){
    const completion=state(context).completion;
    if(completion===Undefined){expect(isExecutionBoundary(value)).toBe(false);expect(state(context).completionPending).toMatchObject({value:true});kinds.push('wait');continue;}
    expect(isExecutionBoundary(value)).toBe(true);
    expect(calls(context,'net.socket.completion')).toHaveLength(1);
    expect(state(context).completionPending).toMatchObject({value:false});
    expect(getProperties(socket(context),context).connecting).toMatchObject({value:false});
    expect(getProperties(env.external.state,context).active).not.toBe(Undefined);
    const fields=getProperties(completion as TESObject,context);
    const known=(name:string)=>resolveBoolean(fields[name] as TESBoolean,context.value.knowledge);
    kinds.push(!known('success')?'failure':!known('readable')?'readable':!known('writable')?'writable':'full');
    expect(calls(context,'net.socket.readStart')).toHaveLength(0);
    expect(calls(context,'events.emit').some(call=>call.args[0].value==='error')).toBe(false);
  }
  expect(kinds.sort()).toEqual(['failure','full','readable','wait','writable']);
});

test('successful callback sees consumed state and current once/listener order before read frontier',()=>{
  const env=setup(full);const before=ready(env,`var socket=net.connect(1234,'127.0.0.1',function(){mark('original');if(this!==socket||socket.connecting)throw 'bad receiver';});
    socket.on('connect',function(){mark('late');});socket.on('ready',function(){mark('ready');});`);
  const all=leaves(env.external.explore(before,1));const delivered=all.filter(pair=>isExecutionBoundary(pair[0]));expect(delivered).toHaveLength(1);
  const context=delivered[0][1];expect(marks(context)).toEqual(['original','late','ready']);
  expect(state(context)).toMatchObject({phase:{value:'connected'},completionPending:{value:false}});
  const emitter=getProperties(socket(context).hostSlots!['node.events'] as TESObject,context);
  const listeners=getArrayElements(emitter['event:connect'] as any,context)!;
  expect(listeners).toHaveLength(1);
  expect(getProperties(env.external.state,context).active).not.toBe(Undefined);
  expect(events(context).filter(event=>event.kind==='return'&&event.call.operation==='net.socket.completion')).toHaveLength(1);
});

test('refresh uses old active delay after invalid public write and preserves old snapshots',()=>{
  const env=setup(full);const before=ready(env,`${open}socket.setTimeout(100);try{socket.setTimeout(-1);}catch(e){}`);
  const old=arm(before);expect(getProperties(socket(before),before).timeout).toMatchObject({value:-1});
  const delivered=leaves(env.external.explore(before,1)).filter(pair=>isExecutionBoundary(pair[0]));expect(delivered).toHaveLength(1);
  const after=delivered[0][1],fresh=arm(after);expect(fresh).not.toBe(old);
  expect(getProperties(fresh as TESObject,after)).toMatchObject({active:{value:true},refed:{value:false},delay:{value:100}});
  expect(getProperties(old as TESObject,after).active).toMatchObject({value:false});
  expect(getProperties(old as TESObject,before).active).toMatchObject({value:true});
  expect(getProperties(socket(after),after).timeout).toMatchObject({value:-1});
});

test('successful completion does not revive a disabled timer',()=>{
  const env=setup(full);const before=ready(env,`${open}socket.setTimeout(100);socket.setTimeout(-0);`),old=arm(before);
  const delivered=leaves(env.external.explore(before,1)).filter(pair=>isExecutionBoundary(pair[0]));expect(delivered).toHaveLength(1);
  const after=delivered[0][1];expect(arm(after)).toBe(old);
  expect(getProperties(old as TESObject,after).active).toMatchObject({value:false});
  expect(Object.is((getProperties(socket(after),after).timeout as any).value,-0)).toBe(true);
});

test.each(['throw 77','stop()'])('connect callback interruption %s preserves the right external checkpoint',action=>{
  const env=setup(full);const before=ready(env,`${open}socket.setTimeout(100);socket.on('connect',function(){mark('connect');${action};});
    socket.on('ready',function(){mark('ready');});`);
  const delivered=leaves(env.external.explore(before,1)).filter(pair=>isExecutionBoundary(pair[0])||isThrownValue(pair[0]));expect(delivered).toHaveLength(1);
  const [value,after]=delivered[0];expect(marks(after)).toEqual(['connect']);
  expect(state(after).completionPending).toMatchObject({value:false});
  expect(getProperties(env.external.state,after).active===Undefined).toBe(isThrownValue(value));
  expect(isExecutionBoundary(value)).toBe(action==='stop()');
  if(isExecutionBoundary(value))expect(after.value.activation).toBeDefined();
});

test('an intrinsic mutation after connect cannot silently use native-default completion behavior',()=>{
  const env=setup(full);const before=ready(env,`${open}socket.setTimeout(100);Object.prototype.changed=1;socket.on('connect',function(){mark('connect');});`);
  const delivered=leaves(env.external.explore(before,1)).filter(pair=>isExecutionBoundary(pair[0]));expect(delivered).toHaveLength(1);
  expect(marks(delivered[0][1])).toEqual([]);expect(arm(delivered[0][1])).toBe(arm(before));
});

test('two sockets can each be selected without allocating facts for the other',()=>{
  const env=setup();const before=ready(env,`var first=net.connect(1234,'127.0.0.1');var second=net.connect(1235,'127.0.0.1');`);
  const all=leaves(env.external.explore(before,2));expect(all).toHaveLength(9);
  const counts={first:0,second:0,wait:0};
  for(const [,context] of all){const a=state(context,'first').completion,b=state(context,'second').completion;
    expect(a===Undefined||b===Undefined).toBe(true);
    if(a!==Undefined)counts.first++;else if(b!==Undefined)counts.second++;else counts.wait++;
    expect(calls(context,'net.socket.completion')).toHaveLength(a===Undefined&&b===Undefined?0:1);
  }
  expect(counts).toEqual({first:4,second:4,wait:1});
});

test('completion configuration without a registry is rejected instead of silently ignored',()=>{
  expect(()=>createNetModel(createEventEmitterModel(),{nextTick:createJobQueue(),completion:full} as any)).toThrow();
});


test.each(['primitive','missing','nonboolean','guest-throw'])('invalid completion configuration result %s is never coerced into a transport outcome',kind=>{
  const invalid:HostModel=(_call,context)=>[kind==='primitive'?ESNumber(1):kind==='guest-throw'?ThrownValue(ESNumber(77)):
    ESObject(kind==='missing'?{success:ESBoolean(true)}:{success:ESBoolean(true),readable:ESBoolean(true),writable:ESNumber(1)}),context];
  const env=setup(invalid),before=ready(env,open);
  expect(()=>env.external.explore(before,1)).toThrow();
});

test('completion reads current outcome heap and retains its own record with shared Boolean facts',()=>{
  const raw=ESObject({success:ESBoolean(false),readable:ESBoolean(true),writable:ESBoolean(true)}),success=ESBoolean(true);
  const completion:HostModel=(_call,context)=>[raw,writeProperty(raw,'success',success,context)];
  const env=setup(completion),before=ready(env,`${open}socket.on('connect',function(){mark('connect');});`);
  const delivered=leaves(env.external.explore(before,1)).filter(pair=>isExecutionBoundary(pair[0]));expect(delivered).toHaveLength(1);
  const context=delivered[0][1],outcome=state(context).completion as TESObject;
  expect(outcome).not.toBe(raw);expect(getProperties(outcome,context).success).toBe(success);expect(marks(context)).toEqual(['connect']);
  const changed=writeProperty(raw,'success',ESBoolean(false),context);
  expect(getProperties(outcome,changed).success).toBe(success);
});

test('a completed socket cannot be delivered twice or regenerate completion facts',()=>{
  const env=setup(full),before=ready(env,`${open}socket.on('connect',function(){mark('once');throw 7;});`);
  const delivered=leaves(env.external.explore(before,1)).filter(pair=>isThrownValue(pair[0]));expect(delivered).toHaveLength(1);
  const after=delivered[0][1],saved=state(after).completion;
  const source=getArrayElements(getProperties(env.external.state,after).sources as any,after)![0] as TESObject;
  const fields=getProperties(source,after);
  expect(invoke(fields.eligible,[],after,fields.receiver)[0]).toMatchObject({value:false});
  const direct=invoke(fields.deliver,[],after,fields.receiver);
  expect(isExecutionBoundary(direct[0])).toBe(true);
  expect(state(direct[1]).completion).toBe(saved);expect(calls(direct[1],'net.socket.completion')).toHaveLength(1);
  expect(marks(direct[1])).toEqual(['once']);
});

test('callback removal uses the current heap and emission snapshot without inventing later callbacks',()=>{
  const env=setup(full),before=ready(env,`${open}
    function removed(){mark('removed');} function later(){mark('later');}
    socket.on('connect',removed);socket.removeListener('connect',removed);
    socket.on('connect',function(){mark('first');socket.removeListener('connect',later);});
    socket.on('connect',later);socket.on('ready',function(){mark('ready');});`);
  const delivered=leaves(env.external.explore(before,1)).filter(pair=>isExecutionBoundary(pair[0]));expect(delivered).toHaveLength(1);
  expect(marks(delivered[0][1])).toEqual(['first','later','ready']);
});

test('shared completion Boolean identities preserve custom correlations rather than expanding impossible outcomes',()=>{
  const shared=ESBoolean(),model:HostModel=(_call,context)=>[ESObject({success:shared,readable:shared,writable:ESBoolean(true)}),context];
  const env=setup(model),before=ready(env,`${open}socket.on('connect',function(){mark('connect');});`);
  const all=leaves(env.external.explore(before,1));expect(all).toHaveLength(3);
  for(const [,context] of all){
    const outcome=state(context).completion;if(outcome===Undefined)continue;
    const fields=getProperties(outcome as TESObject,context);expect(fields.success).toBe(fields.readable);
    const success=resolveBoolean(shared,context.value.knowledge);
    expect(marks(context)).toEqual(success?['connect']:[]);
  }
});

test('an environment typed stop retains active delivery without fabricating completion facts',()=>{
  const env=setup(()=>{throw new UnsupportedAnalysisError('independent environment frontier');}),before=ready(env,open);
  const stopped=leaves(env.external.explore(before,1)).filter(pair=>isExecutionBoundary(pair[0]));expect(stopped).toHaveLength(1);
  const context=stopped[0][1];expect(state(context).completion).toBe(Undefined);
  expect(state(context).completionPending).toMatchObject({value:true});expect(getProperties(socket(context),context).connecting).toMatchObject({value:true});
  expect(getProperties(env.external.state,context).active).not.toBe(Undefined);
  expect(events(context).filter(event=>event.call.operation==='net.socket.completion').map(event=>event.kind)).toEqual(['call']);
});
