import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "fs";
import { copySync, removeSync } from "fs-extra";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { effectPaths, isExecutionBoundary, isForkedCompletion } from "../src";
import { getArrayElements, getProperties } from "../src/execution-context/Heap";
import { resolveBoolean } from "../src/symbolic";

const packageDirectory = resolve("node_modules/node-notifier");
const sourceHash = "6d8fdba983f2589ac744b68437918c63e679a962c4e06007b4f81cb089fdb103";
const manifestHash = "6e14169f6c3301bcb7746ed4816760dccbdf8362616f06b68c3e0f740dd9c5c9";
const cachePath = resolve(".yarn/cache/node-notifier-npm-5.4.0-11e1acc831-72e66e03fd.zip");
const cacheHash = "72e66e03fd0544c23302ba3d53c1a502809aee15b8c9406c79d5294e9bcfe04b43dc39c7b208c1f72912e6ddf93d6f9e0e830b135f424604b3d9e5822090d831";
const hash = (contents: Buffer, algorithm = "sha256") => createHash(algorithm).update(contents).digest("hex");
let directory: string;
beforeEach(() => { directory = realpathSync(mkdtempSync(join(tmpdir(), "prophet-notifier-startup-"))); });
afterEach(() => { removeSync(directory); });
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
function cli(source: string, expectedStatus = 2, maxEvents = 0) {
  const target = join(directory, "node_modules/node-notifier");
  mkdirSync(join(directory, "node_modules"), { recursive:true });
  // Keep the complete existing package available; never rewrite/extract a helper.
  copySync(packageDirectory, target);
  expect(hash(readFileSync(join(target, "lib/checkGrowl.js")))).toBe(sourceHash);
  expect(hash(readFileSync(join(target, "package.json")))).toBe(manifestHash);
  writeFileSync(join(directory, "entry.cjs"), source);
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    [resolve("bin/prophet.js"), "--max-events", String(maxEvents), "--", "entry.cjs"], {
      cwd:directory,encoding:"utf8",timeout:30000,maxBuffer:32*1024*1024,
      env:{...process.env,NODE_OPTIONS:"",NODE_PATH:""}
    });
  expect(child.error).toBeUndefined(); expect(child.status).toBe(expectedStatus);
  if (expectedStatus === 0) expect(child.stderr).toBe("");
  const graph = JSON.parse(child.stdout);
  expect(Object.keys(graph).sort()).toEqual(["nodes","roots"]);
  return { roots:decodeGraph(graph), child, target };
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

