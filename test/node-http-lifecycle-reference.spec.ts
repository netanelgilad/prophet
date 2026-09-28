import { execFileSync } from "child_process";
import { assertPinnedNode } from "./commonjs/oracle";

// Independent concrete checks of the declared live, successful connection.
// These are local compatibility specs, not complete upstream Node cases.
const lifecycleReference = `
  const http = require("node:http");
  const method = process.argv[1];
  const status = Number(process.argv[2]);
  const payload = process.argv[3];
  const events = [];
  let server;
  let response;
  function snapshot(res) {
    return { status: res.statusCode, headersSent: res.headersSent,
      ended: res.writableEnded, finished: res.writableFinished };
  }
  (async function() {
    try {
      server = http.createServer(function(req, res) {
        events.push({ kind: "before", receiver: this === server, state: snapshot(res) });
        res.statusCode = status;
        res.on("finish", function() {
          events.push({ kind: "finish", state: snapshot(res) });
        });
        const returned = payload === "omitted" ? res.end() :
          payload === "null" ? res.end(null) :
          payload === "surrogate" ? res.end("\\ud800") : res.end(payload);
        events.push({ kind: "after", same: returned === res, state: snapshot(res) });
        res.statusCode = 201;
        events.push({ kind: "mutated", state: snapshot(res) });
      });
      await new Promise(function(resolve, reject) {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      response = await new Promise(function(resolve, reject) {
        const request = http.request({ host: "127.0.0.1", port: server.address().port,
          method: method, path: "/", agent: false }, function(incoming) {
          let body = "";
          incoming.setEncoding("utf8");
          incoming.on("data", function(chunk) { body += chunk; });
          incoming.on("error", reject);
          incoming.on("end", function() { resolve({ status: incoming.statusCode, body: body }); });
        });
        request.on("error", reject);
        request.end();
      });
    } finally {
      if (server) await new Promise(function(resolve) {
        server.close(resolve);
        server.closeAllConnections();
      });
    }
    process.stdout.write(JSON.stringify({ events: events, response: response }));
  })().catch(function(error) { console.error(error); process.exitCode = 1; });
`;

describe("pinned Node HTTP response lifecycle reference", () => {
  beforeAll(assertPinnedNode);

  for (const [method, status, payload, body, normalizedStatus] of [
    ["GET", 200, "payload", "payload"],
    ["GET", 200, "omitted", ""],
    ["GET", 200, "null", ""],
    ["GET", 200, "", ""],
    ["GET", 200, "surrogate", "�"],
    ["GET", 204, "payload", ""],
    ["GET", 304, "payload", ""],
    ["HEAD", 200, "payload", ""],
    ["GET", 4294967496, "payload", "payload", 200]
  ] as Array<[string, number, string, string, number?]>) {
    test(`${method} status ${status} end(${JSON.stringify(payload)}) separates end from finish and wire state`, () => {
      const wireStatus = normalizedStatus === undefined ? status : normalizedStatus;
      const observed = JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
        ["--no-global-search-paths", "-e", lifecycleReference, method, String(status), payload], {
          encoding: "utf8", timeout: 10000,
          env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }, stdio: ["ignore", "pipe", "pipe"]
        }));
      expect(observed).toEqual({
        events: [
          { kind: "before", receiver: true,
            state: { status: 200, headersSent: false, ended: false, finished: false } },
          { kind: "after", same: true,
            state: { status: wireStatus, headersSent: true, ended: true, finished: false } },
          { kind: "mutated",
            state: { status: 201, headersSent: true, ended: true, finished: false } },
          { kind: "finish",
            state: { status: 201, headersSent: true, ended: true, finished: true } }
        ],
        response: { status: wireStatus, body }
      });
    });
  }
});
