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

for(const ending of [false,true])test(`full TCP completion returns normally with pending read and end=${ending}`,()=>{
 const {roots}=cli(`var socket=require('net').connect(43210,'127.0.0.1',function(){
   ${ending?'socket.end();':''}console.log('connected');
 });socket.setTimeout(100);socket.on('ready',function(){console.log('ready');});`,2,1);
 const all=paths(roots),full=all.filter(path=>messages(path.events).includes('connected'));
 expect(full).toHaveLength(1);expect(all).toHaveLength(6);
 const {events,context,completion}=full[0],socket=socketOf(events);
 expect(isExecutionBoundary(completion)).toBe(false);expect(messages(events)).toEqual(['connected','ready']);
 const reading=calls(events,'net.socket.read'),start=calls(events,'net.socket.readStart');
 expect(reading).toHaveLength(1);expect(start).toHaveLength(1);
 expect(reading[0].call.args).toMatchObject([{value:0}]);expect(start[0].call.args).toEqual([]);
 expect(reading[0].call.receiver).toBe(socket);expect(start[0].call.receiver).toBe(socket);
 expect(reading[0].call.origin.activation).toBeUndefined();expect(start[0].call.origin.activation).toBeUndefined();
 const order=events.filter(event=>['net.socket.read','net.socket.readStart'].includes(event.call.operation));
 expect(order.map(event=>[event.kind,event.call.operation])).toEqual([
   ['call','net.socket.read'],['call','net.socket.readStart'],['return','net.socket.readStart'],['return','net.socket.read']]);
 expect(order[2].value).toMatchObject({value:0});expect(order[3].value).toMatchObject({type:'null'});
 const before={value:{...context.value,heap:reading[0].heap}},atStart={value:{...context.value,heap:start[0].heap}};
 expect(getProperties(socket.hostSlots['node.stream.readable'],before) as any).toMatchObject({reading:{value:false},sync:{value:true},needReadable:{value:false}});
 expect(getProperties(socket.hostSlots['node.stream.readable'],atStart) as any).toMatchObject({reading:{value:true},sync:{value:true},needReadable:{value:true}});
 expect(getProperties(socket.hostSlots['node.net.read'],atStart)).toMatchObject({handleReading:{value:true},pending:{value:false}});
 expect(getProperties(socket.hostSlots['node.stream.readable'],context) as any).toMatchObject({
   reading:{value:true},sync:{value:false},needReadable:{value:true},highWaterMark:{value:65536},ended:{value:false},endEmitted:{value:false}});
 expect(getProperties(socket.hostSlots['node.stream.readable'],context).length).toMatchObject({value:0});
 expect(getProperties(socket.hostSlots['node.stream.readable'],before).length).toMatchObject({value:0});
 expect(getProperties(socket.hostSlots['node.net.read'],context)).toMatchObject({handleReading:{value:true},pending:{value:true}});
 expect(getProperties(socket.hostSlots['node.net.shutdown'],context)).toMatchObject({pending:{value:ending}});
 expect(getProperties(socket.hostSlots['node.net.timeout'],before).arm).toBe(getProperties(socket.hostSlots['node.net.timeout'],context).arm);
 expect(getProperties(context.value.global.hostSlots.externalEvents,context).active).toMatchObject({type:'undefined'});
 expect(events.filter(event=>event.kind==='return'&&event.call.operation==='net.socket.complete')).toHaveLength(1);
 for(const path of all.filter(path=>path!==full[0])){
   expect(calls(path.events,'net.socket.read')).toHaveLength(0);
   expect(getProperties(socket.hostSlots['node.net.read'],path.context)).toMatchObject({handleReading:{value:false},pending:{value:false}});
 }
});

