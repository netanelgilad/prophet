import { evaluateCode, isExecutionBoundary, isForkedCompletion, nodeInitialExecutionContext } from '../src';
import { getFunctionPrototype } from '../src/Function/prototype';
import { invoke } from '../src/ASTResolvers';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { createHostFunction, effectContext, effectPaths, HostModel } from '../src/effects';
import { createExternalEvents } from '../src/external-events';
import { UnsupportedAnalysisError } from '../src/execution-context/analysis-failure';
import { BranchResult } from '../src/execution-context/branches';
import { ExecutionContext, setVariablesInScope, TExecutionContext } from '../src/execution-context/ExecutionContext';
import { getArrayElements, getProperties, removeProperty } from '../src/execution-context/Heap';
import { createJobQueue } from '../src/jobs';
import { createEventEmitterModel } from '../src/node/events';
import { createNetModel } from '../src/node/net';
import { ESObject, TESObject } from '../src/Object';
import { selectValue } from '../src/symbolic';
import { isThrownValue, Undefined } from '../src/types';

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
function shutdown(context:TExecutionContext,name='socket'){return fields(context,'node.net.shutdown',name);}
function ready(env:ReturnType<typeof setup>,source:string){return normal(env.queue.drain(normal(evaluateCode(source,env.initial)),30));}
const open="var socket=net.connect(1234,'127.0.0.1');";

function direct(env:ReturnType<typeof setup>,context:TExecutionContext){
 const source=getArrayElements(getProperties(env.external.state,context).sources as any,context)![0] as TESObject;
 const f=getProperties(source,context);return invoke(f.deliver,[],context,f.receiver);
}
function arrived(env:ReturnType<typeof setup>,context:TExecutionContext,max=1){
 const snapshots:TExecutionContext[]=[];
 const result=env.external.explore(context,max,after=>{snapshots.push(after);return [Undefined,after];});
 return {snapshots,result};
}
test.each([false,true])('normal first read retains pending input, no bytes/jobs or timer change; end=%s',end=>{
 const env=setup(),before=ready(env,`${open}socket.setTimeout(100);socket.on('connect',function(){${end?'socket.end();':''}mark('connect');});socket.on('ready',function(){mark('ready');});`);
 const result=direct(env,before);expect(result[0]).toBe(Undefined);const after=result[1];
 expect(marks(after)).toEqual(['connect','ready']);
 expect(fields(before,'node.stream.readable')).toMatchObject({reading:{value:false},sync:{value:true},needReadable:{value:false},length:{value:0}} as any);
 expect(fields(after,'node.stream.readable')).toMatchObject({reading:{value:true},sync:{value:false},needReadable:{value:true},length:{value:0},ended:{value:false},endEmitted:{value:false}} as any);
 expect(fields(after,'node.net.read')).toMatchObject({handleReading:{value:true},pending:{value:true}});
 const ev=trace(after).filter(e=>['net.socket.read','net.socket.readStart'].includes(e.call.operation));
 expect(ev.map(e=>[e.kind,e.call.operation])).toEqual([['call','net.socket.read'],['call','net.socket.readStart'],['return','net.socket.readStart'],['return','net.socket.read']]);
 expect(ev[0].call.args[0]).toMatchObject({value:0});expect(ev[1].call.args).toEqual([]);
 expect(ev[2].value).toMatchObject({value:0});expect(ev[3].value.type).toBe('null');
 const entry=effectContext(ev[1],after);expect(fields(entry,'node.stream.readable')).toMatchObject({reading:{value:true},sync:{value:true},needReadable:{value:true}});
 expect(fields(entry,'node.net.read').handleReading).toMatchObject({value:true});
 expect(fields(entry,'node.net.timeout').arm).toBe(fields(after,'node.net.timeout').arm);
 expect(shutdown(after).pending).toMatchObject({value:end});
 expect(getArrayElements(getProperties(env.queue.state,after).pending as any,after)).toHaveLength(0);
 for(const event of ev){expect(event.call.receiver).toBe(socket(after));expect(event.call.origin.activation).toBeUndefined();}
});
test.each(['connect','ready'])('late %s intrinsic mutation preserves previous effects and blocks read changes',event=>{
 const env=setup(),before=ready(env,`${open}socket.on('${event}',function(){socket.end();mark('ended');Function.prototype.call=function(){};});`);
 const result=direct(env,before);expect(isExecutionBoundary(result[0])).toBe(true);expect(marks(result[1])).toEqual(['ended']);
 expect(shutdown(result[1]).pending).toMatchObject({value:true});expect(calls(result[1],'net.socket.readStart')).toHaveLength(0);
 expect(fields(result[1],'node.stream.readable').reading).toMatchObject({value:false});
});
test('normal arrival cleanup precedes a queued job stop; callback stop retains active delivery',()=>{
 const env=setup(),enqueue=createHostFunction('review.enqueue',(_call,context)=>env.queue.enqueue(createHostFunction('review.jobstop',()=>{throw new UnsupportedAnalysisError('job frontier');}),[],context));
 env.initial=setVariablesInScope(env.initial,{enqueue});
 const before=ready(env,`${open}socket.on('connect',function(){enqueue();});`);
 const result=env.external.explore(before,2,context=>env.queue.drain(context,30));
 const stopped=leaves(result).filter(([v])=>isExecutionBoundary(v));expect(stopped).toHaveLength(1);
 const after=stopped[0][1];expect(calls(after,'net.socket.readStart')).toHaveLength(1);
 expect(getProperties(env.external.state,after).active).toBe(Undefined);expect(getProperties(env.queue.state,after).active).not.toBe(Undefined);
 const other=setup(),queued=ready(other,`${open}socket.on('ready',function(){stop();});`);
 const interrupted=leaves(other.external.explore(queued,1)).filter(([v])=>isExecutionBoundary(v));expect(interrupted).toHaveLength(1);
 expect(getProperties(other.external.state,interrupted[0][1]).active).not.toBe(Undefined);expect(calls(interrupted[0][1],'net.socket.readStart')).toHaveLength(0);
});
test('finite outcome record correlation survives healthy normal completion beside partial frontier',()=>{
 const choice=ESBoolean(),model:HostModel=(_call,context)=>[selectValue(choice,ESObject({success:ESBoolean(true),readable:ESBoolean(true),writable:ESBoolean(true)}),ESObject({success:ESBoolean(true),readable:ESBoolean(false),writable:ESBoolean(true)})),context];
 const env=setup(model),before=ready(env,`${open}socket.on('connect',function(){mark('healthy');});`);
 const {snapshots,result}=arrived(env,before);expect(snapshots).toHaveLength(1);expect(marks(snapshots[0])).toEqual(['healthy']);
 expect(getProperties(env.external.state,snapshots[0]).active).toBe(Undefined);expect(fields(snapshots[0],'node.net.read').pending).toMatchObject({value:true});
 const stopped=leaves(result).filter(([v])=>isExecutionBoundary(v));expect(stopped).toHaveLength(1);expect(marks(stopped[0][1])).toEqual([]);expect(calls(stopped[0][1],'net.socket.readStart')).toHaveLength(0);
});
test('two sockets preserve selected histories into afterEvent without duplicate completions',()=>{
 const env=setup(),before=ready(env,"var first=net.connect(1234,'127.0.0.1');var second=net.connect(1235,'127.0.0.1');first.on('connect',function(){mark('first');});second.on('connect',function(){mark('second');});");
 const {snapshots,result}=arrived(env,before,2);expect(leaves(result).every(([v])=>!isExecutionBoundary(v)&&!isThrownValue(v))).toBe(true);
 expect(snapshots.map(marks).sort()).toEqual([['first'],['first','second'],['second'],['second','first']].sort());
 for(const context of snapshots){const names=marks(context);expect(new Set(names).size).toBe(names.length);expect(calls(context,'net.socket.readStart')).toHaveLength(names.length);
  for(const name of ['first','second'])expect(fields(context,'node.net.read',name).pending).toMatchObject({value:names.includes(name)});
  expect(getProperties(env.external.state,context).active).toBe(Undefined);
 }
});

