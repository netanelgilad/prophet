import { spawnSync } from "child_process";
import { assertPinnedNode } from "./commonjs/oracle";

// Independent local compatibility evidence, not a trimmed upstream test.
// Complete candidates reviewed at the pinned release:
// https://github.com/nodejs/node/blob/v24.21.0/test/parallel/test-net-eaddrinuse.js
// https://github.com/nodejs/node/blob/v24.21.0/test/parallel/test-net-listen-error.js
// https://github.com/nodejs/node/blob/v24.21.0/test/parallel/test-net-better-error-messages-listen.js
// Their common/assert harness and full net/server/host/platform domains remain
// separate from these concrete HTTP observations and Prophet's modeled cases.
const reference = `
  const http = require("node:http");
  const fs = require("node:fs");
  const util = require("node:util");
  const mode = process.argv[1];
  const trace = [];
  let owner;
  let server;
  let calls = 0;
  let returned;
  let port;
  function snapshot() {
    return { listening: server.listening, noAddress: server.address() === null,
      callbacks: calls, listeners: server.listenerCount("listening") };
  }
  function inspectError(error) {
    return { name: error.name, code: error.code, syscall: error.syscall,
      address: error.address, port: error.port, errno: error.errno,
      errnoName: util.getSystemErrorName(error.errno), message: error.message,
      instanceOfError: error instanceof Error, constructorIsError: error.constructor === Error,
      ownName: Object.prototype.hasOwnProperty.call(error, "name"),
      ownFields: Object.getOwnPropertyNames(error).sort(), enumerableFields: Object.keys(error).sort() };
  }
  async function close(value) {
    if (!value || !value.listening) return;
    value.closeAllConnections();
    await new Promise(function(resolve) { value.close(resolve); });
  }
  function callback(label) {
    return function() {
      calls++;
      trace.push({ kind: label, receiver: this === server, listening: server.listening,
        arguments: arguments.length });
    };
  }
  (async function() {
    try {
      server = http.createServer();
      server.on("listening", function() {
        trace.push({ kind: "listening", receiver: this === server, listening: server.listening });
      });
      if (mode === "success") {
        const ready = new Promise(function(resolve, reject) {
          server.once("error", reject);
          server.once("listening", resolve);
        });
        const before = snapshot();
        returned = server.listen(0, callback("callback"));
        const afterReturn = snapshot();
        trace.push({ kind: "returned", same: returned === server, listening: server.listening });
        await ready;
        process.stdout.write(JSON.stringify({ before, afterReturn, ready: snapshot(), trace }));
        return;
      }
      owner = http.createServer();
      await new Promise(function(resolve, reject) {
        owner.once("error", reject);
        owner.listen(0, resolve);
      });
      port = owner.address().port;
      const before = snapshot();
      if (mode === "unhandled") {
        // Monitoring observes but does not handle the exception. Node still
        // exits with its normal unhandled-error status and closes OS handles.
        process.once("uncaughtExceptionMonitor", function(error, origin) {
          fs.writeSync(1, JSON.stringify({ before, afterReturn, observed: snapshot(),
            trace, port, origin, error: inspectError(error) }));
        });
        returned = server.listen(port, callback("callback"));
        const afterReturn = snapshot();
        trace.push({ kind: "returned", same: returned === server, listening: server.listening });
        await new Promise(function() {});
        return;
      }
      let errorReceiver;
      let errorArguments;
      const failed = new Promise(function(resolve) {
        server.once("error", function(error) {
          errorReceiver = this === server;
          errorArguments = arguments.length;
          trace.push({ kind: "error", listening: server.listening });
          resolve(error);
        });
      });
      returned = server.listen(port, callback("first-callback"));
      const afterReturn = snapshot();
      trace.push({ kind: "returned", same: returned === server, listening: server.listening });
      const error = await failed;
      await new Promise(setImmediate);
      const afterFailure = snapshot();
      if (mode === "retry") {
        await close(owner);
        const ready = new Promise(function(resolve, reject) {
          server.once("error", reject);
          server.once("listening", resolve);
        });
        // Port zero makes retry success independent of a race for the released
        // port. The old once-listening callback belongs to the same server.
        const retryReturned = server.listen(0, callback("retry-callback"));
        trace.push({ kind: "retry-returned", same: retryReturned === server, listening: server.listening });
        await ready;
      }
      process.stdout.write(JSON.stringify({ before, afterReturn, afterFailure, ready: snapshot(),
        trace, port, errorReceiver, errorArguments, error: inspectError(error) }));
    } finally {
      await close(server);
      await close(owner);
    }
  })().catch(function(error) { console.error(error); process.exitCode = 1; });
`;

