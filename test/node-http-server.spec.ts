import { execFileSync } from "child_process";
import { createCommonJSLoader, evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { effectPaths } from "../src/effects";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { createHTTPModel } from "../src/node/http";
import { ESString, TESString } from "../src/string/String";
import { isESNumber, isESString, isThrownValue, WithProperties } from "../src/types";
import { assertPinnedNode, withModuleFixture } from "./commonjs/oracle";

// The North Star is this entire application, including builtin loading,
// callback registration, listening, and later request delivery. The reference
// loads these exact bytes as a CommonJS module; it never extracts or invokes
// the request callback itself.
const healthServerSource = `
  const http = require("node:http");
  const server = http.createServer(function(req, res) {
    if (req.method === "GET" && req.url === "/health") {
      res.statusCode = 200;
      res.end("ok");
    } else {
      res.statusCode = 404;
      res.end("Not found");
    }
  });
  server.listen(0, "127.0.0.1");
  module.exports = server;
`;

// Observers surround Node's real request dispatch without replacing http,
// createServer, listen, the application callback, or response.end. Listening on
// port zero isolates each case. Real network activity occurs only in this
// concrete reference process, never in Prophet's analysis below.
const nodeReference = `
  const http = require("node:http");
  const trace = [];
  let server;
  let observation;
  (async function() {
    try {
      server = require(process.argv[1]);
      const requestListenersAtLoad = server.listenerCount("request");
      trace.push({ kind: "module-loaded", listening: server.listening, noAddress: server.address() === null });
      server.on("close", function() {
        trace.push({ kind: "closed", listening: server.listening });
      });
      server.prependListener("request", function(req, res) {
        trace.push({ kind: "request", method: req.method, url: req.url });
        // Use on rather than once so duplicate finish events would be visible.
        res.on("finish", function() {
          trace.push({ kind: "finish", status: res.statusCode, writableFinished: res.writableFinished });
        });
      });
      server.on("request", function(_req, res) {
        trace.push({ kind: "handler-return", status: res.statusCode, writableEnded: res.writableEnded });
      });
      await new Promise(function(resolve, reject) {
        server.once("error", reject);
        server.once("listening", function() {
          trace.push({ kind: "listening", listening: server.listening });
          resolve();
        });
      });
      const response = await new Promise(function(resolve, reject) {
        const request = http.request({
          hostname: "127.0.0.1", port: server.address().port,
          method: process.argv[2], path: process.argv[3], agent: false
        }, function(response) {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", function(chunk) { body += chunk; });
          response.on("error", reject);
          response.on("end", function() {
            trace.push({ kind: "client-end" });
            resolve({ status: response.statusCode, body: body });
          });
        });
        request.on("error", reject);
        request.end();
      });
      observation = { requestListenersAtLoad: requestListenersAtLoad, response: response, trace: trace };
    } finally {
      if (server) await new Promise(function(resolve) {
        server.close(resolve);
        server.closeAllConnections();
      });
    }
    process.stdout.write(JSON.stringify(observation));
  })().catch(function(error) { console.error(error); process.exitCode = 1; });
`;

interface ServerObservation {
  requestListenersAtLoad: number;
  response: { status: number; body: string };
  trace: object[];
}

function realServerObservation(method: string, path: string): ServerObservation {
  assertPinnedNode();
  return withModuleFixture(healthServerSource, filename => JSON.parse(execFileSync(
    process.env.PROPHET_NODE_BINARY || process.execPath,
    ["--no-global-search-paths", "-e", nodeReference, filename, method, path],
    {
      encoding: "utf8", timeout: 10000,
      env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }, stdio: ["ignore", "pipe", "pipe"]
    }
  )));
}

