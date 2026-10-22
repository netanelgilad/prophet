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

test("actual CLI returns socket.end before caller continuation with pending shutdown and no finish",()=>{
  const {roots}=cli(`var socket=require('net').connect(43210,'127.0.0.1',function(){
    if(!socket.writable||socket.writableEnded||socket.writableFinished)throw 'before flags';console.log('before');
    if(socket.end()!==socket)throw 'end return';
    if(socket.writable||!socket.writableEnded||socket.writableFinished)throw 'after flags';console.log('ended');
  });socket.setTimeout(100);socket.on('ready',function(){console.log('ready');});`,2,1);
  const all=paths(roots),ended=all.filter(path=>messages(path.events).includes('ended'));
  expect(ended).toHaveLength(1);expect(all).toHaveLength(6);
  const {events,context,completion}=ended[0],socket=socketOf(events);
  expect(messages(events)).toEqual(['before','ended','ready']);
  expect(isExecutionBoundary(completion)).toBe(false);
  const end=calls(events,'net.socket.end'),shutdown=calls(events,'net.socket.shutdown');
  expect(end).toHaveLength(1);expect(shutdown).toHaveLength(1);
  expect(shutdown[0].call.receiver).toBe(socket);expect(end[0].call.receiver).toBe(socket);
  expect(shutdown[0].call.args).toEqual([]);expect(end[0].call.args).toEqual([]);
  expect(shutdown[0].call.origin.activation).toBe(end[0].call.origin.activation);
  const before={value:{...context.value,heap:end[0].heap}},submitting={value:{...context.value,heap:shutdown[0].heap}};
  expect(getProperties(socket.hostSlots['node.stream.writable'],submitting)).toMatchObject({
    ending:{value:true},ended:{value:false},finalCalled:{value:true},finalPending:{value:true}});
  expect(getProperties(socket,submitting)).toMatchObject({writable:{value:false},writableEnded:{value:true},writableFinished:{value:false}});
  expect(getProperties(socket.hostSlots['node.net.shutdown'],submitting)).toMatchObject({pending:{value:false}});
  expect(getProperties(socket.hostSlots['node.net.timeout'],before).arm).toBe(getProperties(socket.hostSlots['node.net.timeout'],context).arm);
  const endReturn=events.filter(event=>event.kind==='return'&&event.call===end[0].call)[0];
  const shutdownReturn=events.filter(event=>event.kind==='return'&&event.call===shutdown[0].call)[0];
  expect(endReturn.value).toBe(socket);expect(shutdownReturn.value).toMatchObject({value:0});
  expect(events.indexOf(end[0])).toBeLessThan(events.indexOf(shutdown[0]));
  expect(events.indexOf(shutdownReturn)).toBeLessThan(events.indexOf(endReturn));
  expect(events.indexOf(endReturn)).toBeLessThan(events.indexOf(calls(events,'console.log')[1]));
  expect(getProperties(socket.hostSlots['node.net.shutdown'],context)).toMatchObject({pending:{value:true}});
  expect(getProperties(socket.hostSlots['node.stream.writable'],context)).toMatchObject({
    constructed:{value:true},ending:{value:true},ended:{value:true},finalCalled:{value:true},
    finalPending:{value:true},prefinished:{value:false},finished:{value:false}});
  const timer=getProperties(socket.hostSlots['node.net.timeout'],context).arm;
  expect(getProperties(timer as any,context)).toMatchObject({active:{value:true},delay:{value:100},refed:{value:false}});
  expect(calls(events,'net.socket.readStart')).toHaveLength(1);
  expect(context.value.activation).toBeUndefined();
  for(const path of all.filter(path=>path!==ended[0])){
    expect(calls(path.events,'net.socket.end')).toHaveLength(0);
    expect(getProperties(socket.hostSlots['node.net.shutdown'],path.context)).toMatchObject({pending:{value:false}});
    expect(getProperties(socket.hostSlots['node.stream.writable'],path.context)).toMatchObject({ending:{value:false},ended:{value:false}});
  }
});

