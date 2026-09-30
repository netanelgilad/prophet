import { execFileSync } from "child_process";
import { createCommonJSLoader, nodeInitialExecutionContext } from "../src";
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

function realServerObservation(method: string, path: string): object {
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
      expect(realServerObservation(method, path)).toEqual({
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
    });
  }
});

test("analysis gap: the same complete HTTP app stops at unsupported builtin loading", () => {
  // Replace this rejection with full-app assertions as the node:http boundary
  // is implemented. Passing this test records a gap; it is not a server proof.
  const filename = "/app/health-server.cjs";
  expect(() => createCommonJSLoader({ [filename]: healthServerSource })
    .load(filename, nodeInitialExecutionContext))
    .toThrow("CommonJS builtin loading is not yet supported");
});
