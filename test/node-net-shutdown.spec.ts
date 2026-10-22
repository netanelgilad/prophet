import { evaluateCode, nodeInitialExecutionContext } from '../src';
import { createNetModel } from '../src/node/net';
import { createEventEmitterModel } from '../src/node/events';
import { createJobQueue } from '../src/jobs';
import { createExternalEvents } from '../src/external-events';
import { createHostFunction, effectPaths } from '../src/effects';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { setVariablesInScope } from '../src/execution-context/ExecutionContext';
import { BranchResult } from '../src/execution-context/branches';
import { isExecutionBoundary, isForkedCompletion } from '../src/execution-context/Completion';
import { getArrayElements, getProperties } from '../src/execution-context/Heap';
import { ESObject, TESObject } from '../src/Object';
import { choiceOf, resolveBoolean } from '../src/symbolic';
import { Any, isThrownValue, Undefined } from '../src/types';

function normal(result:BranchResult){expect(isExecutionBoundary(result[0])||isForkedCompletion(result[0])||isThrownValue(result[0])).toBe(false);return result[1];}
function histories(result:BranchResult):BranchResult[]{
  if(isForkedCompletion(result[0]))return histories(result[0].consequent).concat(histories(result[0].alternate));
  return effectPaths(result[1].value.effects,result[1].value.knowledge).map(path=>{
    const select=(value:Any):Any=>{const choice=choiceOf(value);if(!choice)return value;
      const truth=resolveBoolean(choice.condition,path.knowledge);return truth===undefined?value:select(truth?choice.consequent:choice.alternate);};
    const heap=new Map(result[1].value.heap || []);
    for(const [key,entry] of heap){const properties:{[key:string]:Any}={};for(const name of Object.keys(entry.properties))properties[name]=select(entry.properties[name]);heap.set(key,{...entry,properties});}
    return [result[0],{value:{...result[1].value,heap,knowledge:path.knowledge}}] as BranchResult;
  });
}
function events(result:BranchResult){return effectPaths(result[1].value.effects,result[1].value.knowledge)[0].events;}
function marks(result:BranchResult){return events(result).filter(event=>event.kind==='call'&&event.call.operation==='record').map(event=>(event.call.args[0] as any).value);}
function slot(socket:TESObject,result:BranchResult,name:string):any{return getProperties(socket.hostSlots![name] as TESObject,result[1]);}
function run(source:string,max=2,drain=true){
 const queue=createJobQueue(),externalEvents=createExternalEvents();
 const model=createNetModel(createEventEmitterModel(),{nextTick:queue,externalEvents,submit:(_call,context)=>[ESBoolean(true),context],
 completion:(_call,context)=>[ESObject({success:ESBoolean(true),readable:ESBoolean(true),writable:ESBoolean(true)}),context]});
 const initial=setVariablesInScope(nodeInitialExecutionContext,{net:model.module,choice:ESBoolean(),
 record:createHostFunction('record',(_call,context)=>[Undefined,context]),tick:createHostFunction('tick',(call,context)=>queue.enqueue(call.args[0],[],context))});
 const started=evaluateCode("var socket=net.connect(80,'127.0.0.1');socket.setTimeout(100);"+source,initial);
 const ready=queue.drain(normal(started),100);normal(ready);
 const all=histories(externalEvents.explore(ready[1],max,drain?context=>queue.drain(context,100):undefined));
 return {queue,externalEvents,started,ready,all,socket:started[1].value.scope.socket as TESObject};
}