test("pinned native first-read ordering keeps full JS stream machinery and never calls native transport",()=>{
 const source=String.raw`'use strict';
const fs=require('node:fs'),net=require('node:net'),dns=require('node:dns');
const TCP=process.binding('tcp_wrap').TCP,uv=process.binding('uv');
const rows=[],guards=[];let current;
const original={read:net.Socket.prototype.read,_read:net.Socket.prototype._read,end:net.Socket.prototype.end,
 isPaused:net.Socket.prototype.isPaused,on:net.Socket.prototype.on,pause:net.Socket.prototype.pause};
function forbidden(name){guards.push(name);throw Error('Forbidden '+name);}
TCP.prototype.connect=function(req,address,port){current.connect={req,handle:this};current.events.push({kind:'binding-connect',address,port});return 0;};
TCP.prototype.connect6=function(){forbidden('connect6');};
process.binding('pipe_wrap').Pipe.prototype.connect=function(){forbidden('IPC');};dns.lookup=function(){forbidden('DNS');};
TCP.prototype.readStart=function(){current.events.push({kind:'binding-readStart',state:snapshot(current.socket)});return current.mode==='read-error'?uv.UV_EIO:0;};
TCP.prototype.readStop=function(){current.events.push({kind:'binding-readStop'});return 0;};
TCP.prototype.shutdown=function(req){current.shutdown=req;current.events.push({kind:'binding-shutdown',state:snapshot(current.socket)});return 0;};
TCP.prototype.close=function(cb){current.close={cb,handle:this};current.events.push({kind:'binding-close',state:snapshot(current.socket)});};
for(const key of ['writeBuffer','writeAsciiString','writeUtf8String','writeUcs2String','writeLatin1String','writev'])TCP.prototype[key]=function(){forbidden(key);};
function snapshot(socket){const s=socket._readableState;const key=Object.getOwnPropertySymbols(socket).find(k=>String(k)==='Symbol(timeout)'),timer=socket[key];return {
 connecting:socket.connecting,readable:socket.readable,readableLength:socket.readableLength,readableHighWaterMark:socket.readableHighWaterMark,
 readableFlowing:socket.readableFlowing,paused:socket.isPaused(),destroyed:socket.destroyed,writableEnded:socket.writableEnded,writableFinished:socket.writableFinished,
 bufferLength:s.length,reading:s.reading,needReadable:s.needReadable,emittedReadable:s.emittedReadable,readableListening:s.readableListening,
 sync:s.sync,ended:s.ended,endEmitted:s.endEmitted,constructed:s.constructed,resumeScheduled:s.resumeScheduled,readingMore:s.readingMore,
 handleReading:socket._handle&&socket._handle.reading,timerActive:timer&&!timer._destroyed};}
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function run(mode){
 const row={mode,events:[]};rows.push(row);current=row;
 const socket=net.connect(43210,'127.0.0.1',function(){
  row.events.push({kind:'connect-callback',state:snapshot(socket)});
  process.nextTick(()=>row.events.push({kind:'connect-nextTick',state:snapshot(socket)}));
  if(mode==='end-pending'){socket.end();row.events.push({kind:'after-end',state:snapshot(socket)});}
  if(mode==='pause-connect'){socket.pause();row.events.push({kind:'after-pause',state:snapshot(socket)});}
  if(mode==='throw-connect')throw new Error('connect fixture throw');
 });row.socket=socket;
 socket.on('connect',()=>{row.events.push({kind:'connect-listener',state:snapshot(socket)});process.nextTick(()=>row.events.push({kind:'listener-nextTick'}));});
 socket.on('ready',()=>{
  row.events.push({kind:'ready',state:snapshot(socket)});process.nextTick(()=>row.events.push({kind:'ready-nextTick',state:snapshot(socket)}));
  if(mode==='pause-ready'){socket.pause();row.events.push({kind:'after-pause',state:snapshot(socket)});}
  if(mode==='throw-ready')throw new Error('ready fixture throw');
 });
 socket.on('error',error=>row.events.push({kind:'error',error:{name:error.name,code:error.code,syscall:error.syscall},state:snapshot(socket)}));
 socket.on('close',hadError=>row.events.push({kind:'close',hadError}));
 socket.on('timeout',()=>row.events.push({kind:'unexpected-timeout'}));socket.setTimeout(100);
 if(mode==='readable-listener')socket.on('readable',()=>row.events.push({kind:'unexpected-readable'}));
 if(mode==='data-listener')socket.on('data',()=>row.events.push({kind:'unexpected-data'}));
 row.events.push({kind:'public-return',state:snapshot(socket)});await turn();
 row.events.push({kind:'before-completion',state:snapshot(socket)});
 try{row.connect.req.oncomplete(0,row.connect.handle,row.connect.req,true,true);row.events.push({kind:'completion-return',state:snapshot(socket)});}
 catch(error){row.events.push({kind:'completion-threw',message:error.message,state:snapshot(socket)});}
 await turn();row.events.push({kind:'before-cleanup',state:snapshot(socket)});
 if(!socket.destroyed)socket.destroy();await turn();
 if(row.close){row.events.push({kind:'inject-close'});Reflect.apply(row.close.cb,row.close.handle,[]);await turn();}
 delete row.connect;delete row.socket;delete row.shutdown;delete row.close;current=undefined;
}
(async()=>{for(const mode of ['fresh','end-pending','pause-connect','pause-ready','read-error','throw-connect','throw-ready','readable-listener','data-listener'])await run(mode);
 const unchanged={};for(const key of Object.keys(original))unchanged[key]=original[key]===net.Socket.prototype[key];
 process.stdout.write(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,guards,unchanged,rows}));
 if(guards.length||rows.some(r=>r.events.some(e=>e.kind.startsWith('unexpected-'))))process.exitCode=1;
})().catch(error=>{process.stderr.write(error.stack);process.exitCode=1;});
`;
 const child=spawnSync(process.env.PROPHET_NODE_BINARY||process.execPath,['-e',source],{
   encoding:'utf8',timeout:10000,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''}});
 expect(child.error).toBeUndefined();expect(child.status).toBe(0);expect(child.stderr).toBe('');
 const result=JSON.parse(child.stdout);expect(result.node).toBe('v24.21.0');expect(result.guards).toEqual([]);
 expect(result.unchanged).toEqual({read:true,_read:true,end:true,isPaused:true,on:true,pause:true});
 expect(result.rows).toHaveLength(9);
 const events=(mode:string)=>result.rows.filter((row:any)=>row.mode===mode)[0].events;
 const kinds=(mode:string)=>events(mode).map((event:any)=>event.kind);
 const state=(mode:string,kind:string)=>events(mode).filter((event:any)=>event.kind===kind)[0].state;
 for(const mode of ['fresh','end-pending']){
   const order=kinds(mode);
   expect(order.indexOf('ready')).toBeLessThan(order.indexOf('binding-readStart'));
   expect(order.indexOf('binding-readStart')).toBeLessThan(order.indexOf('completion-return'));
   expect(order.indexOf('completion-return')).toBeLessThan(order.indexOf('connect-nextTick'));
   expect(order.indexOf('connect-nextTick')).toBeLessThan(order.indexOf('listener-nextTick'));
   expect(order.indexOf('listener-nextTick')).toBeLessThan(order.indexOf('ready-nextTick'));
   expect(state(mode,'before-completion')).toMatchObject({reading:false,needReadable:false,sync:true,handleReading:false,readableFlowing:null,bufferLength:0});
   expect(state(mode,'binding-readStart')).toMatchObject({reading:true,sync:true,needReadable:true,handleReading:true,readableHighWaterMark:65536,bufferLength:0});
   expect(state(mode,'completion-return')).toMatchObject({reading:true,sync:false,needReadable:true,handleReading:true,ended:false,endEmitted:false,bufferLength:0,timerActive:true});
 }
 expect(state('end-pending','completion-return')).toMatchObject({writableEnded:true,writableFinished:false,readable:true});
 expect(kinds('end-pending').indexOf('binding-shutdown')).toBeLessThan(kinds('end-pending').indexOf('binding-readStart'));
 for(const mode of ['pause-connect','pause-ready','throw-connect','throw-ready'])expect(kinds(mode)).not.toContain('binding-readStart');
 for(const mode of ['pause-connect','pause-ready'])expect(state(mode,'completion-return')).toMatchObject({paused:true,readableFlowing:false,reading:false});
 for(const mode of ['readable-listener','data-listener']){
   expect(state(mode,'before-completion').reading).toBe(true);
   expect(kinds(mode).indexOf('binding-readStart')).toBeLessThan(kinds(mode).indexOf('ready'));
 }
 // EIO is an injected excluded-domain reaction; fresh POSIX state entails0.
 expect(state('read-error','completion-return')).toMatchObject({destroyed:true,timerActive:false});
 expect(events('read-error').filter((event:any)=>event.kind==='error')[0].error).toMatchObject({code:'EIO',syscall:'read'});
 expect(kinds('read-error').indexOf('ready-nextTick')).toBeLessThan(kinds('read-error').indexOf('error'));
 for(const row of result.rows)expect(row.events.some((event:any)=>event.kind.indexOf('unexpected-')===0)).toBe(false);
 // Throws are caught by the fixture; no claim about jobs after uncaught throws.
 // Close is manually delivered only for cleanup, not native lifecycle evidence.
});
