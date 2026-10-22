import { evaluateCode, isExecutionBoundary, isForkedCompletion, nodeInitialExecutionContext } from '../src';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { createHostFunction, effectContext, effectPaths, HostModel } from '../src/effects';
import { createExternalEvents } from '../src/external-events';
import { UnsupportedAnalysisError } from '../src/execution-context/analysis-failure';
import { BranchResult } from '../src/execution-context/branches';
import { ExecutionContext, setVariablesInScope, TExecutionContext } from '../src/execution-context/ExecutionContext';
import { getArrayElements, getProperties, writeProperty } from '../src/execution-context/Heap';
import { createJobQueue } from '../src/jobs';
import { createEventEmitterModel } from '../src/node/events';
import { createNetModel } from '../src/node/net';
import { ESObject, TESObject } from '../src/Object';
import { choiceOf, resolveBoolean, selectValue } from '../src/symbolic';
import { Any, isThrownValue, Undefined } from '../src/types';

const full:HostModel=(_call,context)=>[ESObject({success:ESBoolean(true),readable:ESBoolean(true),writable:ESBoolean(true)}),context];
function setup(completion:HostModel|undefined=full){
 const queue=createJobQueue(),external=createExternalEvents();
 const net=createNetModel(createEventEmitterModel(),{nextTick:queue,externalEvents:external,completion,
   submit:(_call,context)=>[ESBoolean(true),context]});
 const initial=setVariablesInScope(ExecutionContext({...nodeInitialExecutionContext.value,sourceFile:'/end-review.cjs',evaluationBudget:{remaining:20000}}),{
  net:net.module,mark:createHostFunction('review.mark',(_call,context)=>[Undefined,context]),
  stop:createHostFunction('review.stop',()=>{throw new UnsupportedAnalysisError('independent end callback stop');})});
 return {queue,external,initial};
}
function normal(pair:BranchResult){expect(isExecutionBoundary(pair[0])||isForkedCompletion(pair[0])||isThrownValue(pair[0])).toBe(false);return pair[1];}
function leaves(pair:BranchResult):BranchResult[]{return isForkedCompletion(pair[0])?leaves(pair[0].consequent).concat(leaves(pair[0].alternate)):[pair];}
function trace(context:TExecutionContext):any[]{return effectPaths(context.value.effects,context.value.knowledge).reduce((all,path)=>all.concat(path.events),[] as any[]);}
function calls(context:TExecutionContext,operation:string){return trace(context).filter(event=>event.kind==='call'&&event.call.operation===operation);}
function marks(context:TExecutionContext){return calls(context,'review.mark').map(event=>event.call.args[0].value);}
function socket(context:TExecutionContext,name='socket'){return context.value.scope[name] as TESObject;}
function fields(context:TExecutionContext,slot:string,name='socket'){
 const link=socket(context,name).hostSlots![slot];expect(link).toBeDefined();return getProperties(link as TESObject,context);
}
function writable(context:TExecutionContext,name='socket'){return fields(context,'node.stream.writable',name);}
function shutdown(context:TExecutionContext,name='socket'){return fields(context,'node.net.shutdown',name);}
function ready(env:ReturnType<typeof setup>,source:string){return normal(env.queue.drain(normal(evaluateCode(source,env.initial)),30));}
// Inspect graph histories without executing guest work or resuming checkpoints.
function histories(result:BranchResult):BranchResult[]{
 if(isForkedCompletion(result[0]))return histories(result[0].consequent).concat(histories(result[0].alternate));
 return effectPaths(result[1].value.effects,result[1].value.knowledge).map(path=>{
  const select=(value:Any):Any=>{const choice=choiceOf(value);if(!choice)return value;const known=resolveBoolean(choice.condition,path.knowledge);return known===undefined?value:select(known?choice.consequent:choice.alternate);};
  const heap=new Map(result[1].value.heap || []);
  for(const [key,entry] of heap){const properties:{[name:string]:Any}={};for(const name of Object.keys(entry.properties))properties[name]=select(entry.properties[name]);heap.set(key,{...entry,properties});}
  return [result[0],ExecutionContext({...result[1].value,heap,knowledge:path.knowledge})] as BranchResult;
 });
}
function deliveries(env:ReturnType<typeof setup>,context:TExecutionContext){
 const healthy:BranchResult[]=[];
 const result=env.external.explore(context,1,after=>{healthy.push([Undefined,after]);return [Undefined,after];});
 return healthy.concat(leaves(result).filter(([value])=>isExecutionBoundary(value)||isThrownValue(value)));
}
function deliver(env:ReturnType<typeof setup>,context:TExecutionContext){const found=deliveries(env,context);expect(found).toHaveLength(1);return found[0];}
const open="var socket=net.connect(1234,'127.0.0.1');";
const fresh={constructed:{value:true},ending:{value:false},ended:{value:false},finalCalled:{value:false},finalPending:{value:false},prefinished:{value:false},finished:{value:false}};

