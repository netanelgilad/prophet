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
beforeEach(() => { directory = realpathSync(mkdtempSync(join(tmpdir(), "prophet-net-integration-"))); });
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

test("actual CLI imports identical net aliases without executing a retained API or callback", () => {
  const { roots } = cli(`const net = require('net');
    if (net !== require('node:net') || net.connect !== net.createConnection) throw 'identity';
    function later() { net.connect({host:'127.0.0.1',port:43210}); }
    module.exports = {later:later, connect:net.connect}; console.log('retained');`, 0, 2);
  expect(paths(roots)).toHaveLength(1);
  expect(messages(paths(roots)[0].events)).toEqual(["retained"]);
  expect(paths(roots)[0].events.some(event => event.call.operation.indexOf("net.") === 0)).toBe(false);
});

test("actual CLI joins dependency identity, public return and deferred submission without claiming completion", () => {
  fixture("node_modules/connector/package.json", '{"name":"connector","version":"1.0.0","main":"index.js"}');
  const dependency = fixture("node_modules/connector/index.js", `module.exports = function open() {
    var socket = require('node:net').createConnection({host:'127.0.0.1',port:43210},
      function connected() { throw 'connect callback must remain pending'; });
    socket.on('error', function failed() { throw 'error callback must remain pending'; });
    socket.on('close', function closed() { throw 'close callback must remain pending'; });
    socket.on('connectionAttempt', function attempted(address, port, family) {
      if (this !== socket || address !== '127.0.0.1' || port !== 43210 || family !== 4) throw 'attempt identity';
      console.log('attempt');
    });
    return socket;
  };`);
  const { roots } = cli(`try { module.exports = require('connector')(); console.log('caller continued'); }
    catch (error) { console.log('caught'); }`, 2, 0);
  const all = paths(roots);
  expect(all).toHaveLength(2);
  expect(all.filter(path => isExecutionBoundary(path.completion))).toHaveLength(1);
  expect(roots.program.sources.get(dependency)).toEqual({ byteLength: readFileSync(dependency).length,
    sha256: createHash('sha256').update(readFileSync(dependency)).digest('hex') });
  for (const { events, context, completion } of all) {
    expect(messages(events)).toEqual(['caller continued', 'attempt']);
    const socket = socketOf(events);
    const entry = calls(events, 'net.connect')[0].call;
    expect(entry.origin.sourceFile).toBe(dependency);
    expect(entry.origin.activation.sourceFile).toBe(dependency);
    expect(entry.origin.activation.parent.sourceFile).toBe(join(directory, 'entry.cjs'));
    const emitterState = getProperties(socket.hostSlots['node.events'], context);
    const connectListeners = getArrayElements(emitterState['event:connect'] as any, context)!;
    expect(connectListeners).toHaveLength(1);
    const retained = getProperties(connectListeners[0] as any, context);
    expect(retained.listener).toBe(entry.args[1]);
    expect(retained.once).toMatchObject({ value:true });
    expect(retained.fired).toMatchObject({ value:false });
    const attempts = calls(events, 'net.socket.initiate');
    const submissions = calls(events, 'net.socket.submit');
    expect(attempts).toHaveLength(1); expect(submissions).toHaveLength(1);
    expect(attempts[0].call.receiver).toBe(socket);
    expect(submissions[0].call.receiver).toBe(socket);
    expect(submissions[0].call.args.map((value: any) => value.value)).toEqual(['127.0.0.1', 43210, 4]);
    expect(submissions[0].call.origin.activation).toBeUndefined();
    const state = phase(socket, context);
    const stopped = isExecutionBoundary(completion);
    expect(state.phase.value).toBe(stopped ? 'submission-failed' : 'submitted');
    expect(resolveBoolean(state.submissionAccepted, context.value.knowledge)).toBe(!stopped);
    expect(resolveBoolean(state.completionPending, context.value.knowledge)).toBe(!stopped);
    expect(getProperties(socket, context).connecting).toMatchObject({ value: true });
    expect(getProperties(socket, context).destroyed).toMatchObject({ value: false });
    const returned = events.filter(event => event.kind === 'return' && event.call.operation === 'net.socket.submit');
    expect(returned).toHaveLength(1);
    expect(returned[0].call).toBe(submissions[0].call);
    expect(returned[0].call.origin).toBe(submissions[0].call.origin);
    expect(returned[0].value).toBe(state.submissionAccepted);
    const queue = getProperties(context.value.global.hostSlots['node.nextTick'], context);
    if (stopped) expect(getProperties(queue.active as any, context).receiver).toBe(socket);
    else expect(queue.active).toMatchObject({ type:'undefined' });
    expect(roots.initial.value.effects).toBeUndefined();
  }
});