function modeledServer(method: TESString, url: TESString) {
  const model = createHTTPModel();
  const filename = "/app/health-server.cjs";
  const [server, loaded] = createCommonJSLoader({ [filename]: healthServerSource },
    { builtins: { http: model.module } }).load(filename, nodeInitialExecutionContext);
  expect(isThrownValue(server)).toBe(false);
  expect(isForkedCompletion(server)).toBe(false);
  expect(getProperties(server as WithProperties, loaded).listening).toMatchObject({ value: false });
  // Loading the application performs registration/listen, never request work.
  expect(effectPaths(loaded.value.effects!)[0].events.some(event => event.call.operation === "http.server.request")).toBe(false);
  const [listened, ready] = model.completeListen(server, loaded);
  expect(listened).toBe(server);
  expect(getProperties(server as WithProperties, ready).listening).toMatchObject({ value: true });
  const delivery = model.deliverRequest(server, { method, url }, ready);
  const [completion, handled] = delivery.result;
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(completion).toMatchObject({ type: "undefined" });
  expect(getProperties(delivery.response, handled).writableEnded).toMatchObject({ value: true });
  for (const path of effectPaths(handled.value.effects!)) {
    expect(path.events.filter(event => event.kind === "call" && event.call.operation === "http.response.end"))
      .toHaveLength(1);
    expect(path.events.filter(event => event.kind === "call" && event.call.operation === "http.response.finish"))
      .toHaveLength(0);
  }
  const [finished, context] = model.completeResponse(delivery.response, handled);
  expect(finished).toBe(delivery.response);
  for (const path of effectPaths(context.value.effects!)) {
    expect(path.events.filter(event => event.kind === "call" && event.call.operation === "http.response.finish"))
      .toHaveLength(1);
  }
  return { model, server, response: delivery.response, context,
    wire: model.inspectResponse(delivery.response, context) };
}

describe("Node HTTP North Star: complete application on pinned Node", () => {
  beforeAll(assertPinnedNode);

  const cases: Array<[string, string, number, string]> = [
    ["GET", "/health", 200, "ok"],
    ["POST", "/health", 404, "Not found"],
    ["GET", "/missing", 404, "Not found"],
    ["GET", "/health?probe=1", 404, "Not found"],
    // The callback supplies "Not found", but Node suppresses an HTTP HEAD body.
    ["HEAD", "/health", 404, ""]
  ];
  for (const [method, path, status, body] of cases) {
    test(`${method} ${path} dispatches after listening and finishes exactly one ${status} response`, () => {
      const actual = realServerObservation(method, path);
      expect(actual).toEqual({
        requestListenersAtLoad: 1,
        response: { status, body },
        trace: [
          { kind: "module-loaded", listening: false, noAddress: true },
          { kind: "listening", listening: true },
          { kind: "request", method, url: path },
          { kind: "handler-return", status, writableEnded: true },
          { kind: "finish", status, writableFinished: true },
          { kind: "client-end" },
          { kind: "closed", listening: false }
        ]
      });
      const { wire } = modeledServer(ESString(method), ESString(path));
      if (!isESNumber(wire.statusCode) || !isESString(wire.body)) throw new Error("Expected concrete response");
      expect({ status: wire.statusCode.value, body: wire.body.value }).toEqual(actual.response);
    });
  }
});

test("the entire HTTP app proves its routing and wire response for unknown method and URL", () => {
  // These strings are unrestricted, not a finite list of request fixtures.
  // The host boundary supplies a parsed request after successful listening and
  // later successful response completion; no actual socket is opened here.
  const method = ESString(), url = ESString();
  const { context, wire, response } = modeledServer(method, url);
  const [completion, proved] = evaluateCode(`
    const healthy = method === "GET" && url === "/health";
    const statusCorrect = healthy ? status === 200 : status === 404;
    const bodyCorrect = method === "HEAD" ? body === ""
      : healthy ? body === "ok" : body === "Not found";
    const ended = response.writableEnded;
    const uncertainStatus = status === 200;
    const uncertainBody = body === "ok";
  `, setVariablesInScope(context, {
    method, url, status: wire.statusCode, body: wire.body, response
  }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  for (const name of ["statusCorrect", "bodyCorrect", "ended"]) {
    expect(proved.value.scope[name]).toMatchObject({ value: true });
  }
  for (const name of ["healthy", "uncertainStatus", "uncertainBody"]) {
    expect(proved.value.scope[name]).toMatchObject({ value: undefined });
  }
});
