import { evaluateCode, isExecutionBoundary, isForkedCompletion, nodeInitialExecutionContext } from '../src';
import { invoke } from '../src/ASTResolvers';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { createHostFunction, effectPaths, HostModel } from '../src/effects';
import { createExternalEvents } from '../src/external-events';
import { UnsupportedAnalysisError } from '../src/execution-context/analysis-failure';
import { BranchResult } from '../src/execution-context/branches';
import { ExecutionContext, setVariablesInScope, TExecutionContext } from '../src/execution-context/ExecutionContext';
import { getArrayElements, getProperties, writeProperty } from '../src/execution-context/Heap';
import { createJobQueue } from '../src/jobs';
import { createEventEmitterModel } from '../src/node/events';
import { createNetModel } from '../src/node/net';
import { ESObject, TESObject } from '../src/Object';
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
function connected(env:ReturnType<typeof setup>, extra=''){
 return normal(direct(env,ready(env,`${open}socket.setTimeout(100);socket.on('connect',function(){socket.end();});${extra}`)));
}
function selected(env:ReturnType<typeof setup>,context:TExecutionContext){
 const sources=getArrayElements(getProperties(env.external.state,context).sources as any,context)!;
 expect(sources).toHaveLength(2);const fields=getProperties(sources[1] as TESObject,context);
 return invoke(fields.deliver,[],context,fields.receiver);
}
test('selected shutdown consumes only finalization, queues finish and retains timer/read identities',()=>{
 const env=setup(),before=connected(env),result=selected(env,before),after=normal(result);
 expect(shutdown(after).pending).toMatchObject({value:false});
 expect(fields(after,'node.stream.writable')).toMatchObject({finalPending:{value:false},prefinished:{value:true},finished:{value:false},finishPending:{value:true}});
 expect(fields(after,'node.net.read')).toEqual(fields(before,'node.net.read'));
 expect(fields(after,'node.net.timeout').arm).toBe(fields(before,'node.net.timeout').arm);
 expect(getArrayElements(getProperties(env.queue.state,after).pending as any,after)).toHaveLength(1);
 const finished=normal(env.queue.drain(after,10));
 expect(fields(finished,'node.stream.writable')).toMatchObject({finished:{value:true},finishPending:{value:false}});
 expect(getProperties(socket(finished),finished)).toMatchObject({writable:{value:false},writableEnded:{value:true},writableFinished:{value:true},destroyed:{value:false}});
});
test.each(['prefinish','finish'])('%s actual callback sees correct state and receiver, no arguments',name=>{
 const env=setup(),before=connected(env,`socket.on('${name}',function(arg){mark(this===socket);mark(socket.writableFinished);mark(arg===undefined);});`);
 const after=normal(env.queue.drain(normal(selected(env,before)),10));
 expect(marks(after)).toEqual([true,name==='finish',true]);
 for(const e of calls(after,'review.mark'))expect(e.call.origin.activation).toBeDefined();
});
test.each(['prefinish','finish'])('%s guest throw preserves writes and clears active work',name=>{
 const env=setup(),before=connected(env,`socket.on('${name}',function(){mark('${name}');throw 'sentinel';});`);
 const result=env.external.explore(before,1,c=>env.queue.drain(c,10));
 const thrown=leaves(result).filter(([v])=>isThrownValue(v));expect(thrown).toHaveLength(1);const after=thrown[0][1];
 expect(marks(after)).toEqual([name]);expect(shutdown(after).pending).toMatchObject({value:false});
 expect(fields(after,'node.stream.writable')).toMatchObject({prefinished:{value:true},finalPending:{value:false},finished:{value:name==='finish'},finishPending:{value:false}});
 expect(getProperties(env.external.state,after).active).toBe(Undefined);expect(getProperties(env.queue.state,after).active).toBe(Undefined);
});
test.each(['prefinish','finish'])('%s typed stop retains the actual active stage',name=>{
 const env=setup(),before=connected(env,`socket.on('${name}',function(){mark('${name}');stop();});`);
 const result=env.external.explore(before,1,c=>env.queue.drain(c,10));
 const stopped=leaves(result).filter(([v])=>isExecutionBoundary(v));expect(stopped).toHaveLength(1);const after=stopped[0][1];
 expect(marks(after)).toEqual([name]);expect(fields(after,'node.stream.writable').finished).toMatchObject({value:name==='finish'});
 expect(getProperties(env.external.state,after).active===Undefined).toBe(name==='finish');
 expect(getProperties(env.queue.state,after).active===Undefined).toBe(name==='prefinish');
});
test('prefinish user job precedes finish and can halt it without suppressing queued finalization',()=>{
 const env=setup();env.initial=setVariablesInScope(env.initial,{enqueue:createHostFunction('review.enqueue',(_call,c)=>env.queue.enqueue(createHostFunction('review.jobstop',()=>{throw new UnsupportedAnalysisError('queued stop');}),[],c))});
 const before=connected(env,"socket.on('prefinish',function(){enqueue();});socket.on('finish',function(){mark('finish');});");
 const result=env.external.explore(before,1,c=>env.queue.drain(c,10));const stopped=leaves(result).filter(([v])=>isExecutionBoundary(v));expect(stopped).toHaveLength(1);const after=stopped[0][1];
 expect(marks(after)).toEqual([]);expect(fields(after,'node.stream.writable')).toMatchObject({prefinished:{value:true},finished:{value:false},finishPending:{value:true}});
 expect(getArrayElements(getProperties(env.queue.state,after).pending as any,after)).toHaveLength(1);
 expect(getProperties(env.external.state,after).active).toBe(Undefined);
});
test('finite conditional end registers shutdown only on its actual reached branch',()=>{
 const env=setup();env.initial=setVariablesInScope(env.initial,{choice:ESBoolean()});
 const before=ready(env,`${open}socket.on('connect',function(){if(choice)socket.end();});socket.on('finish',function(){mark('finish');});`);
 const snapshots:TExecutionContext[]=[];const result=env.external.explore(before,2,c=>{const drained=env.queue.drain(c,20);snapshots.push(drained[1]);return drained;});
 expect(leaves(result).every(([v])=>!isExecutionBoundary(v)&&!isThrownValue(v))).toBe(true);
 expect(snapshots.filter(c=>marks(c).includes('finish'))).toHaveLength(1);
});
test('once prefinish removal and current lexical state persist into finish',()=>{
 const env=setup(),before=connected(env,"var n=0;function gone(){mark('gone');}socket.on('prefinish',gone);socket.removeListener('prefinish',gone);socket.once('prefinish',function(){n=9;mark('pre');});socket.on('finish',function(){mark(n);});");
 const result=env.external.explore(before,2,c=>env.queue.drain(c,20));
 const paths=effectPaths(result[1].value.effects,result[1].value.knowledge).map(p=>p.events.filter(e=>e.kind==='call'&&e.call.operation==='review.mark').map((e:any)=>e.call.args[0].value));
 expect(paths).toContainEqual(['pre',9]);expect(paths.every(p=>p.length===0||JSON.stringify(p)===JSON.stringify(['pre',9]))).toBe(true);
});