test('empty end retains deterministic pending shutdown with exact before/after state and return identity',()=>{
 const env=setup(),before=ready(env,`${open}socket.setTimeout(100);socket.on('connect',function(){mark('entered');if(socket.end()!==socket)throw 'identity';mark('returned');});socket.on('ready',function(){mark('ready');});`);
 const [value,after]=deliver(env,before);expect(value).toBe(Undefined);
 expect(marks(after)).toEqual(['entered','returned','ready']);
 const events=trace(after).filter(event=>['net.socket.end','net.socket.shutdown'].includes(event.call.operation));
 expect(events.map(event=>[event.kind,event.call.operation])).toEqual([['call','net.socket.end'],['call','net.socket.shutdown'],['return','net.socket.shutdown'],['return','net.socket.end']]);
 const target=socket(after);for(const event of events)expect(event.call.receiver).toBe(target);
 expect(events[0].call).toBe(events[3].call);expect(events[1].call).toBe(events[2].call);expect(events[3].value).toBe(target);
 const entry=effectContext(events[0],after),submitted=effectContext(events[1],after),returned=effectContext(events[3],after);
 expect(writable(entry)).toMatchObject(fresh);expect(shutdown(entry).pending).toMatchObject({value:false});
 expect(writable(submitted)).toMatchObject({ending:{value:true},ended:{value:false},finalCalled:{value:true},finalPending:{value:true}});
 expect(getProperties(target,submitted)).toMatchObject({writable:{value:false},writableEnded:{value:true},writableFinished:{value:false}});
 expect(writable(returned)).toMatchObject({ending:{value:true},ended:{value:true},finalCalled:{value:true},finalPending:{value:true},prefinished:{value:false},finished:{value:false}});
 expect(shutdown(returned).pending).toMatchObject({value:true});
 const initialArm=fields(entry,'node.net.timeout').arm,finalArm=fields(after,'node.net.timeout').arm;expect(finalArm).toBe(initialArm);
 expect(getProperties(finalArm as TESObject,after)).toMatchObject({active:{value:true},refed:{value:false},delay:{value:100}});
 expect(getArrayElements(getProperties(env.queue.state,after).pending as any,after)).toHaveLength(0);
 expect(getProperties(env.external.state,after).active).toBe(Undefined);
 expect(events[0].call.origin.activation).toBe(events[1].call.origin.activation);
 expect(events[0].call.origin.activation.sourceFile).toBe('/end-review.cjs');
});

test.each(['Function.prototype.call=function(){mark("patched");};','Object.prototype.altered=1;'])('late prototype mutation stops before end state: %s',mutation=>{
 const env=setup(),before=ready(env,`${open}socket.on('connect',function(){${mutation}socket.end();mark('after');});`);
 const [value,after]=deliver(env,before);expect(isExecutionBoundary(value)).toBe(true);expect(marks(after)).toEqual([]);
 expect(writable(after)).toMatchObject(fresh);expect(shutdown(after).pending).toMatchObject({value:false});expect(calls(after,'net.socket.shutdown')).toHaveLength(0);
});

test.each(['undefined','1','function(){}'])('argument %s is rejected before writable changes',argument=>{
 const env=setup(),before=ready(env,`${open}socket.on('connect',function(){socket.end(${argument});mark('after');});`);
 const [value,after]=deliver(env,before);expect(isExecutionBoundary(value)).toBe(true);expect(writable(after)).toMatchObject(fresh);
 expect(shutdown(after).pending).toMatchObject({value:false});expect(calls(after,'net.socket.shutdown')).toHaveLength(0);expect(marks(after)).toEqual([]);
});

test('a second end stops without submitting twice or undoing the first end',()=>{
 const env=setup(),before=ready(env,`${open}socket.on('connect',function(){socket.end();mark('first');socket.end();mark('second');});`);
 const [value,after]=deliver(env,before);expect(isExecutionBoundary(value)).toBe(true);expect(marks(after)).toEqual(['first']);
 expect(calls(after,'net.socket.shutdown')).toHaveLength(1);expect(writable(after)).toMatchObject({ended:{value:true},finalPending:{value:true},finished:{value:false}});
 expect(shutdown(after).pending).toMatchObject({value:true});
});

test.each(['throw 19','stop()'])('actual caller %s after end preserves pending shutdown and correct event checkpoint',action=>{
 const env=setup(),before=ready(env,`${open}socket.on('connect',function(){socket.end();mark('callback');${action};});socket.on('ready',function(){mark('ready');});`);
 const [value,after]=deliver(env,before);expect(marks(after)).toEqual(['callback']);expect(shutdown(after).pending).toMatchObject({value:true});
 expect(writable(after).ended).toMatchObject({value:true});expect(isThrownValue(value)).toBe(action==='throw 19');
 expect(getProperties(env.external.state,after).active===Undefined).toBe(isThrownValue(value));
 if(isExecutionBoundary(value))expect(after.value.activation).toBeDefined();
});

