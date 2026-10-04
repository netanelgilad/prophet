import { spawnSync } from "child_process";
import { assertPinnedNode } from "./commonjs/oracle";

// Local native reference evidence for the first startup-notification schedule.
// This is not a substitute for complete upstream nextTick coverage:
// https://github.com/nodejs/node/blob/v24.21.0/test/parallel/test-next-tick-ordering.js
// https://github.com/nodejs/node/blob/v24.21.0/test/parallel/test-next-tick-ordering2.js
// https://github.com/nodejs/node/blob/v24.21.0/test/parallel/test-next-tick-errors.js
// The whole error case installs uncaughtException and resumes later callbacks;
// our fatal cases intentionally use the default domain with no such handler.
const reference = `
  const http = require("node:http");
  const fs = require("node:fs");
  const mode = process.argv[1];
  const trace = [];
  const first = http.createServer();
  const second = http.createServer();
  let owner;
  let failureCode;
  function output(label) { trace.push(label); console.log(label); }
  function observation(extra) {
    fs.writeSync(1, "OBSERVATION " + JSON.stringify({ trace, failureCode,
      firstListening: first.listening, secondListening: second.listening,
      ...extra }) + "\\n");
  }
  async function close(server) {
    if (!server || !server.listening) return;
    server.closeAllConnections();
    await new Promise(function(resolve) { server.close(resolve); });
  }
  (async function() {
    try {
      if (mode === "retry" || mode === "bind-failure") {
        owner = http.createServer();
        await new Promise(function(resolve, reject) {
          owner.once("error", reject);
          owner.listen(0, resolve);
        });
      }
      if (mode === "bind-failure" || mode === "callback-failure") {
        // A monitor observes the fatal default behavior without handling it.
        // Node's fatal exit closes these isolated child-process sockets.
        process.once("uncaughtExceptionMonitor", function(error, origin) {
          observation({ origin, error: { name: error.name, code: error.code, message: error.message } });
        });
      }
      if (mode === "ordered") {
        first.listen(0, function() { output("first"); });
        const completed = new Promise(function(resolve) {
          second.listen(0, function() { output("second"); resolve(); });
        });
        output("top");
        await completed;
        observation({});
      } else if (mode === "explicit-first") {
        const completed = new Promise(function(resolve) {
          first.listen(0, "127.0.0.1", function() { output("first"); resolve(); });
        });
        second.listen(0, function() { output("second"); });
        output("top");
        await completed;
        observation({});
      } else if (mode === "retry") {
        const completed = new Promise(function(resolve) {
          first.once("error", function(error) {
            failureCode = error.code;
            output("error");
            // A fresh OS-selected port avoids racing to reacquire the occupied
            // port. This enqueues another notification during error delivery.
            first.listen(0, function() { output("retry-callback"); resolve(); });
          });
        });
        first.listen(owner.address().port, function() { output("original-callback"); });
        second.listen(0, function() { output("second"); });
        output("top");
        await completed;
        observation({});
      } else {
        if (mode === "bind-failure") {
          first.listen(owner.address().port, function() { output("first"); });
        } else {
          first.listen(0, function() { output("first"); throw new Error("callback failure"); });
        }
        second.listen(0, function() { output("second"); });
        output("top");
        // Keep setup cleanup from closing the servers before the queued fatal
        // notification. spawnSync bounds a failure of the expected fatal exit.
        await new Promise(function() {});
      }
    } finally {
      await close(first);
      await close(second);
      await close(owner);
    }
  })().catch(function(error) { console.error(error); process.exitCode = 1; });
`;

function observe(mode: "ordered" | "explicit-first" | "retry" | "bind-failure" | "callback-failure") {
  assertPinnedNode();
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ["--no-global-search-paths", "-e", reference, mode], {
      encoding: "utf8", timeout: 10000,
      env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }
    });
  expect(child.error).toBeUndefined();
  expect(child.signal).toBeNull();
  const fatal = mode === "bind-failure" || mode === "callback-failure";
  expect(child.status).toBe(fatal ? 1 : 0);
  if (mode === "bind-failure") expect(child.stderr).toMatch(/Unhandled 'error' event[\s\S]*EADDRINUSE/);
  else if (mode === "callback-failure") expect(child.stderr).toMatch(/Error: callback failure/);
  else expect(child.stderr).toBe("");
  const lines = child.stdout.replace(/\n$/, "").split("\n");
  const encoded = lines.pop()!;
  expect(encoded.startsWith("OBSERVATION ")).toBe(true);
  const result = JSON.parse(encoded.slice("OBSERVATION ".length));
  // These lines came from the real console, which the reference never replaces.
  expect(lines).toEqual(result.trace);
  return result;
}

test("hostless startup notifications run after top-level output in listen-call order", () => {
  expect(observe("ordered")).toEqual({ trace: ["top", "first", "second"],
    firstListening: true, secondListening: true });
});

test("an explicit IPv4 host adds a lookup turn before its listening notification", () => {
  expect(observe("explicit-first")).toEqual({ trace: ["top", "second", "first"],
    firstListening: true, secondListening: true });
});

test("a bind-error handler's retry notification follows startup notifications already queued", () => {
  expect(observe("retry")).toEqual({ trace: ["top", "error", "second", "original-callback", "retry-callback"],
    failureCode: "EADDRINUSE", firstListening: true, secondListening: true });
});

test("an unhandled bind error terminates before a later queued server's listening callback", () => {
  const result = observe("bind-failure");
  expect(result).toMatchObject({ trace: ["top"], origin: "uncaughtException",
    firstListening: false, secondListening: true, error: { name: "Error", code: "EADDRINUSE" } });
});

test("an unhandled listening-callback exception terminates before later queued notifications", () => {
  const result = observe("callback-failure");
  expect(result).toEqual({ trace: ["top", "first"], origin: "uncaughtException",
    firstListening: true, secondListening: true, error: { name: "Error", message: "callback failure" } });
});