test("separate sockets retain independent end state under either eligible completion",()=>{
  const {roots}=cli(`var net=require('net');
    var a=net.connect(43210,'127.0.0.1',function(){a.end();console.log('first');});
    var b=net.connect(43211,'127.0.0.1',function(){b.end();console.log('second');});`,2,2);
  const all=paths(roots);expect(all.some(path=>messages(path.events).includes('first'))).toBe(true);
  expect(all.some(path=>messages(path.events).includes('second'))).toBe(true);
  for(const {events,context} of all){
    const sockets=events.filter(event=>event.kind==='return'&&event.call.operation==='net.connect').map(event=>event.value);
    expect(sockets).toHaveLength(2);expect(sockets[0]).not.toBe(sockets[1]);
    expect(sockets[0].hostSlots['node.net.shutdown']).not.toBe(sockets[1].hostSlots['node.net.shutdown']);
    expect(sockets[0].hostSlots['node.stream.writable']).not.toBe(sockets[1].hostSlots['node.stream.writable']);
    const end=calls(events,'net.socket.end');expect(end.length).toBeLessThanOrEqual(2);
    for(const socket of sockets){
      const ended=end.some(event=>event.call.receiver===socket);
      expect(getProperties(socket.hostSlots['node.net.shutdown'],context)).toMatchObject({pending:{value:ended}});
      expect(getProperties(socket.hostSlots['node.stream.writable'],context)).toMatchObject({ended:{value:ended},finished:{value:false}});
    }
  }
});

