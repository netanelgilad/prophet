import { execFileSync } from "child_process";
import { createCommonJSLoader, evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { effectPaths } from "../src/effects";
import { ExecutionContext, setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { createHTTPModel } from "../src/node/http";
import { ESObject, isESObject, TESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { resolveBoolean } from "../src/symbolic";
import { Any, ESNumber, isThrownValue, Undefined } from "../src/types";
import { assertPinnedNode, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";

const request = { method: ESString("GET"), url: ESString("/") };

// Model domain: a primary Node process where valid socket binding succeeds.
// Event delivery stays explicit. This does not prove real port availability;
// the independent native cases below select available ports for their runs.
function load(source: string, inputs: { [name: string]: Any } = {}) {
  const model = createHTTPModel();
  const filename = "/app/listen.cjs";
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...inputs }, "unmodeled") });
  const [exports, context] = createCommonJSLoader({ [filename]: source },
    { builtins: { http: model.module, events: model.eventsModule } }).load(filename, initial);
  expect(isThrownValue(exports)).toBe(false);
  expect(isForkedCompletion(exports)).toBe(false);
  if (!isESObject(exports)) throw new Error("Expected object exports");
  return { model, exports, server: getProperties(exports, context).server, context };
}

function observe(exports: TESObject, expression: string, context: TExecutionContext,
  inputs: { [name: string]: Any } = {}) {
  const [completion, observed] = evaluateCode(`const observation = (${expression});`,
    setVariablesInScope(context, { loaded: exports, ...inputs }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  return { value: observed.value.scope.observation, context: observed };
}

// The native child loads the same complete module and makes an actual request.
// Nonzero-port cases first ask the OS for an unused port, close that reservation,
// and retry only an EADDRINUSE race. No fixed native port is assumed available.
const nativeReference = `
  const http = require("node:http");
  const filename = process.argv[1];
  const nonzero = process.argv[2] === "true";
  async function close(server) {
    if (!server) return;
    server.closeAllConnections();
    await new Promise(function(resolve) { server.close(function() { resolve(); }); });
  }
  async function reservePort() {
    const probe = http.createServer();
    try {
      await new Promise(function(resolve, reject) {
        probe.once("error", reject);
        probe.listen(0, "127.0.0.1", resolve);
      });
      return probe.address().port;
    } finally { await close(probe); }
  }
  (async function() {
    for (let attempt = 0; attempt < 5; attempt++) {
      let server;
      try {
        const port = nonzero ? await reservePort() : 0;
        global.requestedPort = port;
        delete require.cache[filename];
        const loaded = require(filename);
        server = loaded.server;
        const before = loaded.read();
        await new Promise(function(resolve, reject) {
          server.once("error", reject);
          server.once("listening", resolve);
        });
        const ready = loaded.read();
        const response = await new Promise(function(resolve, reject) {
          const outgoing = http.get({ hostname: "127.0.0.1", port: server.address().port,
            path: "/", agent: false }, function(incoming) {
            let body = "";
            incoming.setEncoding("utf8");
            incoming.on("data", function(chunk) { body += chunk; });
            incoming.once("error", reject);
            incoming.once("end", function() { resolve({ status: incoming.statusCode, body: body }); });
          });
          outgoing.once("error", reject);
        });
        const afterReady = loaded.afterReady ? loaded.afterReady() : null;
        process.stdout.write(JSON.stringify({ port: port, before: before, ready: ready,
          response: response, afterReady: afterReady }));
        return;
      } catch (error) {
        if (!nonzero || error.code !== "EADDRINUSE" || attempt === 4) throw error;
      } finally { await close(server); }
    }
  })().catch(function(error) { console.error(error); process.exitCode = 1; });
`;

function real(source: string, nonzero = false): {
  port: number; before: string; ready: string; response: { status: number; body: string }; afterReady: string | null;
} {
  assertPinnedNode();
  return withModuleFixture(source, filename => JSON.parse(execFileSync(
    process.env.PROPHET_NODE_BINARY || process.execPath,
    ["--no-global-search-paths", "-e", nativeReference, filename, String(nonzero)],
    { encoding: "utf8", timeout: 15000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" },
      stdio: ["ignore", "pipe", "pipe"] }
  )));
}

for (const host of ["", ', "127.0.0.1"']) {
  for (const nonzero of [false, true]) {
    test(`listen(port${host}) returns the server and preserves native startup timing (${nonzero ? "nonzero" : "zero"} port)`, () => {
      const source = `
        const http = require("node:http");
        let trace = "";
        const server = http.createServer(function(req, res) { res.end("ok"); });
        server.on("listening", function() { trace = trace + (this === server ? "event:" : "wrong:"); });
        const same = server.listen(requestedPort${host}) === server;
        module.exports = { server: server, read: function() { return trace + server.listening + ":" + same; } };
      `;
      const native = real(source, nonzero);
      expect(native.before).toBe(`${host ? "false" : "true"}:true`);
      expect(native.ready).toBe("event:true:true");
      expect(native.response).toEqual({ status: 200, body: "ok" });
      expect(native.port > 0).toBe(nonzero);
      const { model, exports, server, context } = load(source, { requestedPort: ESNumber(native.port) });
      expect(observe(exports, "loaded.read()", context).value).toMatchObject({ value: native.before });
      const [result, ready] = model.completeListen(server, context);
      expect(result).toBe(server);
      expect(observe(exports, "loaded.read()", ready).value).toMatchObject({ value: native.ready });
      const delivered = model.deliverRequest(server, request, ready);
      expect(delivered.result[0]).toBe(Undefined);
      expect(model.inspectResponse(delivered.response, delivered.result[1])).toMatchObject({
        statusCode: { value: 200 }, body: { value: "ok" }
      });
      expect(observe(exports, "loaded.read()", context).value).toMatchObject({ value: native.before });
    });
  }
}

for (const host of ["", ', "127.0.0.1"']) {
  test(`listen(port${host}, callback) defers callbacks and preserves listener order and receiver`, () => {
    const source = `
      const http = require("node:http");
      let trace = "";
      let captured = "before";
      const server = http.createServer(function(req, res) { res.end("ok"); });
      server.on("listening", function() { trace = trace + "A:"; });
      const same = server.listen(0${host}, function() {
        trace = trace + captured + ":" + (this === server) + ":" + server.listening + ":";
      }) === server;
      captured = "after";
      server.once("listening", function() { trace = trace + "C:"; });
      module.exports = { server: server, read: function() { return trace + server.listening + ":" + same; } };
    `;
    const native = real(source);
    expect(native.before).toBe(`${host ? "false" : "true"}:true`);
    expect(native.ready).toBe("A:after:true:true:C:true:true");
    const { model, exports, server, context } = load(source);
    expect(observe(exports, "loaded.read()", context).value).toMatchObject({ value: native.before });
    const [, ready] = model.completeListen(server, context);
    expect(observe(exports, "loaded.read()", ready).value).toMatchObject({ value: native.ready });
  });
}

for (const invalid of ["-1", "65536", "1.5", "NaN", "Infinity", "-Infinity"]) {
  test(`invalid numeric port ${invalid} throws RangeError but retains its already registered callback`, () => {
    const source = `
      const http = require("node:http");
      let trace = "";
      let failure = "";
      const server = http.createServer(function(req, res) { res.end("ok"); });
      try { server.listen(${invalid}, function() { trace = trace + "invalid:"; }); }
      catch (error) { failure = error.name + ":" + error.code + ":" + server.listening; }
      server.listen(0, function() { trace = trace + "valid:"; });
      module.exports = { server: server, read: function() { return failure + ":" + trace; } };
    `;
    const native = real(source);
    expect(native.before).toBe("RangeError:ERR_SOCKET_BAD_PORT:false:");
    expect(native.ready).toBe("RangeError:ERR_SOCKET_BAD_PORT:false:invalid:valid:");
    const { model, exports, server, context } = load(source);
    expect(observe(exports, "loaded.read()", context).value).toMatchObject({ value: native.before });
    const [, ready] = model.completeListen(server, context);
    expect(observe(exports, "loaded.read()", ready).value).toMatchObject({ value: native.ready });
    const events = effectPaths(ready.value.effects!)[0].events
      .filter(event => event.call.operation === "http.server.listen").map(event => event.kind);
    expect(events).toEqual(["call", "throw", "call", "return"]);
  });
}

test("a second listen after synchronous binding throws before registering its callback or validating its port", () => {
  const source = `
    const http = require("node:http");
    let trace = "";
    let failure = "";
    const server = http.createServer(function(req, res) { res.end("ok"); });
    server.listen(0, function() { trace = trace + "first:"; });
    try { server.listen(-1, function() { trace = trace + "must not run:"; }); }
    catch (error) { failure = error.name + ":" + error.code + ":" + server.listening; }
    module.exports = { server: server, read: function() { return failure + ":" + trace; } };
  `;
  const native = real(source);
  expect(native.before).toBe("Error:ERR_SERVER_ALREADY_LISTEN:true:");
  expect(native.ready).toBe("Error:ERR_SERVER_ALREADY_LISTEN:true:first:");
  const { model, exports, server, context } = load(source);
  expect(observe(exports, "loaded.read()", context).value).toMatchObject({ value: native.before });
  const [, ready] = model.completeListen(server, context);
  expect(observe(exports, "loaded.read()", ready).value).toMatchObject({ value: native.ready });
});

test("finite symbolic valid/invalid ports preserve failure, immediate listening, retained callback, and retry correlation", () => {
  const source = `
    const http = require("node:http");
    let failed = false;
    let calls = 0;
    const server = http.createServer(function(req, res) { res.end("ok"); });
    try { server.listen(invalid ? -1 : 0, function() { calls = calls + 1; }); }
    catch (error) { failed = error.code === "ERR_SOCKET_BAD_PORT"; }
    const stateCorrect = server.listening === !invalid;
    if (failed) server.listen(0, function() { calls = calls + 10; });
    module.exports = { server: server, failed: failed, stateCorrect: stateCorrect,
      read: function() { return failed + ":" + calls + ":" + server.listening; },
      verify: function() { return failed === invalid && stateCorrect && (invalid ? calls === 11 : calls === 1); } };
  `;
  for (const invalid of [false, true]) {
    const native = real(`const invalid = ${invalid};\n${source}`);
    expect(native.before).toBe(`${invalid}:0:true`);
    expect(native.ready).toBe(`${invalid}:${invalid ? 11 : 1}:true`);
  }
  const invalid = ESBoolean();
  const { model, exports, server, context } = load(source, { invalid });
  expect(resolveBoolean(getProperties(exports, context).failed as ReturnType<typeof ESBoolean>, context.value.knowledge))
    .toBeUndefined();
  expect(getProperties(exports, context).stateCorrect).toMatchObject({ value: true });
  const [, ready] = model.completeListen(server, context);
  expect(observe(exports, "loaded.verify()", ready).value).toMatchObject({ value: true });
});

for (const port of ["1", "65535", "-0"]) {
  test(`numeric boundary ${port} is accepted under the declared successful-bind environment`, () => {
    // These fixed numbers are never used by the native socket oracle. Native
    // nonzero success above uses an OS-selected port and retries bind races.
    const { model, server, context } = load(`
      const http = require("node:http");
      const server = http.createServer(function(req, res) { res.end("ok"); });
      server.listen(${port});
      module.exports = { server: server };
    `);
    expect(getProperties(server as TESObject, context).listening).toMatchObject({ value: true });
    const [result] = model.completeListen(server, context);
    expect(result).toBe(server);
  });
}

test("a server used with a context preceding its creation reports an explicit lifecycle gap", () => {
  const { server } = load(`
    const http = require("node:http");
    module.exports = { server: http.createServer() };
  `);
  expect(() => evaluateCode("server.listen(0);", setVariablesInScope(nodeInitialExecutionContext, { server })))
    .toThrow(/HTTP analysis is not yet supported/);
});

test("overlapping explicit-host lookup remains a gap instead of inventing a bound-handle duplicate error", () => {
  expect(() => load(`
    const http = require("node:http");
    const server = http.createServer();
    server.listen(0, "127.0.0.1");
    server.listen(0, "127.0.0.1");
    module.exports = { server: server };
  `)).toThrow(/HTTP analysis is not yet supported/);
});

test("immediate binding does not bypass the declared listening-event-before-request schedule", () => {
  const { model, server, context } = load(`
    const http = require("node:http");
    let text = "before";
    const server = http.createServer(function(req, res) { res.end(text); });
    server.listen(0, function() { text = "ready"; });
    module.exports = { server: server };
  `);
  expect(getProperties(server as TESObject, context).listening).toMatchObject({ value: true });
  expect(() => model.deliverRequest(server, request, context)).toThrow(/HTTP analysis is not yet supported/);
  const [, ready] = model.completeListen(server, context);
  const delivered = model.deliverRequest(server, request, ready);
  expect(model.inspectResponse(delivered.response, delivered.result[1]).body).toMatchObject({ value: "ready" });
});

test("an unbounded symbolic number remains an explicit port-analysis gap", () => {
  expect(() => load(`
    const http = require("node:http");
    const server = http.createServer();
    server.listen(port);
    module.exports = { server: server };
  `, { port: ESNumber() })).toThrow(/HTTP/);
});

for (const mutation of [
  'callback.valueOf = function() { throw "callback conversion"; };',
  'Function.prototype.toString = function() { throw "callback conversion"; };'
]) {
  test(`callback numeric conversion side effects remain explicit gaps: ${mutation}`, () => {
    const source = `
      const http = require("node:http");
      const server = http.createServer();
      function callback() {}
      ${mutation}
      try { server.listen(0, callback); }
      catch (error) { module.exports = error + ":" + server.listening; }
    `;
    // net.Server.listen converts positional arguments to a numeric backlog.
    // Both conversions throw before a socket binds, so this oracle needs no
    // external cleanup and cannot accidentally turn a thrown effect into success.
    expect(withModuleFixture(source, filename => nodeModuleObservation(filename))).toEqual({
      kind: "return", value: { type: "string", value: "callback conversion:false" }
    });
    expect(() => load(source)).toThrow(/HTTP/);
  });
}

test("inherited listen options remain an explicit gap instead of silently changing startup timing", () => {
  expect(() => load(`
    const http = require("node:http");
    const server = http.createServer();
    Object.prototype.host = "127.0.0.1";
    server.listen(0);
    module.exports = { server: server };
  `)).toThrow(/HTTP/);
});

for (const argumentsSource of ['"3000"', '{ port: 0 }', '0, "localhost"', '0, "127.0.0.1", 128']) {
  test(`broader listen overloads remain explicit gaps: ${argumentsSource}`, () => {
    expect(() => load(`
      const http = require("node:http");
      const server = http.createServer();
      server.listen(${argumentsSource});
      module.exports = { server: server };
    `)).toThrow(/HTTP/);
  });
}