test("unchanged node-notifier helper returns before deferred submission and retains its 100ms timer", () => {
  expect(JSON.parse(readFileSync(join(packageDirectory,"package.json"),"utf8")).version).toBe("5.4.0");
  expect(hash(readFileSync(cachePath),"sha512")).toBe(cacheHash);
  expect(readFileSync(resolve("yarn.lock"),"utf8")).toContain("checksum: " + cacheHash);
  const { roots, child, target } = cli(`var check = require('node-notifier/lib/checkGrowl');
    var result = check({host:'127.0.0.1',port:23053}, function(error, available) { throw 'availability callback ran'; });
    if (result !== undefined) throw 'helper returned a value';
    console.log('helper returned');`, 2, 0);
  // A stopped default submission remains beside its admitted pending sibling.
  expect(child.stderr).not.toMatch(/connect requires|options require|callback requires/);
  const all = paths(roots); expect(all).toHaveLength(2);
  expect(all.filter(path => isExecutionBoundary(path.completion))).toHaveLength(1);
  const filename = join(target, 'lib/checkGrowl.js');
  expect(roots.program.sources.get(filename)).toEqual({sha256:sourceHash,byteLength:536});
  expect(roots.program.sources.get(join(target,'package.json'))).toEqual({sha256:manifestHash,byteLength:1954});
  const arms: any[] = [];
  for (const { events, context, completion } of all) {
    expect(messages(events)).toEqual(['helper returned']);
    const socket = socketOf(events);
    const connect = calls(events, 'net.connect')[0].call;
    expect(connect.args.map((value: any) => value.value)).toEqual([23053,'127.0.0.1']);
    expect(connect.origin.sourceFile).toBe(filename);
    expect(connect.origin.activation.sourceFile).toBe(filename);
    expect(connect.origin.activation.parent.sourceFile).toBe(join(directory,'entry.cjs'));
    const setter = calls(events, 'net.socket.setTimeout'); expect(setter).toHaveLength(1);
    expect(setter[0].call.receiver).toBe(socket);
    expect(setter[0].call.args).toMatchObject([{value:100}]);
    expect(setter[0].call.origin.activation).toBe(connect.origin.activation);
    const setterReturns = events.filter(event => event.kind === 'return' && event.call.operation === 'net.socket.setTimeout');
    expect(setterReturns).toHaveLength(1); expect(setterReturns[0].value).toBe(socket);
    const properties = getProperties(socket, context);
    expect(properties.timeout).toMatchObject({value:100});
    expect(properties.connecting).toMatchObject({value:true});
    expect(properties.destroyed).toMatchObject({value:false});
    const timer = getProperties(socket.hostSlots['node.net.timeout'], context);
    const arm = timer.arm; arms.push(arm);
    expect(getProperties(arm as any, context)).toMatchObject({
      active:{value:true},delay:{value:100},refed:{value:false}
    });
    const registrations = calls(events, 'events.on');
    expect(registrations.map(event => event.call.args[0].value)).toEqual(['connect','error']);
    for (const name of ['connect','error']) {
      const emitter = getProperties(socket.hostSlots['node.events'], context);
      const listeners = getArrayElements(emitter['event:'+name] as any, context)!;
      expect(listeners).toHaveLength(1);
      const listener = getProperties(listeners[0] as any, context);
      expect(listener.listener).toBe(registrations.filter(event => event.call.args[0].value === name)[0].call.args[1]);
      expect(listener.fired).toMatchObject({value:false});
      expect(listener.once).toMatchObject({value:false});
    }
    const submit = calls(events,'net.socket.submit'); expect(submit).toHaveLength(1);
    expect(submit[0].call.receiver).toBe(socket);
    expect(submit[0].call.origin.activation).toBeUndefined();
    const stopped = isExecutionBoundary(completion), state = phase(socket, context);
    expect(state.phase.value).toBe(stopped ? 'submission-failed' : 'submitted');
    expect(resolveBoolean(state.submissionAccepted,context.value.knowledge)).toBe(!stopped);
    expect(calls(events,'net.socket.end')).toHaveLength(0);
    const callOrder = events.filter(event => event.kind === 'call').map(event => event.call.operation);
    expect(callOrder.indexOf('net.socket.setTimeout')).toBeLessThan(callOrder.indexOf('console.log'));
    expect(callOrder.indexOf('console.log')).toBeLessThan(callOrder.indexOf('net.socket.initiate'));
  }
  expect(arms[0]).toBe(arms[1]);
  expect(roots.initial.value.effects).toBeUndefined();
});

test("unchanged helper's default localhost remains an explicit DNS boundary before timer or callback registration", () => {
  const { roots, target } = cli(`var check = require('node-notifier/lib/checkGrowl');
    console.log('before helper'); check(function(){throw 'callback';}); console.log('after helper');`);
  const all = paths(roots); expect(all).toHaveLength(1);
  const { completion, events } = all[0];
  expect(isExecutionBoundary(completion)).toBe(true);
  expect(messages(events)).toEqual(['before helper']);
  const invoked = calls(events,'net.connect'); expect(invoked).toHaveLength(1);
  expect(invoked[0].call.args.map((value: any) => value.value)).toEqual([23053,'localhost']);
  expect(invoked[0].call.origin.sourceFile).toBe(join(target,'lib/checkGrowl.js'));
  expect(events.filter(event => event.kind === 'return' && event.call.operation === 'net.connect')).toHaveLength(0);
  expect(calls(events,'net.socket.setTimeout')).toHaveLength(0);
  expect(calls(events,'net.socket.submit')).toHaveLength(0);
});

test("two unchanged helper invocations retain separate timers before independent FIFO submission outcomes", () => {
  const { roots } = cli(`var check = require('node-notifier/lib/checkGrowl');
    check({host:'127.0.0.1',port:23053}, function(){throw 'first callback';});
    check({host:'127.0.0.1',port:23054}, function(){throw 'second callback';});
    console.log('both returned');`);
  const all = paths(roots); expect(all).toHaveLength(3);
  expect(all.filter(path => !isExecutionBoundary(path.completion))).toHaveLength(1);
  for (const { events, context } of all) {
    expect(messages(events)).toEqual(['both returned']);
    const sockets = events.filter(event => event.kind === 'return' && event.call.operation === 'net.connect').map(event => event.value);
    expect(sockets).toHaveLength(2); expect(sockets[0]).not.toBe(sockets[1]);
    const arms = sockets.map(socket => getProperties(socket.hostSlots['node.net.timeout'],context).arm);
    expect(arms[0]).not.toBe(arms[1]);
    for (const arm of arms) expect(getProperties(arm as any,context)).toMatchObject({
      active:{value:true},delay:{value:100},refed:{value:false}
    });
    const submits = calls(events,'net.socket.submit');
    expect(submits.length).toBeGreaterThanOrEqual(1); expect(submits.length).toBeLessThanOrEqual(2);
    expect(submits[0].call.receiver).toBe(sockets[0]);
    if (submits.length === 2) {
      expect(submits[1].call.receiver).toBe(sockets[1]);
      expect(phase(sockets[0],context).submissionAccepted).not.toBe(phase(sockets[1],context).submissionAccepted);
    } else expect(phase(sockets[1],context).phase.value).toBe('queued');
  }
});