test("queued cancellation returns the socket and leaves close pending without submission or callback delivery", () => {
  const { roots } = cli(`var socket = require('net').connect({host:'127.0.0.1',port:0}, function(){throw 'connected';});
    socket.on('connectionAttempt', function(){throw 'attempted';});
    socket.on('close', function(){throw 'closed';});
    if (socket.destroy() !== socket || socket.connecting || !socket.destroyed) throw 'cancellation';
    console.log('cancelled'); module.exports = socket;`, 0, 2);
  const all = paths(roots); expect(all).toHaveLength(1);
  const { events, context } = all[0];
  expect(messages(events)).toEqual(['cancelled']);
  expect(calls(events, 'net.socket.submit')).toHaveLength(0);
  const socket = socketOf(events), state = phase(socket, context);
  expect(state.phase.value).toBe('closing');
  expect(state.closePending).toMatchObject({ value: true });
  expect(state.completionPending).toMatchObject({ value: false });
  expect(state.submissionAccepted.type).toBe('undefined');
});

test("a connectionAttempt guest throw retains public continuation and prevents all submission", () => {
  const { roots } = cli(`var socket = require('net').connect({host:'127.0.0.1',port:43210});
    socket.on('connectionAttempt', function(){ console.log('attempt'); throw 'listener failure'; });
    console.log('after connect');`, 0);
  const all = paths(roots); expect(all).toHaveLength(1);
  expect(all[0].completion).toMatchObject({ type:'ThrownValue', value:{value:'listener failure'} });
  expect(messages(all[0].events)).toEqual(['after connect', 'attempt']);
  expect(calls(all[0].events, 'net.socket.submit')).toHaveLength(0);
  expect(phase(socketOf(all[0].events), all[0].context).phase.value).toBe('initiating');
});

for (const body of ["require('fs').writeFileSync('never-written', 'no');", 'socket.destroy();']) {
  test(`connectionAttempt typed frontier preserves its active job and never submits: ${body}`, () => {
    const { roots } = cli(`var socket = require('net').connect({host:'127.0.0.1',port:43210});
      socket.on('connectionAttempt', function attempted(){ console.log('attempt'); ${body} console.log('after stop'); });
      console.log('after connect');`);
    const all = paths(roots); expect(all).toHaveLength(1);
    const { completion, context, events } = all[0];
    expect(isExecutionBoundary(completion)).toBe(true);
    expect(messages(events)).toEqual(['after connect', 'attempt']);
    expect(calls(events, 'net.socket.submit')).toHaveLength(0);
    const socket = socketOf(events);
    expect(phase(socket, context).phase.value).toBe('initiating');
    const active = getProperties(context.value.global.hostSlots['node.nextTick'], context).active;
    expect(getProperties(active as any, context).receiver).toBe(socket);
    expect(context.value.activation.sourceFile).toBe(join(directory, 'entry.cjs'));
    expect(context.value.activation.parent).toBeUndefined();
  });
}

test("finite cancellation and two submissions retain distinct histories and independent default outcomes", () => {
  const { roots } = cli(`var net = require('net');
    var first = net.connect({host:'127.0.0.1',port:43210});
    var second = net.connect({host:'127.0.0.1',port:43211});
    if (Math.random() < 0.5) { first.destroy(); console.log('cancel first'); }
    else console.log('keep first');
    second.on('connectionAttempt', function(){console.log('second attempt');});`);
  const all = paths(roots);
  expect(all).toHaveLength(5);
  expect(all.filter(path => !isExecutionBoundary(path.completion))).toHaveLength(2);
  for (const { events, context } of all) {
    const submissions = calls(events, 'net.socket.submit');
    const logs = messages(events);
    if (logs[0] === 'cancel first') {
      expect(submissions).toHaveLength(1);
      expect(submissions[0].call.args[1].value).toBe(43211);
      expect(logs).toEqual(['cancel first', 'second attempt']);
    } else {
      expect(submissions.length).toBeGreaterThanOrEqual(1);
      expect(submissions[0].call.args[1].value).toBe(43210);
      if (submissions.length === 2) {
        expect(logs).toEqual(['keep first', 'second attempt']);
        expect(phase(submissions[0].call.receiver, context).submissionAccepted)
          .not.toBe(phase(submissions[1].call.receiver, context).submissionAccepted);
      } else expect(logs).toEqual(['keep first']);
    }
  }
});