function observe(mode: "success" | "handled" | "unhandled" | "retry") {
  assertPinnedNode();
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ["--no-global-search-paths", "-e", reference, mode], {
      encoding: "utf8", timeout: 10000,
      env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }
    });
  expect(child.error).toBeUndefined();
  expect(child.signal).toBeNull();
  expect(child.status).toBe(mode === "unhandled" ? 1 : 0);
  if (mode === "unhandled") expect(child.stderr).toMatch(/Unhandled 'error' event[\s\S]*EADDRINUSE/);
  else expect(child.stderr).toBe("");
  return JSON.parse(child.stdout);
}

function expectAddressInUse(observation: any) {
  expect(Number.isInteger(observation.port)).toBe(true);
  expect(observation.port).toBeGreaterThan(0);
  expect(observation.error).toMatchObject({
    name: "Error", code: "EADDRINUSE", syscall: "listen", port: observation.port,
    errnoName: "EADDRINUSE", instanceOfError: true, constructorIsError: true, ownName: false,
    ownFields: ["address", "code", "errno", "message", "port", "stack", "syscall"],
    enumerableFields: ["address", "code", "errno", "port", "syscall"]
  });
  // Hostless listen selects an unspecified IPv6 address or falls back to IPv4.
  // errno is a platform libuv code, not one portable numeric constant.
  expect(["::", "0.0.0.0"]).toContain(observation.error.address);
  expect(Number.isInteger(observation.error.errno)).toBe(true);
  expect(observation.error.errno).toBeLessThan(0);
  expect(observation.error.message).toBe(
    `listen EADDRINUSE: address already in use ${observation.error.address}:${observation.port}`
  );
}

test("numeric hostless successful listen returns with listening true before delivering its event and callback", () => {
  const observed = observe("success");
  expect(observed.before).toMatchObject({ listening: false, noAddress: true, callbacks: 0 });
  expect(observed.afterReturn).toMatchObject({ listening: true, noAddress: false, callbacks: 0 });
  expect(observed.ready).toMatchObject({ listening: true, noAddress: false, callbacks: 1 });
  expect(observed.trace).toEqual([
    { kind: "returned", same: true, listening: true },
    { kind: "listening", receiver: true, listening: true },
    { kind: "callback", receiver: true, listening: true, arguments: 0 }
  ]);
});

test("occupied-port listen returns normally with listening false and later emits a handled error without calling success", () => {
  const observed = observe("handled");
  expectAddressInUse(observed);
  // HTTP's own listening listener is present alongside our observer.
  expect(observed.before).toEqual({ listening: false, noAddress: true, callbacks: 0, listeners: 2 });
  expect(observed.afterReturn).toEqual({ listening: false, noAddress: true, callbacks: 0, listeners: 3 });
  expect(observed.afterFailure).toEqual(observed.afterReturn);
  expect(observed.ready).toEqual(observed.afterReturn);
  expect(observed.errorReceiver).toBe(true);
  expect(observed.errorArguments).toBe(1);
  expect(observed.trace).toEqual([
    { kind: "returned", same: true, listening: false },
    { kind: "error", listening: false }
  ]);
});

test("an unhandled occupied-port error is asynchronous and terminates the child instead of throwing from listen", () => {
  const observed = observe("unhandled");
  expectAddressInUse(observed);
  expect(observed.origin).toBe("uncaughtException");
  expect(observed.afterReturn).toEqual({ listening: false, noAddress: true, callbacks: 0, listeners: 3 });
  expect(observed.observed).toEqual(observed.afterReturn);
  expect(observed.trace).toEqual([{ kind: "returned", same: true, listening: false }]);
});

test("a failed bind retains its listening callback until a later successful listen on that server", () => {
  const observed = observe("retry");
  expectAddressInUse(observed);
  expect(observed.afterFailure).toEqual({ listening: false, noAddress: true, callbacks: 0, listeners: 3 });
  expect(observed.ready).toEqual({ listening: true, noAddress: false, callbacks: 2, listeners: 2 });
  expect(observed.trace).toEqual([
    { kind: "returned", same: true, listening: false },
    { kind: "error", listening: false },
    { kind: "retry-returned", same: true, listening: true },
    { kind: "listening", receiver: true, listening: true },
    { kind: "first-callback", receiver: true, listening: true, arguments: 0 },
    { kind: "retry-callback", receiver: true, listening: true, arguments: 0 }
  ]);
});
