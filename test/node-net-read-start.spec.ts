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
function run(source:string,max=1,drain=true){
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
const fresh={constructed:{value:true},length:{value:0},highWaterMark:{value:65536},reading:{value:false},sync:{value:true},needReadable:{value:false},ended:{value:false},endEmitted:{value:false},paused:{value:false},emittedReadable:{value:false},readableListening:{value:false},resumeScheduled:{value:false},readingMore:{value:false}};

test.each(['', 'socket.end();'])('fresh read prefix after connect %s returns normally with pending input and unchanged timer',end=>{
 const result=run(`socket.on('connect',function(){${end}record('connect');});socket.on('ready',function(){record('ready');});`);
 expect(result.all).toHaveLength(2);const arrived=result.all.find(history=>marks(history).includes('connect'))!;normal(arrived);
 expect(marks(arrived)).toEqual(['connect','ready']);expect(slot(result.socket,result.ready,'node.stream.readable')).toMatchObject(fresh);
 expect(slot(result.socket,arrived,'node.stream.readable')).toMatchObject({...fresh,reading:{value:true},sync:{value:false},needReadable:{value:true}} as any);
 expect(slot(result.socket,arrived,'node.net.read')).toMatchObject({handleReading:{value:true},pending:{value:true}});
 expect(getProperties(result.externalEvents.state,arrived[1]).active).toBe(Undefined);
 const trace=events(arrived),reads=trace.filter(event=>event.call.operation==='net.socket.read'||event.call.operation==='net.socket.readStart');
 expect(reads.map(event=>[event.kind,event.call.operation])).toEqual([['call','net.socket.read'],['call','net.socket.readStart'],['return','net.socket.readStart'],['return','net.socket.read']]);
 expect(reads[0].call.args).toMatchObject([{value:0}]);expect(reads[1].call.args).toEqual([]);expect(reads.every(event=>event.call.receiver===result.socket)).toBe(true);
 expect(reads[1].call.origin.activation).toBeUndefined();expect(reads[2].kind==='return'&&reads[2].value).toMatchObject({value:0});expect(reads[3].kind==='return'&&reads[3].value).toMatchObject({type:'null'});
 const entering:BranchResult=[Undefined,{value:{...arrived[1].value,heap:reads[1].heap}}];
 expect(slot(result.socket,entering,'node.stream.readable')).toMatchObject({...fresh,reading:{value:true},needReadable:{value:true}} as any);
 expect(slot(result.socket,entering,'node.net.read')).toMatchObject({handleReading:{value:true},pending:{value:false}});
 const before:BranchResult=[Undefined,{value:{...arrived[1].value,heap:reads[0].heap}}];
 expect(slot(result.socket,arrived,'node.net.timeout').arm).toBe(slot(result.socket,before,'node.net.timeout').arm);
 expect(slot(result.socket,arrived,'node.net.shutdown')).toMatchObject({pending:{value:!!end}});
 expect(getArrayElements(getProperties(result.queue.state,arrived[1]).pending as any,arrived[1])).toHaveLength(0);
});

test('normal completion precedes real callback ticks and leaves an idle checkpoint if a tick stops',()=>{
 const result=run("socket.on('connect',function(){tick(function(){record('tick');net.createServer();});});socket.on('ready',function(){record('ready');});");
 const stopped=result.all.find(([value])=>isExecutionBoundary(value))!;expect(stopped).toBeDefined();expect(marks(stopped)).toEqual(['ready','tick']);
 expect(getProperties(result.externalEvents.state,stopped[1]).active).toBe(Undefined);
 const trace=events(stopped),returned=trace.findIndex(event=>event.kind==='return'&&event.call.operation==='net.socket.complete'),tick=trace.findIndex(event=>event.kind==='call'&&event.call.operation==='record'&&(event.call.args[0] as any).value==='tick');
 expect(returned).toBeGreaterThan(-1);expect(tick).toBeGreaterThan(returned);expect(slot(result.socket,stopped,'node.net.read').pending).toMatchObject({value:true});
});

test.each([['connect','Function.prototype.call=function(){};'],['ready','Function.prototype.call=function(){};'],['connect','Object.prototype.extra=true;'],['ready','Object.prototype.extra=true;']])('conditional intrinsic mutation in %s preserves a normal sibling and pre-read stopped state',(event,mutation)=>{
 const result=run(`socket.on('${event}',function(){if(choice){${mutation}}record('callback');});`);
 const stopped=result.all.find(([value])=>isExecutionBoundary(value))!;expect(stopped).toBeDefined();expect(slot(result.socket,stopped,'node.stream.readable')).toMatchObject(fresh);
 expect(getProperties(result.externalEvents.state,stopped[1]).active).not.toBe(Undefined);
 const normalArrival=result.all.find(history=>!isExecutionBoundary(history[0])&&marks(history).includes('callback'))!;normal(normalArrival);expect(slot(result.socket,normalArrival,'node.net.read').pending).toMatchObject({value:true});
});

test.each(['socket.read(0);','socket.pause();',"socket.on('data',function(){});",'socket._readableState;'])('unsupported public readable surface %s stops before read initiation',source=>{
 const result=run(`socket.on('ready',function(){${source}});`),stopped=result.all.find(([value])=>isExecutionBoundary(value))!;
 expect(stopped).toBeDefined();expect(slot(result.socket,stopped,'node.stream.readable')).toMatchObject(fresh);
 expect(slot(result.socket,stopped,'node.net.read')).toMatchObject({handleReading:{value:false},pending:{value:false}});
});

test('horizon zero retains fresh readable state and two arrivals never repeat a consumed socket',()=>{
 const zero=run('',0);expect(zero.all).toHaveLength(1);normal(zero.all[0]);expect(slot(zero.socket,zero.all[0],'node.stream.readable')).toMatchObject(fresh);
 const two=run('',2);expect(two.all).toHaveLength(2);for(const history of two.all){normal(history);expect(events(history).filter(event=>event.kind==='call'&&event.call.operation==='net.socket.readStart').length).toBeLessThanOrEqual(1);}
});