test("finite caller configuration keeps the real helper's supported and unsupported host histories separate", () => {
  const { roots } = cli(`var check = require('node-notifier/lib/checkGrowl');
    var host = Math.random() < 0.5 ? '127.0.0.1' : 'ordinary.example';
    check({host:host,port:23053}, function(){throw 'callback';}); console.log('returned');`);
  const all = paths(roots); expect(all).toHaveLength(3);
  expect(all.filter(path => messages(path.events).length === 1)).toHaveLength(2);
  for (const { events, completion } of all) {
    const invocation = calls(events,'net.connect')[0].call;
    if (messages(events).length === 1) {
      expect(messages(events)).toEqual(['returned']);
      expect(invocation.args).toHaveLength(2);
      expect(calls(events,'net.socket.setTimeout')).toHaveLength(1);
      expect(calls(events,'net.socket.submit')).toHaveLength(1);
    } else {
      expect(isExecutionBoundary(completion)).toBe(true);
      expect(calls(events,'net.socket.setTimeout')).toHaveLength(0);
      expect(calls(events,'net.socket.submit')).toHaveLength(0);
    }
  }
});

test("pinned native socket timers retain public timeout writes, unrefed arms and cancellation without transport", () => {
  // This oracle invokes only controlled built-in API fixtures, never the package.
  // Private timer inspection describes native state; it is not a guest timer API.
  const source = `
    const net=require('net'),dns=require('dns');
    const TCP=process.binding('tcp_wrap').TCP;
    const prohibited=[],deliveries=[],rows=[];
    function forbidden(name){prohibited.push(name);throw new Error('prohibited '+name);}
    TCP.prototype.connect=function(){forbidden('TCP');};
    TCP.prototype.connect6=function(){forbidden('TCP6');};
    process.binding('pipe_wrap').Pipe.prototype.connect=function(){forbidden('IPC');};
    dns.lookup=function(){forbidden('DNS');};
    const repr=value=>Object.is(value,-0)?'-0':String(value);
    function run(label,delays){
      const socket=net.connect(23053,'127.0.0.1',()=>deliveries.push('connect'));
      socket.on('timeout',()=>deliveries.push('timeout'));
      socket.on('connectionAttempt',()=>deliveries.push('attempt'));
      const key=Object.getOwnPropertySymbols(socket).find(key=>String(key)==='Symbol(timeout)');
      if(!key)throw new Error('Missing native timer symbol');
      const row={label,initialTimeout:repr(socket.timeout),steps:[]};rows.push(row);
      for(const delay of delays){
        const before=socket[key];let same=false,error;
        try{same=socket.setTimeout(delay)===socket;}
        catch(e){error={name:e.name,code:e.code,message:e.message};}
        const timer=socket[key];
        row.steps.push({input:repr(delay),publicTimeout:repr(socket.timeout),same,error,
          preservedTimer:timer===before,
          timer:timer?{delay:timer._idleTimeout,active:!timer._destroyed,refed:timer.hasRef()}:null});
      }
      socket.destroy();
      const timer=socket[key];row.afterDestroy={publicTimeout:repr(socket.timeout),connecting:socket.connecting,
        destroyed:socket.destroyed,timerActive:timer?!timer._destroyed:false};
    }
    run('positive',[100]);run('reset',[100,200]);run('zero',[100,0]);run('negative-zero',[100,-0]);
    run('rearm',[100,0,50]);run('negative',[100,-1]);run('negative-fraction',[100,-0.5]);
    run('nan',[100,NaN]);run('infinity',[100,Infinity]);run('negative-infinity',[100,-Infinity]);
    run('maximum',[2147483647]);
    setImmediate(()=>process.stdout.write(JSON.stringify({version:process.version,rows,prohibited,deliveries})));`;
  const child=spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,['-e',source],{
    encoding:'utf8',timeout:10000,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''}
  });
  expect(child.error).toBeUndefined();expect(child.status).toBe(0);expect(child.stderr).toBe('');
  const result=JSON.parse(child.stdout);
  expect(result.version).toBe('v24.21.0');expect(result.prohibited).toEqual([]);expect(result.deliveries).toEqual([]);
  const row=(label:string)=>result.rows.filter((item:any)=>item.label===label)[0];
  for(const item of result.rows){
    expect(item.initialTimeout).toBe('undefined');
    expect(item.afterDestroy).toMatchObject({connecting:false,destroyed:true,timerActive:false});
  }
  expect(row('positive').steps[0]).toMatchObject({same:true,publicTimeout:'100',timer:{delay:100,active:true,refed:false}});
  expect(row('reset').steps[1]).toMatchObject({same:true,publicTimeout:'200',timer:{delay:200,active:true,refed:false}});
  for(const label of ['zero','negative-zero']){
    expect(row(label).steps[1]).toMatchObject({same:true,publicTimeout:label==='zero'?'0':'-0',timer:{active:false}});
    expect(row(label).afterDestroy.publicTimeout).toBe(label==='zero'?'0':'-0');
  }
  expect(row('rearm').steps[2]).toMatchObject({same:true,publicTimeout:'50',timer:{delay:50,active:true,refed:false}});
  expect(row('maximum').steps[0]).toMatchObject({same:true,publicTimeout:'2147483647',timer:{delay:2147483647,active:true,refed:false}});
  for(const [label,value] of [['negative','-1'],['negative-fraction','-0.5'],['nan','NaN'],['infinity','Infinity'],['negative-infinity','-Infinity']]){
    const step=row(label).steps[1];
    expect(step).toMatchObject({same:false,publicTimeout:value,preservedTimer:true,timer:{delay:100,active:true,refed:false},
      error:{name:'RangeError',code:'ERR_OUT_OF_RANGE',message:'The value of "msecs" is out of range. It must be a non-negative finite number. Received '+value}});
    expect(row(label).afterDestroy.publicTimeout).toBe(value);
  }
});

