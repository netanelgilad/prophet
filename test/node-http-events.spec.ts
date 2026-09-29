import { execFileSync } from "child_process";
import { createCommonJSLoader, evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { effectPaths } from "../src/effects";
import { ExecutionContext, setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { createHTTPModel } from "../src/node/http";
import { ESObject, isESObject, TESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { Any, isThrownValue, Undefined } from "../src/types";
import { assertPinnedNode, withModuleFixture } from "./commonjs/oracle";

const request = { method: ESString("GET"), url: ESString("/") };

function load(source: string, inputs: { [name: string]: Any } = {}) {
  const model = createHTTPModel();
  const filename = "/app/http-events.cjs";
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...inputs }) });
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

// Node loads the full app module and delivers requests over actual sockets.
// An uncaught-exception observer belongs only to this isolated reference child;
// it records an escaping finish callback without pretending the app caught it.
const nativeReference = `
  const http = require("node:http");
  const uncaught = [];
  process.on("uncaughtException", function(error) { uncaught.push(String(error)); });
  let server;
  (async function() {
    try {
      const loaded = require(process.argv[1]);
      server = loaded.server;
      const before = loaded.read();
      await new Promise(function(resolve, reject) {
        server.once("error", reject);
        server.once("listening", resolve);
      });
      const ready = loaded.read();
      const responses = [];
      for (let index = 0; index < Number(process.argv[2]); index++) {
        responses.push(await new Promise(function(resolve, reject) {
          const outgoing = http.get({ hostname: "127.0.0.1", port: server.address().port,
            path: "/", agent: false }, function(response) {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", function(chunk) { body += chunk; });
            response.on("error", reject);
            response.on("end", function() { resolve({ status: response.statusCode, body: body }); });
          });
          outgoing.on("error", reject);
        }));
      }
      const after = loaded.read();
      const probe = loaded.probe ? loaded.probe() : null;
      process.stdout.write(JSON.stringify({ before: before, ready: ready, responses: responses,
        after: after, probe: probe, uncaught: uncaught }));
    } finally {
      if (server) await new Promise(function(resolve) {
        server.close(resolve);
        server.closeAllConnections();
      });
    }
  })().catch(function(error) { console.error(error); process.exitCode = 1; });
`;

function real(source: string, requests = 1): object {
  assertPinnedNode();
  return withModuleFixture(source, filename => JSON.parse(execFileSync(
    process.env.PROPHET_NODE_BINARY || process.execPath,
    ["--no-global-search-paths", "-e", nativeReference, filename, String(requests)],
    { encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" },
      stdio: ["ignore", "pipe", "pipe"] }
  )));
}

test("a complete server registers a request later and runs finish only after completion with current captures", () => {
  const source = `
    const http = require("node:http");
    let trace = "registered";
    let message = "old";
    const server = http.createServer();
    const same = server.on("request", function(req, res) {
      res.once("finish", function() {
        trace = trace + ":" + message + ":" + (this === res) + ":" + res.writableFinished;
      });
      message = "latest";
      res.end(this === server ? "ok" : "wrong receiver");
      trace = trace + ":ended:" + res.writableEnded + ":" + res.writableFinished;
    }) === server;
    server.listen(0, "127.0.0.1");
    module.exports = { server: server, same: same, read: function() { return trace; } };
  `;
  expect(real(source)).toEqual({ before: "registered", ready: "registered",
    responses: [{ status: 200, body: "ok" }],
    after: "registered:ended:true:false:latest:true:true", probe: null, uncaught: [] });
  const { model, exports, server, context } = load(source);
  expect(getProperties(exports, context).same).toMatchObject({ value: true });
  const [, ready] = model.completeListen(server, context);
  const delivered = model.deliverRequest(server, request, ready);
  expect(delivered.result[0]).toBe(Undefined);
  expect(observe(exports, "loaded.read()", delivered.result[1]).value)
    .toMatchObject({ value: "registered:ended:true:false" });
  const [result, finished] = model.completeResponse(delivered.response, delivered.result[1]);
  expect(result).toBe(delivered.response);
  expect(observe(exports, "loaded.read()", finished).value)
    .toMatchObject({ value: "registered:ended:true:false:latest:true:true" });
  expect(model.inspectResponse(delivered.response, finished)).toMatchObject({
    statusCode: { value: 200 }, body: { value: "ok" }
  });
  expect(observe(exports, "loaded.read()", context).value).toMatchObject({ value: "registered" });
  expect(observe(exports, "loaded.read()", delivered.result[1]).value)
    .toMatchObject({ value: "registered:ended:true:false" });
  expect(() => model.completeResponse(delivered.response, finished)).toThrow(/HTTP/);
});