test.each(['prefinish','finish'])('custom apply at %s stops after its reached state writes',name=>{
 const env=setup(),before=connected(env,`function listener(){mark('unreached');}socket.on('${name}',listener);socket.on('ready',function(){listener.apply=function(){};});`);
 const result=env.external.explore(before,1,c=>env.queue.drain(c,20));
 const stopped=leaves(result).filter(([v])=>isExecutionBoundary(v));expect(stopped).toHaveLength(1);const after=stopped[0][1];
 expect(marks(after)).toEqual([]);expect(shutdown(after).pending).toMatchObject({value:false});
 expect(fields(after,'node.stream.writable')).toMatchObject({finalPending:{value:false},prefinished:{value:true},finished:{value:name==='finish'}});
});
test('unsupported readable end fact is checked after actual finish callback effects',()=>{
 const env=setup();env.initial=setVariablesInScope(env.initial,{alterRead:createHostFunction('review.alterRead',(call,c)=>[Undefined,writeProperty((call.args[0] as TESObject).hostSlots!['node.stream.readable'] as TESObject,'endEmitted',ESBoolean(true),c)])});
 const before=connected(env,"socket.on('finish',function(){mark('finished');alterRead(socket);});");
 const result=env.external.explore(before,1,c=>env.queue.drain(c,20));const stopped=leaves(result).filter(([v])=>isExecutionBoundary(v));expect(stopped).toHaveLength(1);const after=stopped[0][1];
 expect(marks(after)).toEqual(['finished']);expect(fields(after,'node.stream.writable').finished).toMatchObject({value:true});expect(getProperties(socket(after),after).destroyed).toMatchObject({value:false});
});