test("one TCP completion runs unchanged checkGrowl end and its real availability callback before the read frontier",()=>{
  const {roots,target}=cli(`var check=require('node-notifier/lib/checkGrowl');
    check({host:'127.0.0.1',port:23053},function(error,available){
      if(error!==null||available!==true)throw 'callback arguments';console.log('availability callback');
    });console.log('helper returned');`,2,1);
  const all=paths(roots);expect(all).toHaveLength(6);
  const waiting=all.filter(path=>!isExecutionBoundary(path.completion));expect(waiting).toHaveLength(1);
  const socket=socketOf(waiting[0].events);
  const previousArm=getProperties(socket.hostSlots['node.net.timeout'],waiting[0].context).arm;
  const full=all.filter(path=>calls(path.events,'net.socket.end').length===1);
  expect(full).toHaveLength(1);
  const {events,context,completion}=full[0];
  expect(isExecutionBoundary(completion)).toBe(true);expect(completion.message).toMatch(/read/);
  expect(socketOf(events)).toBe(socket);
  expect(messages(events)).toEqual(['helper returned','availability callback']);
  expect(getProperties(socket,context)).toMatchObject({connecting:{value:false},
    writable:{value:false},writableEnded:{value:true},writableFinished:{value:false}});
  expect(phase(socket,context)).toMatchObject({phase:{value:'connected'},completionPending:{value:false}});
  const outcome=getProperties(phase(socket,context).completion,context) as any;
  for(const value of [outcome.success,outcome.readable,outcome.writable])expect(resolveBoolean(value,context.value.knowledge)).toBe(true);
  const filename=join(target,'lib/checkGrowl.js');
  expect(roots.program.sources.get(filename)).toEqual({sha256:sourceHash,byteLength:536});
  expect(roots.program.sources.get(join(target,'package.json'))).toEqual({sha256:manifestHash,byteLength:1954});
  const end=calls(events,'net.socket.end')[0].call;
  expect(end.receiver).toBe(socket);expect(end.args).toEqual([]);
  expect(end.origin.sourceFile).toBe(filename);expect(end.origin.activation.sourceFile).toBe(filename);
  expect(end.origin.activation.parent).toBeUndefined();
  const entries=getArrayElements(getProperties(socket.hostSlots['node.events'],context)['event:connect'] as any,context)!;
  expect(entries).toHaveLength(1);
  expect(end.origin.activation.target).toBe(getProperties(entries[0] as any,context).listener);
  const shutdown=calls(events,'net.socket.shutdown');expect(shutdown).toHaveLength(1);
  expect(shutdown[0].call.receiver).toBe(socket);expect(shutdown[0].call.origin.activation).toBe(end.origin.activation);
  const endReturn=events.filter(event=>event.kind==='return'&&event.call===end);
  expect(endReturn).toHaveLength(1);expect(endReturn[0].value).toBe(socket);
  const availability=calls(events,'console.log')[1];
  expect(availability.call.origin.sourceFile).toBe(join(directory,'entry.cjs'));
  expect(availability.call.origin.activation.parent).toBe(end.origin.activation);
  expect(events.indexOf(endReturn[0])).toBeLessThan(events.indexOf(availability));
  const completionCall=calls(events,'net.socket.completion')[0].call;
  expect(completionCall.receiver).toBe(socket);expect(completionCall.origin.activation).toBeUndefined();
  const active=getProperties(context.value.global.hostSlots.externalEvents,context).active;
  expect(getProperties(active as any,context).receiver).toBe(socket);
  const refreshed=getProperties(socket.hostSlots['node.net.timeout'],context).arm;
  const beforeEnd={value:{...context.value,heap:calls(events,'net.socket.end')[0].heap}};
  expect(getProperties(socket.hostSlots['node.net.timeout'],beforeEnd).arm).toBe(refreshed);
  expect(refreshed).not.toBe(previousArm);
  expect(getProperties(previousArm as any,context).active).toMatchObject({value:false});
  expect(getProperties(refreshed as any,context)).toMatchObject({active:{value:true},delay:{value:100},refed:{value:false}});
  expect(getProperties(socket.hostSlots['node.net.shutdown'],context)).toMatchObject({pending:{value:true}});
  expect(getProperties(socket.hostSlots['node.stream.writable'],context)).toMatchObject({
    ending:{value:true},ended:{value:true},finalCalled:{value:true},finalPending:{value:true},
    prefinished:{value:false},finished:{value:false}});
  expect(context.value.activation).toBeUndefined(); // Both interpreted callbacks returned before native read frontier.
  expect(calls(events,'net.socket.readStart')).toHaveLength(0);
  for(const path of all.filter(path=>path!==full[0])){
    expect(messages(path.events)).toEqual(['helper returned']);
    expect(calls(path.events,'net.socket.shutdown')).toHaveLength(0);
    expect(getProperties(socketOf(path.events).hostSlots['node.net.shutdown'],path.context)).toMatchObject({pending:{value:false}});
  }
});