test.each(['Object.prototype.newReadDefault=1;','Object.prototype.toString=function(){};','Function.prototype.call=undefined;'])('late intrinsic shape mutation stops before reading: %s',mutation=>{
 const env=setup(),before=ready(env,`${open}socket.on('ready',function(){${mutation}mark('mutated');});`);
 const result=direct(env,before);expect(isExecutionBoundary(result[0])).toBe(true);expect(calls(result[1],'net.socket.readStart')).toHaveLength(0);
 expect(fields(result[1],'node.stream.readable').reading).toMatchObject({value:false});
});
test('conditional intrinsic added name retains healthy sibling through post-ready guard',()=>{
 const env=setup();env.initial=setVariablesInScope(env.initial,{choice:ESBoolean()});
 const before=ready(env,`${open}socket.on('ready',function(){if(choice)Object.prototype.extraRead=1;mark('ready');});`);
 const {snapshots,result}=arrived(env,before);expect(snapshots).toHaveLength(1);expect(calls(snapshots[0],'net.socket.readStart')).toHaveLength(1);
 const stopped=leaves(result).filter(([v])=>isExecutionBoundary(v));expect(stopped).toHaveLength(1);
 expect(marks(stopped[0][1])).toEqual(['ready']);expect(fields(stopped[0][1],'node.stream.readable').reading).toMatchObject({value:false});
});

test('model-owned callback deletion of an intrinsic call property cannot bypass presence guard',()=>{
 const env=setup();env.initial=setVariablesInScope(env.initial,{removeCall:createHostFunction('review.removeCall',(_call,context)=>[Undefined,removeProperty(getFunctionPrototype(),'call',context)])});
 const before=ready(env,`${open}socket.on('ready',function(){removeCall();});`);
 const result=direct(env,before);expect(isExecutionBoundary(result[0])).toBe(true);expect(calls(result[1],'net.socket.readStart')).toHaveLength(0);
 expect(fields(result[1],'node.stream.readable').reading).toMatchObject({value:false});
});
