import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "fs";
import { removeSync } from "fs-extra";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { effectPaths, isExecutionBoundary, isForkedCompletion } from "../src";
import { getArrayElements, getProperties } from "../src/execution-context/Heap";
import { resolveBoolean } from "../src/symbolic";

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
function paths(roots: any) {
  const result: Array<{ completion: any; context: any; events: any[] }> = [];
  for (const [completion, context] of leaves([roots.completion, roots.current]))
    for (const path of effectPaths(context.value.effects, context.value.knowledge))
      result.push({ completion, context, events: path.events as any[] });
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
function phase(socket: any, context: any): any {
  expect(socket.hostSlots["node.net.socket"]).toBeDefined();
  return getProperties(socket.hostSlots["node.net.socket"], context) as any;
}

test("real CLI selects completion separately from submission and retains its waiting alternative", () => {
  const { roots } = cli(`var socket=require('net').connect({host:'127.0.0.1',port:43210},function(){
      if(this!==socket||socket.connecting)throw 'callback state';console.log('connected');
    });socket.on('ready',function(){console.log('ready');});console.log('returned');`,2,1);
  const all=paths(roots);
  expect(all.some(path=>calls(path.events,'net.socket.completion').length===1)).toBe(true);
  expect(all.some(path=>!isExecutionBoundary(path.completion)&&messages(path.events).join(',')==='returned')).toBe(true);
  expect(all).toHaveLength(6);
  const categories:string[]=[];
  for(const {completion,context,events} of all){
    const socket=socketOf(events),state=phase(socket,context);
    const delivered=calls(events,'net.socket.completion');
    if(!delivered.length){
      expect(state.completion).toMatchObject({type:'undefined'});
      expect(messages(events)).toEqual(['returned']);
      continue;
    }
    expect(delivered).toHaveLength(1);
    expect(delivered[0].call.receiver).toBe(socket);
    expect(delivered[0].call.origin.activation).toBeUndefined();
    const outcome=getProperties(state.completion,context) as any;
    const outcomeReturn=events.filter(event=>event.kind==='return'&&event.call.operation==='net.socket.completion');
    expect(outcomeReturn).toHaveLength(1);
    expect(outcomeReturn[0].value).toBe(state.completion);
    expect(outcomeReturn[0].call).toBe(delivered[0].call);
    expect(state.completionPending).toMatchObject({value:false});
    expect(getProperties(socket,context).connecting).toMatchObject({value:false});
    expect(isExecutionBoundary(completion)).toBe(true);
    const active=getProperties(context.value.global.hostSlots.externalEvents,context).active;
    expect(getProperties(active as any,context).receiver).toBe(socket);
    const success=resolveBoolean(outcome.success,context.value.knowledge);
    if(!success){categories.push('failure');expect(state.phase.value).toBe('connection-failed');}
    else {
      expect(state.phase.value).toBe('connected');
      if(!resolveBoolean(outcome.readable,context.value.knowledge))categories.push('partial-readable');
      else if(!resolveBoolean(outcome.writable,context.value.knowledge))categories.push('partial-writable');
      else categories.push('full');
    }
    if(categories[categories.length-1]==='full'){
      expect(messages(events)).toEqual(['returned','connected','ready']);
      const once=getProperties(socket.hostSlots['node.events'],context)['event:connect'];
      expect(getArrayElements(once as any,context)).toHaveLength(0);
      for(const logged of calls(events,'console.log').slice(1)){
        expect(logged.call.origin.activation.parent).toBeUndefined();
        expect(logged.call.origin.sourceFile).toBe(join(directory,'entry.cjs'));
        expect(roots.program.sources.get(logged.call.origin.sourceFile)).toEqual({
          byteLength:readFileSync(join(directory,'entry.cjs')).length,
          sha256:createHash('sha256').update(readFileSync(join(directory,'entry.cjs'))).digest('hex')
        });
      }
    } else expect(messages(events)).toEqual(['returned']);
    expect(events.filter(event=>event.kind==='return'&&event.call.operation==='net.socket.complete')).toHaveLength(0);
    expect(calls(events,'net.socket.readStart')).toHaveLength(0);
  }
  expect(categories.sort()).toEqual(['failure','full','partial-readable','partial-writable']);
});

for(const stage of ['connect','ready'])test(`actual ${stage} guest throw prevents later completion stages and clears active delivery`,()=>{
  const {roots}=cli(`var socket=require('net').connect(43210,'127.0.0.1',function(){
      console.log('connect');${stage==='connect'?"throw 'connect failure';":''}
    });socket.on('ready',function(){console.log('ready');${stage==='ready'?"throw 'ready failure';":''}});`,2,1);
  const thrown=paths(roots).filter(path=>path.completion.type==='ThrownValue');
  expect(thrown).toHaveLength(1);
  const {completion,context,events}=thrown[0];
  expect(completion.value).toMatchObject({value:stage+' failure'});
  expect(messages(events)).toEqual(stage==='connect'?['connect']:['connect','ready']);
  expect(phase(socketOf(events),context).completionPending).toMatchObject({value:false});
  expect(getProperties(context.value.global.hostSlots.externalEvents,context).active).toMatchObject({type:'undefined'});
  expect(calls(events,'net.socket.readStart')).toHaveLength(0);
});

test("full-duplex completion refreshes the existing delay after invalid public timeout without inventing a clock",()=>{
  const {roots}=cli(`var socket=require('net').connect(43210,'127.0.0.1');
    socket.setTimeout(100);try{socket.setTimeout(-1);}catch(error){console.log(error.code);}
    socket.on('connect',function(){console.log('connect');});`,2,1);
  const all=paths(roots);
  expect(all.filter(path=>messages(path.events).includes('connect'))).toHaveLength(1);
  const waiting=all.filter(path=>!isExecutionBoundary(path.completion));expect(waiting).toHaveLength(1);
  const oldSocket=socketOf(waiting[0].events);
  const oldArm=getProperties(oldSocket.hostSlots['node.net.timeout'],waiting[0].context).arm;
  for(const {events,context} of all){
    const socket=socketOf(events),arm=getProperties(socket.hostSlots['node.net.timeout'],context).arm;
    expect(getProperties(socket,context).timeout).toMatchObject({value:-1});
    if(messages(events).includes('connect')){
      expect(arm).not.toBe(oldArm);
      expect(getProperties(oldArm as any,context).active).toMatchObject({value:false});
    }else expect(arm).toBe(oldArm);
    expect(getProperties(arm as any,context)).toMatchObject({active:{value:true},delay:{value:100},refed:{value:false}});
    expect(Object.keys(getProperties(arm as any,context)).sort()).toEqual(['active','delay','refed']);
  }
});

test("two sockets can each win the shared delivery choice without repeated completion",()=>{
  const {roots}=cli(`var net=require('net');
    net.connect(43210,'127.0.0.1',function(){console.log('first');});
    net.connect(43211,'127.0.0.1',function(){console.log('second');});`,2,2);
  const all=paths(roots);
  expect(all.some(path=>messages(path.events).includes('first'))).toBe(true);
  expect(all.some(path=>messages(path.events).includes('second'))).toBe(true);
  expect(all.some(path=>!isExecutionBoundary(path.completion))).toBe(true);
  for(const {events} of all){
    // Every delivered TCP branch terminates at a declared frontier or throw.
    expect(calls(events,'net.socket.completion').length).toBeLessThanOrEqual(1);
    expect(messages(events).length).toBeLessThanOrEqual(1);
  }
});

test("HTTP arrivals and TCP completion compete in the same bounded history without provider priority",()=>{
  const source=`require('http').createServer(function(request,response){console.log('http');}).listen(0);
    require('net').connect(43210,'127.0.0.1',function(){console.log('tcp');});`;
  const one=paths(cli(source,2,1).roots);
  const two=paths(cli(source,2,2).roots);
  expect(one.some(path=>messages(path.events).join(',')==='http')).toBe(true);
  expect(one.some(path=>messages(path.events).join(',')==='tcp')).toBe(true);
  expect(one.some(path=>!isExecutionBoundary(path.completion)&&messages(path.events).length===0)).toBe(true);
  for(const {events} of one)expect(calls(events,'http.server.request').length+calls(events,'net.socket.completion').length).toBeLessThanOrEqual(1);
  expect(two.some(path=>messages(path.events).join(',')==='http,tcp')).toBe(true);
  expect(two.some(path=>messages(path.events).join(',')==='http,http')).toBe(true);
  for(const {events} of two){
    expect(calls(events,'http.server.request').length+calls(events,'net.socket.completion').length).toBeLessThanOrEqual(2);
    expect(messages(events).join(',')).not.toBe('tcp,http');
  }
});

test("pinned native completion oracle preserves real read machinery and timer/callback/nextTick order without network",()=>{
  // Only original JS completion code executes. Native connect/readStart are
  // intercepted, and Socket._read stays intact; no package code runs natively.
  const source=String.raw`'use strict';
const net=require('node:net'),dns=require('node:dns');
const TCP=process.binding('tcp_wrap').TCP, uv=process.binding('uv');
const rows=[],guardHits=[],pending=new Map();let current;
const originalRead=net.Socket.prototype._read;
function forbidden(name){guardHits.push(name);throw new Error('prohibited native operation '+name);}
TCP.prototype.connect=function(req,address,port){
  if(!current)throw new Error('Unowned connect fixture');
  current.events.push({kind:'binding-connect-intercepted',address,port});
  pending.set(current,{req,handle:this});
  return current.mode==='immediate-failure'?uv.UV_ECONNREFUSED:0;
};
TCP.prototype.connect6=function(){forbidden('TCP6.connect');};
process.binding('pipe_wrap').Pipe.prototype.connect=function(){forbidden('IPC.connect');};
dns.lookup=function(){forbidden('DNS.lookup');};
// Do not override Socket._read. Observe its real route into the binding method,
// but never invoke native readStart on the deliberately unconnected handle.
TCP.prototype.readStart=function(){
  if(!current)throw new Error('Unowned read fixture');
  current.events.push({kind:'binding-readStart-intercepted',reading:this.reading});
  return current.mode==='read-failure'?uv.UV_EIO:0;
};
TCP.prototype.readStop=function(){if(current)current.events.push({kind:'binding-readStop-intercepted'});return 0;};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function errorData(error){return {name:error.name,code:error.code,message:error.message,errno:error.errno,syscall:error.syscall,address:error.address,port:error.port};}
async function run(mode){
 const row={mode,events:[]};rows.push(row);current=row;
 let socket,failedError;
 try{
  socket=net.connect({host:'127.0.0.1',port:43210},function(){
   row.events.push({kind:'callback',sameReceiver:this===socket,connecting:this.connecting,callbackStillRegistered:this.listeners('connect').includes(callbackMarker)});
   process.nextTick(()=>row.events.push({kind:'callback-nextTick'}));
   if(mode==='throw-connect')throw new Error('fixture connect throw');
   if(mode==='boundary-connect')throw {fixtureBoundary:true};
  });
  // The callback above is registered by Node once before subsequent listeners.
  const callbackMarker=socket.listeners('connect')[0];
  socket.on('connect',function(){row.events.push({kind:'connect-listener',sameReceiver:this===socket,connecting:this.connecting});process.nextTick(()=>row.events.push({kind:'listener-nextTick'}));});
  socket.on('ready',function(){row.events.push({kind:'ready',sameReceiver:this===socket,connecting:this.connecting});process.nextTick(()=>row.events.push({kind:'ready-nextTick'}));if(mode==='throw-ready')throw new Error('fixture ready throw');});
  socket.on('connectionAttemptFailed',function(address,port,family,error){failedError=error;row.events.push({kind:'connectionAttemptFailed',address,port,family,connecting:this.connecting,destroyed:this.destroyed,error:errorData(error)});});
  socket.on('error',function(error){row.events.push({kind:'error',connecting:this.connecting,destroyed:this.destroyed,sameFailureError:error===failedError,error:errorData(error)});process.nextTick(()=>row.events.push({kind:'error-nextTick'}));});
  socket.on('close',hadError=>row.events.push({kind:'close',hadError}));
  socket.on('timeout',()=>row.events.push({kind:'unexpected-timeout'}));
  socket.setTimeout(100);
  const key=Object.getOwnPropertySymbols(socket).find(key=>String(key)==='Symbol(timeout)');
  const timer=socket[key],refresh=timer.refresh;
  timer.refresh=function(){row.events.push({kind:'timer-refresh',publicTimeout:socket.timeout,activeDelay:this._idleTimeout,activeBefore:!this._destroyed,connecting:socket.connecting});return Reflect.apply(refresh,this,[]);};
  if(mode==='invalid-public-timeout'){try{socket.setTimeout(-1);}catch(error){row.events.push({kind:'caught-timeout-error',error:errorData(error)});}}
  if(mode==='disabled-timeout')socket.setTimeout(0);
  row.events.push({kind:'public-return',connecting:socket.connecting});
  await turn();
  const saved=pending.get(row);
  if(!saved)throw new Error('Missing intercepted connect');
  if(mode!=='immediate-failure'){
   if(mode==='stale-after-destroy'){socket.destroy();row.events.push({kind:'destroy-before-completion'});}
   row.events.push({kind:'inject-completion',status:mode==='async-failure'?uv.UV_ECONNREFUSED:0,readable:true,writable:true});
   try{saved.req.oncomplete(mode==='async-failure'?uv.UV_ECONNREFUSED:0,saved.handle,saved.req,true,true);}
   catch(error){row.events.push({kind:'injection-threw',fixtureBoundary:error.fixtureBoundary===true,error:errorData(error)});}
   row.events.push({kind:'after-injection',connecting:socket.connecting,destroyed:socket.destroyed,publicTimeout:socket.timeout,activeDelay:timer._idleTimeout,timerActive:!timer._destroyed});
   await turn();
  }
  row.events.push({kind:'before-cleanup'});
 } finally {
  if(socket&&!socket.destroyed)socket.destroy();await turn();current=undefined;
 }
}
(async()=>{
 for(const mode of ['success','invalid-public-timeout','disabled-timeout','throw-connect','boundary-connect','throw-ready','read-failure','async-failure','immediate-failure','stale-after-destroy'])await run(mode);
 process.stdout.write(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,socketReadUnmodified:net.Socket.prototype._read===originalRead,guardHits,rows},null,2)+'\n');
 if(guardHits.length||rows.some(row=>row.events.some(event=>event.kind==='unexpected-timeout')))process.exitCode=1;
})();
`;
  const child=spawnSync(process.env.PROPHET_NODE_BINARY||process.execPath,['-e',source],{
    encoding:'utf8',timeout:10000,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''}
  });
  expect(child.error).toBeUndefined();expect(child.status).toBe(0);expect(child.stderr).toBe('');
  const result=JSON.parse(child.stdout);
  expect(result.node).toBe('v24.21.0');expect(result.guardHits).toEqual([]);expect(result.socketReadUnmodified).toBe(true);
  const row=(mode:string)=>result.rows.filter((entry:any)=>entry.mode===mode)[0].events;
  const kinds=(mode:string)=>row(mode).map((event:any)=>event.kind);
  expect(kinds('success')).toEqual(['public-return','binding-connect-intercepted','inject-completion',
    'timer-refresh','callback','connect-listener','ready','binding-readStart-intercepted','after-injection',
    'callback-nextTick','listener-nextTick','ready-nextTick','before-cleanup','close']);
  expect(row('success').filter((event:any)=>event.kind==='callback')[0]).toMatchObject({
    sameReceiver:true,connecting:false,callbackStillRegistered:false
  });
  for(const kind of ['timer-refresh','callback','connect-listener','ready'])
    expect(row('success').filter((event:any)=>event.kind===kind)[0].connecting).toBe(false);
  expect(row('success').filter((event:any)=>event.kind==='binding-readStart-intercepted')[0].reading).toBe(true);
  expect(row('invalid-public-timeout').filter((event:any)=>event.kind==='timer-refresh')[0])
    .toMatchObject({publicTimeout:-1,activeDelay:100,activeBefore:true,connecting:false});
  expect(row('disabled-timeout').filter((event:any)=>event.kind==='after-injection')[0].timerActive).toBe(false);
  for(const mode of ['throw-connect','boundary-connect']){
    expect(kinds(mode)).not.toContain('connect-listener');expect(kinds(mode)).not.toContain('ready');
    expect(kinds(mode)).not.toContain('binding-readStart-intercepted');
    expect(kinds(mode)).toContain('injection-threw');
  }
  // Sentinel propagation is ordinary native JS throw evidence, not a claim that
  // Node understands Prophet typed stops or drains jobs after uncaught throws.
  expect(kinds('throw-ready')).toContain('ready');expect(kinds('throw-ready')).not.toContain('binding-readStart-intercepted');
  expect(row('read-failure').filter((event:any)=>event.kind==='after-injection')[0].destroyed).toBe(true);
  expect(row('read-failure').filter((event:any)=>event.kind==='error')[0].error).toMatchObject({code:'EIO',syscall:'read'});
  expect(row('async-failure').filter((event:any)=>event.kind==='connectionAttemptFailed')[0])
    .toMatchObject({connecting:false,destroyed:false});
  expect(row('async-failure').filter((event:any)=>event.kind==='error')[0].sameFailureError).toBe(true);
  expect(kinds('immediate-failure')).not.toContain('connectionAttemptFailed');
  for(const mode of ['read-failure','async-failure','immediate-failure'])
    expect(kinds(mode).indexOf('error-nextTick')).toBeLessThan(kinds(mode).indexOf('close'));
  for(const kind of ['timer-refresh','callback','ready','binding-readStart-intercepted'])
    expect(kinds('stale-after-destroy')).not.toContain(kind);
  for(const entry of result.rows)expect(entry.events.some((event:any)=>event.kind==='unexpected-timeout')).toBe(false);
});