test("HTTP and node:events share method identities and allow borrowed EventEmitter methods", () => {
  const source = `
    const http = require("node:http");
    const EventEmitter = require("node:events");
    let correct = true;
    let trace = "";
    const server = http.createServer();
    correct = server.on === EventEmitter.prototype.on && server.once === EventEmitter.prototype.once &&
      server.emit === EventEmitter.prototype.emit && server.off === EventEmitter.prototype.off;
    EventEmitter.prototype.once.call(server, "listening", function() { trace = trace + "listening:"; });
    EventEmitter.prototype.on.call(server, "request", function(req, res) {
      correct = correct && res.on === EventEmitter.prototype.on && res.once === EventEmitter.prototype.once &&
        res.emit === EventEmitter.prototype.emit && res.removeListener === EventEmitter.prototype.removeListener;
      EventEmitter.prototype.once.call(res, "finish", function() {
        correct = correct && this === res;
        trace = trace + "finish";
      });
      res.end(correct ? "ok" : "wrong identity");
    });
    server.listen(0, "127.0.0.1");
    module.exports = { server: server, read: function() { return trace + ":" + correct; } };
  `;
  expect(real(source)).toEqual({ before: ":true", ready: "listening::true",
    responses: [{ status: 200, body: "ok" }], after: "listening:finish:true", probe: null, uncaught: [] });
  const { model, exports, server, context } = load(source);
  expect(observe(exports, "loaded.read()", context).value).toMatchObject({ value: ":true" });
  const [, ready] = model.completeListen(server, context);
  expect(observe(exports, "loaded.read()", ready).value).toMatchObject({ value: "listening::true" });
  const delivered = model.deliverRequest(server, request, ready);
  const [, finished] = model.completeResponse(delivered.response, delivered.result[1]);
  expect(observe(exports, "loaded.read()", finished).value).toMatchObject({ value: "listening:finish:true" });
  expect(model.inspectResponse(delivered.response, finished).body).toMatchObject({ value: "ok" });
});

test("listening callbacks follow registration order and removal while listen's callback is deferred", () => {
  const source = `
    const http = require("node:http");
    let trace = "";
    const server = http.createServer(function(req, res) { res.end("ok"); });
    function removed() { trace = trace + "removed"; }
    server.on("listening", function() { trace = trace + (this === server ? "A" : "wrong"); });
    server.once("listening", removed);
    server.once("listening", function() { trace = trace + "B"; });
    server.listen(0, "127.0.0.1", function() { trace = trace + "C"; });
    server.on("listening", function() { trace = trace + "D"; });
    server.off("listening", removed);
    module.exports = { server: server, read: function() { return trace; } };
  `;
  expect(real(source)).toEqual({ before: "", ready: "ABCD",
    responses: [{ status: 200, body: "ok" }], after: "ABCD", probe: null, uncaught: [] });
  const { model, exports, server, context } = load(source);
  expect(observe(exports, "loaded.read()", context).value).toMatchObject({ value: "" });
  const [result, ready] = model.completeListen(server, context);
  expect(result).toBe(server);
  expect(observe(exports, "loaded.read()", ready).value).toMatchObject({ value: "ABCD" });
});

