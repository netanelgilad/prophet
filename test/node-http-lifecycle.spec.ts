import { execFileSync } from "child_process";
import { createCommonJSLoader, evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { effectContext, effectPaths } from "../src/effects";
import { mapCompletions } from "../src/evaluate";
import { assumeInContext } from "../src/execution-context/branches";
import { ExecutionContext, setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { createHTTPModel } from "../src/node/http";
import { ESObject, isESObject, TESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { resolveBoolean, strictEquality } from "../src/symbolic";
import { Any, isThrownValue, Undefined, WithProperties } from "../src/types";
import { assertPinnedNode, withModuleFixture } from "./commonjs/oracle";

const request = { method: ESString("GET"), url: ESString("/") };

function load(source: string, inputs: { [name: string]: Any } = {}) {
  const model = createHTTPModel();
  const filename = "/app/lifecycle.cjs";
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...inputs }) });
  const [exports, context] = createCommonJSLoader({ [filename]: source },
    { builtins: { http: model.module } }).load(filename, initial);
  expect(isThrownValue(exports)).toBe(false);
  expect(isForkedCompletion(exports)).toBe(false);
  if (!isESObject(exports)) throw new Error("Expected object exports");
  return { model, exports, context };
}

function observe(exports: TESObject, expression: string, context: TExecutionContext) {
  const [completion, observed] = evaluateCode(`const observation = (${expression});`,
    setVariablesInScope(context, { loaded: exports }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  return observed.value.scope.observation;
}

// The reference loads complete app modules and sends actual HTTP requests.
// It never calls a saved application listener or substitutes a host method.
const nodeLifecycleReference = `
  const http = require("node:http");
  let servers = [];
  (async function() {
    try {
      const loaded = require(process.argv[1]);
      servers = JSON.parse(process.argv[2]).map(function(name) { return loaded[name]; });
      const before = loaded.read();
      await Promise.all(servers.map(function(server) {
        return new Promise(function(resolve, reject) {
          server.once("error", reject);
          server.once("listening", resolve);
        });
      }));
      const ready = loaded.read();
      const responses = [];
      for (const server of servers) {
        responses.push(await new Promise(function(resolve, reject) {
          const request = http.request({
            hostname: "127.0.0.1", port: server.address().port, path: "/", method: "GET", agent: false
          }, function(response) {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", function(chunk) { body += chunk; });
            response.on("error", reject);
            response.on("end", function() { resolve({ status: response.statusCode, body: body }); });
          });
          request.on("error", reject);
          request.end();
        }));
      }
      process.stdout.write(JSON.stringify({ before: before, ready: ready, responses: responses, after: loaded.read() }));
    } finally {
      await Promise.all(servers.map(function(server) { return new Promise(function(resolve) {
        server.close(resolve);
        server.closeAllConnections();
      }); }));
    }
  })().catch(function(error) { console.error(error); process.exitCode = 1; });
`;

function realLifecycle(source: string, serverNames = ["server"]): object {
  assertPinnedNode();
  return withModuleFixture(source, filename => JSON.parse(execFileSync(
    process.env.PROPHET_NODE_BINARY || process.execPath,
    ["--no-global-search-paths", "-e", nodeLifecycleReference, filename, JSON.stringify(serverNames)],
    { encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" },
      stdio: ["ignore", "pipe", "pipe"] }
  )));
}

test("registered callbacks use the current captured binding and run only when their event is delivered", () => {
  const source = `
    const http = require("node:http");
    let calls = 0;
    let message = "before registration";
    const server = http.createServer(function(req, res) {
      calls = calls + 1;
      res.end(message);
      return "ignored listener return";
    });
    message = "after registration";
    const listenResult = server.listen(0, "127.0.0.1");
    module.exports = { server: server, same: listenResult === server, read: function() { return calls; } };
  `;
  expect(realLifecycle(source)).toEqual({ before: 0, ready: 0,
    responses: [{ status: 200, body: "after registration" }], after: 1 });
  const { model, exports, context } = load(source);
  const server = getProperties(exports, context).server;
  expect(getProperties(exports, context).same).toMatchObject({ value: true });
  expect(observe(exports, "loaded.read()", context)).toMatchObject({ value: 0 });
  const [, ready] = model.completeListen(server, context);
  expect(observe(exports, "loaded.read()", ready)).toMatchObject({ value: 0 });
  const delivered = model.deliverRequest(server, request, ready);
  expect(delivered.result[0]).toBe(Undefined);
  expect(observe(exports, "loaded.read()", delivered.result[1])).toMatchObject({ value: 1 });
  expect(model.inspectResponse(delivered.response, delivered.result[1])).toMatchObject({
    statusCode: { value: 200 }, body: { value: "after registration" }
  });
  // Advancing one context cannot update a previous persistent snapshot.
  expect(observe(exports, "loaded.read()", context)).toMatchObject({ value: 0 });
});

test("listen callbacks are deferred, receive the server as this, and precede later requests", () => {
  const source = `
    const http = require("node:http");
    let trace = "registered";
    const server = http.createServer(function(req, res) {
      trace = trace + ":request";
      res.end(this === server ? trace : "wrong request receiver");
    });
    server.listen(0, "127.0.0.1", function() {
      trace = trace + (this === server ? ":listening" : ":wrong receiver");
      return "ignored listen return";
    });
    module.exports = { server: server, read: function() { return trace; } };
  `;
  expect(realLifecycle(source)).toEqual({ before: "registered", ready: "registered:listening",
    responses: [{ status: 200, body: "registered:listening:request" }], after: "registered:listening:request" });
  const { model, exports, context } = load(source);
  const server = getProperties(exports, context).server;
  expect(observe(exports, "loaded.read()", context)).toMatchObject({ value: "registered" });
  const [value, ready] = model.completeListen(server, context);
  expect(value).toBe(server);
  expect(observe(exports, "loaded.read()", ready)).toMatchObject({ value: "registered:listening" });
  const delivered = model.deliverRequest(server, request, ready);
  expect(model.inspectResponse(delivered.response, delivered.result[1]).body)
    .toMatchObject({ value: "registered:listening:request" });
});

test("each server owns its registered listener and callback receiver", () => {
  const source = `
    const http = require("node:http");
    let calls = 0;
    const first = http.createServer(function(req, res) {
      calls = calls + 1;
      res.end(this === first ? "first" : "wrong receiver");
    });
    const second = http.createServer(function(req, res) {
      calls = calls + 10;
      res.end(this === second ? "second" : "wrong receiver");
    });
    first.listen(0, "127.0.0.1");
    second.listen(0, "127.0.0.1");
    module.exports = { first: first, second: second, read: function() { return calls; } };
  `;
  expect(realLifecycle(source, ["first", "second"])).toEqual({ before: 0, ready: 0,
    responses: [{ status: 200, body: "first" }, { status: 200, body: "second" }], after: 11 });
  const { model, exports, context } = load(source);
  const first = getProperties(exports, context).first, second = getProperties(exports, context).second;
  expect(first).not.toBe(second);
  const [, firstReady] = model.completeListen(first, context);
  const [, ready] = model.completeListen(second, firstReady);
  const firstDelivery = model.deliverRequest(first, request, ready);
  expect(observe(exports, "loaded.read()", firstDelivery.result[1])).toMatchObject({ value: 1 });
  expect(model.inspectResponse(firstDelivery.response, firstDelivery.result[1]).body).toMatchObject({ value: "first" });
  const secondDelivery = model.deliverRequest(second, request, firstDelivery.result[1]);
  expect(observe(exports, "loaded.read()", secondDelivery.result[1])).toMatchObject({ value: 11 });
  expect(model.inspectResponse(secondDelivery.response, secondDelivery.result[1]).body).toMatchObject({ value: "second" });
});

test("a returned listener value does not fabricate an HTTP response", () => {
  const { model, exports, context } = load(`
    const http = require("node:http");
    const server = http.createServer(function() { return "not a response"; });
    server.listen(0, "127.0.0.1");
    module.exports = { server: server };
  `);
  const server = getProperties(exports, context).server;
  const [, ready] = model.completeListen(server, context);
  const delivered = model.deliverRequest(server, request, ready);
  expect(delivered.result[0]).toBe(Undefined);
  expect(getProperties(delivered.response, delivered.result[1]).writableEnded).toMatchObject({ value: false });
  expect(model.inspectResponse(delivered.response, delivered.result[1])).toEqual({ body: Undefined, statusCode: Undefined });
  expect(() => model.completeResponse(delivered.response, delivered.result[1])).toThrow(/HTTP/);
});

test("a thrown request callback preserves earlier effects and propagates without fabricating 500", () => {
  const { model, exports, context } = load(`
    const http = require("node:http");
    let calls = 0;
    const server = http.createServer(function() { calls = calls + 1; throw "listener failed"; });
    server.listen(0, "127.0.0.1");
    module.exports = { server: server, read: function() { return calls; } };
  `);
  const server = getProperties(exports, context).server;
  const [, ready] = model.completeListen(server, context);
  const delivered = model.deliverRequest(server, request, ready);
  expect(delivered.result[0]).toMatchObject({ type: "ThrownValue", value: { value: "listener failed" } });
  expect(observe(exports, "loaded.read()", delivered.result[1])).toMatchObject({ value: 1 });
  expect(model.inspectResponse(delivered.response, delivered.result[1])).toEqual({ body: Undefined, statusCode: Undefined });
  expect(effectPaths(delivered.result[1].value.effects!)[0].events
    .filter(event => event.call.operation === "http.response.end")).toHaveLength(0);
});

test("a conditional callback throw retains its completion, updated capture, and separate response state", () => {
  const fails = ESBoolean();
  const { model, exports, context } = load(`
    const http = require("node:http");
    let calls = 0;
    const server = http.createServer(function(req, res) {
      calls = calls + 1;
      if (fails) throw "listener failed";
      res.end("ok");
    });
    server.listen(0, "127.0.0.1");
    module.exports = { server: server, read: function() { return calls; } };
  `, { fails });
  const server = getProperties(exports, context).server;
  const [, ready] = model.completeListen(server, context);
  const delivered = model.deliverRequest(server, request, ready);
  expect(isForkedCompletion(delivered.result[0])).toBe(true);
  mapCompletions(delivered.result, (completion, branch) => {
    const failed = resolveBoolean(fails, branch.value.knowledge);
    expect(failed).not.toBeUndefined();
    expect(isThrownValue(completion)).toBe(failed);
    expect(observe(exports, "loaded.read()", branch)).toMatchObject({ value: 1 });
    const wire = model.inspectResponse(delivered.response, branch);
    if (failed) {
      expect(completion).toMatchObject({ type: "ThrownValue", value: { value: "listener failed" } });
      expect(wire).toEqual({ body: Undefined, statusCode: Undefined });
      expect(getProperties(delivered.response, branch).writableEnded).toMatchObject({ value: false });
    } else {
      expect(completion).toBe(Undefined);
      expect(wire).toMatchObject({ body: { value: "ok" }, statusCode: { value: 200 } });
      expect(getProperties(delivered.response, branch).writableEnded).toMatchObject({ value: true });
    }
    return [completion, branch];
  });
  for (const path of effectPaths(delivered.result[1].value.effects!)) {
    const failed = resolveBoolean(fails, path.knowledge);
    expect(path.events.filter(event => event.kind === "call" && event.call.operation === "http.response.end"))
      .toHaveLength(failed ? 0 : 1);
    expect(path.events.filter(event => event.call.operation === "http.server.request").map(event => event.kind))
      .toEqual(["call", failed ? "throw" : "return"]);
  }
  expect(() => model.completeResponse(delivered.response, delivered.result[1])).toThrow(/HTTP/);
  expect(() => model.completeResponse(delivered.response,
    assumeInContext(delivered.result[1], fails, true))).toThrow(/HTTP/);
  const [finished] = model.completeResponse(delivered.response,
    assumeInContext(delivered.result[1], fails, false));
  expect(finished).toBe(delivered.response);
});

test("conditional startup cannot silently become an unconditional listening server", () => {
  const enabled = ESBoolean();
  const { model, exports, context } = load(`
    const http = require("node:http");
    const server = http.createServer(function(req, res) { res.end("ok"); });
    if (enabled) server.listen(0, "127.0.0.1");
    module.exports = { server: server };
  `, { enabled });
  const server = getProperties(exports, context).server;
  expect(() => model.completeListen(server, context)).toThrow(/HTTP/);
  expect(() => model.deliverRequest(server, request, context)).toThrow(/HTTP/);
  expect(() => model.completeListen(server, assumeInContext(context, enabled, false))).toThrow(/HTTP/);
  const [, ready] = model.completeListen(server, assumeInContext(context, enabled, true));
  const delivered = model.deliverRequest(server, request, ready);
  expect(model.inspectResponse(delivered.response, delivered.result[1]).body).toMatchObject({ value: "ok" });
});

test("requests cannot run before listening completes or on a server from another model", () => {
  const source = `
    const http = require("node:http");
    const server = http.createServer(function(req, res) { res.end("ok"); });
    server.listen(0, "127.0.0.1");
    module.exports = { server: server };
  `;
  const first = load(source), second = load(source);
  const server = getProperties(first.exports, first.context).server;
  expect(() => first.model.deliverRequest(server, request, first.context)).toThrow(/HTTP/);
  expect(() => second.model.completeListen(server, second.context)).toThrow(/HTTP/);
  const [, ready] = first.model.completeListen(server, first.context);
  expect(() => first.model.completeListen(server, ready)).toThrow(/HTTP/);
  expect(getProperties(server as WithProperties, first.context).listening).toMatchObject({ value: false });
  expect(getProperties(server as WithProperties, ready).listening).toMatchObject({ value: true });
});

for (const source of [
  'require("node:http").createServer({});',
  'require("node:http").createServer(function() {}).listen(3000);'
]) {
  test(`unsupported HTTP overloads and APIs remain explicit gaps: ${source}`, () => {
    expect(() => load(source)).toThrow(/HTTP|host property/);
  });
}

test("HTTP UTF-8 serialization replaces an unpaired surrogate as Node does", () => {
  const source = `
    const http = require("node:http");
    const server = http.createServer(function(req, res) { res.end("bad\\ud800"); });
    server.listen(0, "127.0.0.1");
    module.exports = { server: server, read: function() { return 0; } };
  `;
  expect(realLifecycle(source)).toEqual({ before: 0, ready: 0,
    responses: [{ status: 200, body: "bad\ufffd" }], after: 0 });
  const { model, exports, context } = load(source);
  const server = getProperties(exports, context).server;
  const [, ready] = model.completeListen(server, context);
  const delivered = model.deliverRequest(server, request, ready);
  expect(model.inspectResponse(delivered.response, delivered.result[1]).body).toMatchObject({ value: "bad\ufffd" });
});

test("an unknown response string stays unknown after UTF-8 encoding, while HEAD still suppresses it", () => {
  // No well-formed UTF-16 assumption: an arbitrary JS string may contain lone
  // surrogates, so wire text cannot be asserted identical to the source string.
  const payload = ESString();
  const { model, exports, context } = load(`
    const http = require("node:http");
    const server = http.createServer(function(req, res) { res.end(payload); });
    server.listen(0, "127.0.0.1");
    module.exports = { server: server };
  `, { payload });
  const server = getProperties(exports, context).server;
  const [, ready] = model.completeListen(server, context);
  const delivered = model.deliverRequest(server, request, ready);
  const wire = model.inspectResponse(delivered.response, delivered.result[1]);
  expect(wire.body).toMatchObject({ type: "string", value: undefined });
  expect(strictEquality(wire.body, payload, delivered.result[1].value.knowledge)).toMatchObject({ value: undefined });
  const head = model.deliverRequest(server, { method: ESString("HEAD"), url: ESString("/") }, ready);
  expect(model.inspectResponse(head.response, head.result[1]).body).toMatchObject({ value: "" });
});

// Matching native observations live in node-http-lifecycle-reference.spec.ts.
// They exercise real sockets and finish listeners. Here the explicit host
// schedule delivers successful completion; event registration is covered in
// node-http-events.spec.ts.
for (const [method, status, argument, expectedBody, wireStatus = status] of [
  ["GET", 200, '"payload"', "payload"],
  ["GET", 200, '""', ""],
  ["GET", 200, "", ""],
  ["GET", 200, "null", ""],
  ["GET", 204, '"payload"', ""],
  ["GET", 304, '"payload"', ""],
  ["HEAD", 200, '"payload"', ""],
  ["GET", 4294967496, '"payload"', "payload", 200]
] as Array<[string, number, string, string, number?]>) {
  test(`${method} ${status} end(${argument}) matches Node flags, body suppression, and captured wire status`, () => {
    const { model, exports, context } = load(`
      const http = require("node:http");
      let same = false;
      const server = http.createServer(function(req, res) {
        res.statusCode = ${status};
        same = res.end(${argument}) === res;
        res.statusCode = 201;
      });
      server.listen(0, "127.0.0.1");
      module.exports = { server: server, read: function() { return same; } };
    `);
    const server = getProperties(exports, context).server;
    const [, ready] = model.completeListen(server, context);
    const delivered = model.deliverRequest(server, { method: ESString(method), url: ESString("/") }, ready);
    const handled = delivered.result[1];
    expect(observe(exports, "loaded.read()", handled)).toMatchObject({ value: true });
    const events = effectPaths(handled.value.effects!)[0].events
      .filter(event => event.call.operation === "http.response.end");
    expect(events).toHaveLength(2);
    expect(getProperties(delivered.response, effectContext(events[0], handled))).toMatchObject({
      statusCode: { value: status }, headersSent: { value: false },
      writableEnded: { value: false }, writableFinished: { value: false }
    });
    expect(getProperties(delivered.response, effectContext(events[1], handled))).toMatchObject({
      statusCode: { value: wireStatus }, headersSent: { value: true },
      writableEnded: { value: true }, writableFinished: { value: false }
    });
    expect(getProperties(delivered.response, handled).statusCode).toMatchObject({ value: 201 });
    expect(model.inspectResponse(delivered.response, handled)).toMatchObject({
      statusCode: { value: wireStatus }, body: { value: expectedBody }
    });
    const [result, finished] = model.completeResponse(delivered.response, handled);
    expect(result).toBe(delivered.response);
    expect(getProperties(delivered.response, finished)).toMatchObject({
      statusCode: { value: 201 }, headersSent: { value: true },
      writableEnded: { value: true }, writableFinished: { value: true }
    });
    expect(model.inspectResponse(delivered.response, finished)).toMatchObject({
      statusCode: { value: wireStatus }, body: { value: expectedBody }
    });
    expect(() => model.completeResponse(delivered.response, finished)).toThrow(/HTTP/);
  });
}

test("host field values do not fabricate unsupported own-property descriptor knowledge", () => {
  const { model, exports, context } = load(`
    const http = require("node:http");
    const server = http.createServer(function(req, res) { res.end("ok"); });
    server.listen(0, "127.0.0.1");
    module.exports = { server: server, createServer: http.createServer };
  `);
  const server = getProperties(exports, context).server;
  const [, ready] = model.completeListen(server, context);
  const delivered = model.deliverRequest(server, request, ready);
  for (const expression of [
    'Object.prototype.hasOwnProperty.call(server, "listening")',
    'Object.prototype.hasOwnProperty.call(response, "statusCode")',
    'Object.prototype.hasOwnProperty.call(createServer, "prototype")'
  ]) {
    expect(() => evaluateCode(expression, setVariablesInScope(delivered.result[1], {
      server, response: delivered.response, createServer: getProperties(exports, context).createServer
    }))).toThrow("Unmodeled host own-property inspection");
  }
});

for (const invalidStatus of ["99", "1000", "NaN"]) {
  test(`invalid numeric status ${invalidStatus} throws before output and permits a recovery response`, () => {
    const source = `
      const http = require("node:http");
      let failure = null;
      const server = http.createServer(function(req, res) {
        res.statusCode = ${invalidStatus};
        try { res.end("must not be sent"); }
        catch (error) {
          failure = {
            name: error.name, code: error.code, message: error.message,
            headersSent: res.headersSent, writableEnded: res.writableEnded
          };
          res.statusCode = 200;
          res.end("recovered");
        }
      });
      server.listen(0, "127.0.0.1");
      module.exports = { server: server, read: function() { return failure; } };
    `;
    const failure: { [name: string]: string | boolean } = {
      name: "RangeError", code: "ERR_HTTP_INVALID_STATUS_CODE",
      message: `Invalid status code: ${invalidStatus}`, headersSent: false, writableEnded: false
    };
    expect(realLifecycle(source)).toEqual({ before: null, ready: null,
      responses: [{ status: 200, body: "recovered" }], after: failure });
    const { model, exports, context } = load(source);
    const server = getProperties(exports, context).server;
    const [, ready] = model.completeListen(server, context);
    const delivered = model.deliverRequest(server, request, ready);
    expect(delivered.result[0]).toBe(Undefined);
    const handled = delivered.result[1];
    for (const name of Object.keys(failure)) {
      expect(observe(exports, `loaded.read().${name}`, handled)).toMatchObject({ value: failure[name] });
    }
    const endEvents = effectPaths(handled.value.effects!)[0].events
      .filter(event => event.call.operation === "http.response.end");
    expect(endEvents.map(event => event.kind)).toEqual(["call", "throw", "call", "return"]);
    const failedContext = effectContext(endEvents[1], handled);
    expect(model.inspectResponse(delivered.response, failedContext))
      .toEqual({ statusCode: Undefined, body: Undefined });
    expect(getProperties(delivered.response, failedContext)).toMatchObject({
      headersSent: { value: false }, writableEnded: { value: false }, writableFinished: { value: false }
    });
    expect(model.inspectResponse(delivered.response, handled)).toMatchObject({
      statusCode: { value: 200 }, body: { value: "recovered" }
    });
  });
}
