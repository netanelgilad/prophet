import { spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "fs";
import { removeSync } from "fs-extra";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { effectPaths, isExecutionBoundary, isForkedCompletion } from "../src";
import { getProperties } from "../src/execution-context/Heap";
import { choiceOf, resolveBoolean } from "../src/symbolic";

let directory: string;
beforeEach(() => { directory = realpathSync(mkdtempSync(join(tmpdir(), "prophet-net-completion-"))); });
afterEach(() => { removeSync(directory); });
function fixture(filename: string, contents: string): string {
  const path = join(directory, filename);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  return path;
}
// Inspection decoder preserves map/reference identity. It does not resume code.
function decodeGraph(graph: any): any {
  const objects = new Map<string, any>();
  for (const node of graph.nodes) objects.set(node.id, node.kind === "map" ? new Map() :
    node.kind === "array" ? new Array(node.length) : node.kind === "execution-context"
      ? { type: "ExecutionContext", value: Object.create(null) } : Object.create(null));
  const decode = (value: any): any => {
    if (!value || typeof value !== "object") return value;
    if (value.ref !== undefined) {
      if (!objects.has(value.ref)) throw new Error("Dangling graph reference");
      return objects.get(value.ref);
    }
    switch (value.primitive) {
      case "undefined": return undefined;
      case "NaN": return NaN;
      case "Infinity": return Infinity;
      case "-Infinity": return -Infinity;
      case "-0": return -0;
      default: throw new Error("Unknown graph primitive");
    }
  };
  for (const node of graph.nodes) for (const [key, value] of node.entries || []) {
    const target = objects.get(node.id);
    if (node.kind === "map") target.set(decode(key), decode(value));
    else (node.kind === "execution-context" ? target.value : target)[key] = decode(value);
  }
  const roots: any = {};
  for (const key of Object.keys(graph.roots)) roots[key] = decode(graph.roots[key]);
  return roots;
}
function cli(source: string, status = 2, maxEvents = 0) {
  fixture("entry.cjs", source);
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    [resolve("bin/prophet.js"), "--max-events", String(maxEvents), "--", "entry.cjs"], {
      cwd: directory, encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }
    });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(status);
  if (status === 0) expect(child.stderr).toBe("");
  else expect(child.stderr).toMatch(/^prophet: /);
  const graph = JSON.parse(child.stdout);
  expect(Object.keys(graph).sort()).toEqual(["nodes", "roots"]);
  return { roots: decodeGraph(graph), child };
}
function leaves(result: any[]): any[][] {
  return isForkedCompletion(result[0]) ? leaves(result[0].consequent).concat(leaves(result[0].alternate)) : [result];
}
// Select known alternatives in a merged final heap using this effect history.
// This is inspection only: unresolved values remain symbolic, identities survive.
function inspectPath(context:any,knowledge:any){
  const select=(value:any):any=>{
    const choice=choiceOf(value);if(!choice)return value;
    const known=resolveBoolean(choice.condition,knowledge);
    return known===undefined?value:select(known?choice.consequent:choice.alternate);
  };
  const heap=new Map();
  if(context.value.heap)context.value.heap.forEach((entry:any,key:any)=>{
    const properties:any={};for(const name of Object.keys(entry.properties))properties[name]=select(entry.properties[name]);
    heap.set(key,{...entry,properties,elements:entry.elements&&entry.elements.map(select)});
  });
  return {...context,value:{...context.value,heap,knowledge}};
}
function paths(roots: any) {
  const result: Array<{ completion: any; context: any; events: any[] }> = [];
  for (const [completion, context] of leaves([roots.completion, roots.current]))
    for (const path of effectPaths(context.value.effects, context.value.knowledge))
      result.push({ completion, context: inspectPath(context,path.knowledge), events: path.events as any[] });
  return result;
}
function calls(events: any[], operation: string): any[] {
  return events.filter(event => event.kind === "call" && event.call.operation === operation);
}
function messages(events: any[]): any[] { return calls(events, "console.log").map(event => event.call.args[0].value); }
function socketOf(events: any[]): any {
  const returned = events.filter(event => event.kind === "return" && event.call.operation === "net.connect");
  expect(returned).toHaveLength(1);
  return returned[0].value;
}