test("finish dispatch retains its starting listeners even when an earlier listener removes a later one", () => {
  const source = `
    const http = require("node:http");
    let trace = "";
    const server = http.createServer(function(req, res) {
      function later() { trace = trace + "B"; }
      function removed() { trace = trace + "removed"; }
      res.on("finish", function() { trace = trace + "A"; res.removeListener("finish", later); });
      res.on("finish", later);
      res.once("finish", function() { trace = trace + "C"; });
      res.once("finish", removed);
      res.removeListener("finish", removed);
      res.end("ok");
    });
    server.listen(0, "127.0.0.1");
    module.exports = { server: server, read: function() { return trace; } };
  `;
  expect(real(source)).toEqual({ before: "", ready: "", responses: [{ status: 200, body: "ok" }],
    after: "ABC", probe: null, uncaught: [] });
  const { model, exports, server, context } = load(source);
  const [, ready] = model.completeListen(server, context);
  const delivered = model.deliverRequest(server, request, ready);
  expect(observe(exports, "loaded.read()", delivered.result[1]).value).toMatchObject({ value: "" });
  const [, finished] = model.completeResponse(delivered.response, delivered.result[1]);
  expect(observe(exports, "loaded.read()", finished).value).toMatchObject({ value: "ABC" });
});

test("a request once-listener runs once across separately delivered requests", () => {
  const source = `
    const http = require("node:http");
    let trace = "";
    const server = http.createServer();
    server.once("request", function() { trace = trace + "once:"; });
    server.on("request", function(req, res) { trace = trace + "request:"; res.end(trace); });
    server.listen(0, "127.0.0.1");
    module.exports = { server: server, read: function() { return trace; } };
  `;
  expect(real(source, 2)).toEqual({ before: "", ready: "", responses: [
    { status: 200, body: "once:request:" }, { status: 200, body: "once:request:request:" }
  ], after: "once:request:request:", probe: null, uncaught: [] });
  const { model, exports, server, context } = load(source);
  const [, ready] = model.completeListen(server, context);
  const first = model.deliverRequest(server, request, ready);
  const [, firstFinished] = model.completeResponse(first.response, first.result[1]);
  const second = model.deliverRequest(server, request, firstFinished);
  const [, secondFinished] = model.completeResponse(second.response, second.result[1]);
  expect(observe(exports, "loaded.read()", secondFinished).value).toMatchObject({ value: "once:request:request:" });
  expect(model.inspectResponse(first.response, secondFinished).body).toMatchObject({ value: "once:request:" });
  expect(model.inspectResponse(second.response, secondFinished).body).toMatchObject({ value: "once:request:request:" });
});

test("finish registration after end still observes completion, but registration after finish is not replayed", () => {
  const source = `
    const http = require("node:http");
    let trace = "";
    let response;
    const server = http.createServer(function(req, res) {
      response = res;
      res.end("ok");
      trace = "ended";
      res.once("finish", function() { trace = trace + ":finish"; });
    });
    server.listen(0, "127.0.0.1");
    module.exports = { server: server, read: function() { return trace; }, probe: function() {
      response.once("finish", function() { trace = trace + ":too late"; });
      return trace;
    } };
  `;
  expect(real(source)).toEqual({ before: "", ready: "", responses: [{ status: 200, body: "ok" }],
    after: "ended:finish", probe: "ended:finish", uncaught: [] });
  const { model, exports, server, context } = load(source);
  const [, ready] = model.completeListen(server, context);
  const delivered = model.deliverRequest(server, request, ready);
  expect(observe(exports, "loaded.read()", delivered.result[1]).value).toMatchObject({ value: "ended" });
  const [, finished] = model.completeResponse(delivered.response, delivered.result[1]);
  expect(observe(exports, "loaded.probe()", finished).value).toMatchObject({ value: "ended:finish" });
});