for(const cutoff of ['throw','boundary'])test(`unchanged helper caller ${cutoff} occurs after end and preserves its actual activation semantics`,()=>{
  const {roots,target}=cli(`var check=require('node-notifier/lib/checkGrowl');
    check({host:'127.0.0.1',port:23053},function(error,available){
      if(error!==null||available!==true)throw 'wrong args';console.log('caller entered');
      ${cutoff==='throw'?"throw 'caller failure';":"require('net').createServer();"}
      console.log('caller continued');
    });`,2,1);
  const selected=paths(roots).filter(path=>messages(path.events).includes('caller entered'));
  expect(selected).toHaveLength(1);
  const {events,context,completion}=selected[0],socket=socketOf(events);
  expect(messages(events)).toEqual(['caller entered']);
  const end=calls(events,'net.socket.end')[0].call,logged=calls(events,'console.log')[0].call;
  expect(logged.origin.activation.parent).toBe(end.origin.activation);
  expect(end.origin.sourceFile).toBe(join(target,'lib/checkGrowl.js'));
  expect(getProperties(socket.hostSlots['node.net.shutdown'],context)).toMatchObject({pending:{value:true}});
  expect(events.filter(event=>event.kind==='return'&&event.call===end)).toHaveLength(1);
  const active=getProperties(context.value.global.hostSlots.externalEvents,context).active;
  if(cutoff==='throw'){
    expect(completion).toMatchObject({type:'ThrownValue',value:{value:'caller failure'}});
    expect(active).toMatchObject({type:'undefined'});expect(context.value.activation).toBeUndefined();
  }else{
    expect(isExecutionBoundary(completion)).toBe(true);expect(completion.message).toMatch(/createServer/);
    expect(context.value.activation).toBe(logged.origin.activation);
    expect(context.value.activation.parent).toBe(end.origin.activation);
    expect(getProperties(active as any,context).receiver).toBe(socket);
  }
  expect(calls(events,'net.socket.readStart')).toHaveLength(0);
});