// These fixtures retain original Node JS and intercept every native transport action.
const nativeProbe = String.raw` 'use strict';
const fs=require('node:fs'), net=require('node:net'), dns=require('node:dns');
const TCP=process.binding('tcp_wrap').TCP, uv=process.binding('uv');
const rows=[],guards=[];let current;
const unchanged={end:net.Socket.prototype.end,final:net.Socket.prototype._final,read:net.Socket.prototype._read,destroy:net.Socket.prototype._destroy};
function forbidden(name){guards.push(name);throw Error('Forbidden native transport '+name);}
TCP.prototype.connect=function(req,address,port){current.connect={req,handle:this};current.events.push({kind:'connect-intercepted',address,port});return 0;};
TCP.prototype.connect6=function(){forbidden('connect6');};
process.binding('pipe_wrap').Pipe.prototype.connect=function(){forbidden('pipe.connect');};
dns.lookup=function(){forbidden('dns.lookup');};
TCP.prototype.readStart=function(){current.events.push({kind:'readStart-intercepted',state:snapshot(current.socket)});return 0;};
TCP.prototype.readStop=function(){current.events.push({kind:'readStop-intercepted'});return 0;};
for(const key of ['writeBuffer','writeAsciiString','writeUtf8String','writeUcs2String','writeLatin1String','writev'])TCP.prototype[key]=function(){forbidden(key);};
TCP.prototype.shutdown=function(req){
 const row=current;row.shutdown={req,handle:this};row.events.push({kind:'shutdown-intercepted',state:snapshot(row.socket)});
 if(row.mode==='immediate-one')return 1;
 if(row.mode==='immediate-enotconn')return uv.UV_ENOTCONN;
 if(row.mode==='immediate-eio')return uv.UV_EIO;
 if(row.mode==='throw-shutdown')throw new Error('fixture binding throw');
 return 0;
};
// No native close is invoked either. Delivery is explicitly injected and labeled;
// these observations do not establish native close-event loop timing.
TCP.prototype.close=function(callback){current.close={callback,handle:this};current.events.push({kind:'close-intercepted',state:snapshot(current.socket)});};
function errorData(e){return {name:e.name,code:e.code,errno:e.errno,syscall:e.syscall,message:e.message};}
function snapshot(socket){if(!socket)return null;const key=Object.getOwnPropertySymbols(socket).find(k=>String(k)==='Symbol(timeout)'),timer=socket[key];return {connecting:socket.connecting,writable:socket.writable,writableEnded:socket.writableEnded,writableFinished:socket.writableFinished,destroyed:socket.destroyed,closed:socket.closed,readable:socket.readable,writableLength:socket.writableLength,reading:socket._readableState.reading,handleReading:socket._handle&&socket._handle.reading,pendingcb:socket._writableState.pendingcb,ending:socket._writableState.ending,ended:socket._writableState.ended,prefinished:socket._writableState.prefinished,finalCalled:socket._writableState.finalCalled,timerActive:timer&&!timer._destroyed,error:socket.errored&&errorData(socket.errored)};}
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function run(mode){
 const row={mode,events:[]};rows.push(row);current=row;
 const socket=net.connect({host:'127.0.0.1',port:43210},function(){
  row.events.push({kind:'connect-callback',state:snapshot(socket)});
  process.nextTick(()=>row.events.push({kind:'before-end-nextTick',state:snapshot(socket)}));
  const returned=socket.end();
  row.events.push({kind:'end-return',sameSocket:returned===socket,state:snapshot(socket)});
  row.events.push({kind:'caller-availability-true-marker',state:snapshot(socket)});
  process.nextTick(()=>row.events.push({kind:'after-end-nextTick',state:snapshot(socket)}));
  if(mode==='repeated-end'){const again=socket.end();row.events.push({kind:'second-end-return',sameSocket:again===socket,state:snapshot(socket)});}
 });row.socket=socket;
 for(const event of ['prefinish','finish','connect','ready'])socket.on(event,function(){row.events.push({kind:event,state:snapshot(socket)});process.nextTick(()=>row.events.push({kind:event+'-nextTick',state:snapshot(socket)}));if(event==='prefinish' && mode==='prefinish-throw')throw Error('prefinish sentinel');if(event==='prefinish' && mode==='prefinish-end'){const result=socket.end();row.events.push({kind:'reentrant-end',sameSocket:result===socket,state:snapshot(socket)});}});
 socket.on('error',error=>row.events.push({kind:'error',error:errorData(error),state:snapshot(socket)}));
 socket.on('close',hadError=>row.events.push({kind:'close',hadError,state:snapshot(socket)}));
 row.initialListeners={prefinish:socket.listenerCount('prefinish')-1,finish:socket.listenerCount('finish')-1};socket.on('timeout',()=>row.events.push({kind:'unexpected-timeout'}));socket.setTimeout(100);
 row.events.push({kind:'public-connect-return',state:snapshot(socket)});await turn();
 row.events.push({kind:'inject-connect-success'});
 row.connect.req.oncomplete(0,row.connect.handle,row.connect.req,true,true);
 row.events.push({kind:'after-connect-injection',state:snapshot(socket)});await turn();
 if(mode!=='pending-only'){
  const status=mode==='pending-error'?uv.UV_EIO:0;
  const timerKey=Object.getOwnPropertySymbols(socket).find(k=>String(k)==='Symbol(timeout)');const oldTimer=socket[timerKey],oldIdle=oldTimer._idleStart;row.events.push({kind:'inject-shutdown-completion',status});
  process.nextTick(()=>row.events.push({kind:'before-completion-nextTick',state:snapshot(socket)}));try{row.shutdown.req.oncomplete(status,row.shutdown.handle,undefined);}catch(e){row.events.push({kind:'completion-throw',message:e.message,state:snapshot(socket)});}process.nextTick(()=>row.events.push({kind:'after-completion-nextTick',state:snapshot(socket)}));
  row.events.push({kind:'after-shutdown-injection',state:snapshot(socket),sameTimer:socket[timerKey]===oldTimer,sameIdle:oldTimer._idleStart===oldIdle});await turn();
 }
 row.events.push({kind:'before-cleanup',state:snapshot(socket)});
 if(!socket.destroyed)socket.destroy();await turn();
 if(row.close){row.events.push({kind:'inject-close-completion'});Reflect.apply(row.close.callback,row.close.handle,[]);await turn();}
 delete row.socket;delete row.connect;delete row.shutdown;delete row.close;current=undefined;
}
(async()=>{
 for(const mode of ['pending-success','pending-error','pending-only','prefinish-throw','prefinish-end','repeated-end'])await run(mode);
 const assert=require('node:assert/strict');for(const row of rows){const kinds=row.events.map(e=>e.kind);const after=row.events.find(e=>e.kind==='after-shutdown-injection');if(row.mode==='pending-only')assert(!kinds.includes('prefinish'));else if(row.mode==='prefinish-throw'){assert(kinds.includes('completion-throw'));assert(!kinds.includes('finish'));assert.equal(after.state.prefinished,true);assert.equal(after.state.pendingcb,0);}else{assert(kinds.indexOf('prefinish')<kinds.indexOf('after-shutdown-injection'));assert(kinds.indexOf('before-completion-nextTick')<kinds.indexOf('prefinish-nextTick'));assert(kinds.indexOf('prefinish-nextTick')<kinds.indexOf('finish'));assert(kinds.indexOf('finish')<kinds.indexOf('after-completion-nextTick'));assert.equal(after.state.writableFinished,false);assert.equal(after.state.pendingcb,1);assert.equal(after.sameTimer,true);assert.equal(after.sameIdle,true);assert.equal(after.state.reading,true);assert.equal(after.state.handleReading,true);assert.equal(row.events.find(e=>e.kind==='finish').state.writableFinished,true);}assert.equal(row.initialListeners.prefinish,0);assert.equal(row.initialListeners.finish,0);}const result={node:process.version,platform:process.platform,arch:process.arch,guards,unmodified:{end:unchanged.end===net.Socket.prototype.end,final:unchanged.final===net.Socket.prototype._final,read:unchanged.read===net.Socket.prototype._read,destroy:unchanged.destroy===net.Socket.prototype._destroy},rows};
 console.log(JSON.stringify(result));
 if(guards.length||rows.some(row=>row.events.some(e=>e.kind==='unexpected-timeout')))process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
`;
const finishThrowProbe = String.raw` 'use strict';
const fs=require('node:fs'), net=require('node:net'), dns=require('node:dns');
const TCP=process.binding('tcp_wrap').TCP, uv=process.binding('uv');
const rows=[],guards=[];let current;
const unchanged={end:net.Socket.prototype.end,final:net.Socket.prototype._final,read:net.Socket.prototype._read,destroy:net.Socket.prototype._destroy};
function forbidden(name){guards.push(name);throw Error('Forbidden native transport '+name);}
TCP.prototype.connect=function(req,address,port){current.connect={req,handle:this};current.events.push({kind:'connect-intercepted',address,port});return 0;};
TCP.prototype.connect6=function(){forbidden('connect6');};
process.binding('pipe_wrap').Pipe.prototype.connect=function(){forbidden('pipe.connect');};
dns.lookup=function(){forbidden('dns.lookup');};
TCP.prototype.readStart=function(){current.events.push({kind:'readStart-intercepted',state:snapshot(current.socket)});return 0;};
TCP.prototype.readStop=function(){current.events.push({kind:'readStop-intercepted'});return 0;};
for(const key of ['writeBuffer','writeAsciiString','writeUtf8String','writeUcs2String','writeLatin1String','writev'])TCP.prototype[key]=function(){forbidden(key);};
TCP.prototype.shutdown=function(req){
 const row=current;row.shutdown={req,handle:this};row.events.push({kind:'shutdown-intercepted',state:snapshot(row.socket)});
 if(row.mode==='immediate-one')return 1;
 if(row.mode==='immediate-enotconn')return uv.UV_ENOTCONN;
 if(row.mode==='immediate-eio')return uv.UV_EIO;
 if(row.mode==='throw-shutdown')throw new Error('fixture binding throw');
 return 0;
};
// No native close is invoked either. Delivery is explicitly injected and labeled;
// these observations do not establish native close-event loop timing.
TCP.prototype.close=function(callback){current.close={callback,handle:this};current.events.push({kind:'close-intercepted',state:snapshot(current.socket)});};
function errorData(e){return {name:e.name,code:e.code,errno:e.errno,syscall:e.syscall,message:e.message};}
function snapshot(socket){if(!socket)return null;const key=Object.getOwnPropertySymbols(socket).find(k=>String(k)==='Symbol(timeout)'),timer=socket[key];return {connecting:socket.connecting,writable:socket.writable,writableEnded:socket.writableEnded,writableFinished:socket.writableFinished,destroyed:socket.destroyed,closed:socket.closed,readable:socket.readable,writableLength:socket.writableLength,pendingcb:socket._writableState.pendingcb,ending:socket._writableState.ending,ended:socket._writableState.ended,prefinished:socket._writableState.prefinished,finalCalled:socket._writableState.finalCalled,timerActive:timer&&!timer._destroyed,error:socket.errored&&errorData(socket.errored)};}
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function run(mode){
 const row={mode,events:[]};rows.push(row);current=row;
 const socket=net.connect({host:'127.0.0.1',port:43210},function(){
  row.events.push({kind:'connect-callback',state:snapshot(socket)});
  process.nextTick(()=>row.events.push({kind:'before-end-nextTick',state:snapshot(socket)}));
  const returned=socket.end();
  row.events.push({kind:'end-return',sameSocket:returned===socket,state:snapshot(socket)});
  row.events.push({kind:'caller-availability-true-marker',state:snapshot(socket)});
  process.nextTick(()=>row.events.push({kind:'after-end-nextTick',state:snapshot(socket)}));
  if(mode==='repeated-end'){const again=socket.end();row.events.push({kind:'second-end-return',sameSocket:again===socket,state:snapshot(socket)});}
 });row.socket=socket;
 for(const event of ['prefinish','finish','connect','ready'])socket.on(event,function(){row.events.push({kind:event,state:snapshot(socket)});process.nextTick(()=>row.events.push({kind:event+'-nextTick',state:snapshot(socket)}));if(event==='finish' && mode==='finish-throw')throw Error('finish sentinel');if(event==='prefinish' && mode==='prefinish-throw')throw Error('prefinish sentinel');if(event==='prefinish' && mode==='prefinish-end'){const result=socket.end();row.events.push({kind:'reentrant-end',sameSocket:result===socket,state:snapshot(socket)});}});
 socket.on('error',error=>row.events.push({kind:'error',error:errorData(error),state:snapshot(socket)}));
 socket.on('close',hadError=>row.events.push({kind:'close',hadError,state:snapshot(socket)}));
 row.initialListeners={prefinish:socket.listenerCount('prefinish')-1,finish:socket.listenerCount('finish')-1};socket.on('timeout',()=>row.events.push({kind:'unexpected-timeout'}));socket.setTimeout(100);
 row.events.push({kind:'public-connect-return',state:snapshot(socket)});await turn();
 row.events.push({kind:'inject-connect-success'});
 row.connect.req.oncomplete(0,row.connect.handle,row.connect.req,true,true);
 row.events.push({kind:'after-connect-injection',state:snapshot(socket)});await turn();
 if(mode!=='pending-only'){
  const status=mode==='pending-error'?uv.UV_EIO:0;
  row.events.push({kind:'inject-shutdown-completion',status});
  process.nextTick(()=>row.events.push({kind:'before-completion-nextTick',state:snapshot(socket)}));try{row.shutdown.req.oncomplete(status,row.shutdown.handle,undefined);}catch(e){row.events.push({kind:'completion-throw',message:e.message,state:snapshot(socket)});}process.nextTick(()=>row.events.push({kind:'after-completion-nextTick',state:snapshot(socket)}));
  row.events.push({kind:'after-shutdown-injection',state:snapshot(socket)});await turn();
 }
 row.events.push({kind:'before-cleanup',state:snapshot(socket)});
 if(!socket.destroyed)socket.destroy();await turn();
 if(row.close){row.events.push({kind:'inject-close-completion'});Reflect.apply(row.close.callback,row.close.handle,[]);await turn();}
 delete row.socket;delete row.connect;delete row.shutdown;delete row.close;current=undefined;
}
process.once('uncaughtExceptionMonitor',error=>{const row=current;console.log(JSON.stringify({message:error.message,state:snapshot(row.socket),events:row.events,guards}));});(async()=>{
 for(const mode of ['finish-throw'])await run(mode);
 const assert=require('node:assert/strict');for(const row of rows){const kinds=row.events.map(e=>e.kind);const after=row.events.find(e=>e.kind==='after-shutdown-injection');if(row.mode==='pending-only')assert(!kinds.includes('prefinish'));else if(row.mode==='prefinish-throw'){assert(kinds.includes('completion-throw'));assert(!kinds.includes('finish'));assert.equal(after.state.prefinished,true);assert.equal(after.state.pendingcb,0);}else{assert(kinds.indexOf('prefinish')<kinds.indexOf('after-shutdown-injection'));assert(kinds.indexOf('before-completion-nextTick')<kinds.indexOf('prefinish-nextTick'));assert(kinds.indexOf('prefinish-nextTick')<kinds.indexOf('finish'));assert(kinds.indexOf('finish')<kinds.indexOf('after-completion-nextTick'));assert.equal(after.state.writableFinished,false);assert.equal(after.state.pendingcb,1);assert.equal(row.events.find(e=>e.kind==='finish').state.writableFinished,true);}assert.equal(row.initialListeners.prefinish,0);assert.equal(row.initialListeners.finish,0);}const result={node:process.version,platform:process.platform,arch:process.arch,guards,unmodified:{end:unchanged.end===net.Socket.prototype.end,final:unchanged.final===net.Socket.prototype._final,read:unchanged.read===net.Socket.prototype._read,destroy:unchanged.destroy===net.Socket.prototype._destroy},rows};
 console.log(JSON.stringify(result));
 if(guards.length||rows.some(row=>row.events.some(e=>e.kind==='unexpected-timeout')))process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
`;
test("pinned Node shutdown completion ignores status and preserves ordering, reading and timer",()=>{
 const child=spawnSync(process.env.PROPHET_NODE_BINARY||process.execPath,['-e',nativeProbe],{encoding:'utf8',timeout:10000});
 expect(child.error).toBeUndefined();expect(child.status).toBe(0);expect(child.stderr).toBe('');
 const result=JSON.parse(child.stdout);expect(result.node).toBe('v24.21.0');expect(result.guards).toEqual([]);expect(result.rows).toHaveLength(6);
 expect(result.unmodified).toEqual({end:true,final:true,read:true,destroy:true});
});
test("pinned Node finish throw retains finished state and stops queued tail",()=>{
 const child=spawnSync(process.env.PROPHET_NODE_BINARY||process.execPath,['-e',finishThrowProbe],{encoding:'utf8',timeout:10000});
 expect(child.error).toBeUndefined();expect(child.status).toBe(1);
 const result=JSON.parse(child.stdout);expect(result.message).toBe('finish sentinel');expect(result.guards).toEqual([]);
 expect(result.state).toMatchObject({writable:false,writableEnded:true,writableFinished:true,pendingcb:0,destroyed:false});
 expect(result.events.some((event:any)=>event.kind==='after-completion-nextTick')).toBe(false);
});
for(const horizon of [0,1,2])test(`CLI shutdown finalizes only on a second selected arrival horizon=${horizon}`,()=>{
 const {roots}=cli(`var socket=require('net').connect(43210,'127.0.0.1',function(){socket.end();console.log('ended');});
 socket.setTimeout(100);socket.on('prefinish',function(){if(socket.writableFinished)throw 'early';console.log('prefinish');});
 socket.on('finish',function(){if(!socket.writableFinished)throw 'late';console.log('finish');});`,2,horizon);
 const all=paths(roots),finished=all.filter(path=>messages(path.events).includes('finish'));
 expect(finished).toHaveLength(horizon===2?1:0);
 const ended=all.filter(path=>messages(path.events).includes('ended'));
 expect(ended).toHaveLength(horizon===0?0:horizon===1?1:2);
 for(const path of ended){
  const socket=socketOf(path.events),done=messages(path.events).includes('finish');
  expect(isExecutionBoundary(path.completion)).toBe(false);
  expect(messages(path.events)).toEqual(done?['ended','prefinish','finish']:['ended']);
  expect(getProperties(socket.hostSlots['node.net.shutdown'],path.context)).toMatchObject({pending:{value:!done}});
  expect(getProperties(socket.hostSlots['node.stream.writable'],path.context)).toMatchObject({finalPending:{value:!done},prefinished:{value:done},finished:{value:done}});
  expect(getProperties(socket,path.context)).toMatchObject({writable:{value:false},writableEnded:{value:true},writableFinished:{value:done},destroyed:{value:false}});
  const timer=getProperties(socket.hostSlots['node.net.timeout'],path.context).arm;
  expect(getProperties(timer as any,path.context)).toMatchObject({active:{value:true},delay:{value:100}});
  expect(calls(path.events,'net.socket.readStart')).toHaveLength(1);
  expect(calls(path.events,'net.socket.shutdown')).toHaveLength(1);
 }
});
for(const event of ['prefinish','finish'])test(`CLI ${event} throw preserves its actual finalization prefix`,()=>{
 const {roots}=cli(`var socket=require('net').connect(43210,'127.0.0.1',function(){socket.end();});
 socket.on('${event}',function(){console.log('throwing');throw '${event} sentinel';});`,2,2);
 const selected=paths(roots).filter(path=>messages(path.events).includes('throwing'));expect(selected).toHaveLength(1);
 const path=selected[0],socket=socketOf(path.events);
 expect(isExecutionBoundary(path.completion)).toBe(false);
 expect(getProperties(socket.hostSlots['node.net.shutdown'],path.context)).toMatchObject({pending:{value:false}});
 expect(getProperties(socket.hostSlots['node.stream.writable'],path.context)).toMatchObject({finalPending:{value:false},prefinished:{value:true},finished:{value:event==='finish'}});
 expect(getProperties(socket,path.context)).toMatchObject({writableFinished:{value:event==='finish'},destroyed:{value:false}});
});
for(const event of ['prefinish','finish'])test(`CLI ${event} unsupported callback retains its active execution`,()=>{
 const {roots}=cli(`var socket=require('net').connect(43210,'127.0.0.1',function(){socket.end();});
 socket.on('${event}',function(){console.log('entered');require('net').createServer();console.log('unreachable');});`,2,2);
 const selected=paths(roots).filter(path=>messages(path.events).includes('entered'));expect(selected).toHaveLength(1);
 const path=selected[0],socket=socketOf(path.events);
 expect(isExecutionBoundary(path.completion)).toBe(true);expect(messages(path.events)).toEqual(['entered']);
 expect(getProperties(socket.hostSlots['node.net.shutdown'],path.context)).toMatchObject({pending:{value:false}});
 expect(getProperties(socket.hostSlots['node.stream.writable'],path.context)).toMatchObject({finalPending:{value:false},prefinished:{value:true},finished:{value:event==='finish'}});
 expect(path.context.value.activation).toBe(calls(path.events,'console.log')[0].call.origin.activation);
 const external=getProperties(path.context.value.global.hostSlots.externalEvents,path.context).active;
 if(event==='prefinish')expect(external).not.toMatchObject({type:'undefined'});
 else expect(external).toMatchObject({type:'undefined'});
});