const end="socket.on('connect',function(){socket.end();});";
function selected(run:ReturnType<typeof runCase>){return run.all.filter(history=>events(history).some(event=>event.kind==='call'&&event.call.operation==='net.socket.shutdownComplete'));}
const runCase=run;
test('selected shutdown completes writable through FIFO while retaining readable and timer',()=>{
 const result=run(end+"socket.on('prefinish',function(){record(socket.writableFinished);tick(function(){record('prefinish-tick');});});socket.on('finish',function(){record(socket.writableFinished);record('finish');});");
 const completed=selected(result);expect(completed).toHaveLength(1);const done=completed[0];normal(done);
 expect(marks(done)).toEqual([false,'prefinish-tick',true,'finish']);
 expect(slot(result.socket,done,'node.net.shutdown').pending).toMatchObject({value:false});
 expect(slot(result.socket,done,'node.stream.writable')).toMatchObject({finalPending:{value:false},prefinished:{value:true},finishPending:{value:false},finished:{value:true}});
 expect(slot(result.socket,done,'node.net.read')).toMatchObject({pending:{value:true},handleReading:{value:true}});
 expect(getProperties(result.socket,done[1])).toMatchObject({destroyed:{value:false},writable:{value:false},writableEnded:{value:true},writableFinished:{value:true}});
 expect(getProperties(slot(result.socket,done,'node.net.timeout').arm,done[1])).toMatchObject({active:{value:true},delay:{value:100}});
 expect(getProperties(result.externalEvents.state,done[1]).active).toBe(Undefined);
 expect(result.all).toHaveLength(3);
});
test.each([0,1])('horizon %s cannot invent shutdown callback',horizon=>{
 const result=run(end,horizon);expect(selected(result)).toHaveLength(0);
 for(const history of result.all)expect(slot(result.socket,history,'node.stream.writable').finished).toMatchObject({value:false});
});
test('prefinish throw consumes callback but never schedules finish',()=>{
 const result=run(end+"socket.on('prefinish',function(){tick(function(){record('queued');});throw 'prefinish';});socket.on('finish',function(){record('finish');});");
 const done=selected(result)[0];expect(isThrownValue(done[0])).toBe(true);expect(marks(done)).toEqual([]);
 expect(slot(result.socket,done,'node.stream.writable')).toMatchObject({finalPending:{value:false},prefinished:{value:true},finishPending:{value:false},finished:{value:false}});
 expect(slot(result.socket,done,'node.net.shutdown').pending).toMatchObject({value:false});
 expect(getArrayElements(getProperties(result.queue.state,done[1]).pending as any,done[1])).toHaveLength(1);
 expect(getProperties(result.externalEvents.state,done[1]).active).toBe(Undefined);
});
test('prefinish unsupported operation retains active delivery and preceding state',()=>{
 const result=run(end+"socket.on('prefinish',function(){socket.write('x');});");const done=selected(result)[0];
 expect(isExecutionBoundary(done[0])).toBe(true);expect(getProperties(result.externalEvents.state,done[1]).active).not.toBe(Undefined);
 expect(slot(result.socket,done,'node.stream.writable')).toMatchObject({prefinished:{value:true},finalPending:{value:false},finishPending:{value:false},finished:{value:false}});
});
test('finish throw occurs after finished write and preserves later jobs',()=>{
 const result=run(end+"socket.on('finish',function(){tick(function(){record('later');});throw 'finish';});");const done=selected(result)[0];
 expect(isThrownValue(done[0])).toBe(true);expect(getProperties(result.socket,done[1]).writableFinished).toMatchObject({value:true});expect(marks(done)).toEqual([]);
 expect(getProperties(result.queue.state,done[1]).active).toBe(Undefined);expect(getProperties(result.externalEvents.state,done[1]).active).toBe(Undefined);
 expect(getArrayElements(getProperties(result.queue.state,done[1]).pending as any,done[1])).toHaveLength(1);
});
test('finish unsupported operation retains active job after finished write',()=>{
 const result=run(end+"socket.on('finish',function(){socket.write('x');});");const done=selected(result)[0];
 expect(isExecutionBoundary(done[0])).toBe(true);expect(getProperties(result.socket,done[1]).writableFinished).toMatchObject({value:true});
 expect(getProperties(result.queue.state,done[1]).active).not.toBe(Undefined);expect(getProperties(result.externalEvents.state,done[1]).active).toBe(Undefined);
});
test('undrained completion retains finish job after synchronous prefinish',()=>{
 const result=run(end+"socket.on('prefinish',function(){record('prefinish');});socket.on('finish',function(){record('finish');});",2,false);const done=selected(result)[0];normal(done);
 expect(marks(done)).toEqual(['prefinish']);expect(slot(result.socket,done,'node.stream.writable')).toMatchObject({finishPending:{value:true},finished:{value:false}});
 expect(getArrayElements(getProperties(result.queue.state,done[1]).pending as any,done[1])).toHaveLength(1);
});
test('no end creates no shutdown callback',()=>{const result=run('');expect(selected(result)).toHaveLength(0);});
test('conditional end only finalizes the selected submitted branch',()=>{
 const result=run("socket.on('connect',function(){if(choice)socket.end();});");expect(selected(result)).toHaveLength(1);
 for(const history of result.all)if(slot(result.socket,history,'node.stream.writable').finished.value===true)expect(events(history).some(event=>event.call.operation==='net.socket.end')).toBe(true);
});
test('once and removed finish listeners use actual current state',()=>{
 const result=run("var value=1;"+end+"function removed(){record('removed');}socket.on('finish',removed);socket.off('finish',removed);socket.once('finish',function(){record(value);});socket.on('prefinish',function(){value=2;});");
 expect(marks(selected(result)[0])).toEqual([2]);
});

test('consumed shutdown cannot arrive twice',()=>{
 const result=run(end);const done=selected(result)[0];
 const again=histories(result.externalEvents.explore(done[1],2,context=>result.queue.drain(context,100)));
 expect(again).toHaveLength(1);expect(events(again[0]).filter(event=>event.kind==='call'&&event.call.operation==='net.socket.shutdownComplete')).toHaveLength(1);
});
test('exhausted finish job budget retains queued finalization without marking finished',()=>{
 const result=run(end,2,false);const done=selected(result)[0];const exhausted=result.queue.drain(done[1],0);
 expect(isExecutionBoundary(exhausted[0])).toBe(true);expect(slot(result.socket,exhausted,'node.stream.writable')).toMatchObject({finishPending:{value:true},finished:{value:false}});
 expect(getArrayElements(getProperties(result.queue.state,exhausted[1]).pending as any,exhausted[1])).toHaveLength(1);
});
test('shutdown competes with a second connection under the same two-event horizon',()=>{
 const result=run(end+"var second=net.connect(81,'127.0.0.1');second.on('connect',function(){record('second');});");
 expect(selected(result)).toHaveLength(1);
 expect(result.all.some(history=>marks(history).includes('second')&&events(history).filter(event=>event.kind==='call'&&event.call.operation==='net.socket.complete').length===2)).toBe(true);
 for(const history of result.all)expect(events(history).filter(event=>event.kind==='call'&&(event.call.operation==='net.socket.complete'||event.call.operation==='net.socket.shutdownComplete')).length).toBeLessThanOrEqual(2);
});
test('custom prefinish apply boundary retains reached writes and waiting siblings',()=>{
 const result=run(end+"function listener(){}listener.apply=function(){};socket.on('prefinish',listener);");const done=selected(result)[0];
 expect(isExecutionBoundary(done[0])).toBe(true);expect(slot(result.socket,done,'node.net.shutdown').pending).toMatchObject({value:false});
 expect(slot(result.socket,done,'node.stream.writable')).toMatchObject({finalPending:{value:false},prefinished:{value:true},finishPending:{value:false}});
 expect(result.all.filter(history=>!isExecutionBoundary(history[0]))).toHaveLength(2);
});