test('pending transport with invalid finalization consumes arrival before retaining unsupported state',()=>{
 const env=setup(),initial=connected(env),state=socket(initial).hostSlots!['node.stream.writable'] as TESObject;
 const before=writeProperty(state,'finalPending',ESBoolean(false),initial),result=selected(env,before);
 expect(isExecutionBoundary(result[0])).toBe(true);expect(shutdown(result[1]).pending).toMatchObject({value:false});
 expect(fields(result[1],'node.stream.writable')).toMatchObject({finalPending:{value:false},prefinished:{value:false},finished:{value:false}});
});
test('finite writable invariant preserves healthy finalization alongside selected unsupported continuation',()=>{
 const env=setup(),initial=connected(env),state=socket(initial).hostSlots!['node.stream.writable'] as TESObject;
 const before=writeProperty(state,'constructed',ESBoolean(),initial),result=selected(env,before),parts=leaves(result);
 expect(parts.filter(([v])=>isExecutionBoundary(v))).toHaveLength(1);expect(parts.filter(([v])=>!isExecutionBoundary(v))).toHaveLength(1);
 for(const [v,c] of parts){expect(shutdown(c).pending).toMatchObject({value:false});expect(fields(c,'node.stream.writable').prefinished).toMatchObject({value:!isExecutionBoundary(v)});}
});

test('symbolic prefinish exception preserves healthy finish and waiting alternatives',()=>{
 const env=setup();env.initial=setVariablesInScope(env.initial,{choice:ESBoolean()});
 const before=connected(env,"socket.on('prefinish',function(){if(choice)throw 'conditional';mark('pre');});socket.on('finish',function(){mark('finish');});");
 const snapshots:TExecutionContext[]=[];
 const result=env.external.explore(before,1,c=>{const done=env.queue.drain(c,20);snapshots.push(done[1]);return done;});
 const thrown=leaves(result).filter(([v])=>isThrownValue(v));expect(thrown).toHaveLength(1);
 expect(shutdown(thrown[0][1]).pending).toMatchObject({value:false});expect(fields(thrown[0][1],'node.stream.writable').finished).toMatchObject({value:false});
 expect(snapshots).toHaveLength(1);expect(marks(snapshots[0])).toEqual(['pre','finish']);
 expect(effectPaths(result[1].value.effects,result[1].value.knowledge).some(p=>!p.events.some(e=>e.kind==='call'&&e.call.operation==='net.socket.shutdownComplete'))).toBe(true);
});

test('finite listener choice retains healthy selected finish beside uncatchable apply boundary',()=>{
 const env=setup();env.initial=setVariablesInScope(env.initial,{choice:ESBoolean()});
 const before=connected(env,"function bad(){mark('bad-body');}function good(){mark('good-body');}if(choice)socket.on('finish',bad);else socket.on('finish',good);socket.on('ready',function(){bad.apply=function(){mark('apply-body');};});");
 const snapshots:TExecutionContext[]=[];
 const result=env.external.explore(before,1,c=>{const done=env.queue.drain(c,20);for(const [v,branch] of leaves(done))if(!isExecutionBoundary(v)&&!isThrownValue(v))snapshots.push(branch);return done;});
 const stopped=leaves(result).filter(([v])=>isExecutionBoundary(v));expect(stopped).toHaveLength(1);const after=stopped[0][1];
 expect(fields(after,'node.stream.writable').finished).toMatchObject({value:true});expect(marks(after)).toEqual([]);
 expect(snapshots).toHaveLength(1);expect(marks(snapshots[0])).toEqual(['good-body']);
 expect(getProperties(env.external.state,after).active).toBe(Undefined);expect(getProperties(env.queue.state,after).active).not.toBe(Undefined);
});
test('guest catch cannot absorb custom apply analysis boundary reached by finalization',()=>{
 const env=setup(),before=connected(env,"function listener(){mark('body');}socket.on('finish',listener);socket.on('prefinish',function(){listener.apply=function(){};});");
 const pre=normal(selected(env,before));
 const job=getArrayElements(getProperties(env.queue.state,pre).pending as any,pre)![0] as TESObject;
 const callback=getProperties(job,pre).callback;
 const c=setVariablesInScope(pre,{invokeFinish:createHostFunction('review.invokeFinish',(_call,current)=>invoke(callback,[],current,socket(current)))});
 const result=evaluateCode("try{invokeFinish();}catch(e){mark('caught');}mark('after');",c);
 expect(isExecutionBoundary(result[0])).toBe(true);expect(marks(result[1])).toEqual([]);expect(fields(result[1],'node.stream.writable').finished).toMatchObject({value:true});
});