test("numeric invalid ports precede unsupported DNS routing and never enter deferred submission", () => {
  const { roots } = cli(`var net = require('net');
    try { net.connect({host:'ordinary.example',port:65536}); throw 'missing error'; }
    catch(error) {
      if (error.name !== 'RangeError' || error.code !== 'ERR_SOCKET_BAD_PORT') throw error;
      console.log(error.message);
    }
    try { net.connect({host:'127.0.0.1',port:-1}); throw 'missing error'; }
    catch(error) { console.log(error.code); }`, 0);
  const all = paths(roots); expect(all).toHaveLength(1);
  expect(messages(all[0].events)).toEqual([
    'Port should be >= 0 and < 65536. Received type number (65536).', 'ERR_SOCKET_BAD_PORT']);
  expect(calls(all[0].events, 'net.socket.initiate')).toHaveLength(0);
  expect(calls(all[0].events, 'net.socket.submit')).toHaveLength(0);
});

test("finite valid, invalid and unsupported endpoints retain their distinct completed/stopped results", () => {
  const { roots } = cli(`var host = Math.random() < 0.5 ? '127.0.0.1' : 'ordinary.example';
    var port = Math.random() < 0.5 ? 43210 : 65536;
    try { require('net').connect({host:host,port:port}); console.log('returned'); }
    catch(error) { console.log(error.code); }`);
  const all = paths(roots);
  expect(all).toHaveLength(5);
  expect(all.filter(path => messages(path.events)[0] === 'ERR_SOCKET_BAD_PORT')).toHaveLength(2);
  expect(all.filter(path => messages(path.events)[0] === 'returned')).toHaveLength(2);
  expect(all.filter(path => messages(path.events).length === 0)).toHaveLength(1);
  for (const path of all) {
    const logged = messages(path.events);
    if (logged[0] === 'returned') expect(calls(path.events, 'net.socket.submit')).toHaveLength(1);
    else expect(calls(path.events, 'net.socket.submit')).toHaveLength(0);
    if (logged[0] === 'ERR_SOCKET_BAD_PORT') expect(isExecutionBoundary(path.completion)).toBe(false);
  }
});