test("response custom events use shared once removal and ordinary listener behavior", () => {
  const source = `
    const http = require("node:http");
    let trace = "";
    let response;
    const server = http.createServer(function(req, res) {
      response = res;
      res.once("audit", function(value) { trace = trace + "once:" + value + ":"; });
      res.on("audit", function(value) { trace = trace + "on:" + value + ":"; });
      res.end("ok");
    });
    server.listen(0, "127.0.0.1");
    module.exports = { server: server, read: function() { return trace; }, probe: function() {
      const first = response.emit("audit", "A");
      const second = response.emit("audit", "B");
      return trace + first + ":" + second;
    } };
  `;
  expect(real(source)).toEqual({ before: "", ready: "", responses: [{ status: 200, body: "ok" }],
    after: "", probe: "once:A:on:A:on:B:true:true", uncaught: [] });
  const { model, exports, server, context } = load(source);
  const [, ready] = model.completeListen(server, context);
  const delivered = model.deliverRequest(server, request, ready);
  const [, finished] = model.completeResponse(delivered.response, delivered.result[1]);
  expect(observe(exports, "loaded.probe()", finished).value).toMatchObject({ value: "once:A:on:A:on:B:true:true" });
  expect(observe(exports, "loaded.read()", finished).value).toMatchObject({ value: "" });
});

test("conditional finish registration preserves the input condition instead of inventing a definite callback", () => {
  const source = `
    const http = require("node:http");
    let finished = false;
    const server = http.createServer(function(req, res) {
      if (enabled) res.once("finish", function() { finished = true; });
      res.end("ok");
    });
    server.listen(0, "127.0.0.1");
    module.exports = { server: server, read: function() { return finished; } };
  `;
  for (const enabled of [true, false]) {
    expect(real(`const enabled = ${enabled};\n${source}`)).toEqual({ before: false, ready: false,
      responses: [{ status: 200, body: "ok" }], after: enabled, probe: null, uncaught: [] });
  }
  const enabled = ESBoolean();
  const { model, exports, server, context } = load(source, { enabled });
  const [, ready] = model.completeListen(server, context);
  const delivered = model.deliverRequest(server, request, ready);
  expect(observe(exports, "loaded.read()", delivered.result[1]).value).toMatchObject({ value: false });
  const [completion, finished] = model.completeResponse(delivered.response, delivered.result[1]);
  expect(completion).toBe(delivered.response);
  expect(observe(exports, "loaded.read()", finished).value).toMatchObject({ type: "boolean", value: undefined });
  expect(observe(exports, "loaded.read() === enabled", finished, { enabled }).value).toMatchObject({ value: true });
  for (const path of effectPaths(finished.value.effects!)) {
    expect(path.events.filter(event => event.kind === "call" && event.call.operation === "http.response.end"))
      .toHaveLength(1);
    expect(path.events.filter(event => event.kind === "call" && event.call.operation === "http.response.finish"))
      .toHaveLength(1);
  }
});

test("a finish listener throw escapes with completed transport and prior state changes intact", () => {
  const source = `
    const http = require("node:http");
    let trace = "";
    const server = http.createServer(function(req, res) {
      res.once("finish", function() {
        trace = trace + "finished:" + res.writableFinished;
        res.statusCode = 201;
        throw "finish failed";
      });
      res.on("finish", function() { trace = trace + ":must not run"; });
      res.end("ok");
    });
    server.listen(0, "127.0.0.1");
    module.exports = { server: server, read: function() { return trace; } };
  `;
  expect(real(source)).toEqual({ before: "", ready: "", responses: [{ status: 200, body: "ok" }],
    after: "finished:true", probe: null, uncaught: ["finish failed"] });
  const { model, exports, server, context } = load(source);
  const [, ready] = model.completeListen(server, context);
  const delivered = model.deliverRequest(server, request, ready);
  const [completion, finished] = model.completeResponse(delivered.response, delivered.result[1]);
  expect(completion).toMatchObject({ type: "ThrownValue", value: { value: "finish failed" } });
  expect(observe(exports, "loaded.read()", finished).value).toMatchObject({ value: "finished:true" });
  expect(getProperties(delivered.response, finished)).toMatchObject({
    writableFinished: { value: true }, writableEnded: { value: true }, statusCode: { value: 201 }
  });
  expect(model.inspectResponse(delivered.response, finished)).toMatchObject({
    statusCode: { value: 200 }, body: { value: "ok" }
  });
  expect(effectPaths(finished.value.effects!)[0].events
    .filter(event => event.call.operation === "http.response.finish").map(event => event.kind))
    .toEqual(["call", "throw"]);
});