test('new writable observations remain correct in queued and canceled phases',()=>{
 const env=setup(),queued=normal(evaluateCode(open,env.initial));
 expect(getProperties(socket(queued),queued)).toMatchObject({writable:{value:true},writableEnded:{value:false},writableFinished:{value:false}});
 const stopped=evaluateCode('socket.end();',queued);expect(isExecutionBoundary(stopped[0])).toBe(true);expect(writable(stopped[1])).toMatchObject(fresh);
 const canceled=normal(evaluateCode('socket.destroy();',queued));
 expect(getProperties(socket(canceled),canceled)).toMatchObject({writable:{value:false},writableEnded:{value:false},writableFinished:{value:false}});
 expect(shutdown(canceled).pending).toMatchObject({value:false});
 expect(getProperties(socket(queued),queued).writable).toMatchObject({value:true});
});

test.each([[true,false,true],[true,true,false],[false,true,true]])('partial/failure saved facts %s/%s/%s cannot use connected phase alone',(success,readable,writableFlag)=>{
 const env=setup((_call,context)=>[ESObject({success:ESBoolean(success),readable:ESBoolean(readable),writable:ESBoolean(writableFlag)}),context]);
 const before=ready(env,open),[,stopped]=deliver(env,before);
 // Direct embedding admission check on a retained frontier, not a claim of resumption.
 const end=evaluateCode('socket.end();',stopped);expect(isExecutionBoundary(end[0])).toBe(true);
 expect(writable(end[1])).toMatchObject(fresh);expect(shutdown(end[1]).pending).toMatchObject({value:false});
 expect(calls(end[1],'net.socket.shutdown')).toHaveLength(0);
});

test.each(['writable','writableEnded','writableFinished','end'])('public %s write remains an explicit boundary',property=>{
 const env=setup(),before=ready(env,`${open}socket.on('connect',function(){socket.${property}=false;});`);
 const [value,after]=deliver(env,before);expect(isExecutionBoundary(value)).toBe(true);expect(writable(after)).toMatchObject(fresh);
 expect(shutdown(after).pending).toMatchObject({value:false});
});

test('two possible selected sockets keep independent writable and shutdown state',()=>{
 const env=setup(),before=ready(env,`var first=net.connect(1234,'127.0.0.1');var second=net.connect(1235,'127.0.0.1');
 first.on('connect',function(){first.end();mark('first');});second.on('connect',function(){second.end();mark('second');});`);
 const all=histories(env.external.explore(before,2));expect(all).toHaveLength(5);
 expect(all.map(([,context])=>marks(context)).sort()).toEqual([[],['first'],['first','second'],['second'],['second','first']].sort());
 for(const [,context] of all){const selected=marks(context);expect(new Set(selected).size).toBe(selected.length);
   for(const name of ['first','second']){const ended=selected.includes(name);expect(writable(context,name).ended).toMatchObject({value:ended});expect(shutdown(context,name).pending).toMatchObject({value:ended});}
 }
 expect(writable(before,'first')).toMatchObject(fresh);expect(writable(before,'second')).toMatchObject(fresh);
});


test('finite completion-record choices preserve a full-duplex end sibling beside a partial frontier',()=>{
 const choice=ESBoolean(),model:HostModel=(_call,context)=>[selectValue(choice,
   ESObject({success:ESBoolean(true),readable:ESBoolean(true),writable:ESBoolean(true)}),
   ESObject({success:ESBoolean(true),readable:ESBoolean(false),writable:ESBoolean(true)})),context];
 const env=setup(model),before=ready(env,`${open}socket.on('connect',function(){socket.end();mark('ended');});`);
 const all=deliveries(env,before);expect(all).toHaveLength(2);
 expect(all.filter(([,context])=>marks(context).includes('ended'))).toHaveLength(1);
 expect(all.filter(([value])=>isExecutionBoundary(value))).toHaveLength(1);
});


test('conditional retained completion records do not contaminate sibling end admission checks',()=>{
 const env=setup(),before=ready(env,open),[,connected]=deliver(env,before);
 const choice=ESBoolean(),record=selectValue(choice,
   ESObject({success:ESBoolean(true),readable:ESBoolean(false),writable:ESBoolean(true)}),
   ESObject({success:ESBoolean(true),readable:ESBoolean(true),writable:ESBoolean(true)}));
 // Direct model admission inspection: vary a retained fact, never resume the old external delivery.
 const selected=writeProperty(socket(connected).hostSlots!['node.net.socket'] as TESObject,'completion',record,connected);
 const all=leaves(evaluateCode('socket.end();',selected));expect(all).toHaveLength(2);
 expect(all.filter(([value])=>isExecutionBoundary(value))).toHaveLength(1);
 const healthy=all.filter(([value])=>!isExecutionBoundary(value));expect(healthy).toHaveLength(1);
 expect(shutdown(healthy[0][1]).pending).toMatchObject({value:true});
});