test("pinned native no-data end preserves pending finalization and distinct injected shutdown reactions without I/O",()=>{
  // Complete controlled API fixture. Injected statuses are JS reaction checks,
  // not claims that those statuses are reachable for a fresh POSIX TCP handle.
  const source=String.raw` 'use strict';
const net=require('node:net'), dns=require('node:dns');
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
 for(const event of ['prefinish','finish','connect','ready'])socket.on(event,function(){row.events.push({kind:event,state:snapshot(socket)});process.nextTick(()=>row.events.push({kind:event+'-nextTick',state:snapshot(socket)}));});
 socket.on('error',error=>row.events.push({kind:'error',error:errorData(error),state:snapshot(socket)}));
 socket.on('close',hadError=>row.events.push({kind:'close',hadError,state:snapshot(socket)}));
 socket.on('timeout',()=>row.events.push({kind:'unexpected-timeout'}));socket.setTimeout(100);
 row.events.push({kind:'public-connect-return',state:snapshot(socket)});await turn();
 row.events.push({kind:'inject-connect-success'});
 row.connect.req.oncomplete(0,row.connect.handle,row.connect.req,true,true);
 row.events.push({kind:'after-connect-injection',state:snapshot(socket)});await turn();
 if(mode==='pending-success'||mode==='pending-error'||mode==='repeated-end'){
  const status=mode==='pending-error'?uv.UV_EIO:0;
  row.events.push({kind:'inject-shutdown-completion',status});
  row.shutdown.req.oncomplete(status,row.shutdown.handle,undefined);
  row.events.push({kind:'after-shutdown-injection',state:snapshot(socket)});await turn();
 }
 row.events.push({kind:'before-cleanup',state:snapshot(socket)});
 if(!socket.destroyed)socket.destroy();await turn();
 if(row.close){row.events.push({kind:'inject-close-completion'});Reflect.apply(row.close.callback,row.close.handle,[]);await turn();}
 delete row.socket;delete row.connect;delete row.shutdown;delete row.close;current=undefined;
}
(async()=>{
 for(const mode of ['pending-success','pending-error','pending-only','immediate-one','immediate-enotconn','immediate-eio','throw-shutdown','repeated-end'])await run(mode);
 const result={node:process.version,platform:process.platform,arch:process.arch,guards,unmodified:{end:unchanged.end===net.Socket.prototype.end,final:unchanged.final===net.Socket.prototype._final,read:unchanged.read===net.Socket.prototype._read,destroy:unchanged.destroy===net.Socket.prototype._destroy},rows};
 process.stdout.write(JSON.stringify(result));
 if(guards.length||rows.some(row=>row.events.some(e=>e.kind==='unexpected-timeout')))process.exitCode=1;
})().catch(e=>{process.stderr.write(e.stack);process.exitCode=1;});
`;
  const child=spawnSync(process.env.PROPHET_NODE_BINARY||process.execPath,['-e',source],{
    encoding:'utf8',timeout:10000,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''}
  });
  expect(child.error).toBeUndefined();expect(child.status).toBe(0);expect(child.stderr).toBe('');
  const result=JSON.parse(child.stdout);
  expect(result.node).toBe('v24.21.0');expect(result.guards).toEqual([]);
  expect(result.unmodified).toEqual({end:true,final:true,read:true,destroy:true});
  expect(result.rows).toHaveLength(8);
  const row=(mode:string)=>result.rows.filter((entry:any)=>entry.mode===mode)[0].events;
  const kinds=(mode:string)=>row(mode).map((event:any)=>event.kind);
  const event=(mode:string,kind:string)=>row(mode).filter((entry:any)=>entry.kind===kind)[0];
  for(const item of result.rows){
    expect(item.events.filter((entry:any)=>entry.kind==='shutdown-intercepted')).toHaveLength(1);
    expect(item.events.some((entry:any)=>entry.kind==='unexpected-timeout')).toBe(false);
    expect(event(item.mode,'shutdown-intercepted').state).toMatchObject({
      connecting:false,writable:false,writableEnded:true,writableFinished:false,ending:true,ended:false,
      finalCalled:true,pendingcb:1,readable:true,destroyed:false,timerActive:true});
    expect(event(item.mode,'end-return')).toMatchObject({sameSocket:true,state:{
      writable:false,writableEnded:true,writableFinished:false,ending:true,ended:true}});
    expect(kinds(item.mode).indexOf('end-return')).toBeLessThan(kinds(item.mode).indexOf('caller-availability-true-marker'));
  }
  expect(kinds('pending-only')).toEqual(['public-connect-return','connect-intercepted','inject-connect-success',
    'connect-callback','shutdown-intercepted','end-return','caller-availability-true-marker','connect','ready',
    'readStart-intercepted','after-connect-injection','before-end-nextTick','after-end-nextTick','connect-nextTick',
    'ready-nextTick','before-cleanup','close-intercepted','inject-close-completion','close']);
  for(const mode of ['pending-success','pending-error']){
    const order=kinds(mode);
    expect(order.indexOf('inject-shutdown-completion')).toBeLessThan(order.indexOf('prefinish'));
    expect(order.indexOf('prefinish')).toBeLessThan(order.indexOf('after-shutdown-injection'));
    expect(order.indexOf('after-shutdown-injection')).toBeLessThan(order.indexOf('prefinish-nextTick'));
    expect(order.indexOf('prefinish-nextTick')).toBeLessThan(order.indexOf('finish'));
    expect(order).not.toContain('error');
    expect(event(mode,'before-cleanup').state).toMatchObject({writableFinished:true,readable:true,destroyed:false,timerActive:true});
  }
  for(const mode of ['immediate-one','immediate-enotconn']){
    const order=kinds(mode);
    expect(order.indexOf('prefinish')).toBeLessThan(order.indexOf('end-return'));
    expect(event(mode,'prefinish').state.ended).toBe(false);
    expect(order.indexOf('before-end-nextTick')).toBeLessThan(order.indexOf('prefinish-nextTick'));
    expect(order.indexOf('finish')).toBeLessThan(order.indexOf('after-end-nextTick'));
    expect(order).not.toContain('error');
  }
  for(const mode of ['immediate-eio','throw-shutdown']){
    expect(event(mode,'end-return').state).toMatchObject({destroyed:true,closed:true,readable:false,timerActive:false});
    expect(kinds(mode).indexOf('caller-availability-true-marker')).toBeLessThan(kinds(mode).indexOf('error'));
    expect(kinds(mode)).not.toContain('readStart-intercepted');
    expect(kinds(mode)).not.toContain('finish');
  }
  expect(event('immediate-eio','error').error).toMatchObject({name:'Error',code:'EIO',errno:-5,syscall:'shutdown',message:'shutdown EIO'});
  expect(event('repeated-end','second-end-return')).toMatchObject({sameSocket:true,state:{writableEnded:true,writableFinished:false}});
  // All close callbacks are manually injected after cleanup. This establishes
  // neither native close scheduling nor successful shutdown(2)/delivered FIN.
});