test("pinned Node oracle separates callback registration, validation, pending return and intercepted submission", () => {
  // Original TCP/pipe/DNS entrypoints are never invoked. Native wrapper allocation
  // and controlled JS event execution establish ordering, not OS/packet outcomes.
  const source = `
    const net = require('net'), dns = require('dns'), asyncHooks = require('async_hooks');
    const TCP = process.binding('tcp_wrap').TCP;
    let current; const rows = [], sockets = new Set(), prohibited = [];
    function forbidden(name) { prohibited.push(name); throw new Error('prohibited '+name); }
    TCP.prototype.connect = function(req,address,port) {
      current.events.push({kind:'submission',address,port}); return 0;
    };
    TCP.prototype.connect6 = function(){forbidden('IPv6');};
    process.binding('pipe_wrap').Pipe.prototype.connect = function(){forbidden('IPC');};
    dns.lookup = function(){forbidden('DNS');};
    const hook = asyncHooks.createHook({init(id,type) {
      if (current && type === 'TCPWRAP') current.events.push({kind:'wrapper'});
    }}); hook.enable();
    const originalOnce = net.Socket.prototype.once;
    net.Socket.prototype.once = function(name,callback) {
      if (current && name === 'connect') {
        current.events.push({kind:'register',connecting:this.connecting,hasHandle:!!this._handle});
        sockets.add(this);
      }
      return Reflect.apply(originalOnce,this,[name,callback]);
    };
    process.on('uncaughtException', error => {
      if (!current) throw error;
      current.events.push({kind:'uncaught',name:error.name,message:error.message});
    });
    const turn = () => new Promise(resolve => setImmediate(resolve));
    async function run(label,options,mode) {
      current={label,events:[]}; rows.push(current);
      const row=current;
      try {
        const socket=net.connect(options,function(){row.events.push({kind:'connected'});});
        socket.on('connectionAttempt',function(address,port,family) {
          row.events.push({kind:'attempt',address,port,family,sameReceiver:this===socket});
          if(mode==='throw')throw new Error('listener failure');
          if(mode==='destroy-during'){socket.destroy();row.events.push({kind:'destroyed-during'});}
        });
        row.events.push({kind:'returned',connecting:socket.connecting,destroyed:socket.destroyed});
        if(mode==='cancel'){socket.destroy();row.events.push({kind:'cancelled',connecting:socket.connecting,destroyed:socket.destroyed});}
      } catch(error) {
        row.events.push({kind:'throw',name:error.name,code:error.code,message:error.message,
          own:Object.getOwnPropertyNames(error).filter(key=>key!=='stack').sort()});
      }
      await turn();
      for(const socket of sockets) if(!socket.destroyed) socket.destroy();
      sockets.clear();await turn();current=undefined;
    }
    (async function(){
      await run('pending',{host:'127.0.0.1',port:43210});
      await run('zero',{host:'127.0.0.1',port:0});
      await run('invalid',{host:'127.0.0.1',port:65536});
      await run('hostname-invalid',{host:'ordinary.example',port:65536});
      await run('host-type-first',{host:42,port:65536});
      await run('cancel',{host:'127.0.0.1',port:43210},'cancel');
      await run('throw',{host:'127.0.0.1',port:43210},'throw');
      await run('destroy-during',{host:'127.0.0.1',port:43210},'destroy-during');
      hook.disable();process.stdout.write(JSON.stringify({version:process.version,aliases:net.connect===net.createConnection,rows,prohibited}));
    })();`;
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath, ['-e', source], {
    encoding:'utf8',timeout:10000,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''}
  });
  expect(child.error).toBeUndefined(); expect(child.status).toBe(0); expect(child.stderr).toBe('');
  const result = JSON.parse(child.stdout);
  expect(result.version).toBe('v24.21.0'); expect(result.aliases).toBe(true); expect(result.prohibited).toEqual([]);
  const row = (name: string) => result.rows.filter((item: any) => item.label === name)[0].events;
  const kinds = (name: string) => row(name).map((event: any) => event.kind);
  expect(kinds('pending')).toEqual(['register','wrapper','returned','attempt','submission']);
  expect(row('pending')[0]).toEqual({kind:'register',connecting:false,hasHandle:false});
  expect(row('pending')[2]).toEqual({kind:'returned',connecting:true,destroyed:false});
  expect(row('pending')[3]).toEqual({kind:'attempt',address:'127.0.0.1',port:43210,family:4,sameReceiver:true});
  expect(row('zero')[4]).toEqual({kind:'submission',address:'127.0.0.1',port:0});
  for (const name of ['invalid','hostname-invalid']) {
    expect(kinds(name)).toEqual(['register','wrapper','throw']);
    expect(row(name)[2]).toEqual({kind:'throw',name:'RangeError',code:'ERR_SOCKET_BAD_PORT',
      message:'Port should be >= 0 and < 65536. Received type number (65536).',own:['code','message']});
  }
  expect(row('host-type-first')[2]).toMatchObject({kind:'throw',name:'TypeError',code:'ERR_INVALID_ARG_TYPE'});
  expect(kinds('cancel')).toEqual(['register','wrapper','returned','cancelled']);
  expect(row('cancel')[3]).toEqual({kind:'cancelled',connecting:false,destroyed:true});
  expect(kinds('throw')).toEqual(['register','wrapper','returned','attempt','uncaught']);
  expect(row('throw')[4]).toEqual({kind:'uncaught',name:'Error',message:'listener failure'});
  expect(kinds('destroy-during')).toEqual(['register','wrapper','returned','attempt','destroyed-during','uncaught']);
  expect(row('destroy-during')[5]).toEqual({kind:'uncaught',name:'TypeError',message:"Cannot read properties of null (reading 'connect')"});
});