test("request stream registration remains an explicit gap until flowing and readable state are modeled", () => {
  const { model, server, context } = load(`
    const http = require("node:http");
    const server = http.createServer(function(req, res) {
      req.on("data", function() {});
      res.end("ok");
    });
    server.listen(0, "127.0.0.1");
    module.exports = { server: server };
  `);
  const [, ready] = model.completeListen(server, context);
  expect(() => model.deliverRequest(server, request, ready)).toThrow(/HTTP|host property/);
});

for (const event of ["connection", "error", "close"]) {
  test(`server ${event} registration is a gap until that host event can be delivered`, () => {
    expect(() => load(`
      const http = require("node:http");
      const server = http.createServer(function(req, res) { res.end("ok"); });
      server.on("${event}", function() {});
      server.listen(0, "127.0.0.1");
      module.exports = { server: server };
    `)).toThrow(/HTTP|EventEmitter/);
  });
}

for (const event of ["prefinish", "error", "close"]) {
  test(`response ${event} registration cannot silently omit the native event`, () => {
    const source = `
      const http = require("node:http");
      let calls = 0;
      const server = http.createServer(function(req, res) {
        res.on("${event}", function() { calls = calls + 1; });
        res.end("ok");
      });
      server.listen(0, "127.0.0.1");
      module.exports = { server: server, read: function() { return calls; } };
    `;
    if (event === "prefinish") {
      // This event happens in our otherwise supported successful schedule;
      // accepting its registration and omitting delivery would give false proofs.
      expect(real(source)).toEqual({ before: 0, ready: 0,
        responses: [{ status: 200, body: "ok" }], after: 1, probe: null, uncaught: [] });
    }
    const { model, server, context } = load(source);
    const [, ready] = model.completeListen(server, context);
    expect(() => model.deliverRequest(server, request, ready)).toThrow(/HTTP|EventEmitter/);
  });
}

for (const event of ["listening", "finish"]) {
  test(`the tenth application ${event} listener exposes the unmodeled warning including Node's internal listener`, () => {
    const source = (count: number) => `
      const http = require("node:http");
      let calls = 0;
      const server = http.createServer(function(req, res) {
        ${event === "finish" ? 'res.on("finish", function() { calls = calls + 1; });'.repeat(count) : ""}
        res.end("ok");
      });
      ${event === "listening" ? 'server.on("listening", function() { calls = calls + 1; });'.repeat(count) : ""}
      server.listen(0, "127.0.0.1");
      module.exports = { server: server, read: function() { return calls; } };
    `;
    const { model, exports, server, context } = load(source(9));
    const [, ready] = model.completeListen(server, context);
    const delivered = model.deliverRequest(server, request, ready);
    const [, finished] = model.completeResponse(delivered.response, delivered.result[1]);
    expect(observe(exports, "loaded.read()", finished).value).toMatchObject({ value: 9 });
    if (event === "listening") expect(() => load(source(10))).toThrow(/warning/);
    else {
      const excessive = load(source(10));
      const [, excessiveReady] = excessive.model.completeListen(excessive.server, excessive.context);
      expect(() => excessive.model.deliverRequest(excessive.server, request, excessiveReady)).toThrow(/warning/);
    }
  });
}

for (const operation of ['server.emit("listening")', 'server.emit("request")', 'response.emit("finish")']) {
  test(`public lifecycle emit cannot bypass modeled transitions: ${operation}`, () => {
    const { model, server, context } = load(`
      const http = require("node:http");
      const server = http.createServer(function(req, res) { res.end("ok"); });
      server.listen(0, "127.0.0.1");
      module.exports = { server: server };
    `);
    const [, ready] = model.completeListen(server, context);
    const delivered = model.deliverRequest(server, request, ready);
    expect(() => evaluateCode(operation, setVariablesInScope(delivered.result[1], {
      server, response: delivered.response
    }))).toThrow(/HTTP|EventEmitter/);
  });
}
