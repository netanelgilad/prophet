import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve, sep } from "path";
import { assertPinnedNode } from "./commonjs/oracle";

const fixtureDirectory = resolve(__dirname, "fixtures/pico-static-server-3.0.3");
const packageDirectory = join(fixtureDirectory, "package");
const marker = "PROPHET_PICO_OBSERVATION ";
const fileBody = "hello from pico\n";
const indexBody = "<h1>ready</h1>\n";

// All application code is the original published package. This driver calls
// its public factory with trusted concrete options; its actual registered
// listener receives one real HTTP request. The package has no host option and
// listens on Node's default wildcard address; clients connect only to loopback.
// No actual filesystem/socket operation is part of symbolic exploration.
// Filesystem observers delegate to the original Node functions and preserve
// their return/throw behavior; they are installed AFTER loading the package so
// CommonJS's own reads do not look like request effects.
const referenceDriver = `
  const fs = require("node:fs");
  const http = require("node:http");
  const path = require("node:path");
  const output = fs.writeSync;
  const marker = ${JSON.stringify(marker)};
  const root = process.argv[2];
  let activeResponse;
  const environment = process.argv[5];
  const heldDescriptors = [];
  function releaseDescriptors() {
    for (const descriptor of heldDescriptors.splice(0)) fs.closeSync(descriptor);
  }
  function emit(event) { output(1, marker + JSON.stringify(event) + "\\n"); }
  function responseState() {
    return activeResponse ? { status: activeResponse.statusCode,
      headersSent: activeResponse.headersSent, ended: activeResponse.writableEnded,
      finished: activeResponse.writableFinished } : null;
  }
  // Monitoring does not recover the exception or change Node's default exit.
  process.on("uncaughtExceptionMonitor", function(error, origin) {
    releaseDescriptors();
    emit({ kind: "uncaught", origin: origin, name: error.name, code: error.code,
      syscall: error.syscall, path: typeof error.path === "string" ? path.relative(root, error.path) : null,
      message: error.message, stack: error.stack, response: responseState() });
  });
  const createServer = require(process.argv[1]);
  emit({ kind: "module-loaded", factory: typeof createServer, platform: process.platform,
    node: process.version, separator: path.sep });
  for (const operation of ["existsSync", "statSync", "readFileSync"]) {
    const original = fs[operation];
    fs[operation] = function() {
      const filename = path.relative(root, arguments[0]);
      emit({ kind: "fs-call", operation: operation, path: filename });
      try {
        const result = Reflect.apply(original, this, arguments);
        emit({ kind: "fs-return", operation: operation, path: filename,
          value: operation === "statSync" ? { directory: result.isDirectory() }
            : operation === "readFileSync" ? { bytes: result.length } : result });
        return result;
      } catch (error) {
        emit({ kind: "fs-throw", operation: operation, path: filename,
          name: error.name, code: error.code, syscall: error.syscall });
        throw error;
      }
    };
  }
  if (environment !== "healthy" && process.getuid() === 0) {
    process.setgroups([]); process.setgid(65534); process.setuid(65534);
  }
  const server = createServer({ port: 0, staticPath: root, defaultFile: "index.html" });
  emit({ kind: "created", requestListeners: server.listenerCount("request") });
  server.prependListener("request", function(request, response) {
    activeResponse = response;
    emit({ kind: "request", method: request.method, url: request.url });
    if (environment === "exhausted") {
      let code;
      for (let count = 0; count < 64; count++) {
        try { heldDescriptors.push(fs.openSync(root + "/hello.txt", "r")); }
        catch (error) { code = error.code; break; }
      }
      if (code !== "EMFILE") throw new Error("Fixture failed to establish descriptor exhaustion");
      emit({ kind: "descriptor-exhaustion", code });
    }
    response.on("finish", function() { emit({ kind: "finish", response: responseState() }); });
  });
  server.on("request", function() { releaseDescriptors(); emit({ kind: "handler-return", response: responseState() }); });
  server.on("error", function(error) { throw error; });
  server.once("listening", function() {
    emit({ kind: "listening", listening: server.listening });
    const request = http.request({ hostname: "127.0.0.1", port: server.address().port,
      method: process.argv[3], path: process.argv[4], agent: false }, function(response) {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", function(chunk) { body += chunk; });
      response.on("error", function(error) { throw error; });
      response.on("end", function() {
        emit({ kind: "response", status: response.statusCode,
          statusMessage: response.statusMessage, headers: response.headers, body: body });
        server.close(function() { emit({ kind: "closed", listening: server.listening }); });
        server.closeAllConnections();
      });
    });
    request.on("error", function(error) { throw error; });
    request.end();
  });
`;

interface Observation {
  kind: string;
  operation?: string;
  path?: string;
  value?: unknown;
  status?: number;
  statusMessage?: string;
  headers?: { [name: string]: string };
  body?: string;
  name?: string;
  code?: string;
  syscall?: string;
  origin?: string;
  message?: string;
  stack?: string;
  response?: { status: number; headersSent: boolean; ended: boolean; finished: boolean };
}

function removeTree(directory: string) {
  chmodSync(directory, 0o755);
  for (const name of readdirSync(directory)) {
    const filename = join(directory, name);
    if (statSync(filename).isDirectory()) removeTree(filename);
    else unlinkSync(filename);
  }
  rmdirSync(directory);
}

function observeServer(method: string, target: string, docsExists = false,
  environment: "healthy" | "read-denied" | "search-denied" | "exhausted" = "healthy") {
  assertPinnedNode();
  // Explicit first domain: POSIX paths, one request, fixed readable contents,
  // no symlinks, no concurrent filesystem changes and no exception recovery.
  if (sep !== "/") throw new Error("The initial pico reference domain requires POSIX paths");
  // Failure fixtures may drop root privileges: /tmp stays traversable even
  // when the invoking user's private TMPDIR does not.
  const directory = mkdtempSync(join(environment === "healthy" ? tmpdir() : "/tmp", "prophet-pico-"));
  try {
    mkdirSync(join(directory, "ready"));
    mkdirSync(join(directory, "empty"));
    if (docsExists) mkdirSync(join(directory, "docs"));
    writeFileSync(join(directory, "hello.txt"), fileBody);
    writeFileSync(join(directory, "ready", "index.html"), indexBody);
    if (environment !== "healthy") {
      chmodSync(directory, 0o755);
      chmodSync(join(directory, "hello.txt"), 0o644);
      chmodSync(join(directory, "ready", "index.html"), environment === "read-denied" ? 0 : 0o644);
      chmodSync(join(directory, "ready"), environment === "search-denied" ? 0o444 : 0o755);
    }
    const node = process.env.PROPHET_NODE_BINARY || process.execPath;
    const args = ["--no-global-search-paths", "-e", referenceDriver, packageDirectory, directory, method, target, environment];
    // Node raises a soft-only limit at startup; cap both in this child shell.
    const result = spawnSync(environment === "exhausted" ? "/bin/sh" : node,
      environment === "exhausted" ? ["-c", 'ulimit -n 64 || exit $?; exec "$@"', "prophet-pico-capacity", node, ...args] : args, {
        encoding: "utf8", timeout: 10000,
        env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }, stdio: ["ignore", "pipe", "pipe"]
      });
    if (result.error) throw result.error;
    const events: Observation[] = result.stdout.split("\n")
      .filter(line => line.startsWith(marker)).map(line => JSON.parse(line.slice(marker.length)));
    // Observe the unchanged application's real console output as well as the
    // driver's markers. Port 0 is the configured value printed by its callback.
    expect(result.stdout.split("\n").filter(line => line && !line.startsWith(marker)))
      .toEqual(["Static server is listening http requests on port 0"]);
    expect(events[0]).toEqual({ kind: "module-loaded", factory: "function",
      platform: process.platform, node: "v24.21.0", separator: "/" });
    expect(events[1]).toEqual({ kind: "created", requestListeners: 1 });
    expect(events[2]).toEqual({ kind: "listening", listening: true });
    expect(events[3]).toEqual({ kind: "request", method, url: target });
    return { status: result.status, signal: result.signal, stderr: result.stderr, events };
  } finally {
    removeTree(directory);
  }
}

function observedFilesystem(events: Observation[]) {
  return events.filter(event => event.kind.startsWith("fs-"));
}

function fileRead(path: string, body: string): Observation[] {
  return [
    { kind: "fs-call", operation: "readFileSync", path },
    { kind: "fs-return", operation: "readFileSync", path, value: { bytes: Buffer.byteLength(body) } }
  ];
}

function existingPath(path: string, directory: boolean): Observation[] {
  return [
    { kind: "fs-call", operation: "existsSync", path },
    { kind: "fs-return", operation: "existsSync", path, value: true },
    { kind: "fs-call", operation: "statSync", path },
    { kind: "fs-return", operation: "statSync", path, value: { directory } }
  ];
}

function expectResponse(result: ReturnType<typeof observeServer>, status: number, statusMessage: string,
  body: string) {
  expect(result.status).toBe(0);
  expect(result.signal).toBeNull();
  // The pinned release warns for the application's legacy url.parse call.
  if (observedFilesystem(result.events).length) {
    expect(result.stderr).toContain("[DEP0169] DeprecationWarning:");
  } else {
    expect(result.stderr).toBe("");
  }
  const response = result.events.filter(event => event.kind === "response");
  expect(response).toHaveLength(1);
  expect(response[0]).toMatchObject({ kind: "response", status, statusMessage, body });
  // The application's reversed writeHead arguments discard its intended
  // headers. Node enumerates characters of STATUS_CODES[code] as numeric
  // header names; whitespace values are trimmed when parsed by the client.
  const headers = response[0].headers!;
  const numericHeaders: { [name: string]: string } = {};
  for (let index = 0; index < statusMessage.length; index++) {
    numericHeaders[String(index)] = statusMessage[index].trim();
  }
  expect(headers).toMatchObject(numericHeaders);
  for (const absent of ["content-type", "content-length", "allow"]) {
    expect(headers[absent]).toBeUndefined();
  }
  expect(result.events.filter(event => event.kind === "uncaught")).toEqual([]);
  expect(result.events.filter(event => event.kind === "handler-return")).toEqual([
    { kind: "handler-return", response: { status, headersSent: true, ended: true, finished: false } }
  ]);
  expect(result.events.filter(event => event.kind === "finish")).toEqual([
    { kind: "finish", response: { status, headersSent: true, ended: true, finished: true } }
  ]);
  expect(result.events[result.events.length - 1]).toEqual({ kind: "closed", listening: false });
}

test("pico fixture retains every published file with its recorded hash and MIT license", () => {
  const manifest = JSON.parse(readFileSync(join(fixtureDirectory, "integrity.json"), "utf8"));
  expect(manifest.gitHead).toBe("6b553fb34e3b5b5bccf3c082bb2cae5f93b9e3be");
  expect(manifest.integrity).toBe("sha512-wn397s0nIVy5dGwfJuiWJklF+WCLtCZr6XVs+dG1QbL2Yg/+nVEampmxRbT6Dt+0hulsj5mYdUa8u6d6VZUyTg==");
  const filenames: string[] = [];
  function inspect(directory: string) {
    for (const name of readdirSync(join(fixtureDirectory, directory))) {
      const filename = directory + "/" + name;
      if (statSync(join(fixtureDirectory, filename)).isDirectory()) inspect(filename);
      else filenames.push(filename);
    }
  }
  inspect("package");
  expect(filenames.sort()).toEqual(Object.keys(manifest.sha256).sort());
  expect(filenames).toHaveLength(9);
  for (const filename of filenames) {
    expect(createHash("sha256").update(readFileSync(join(fixtureDirectory, filename))).digest("hex"))
      .toBe(manifest.sha256[filename]);
  }
  expect(JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8")))
    .toMatchObject({ name: "pico-static-server", version: "3.0.3", license: "MIT", main: "index.js" });
  expect(readFileSync(join(packageDirectory, "LICENSE"), "utf8")).toContain("MIT License");
});

describe("unmodified pico-static-server 3.0.3: concrete pinned Node reference", () => {
  beforeAll(assertPinnedNode);

  for (const method of ["GET", "HEAD"]) {
    test(`${method} existing file reads bytes; HEAD suppresses them only on the wire`, () => {
      const result = observeServer(method, "/hello.txt");
      expectResponse(result, 200, "OK", method === "HEAD" ? "" : fileBody);
      expect(observedFilesystem(result.events)).toEqual([
        ...existingPath("hello.txt", false), ...fileRead("hello.txt", fileBody)
      ]);
    });
  }

  test("an absent requested path returns 404 without stat or readFileSync", () => {
    const result = observeServer("GET", "/missing.txt");
    expectResponse(result, 404, "Not Found", "");
    expect(observedFilesystem(result.events)).toEqual([
      { kind: "fs-call", operation: "existsSync", path: "missing.txt" },
      { kind: "fs-return", operation: "existsSync", path: "missing.txt", value: false }
    ]);
  });

  for (const [method, status, statusMessage] of [["OPTIONS", 200, "OK"], ["POST", 405, "Method Not Allowed"], ["DELETE", 405, "Method Not Allowed"]] as Array<[string, number, string]>) {
    test(`${method} does not reach filesystem operations, even for a directory with no index`, () => {
      const result = observeServer(method, "/empty/");
      expectResponse(result, status, statusMessage, "");
      expect(observedFilesystem(result.events)).toEqual([]);
    });
  }

  test("an existing directory with index.html returns that file", () => {
    const result = observeServer("GET", "/ready/");
    expectResponse(result, 200, "OK", indexBody);
    expect(observedFilesystem(result.events)).toEqual([
      ...existingPath("ready", true), ...fileRead("ready/index.html", indexBody)
    ]);
  });

  for (const method of ["GET", "HEAD"]) {
    test(`${method} a directory without index.html exits from an uncaught ENOENT before responding`, () => {
      const result = observeServer(method, "/empty/");
      expect(result.status).toBe(1);
      expect(result.signal).toBeNull();
      expect(observedFilesystem(result.events)).toEqual([
        ...existingPath("empty", true),
        { kind: "fs-call", operation: "readFileSync", path: "empty/index.html" },
        { kind: "fs-throw", operation: "readFileSync", path: "empty/index.html", name: "Error", code: "ENOENT", syscall: "open" }
      ]);
      const failures = result.events.filter(event => event.kind === "uncaught");
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ origin: "uncaughtException", name: "Error", code: "ENOENT",
        syscall: "open", path: "empty/index.html",
        response: { status: 200, headersSent: false, ended: false, finished: false } });
      expect(failures[0].message).toContain("ENOENT: no such file or directory, open");
      expect(failures[0].stack).toContain(join(packageDirectory, "index.js") + ":126:");
      expect(result.stderr).toContain("Error: ENOENT: no such file or directory, open");
      expect(result.stderr).toContain(join(packageDirectory, "index.js") + ":126:");
      for (const kind of ["response", "handler-return", "finish", "closed"]) {
        expect(result.events.filter(event => event.kind === kind)).toEqual([]);
      }
    });
  }
});


for (const method of ["GET", "HEAD"]) for (const directoryExists of [false, true]) {
  test(`replay the symbolic /docs filesystem branch in pinned Node: ${method}, directory=${directoryExists}`, () => {
    // These are the two concrete environments represented by the symbolic
    // directory choice in the analysis spec, using the same request target.
    const result = observeServer(method, "/docs", directoryExists);
    if (directoryExists) {
      expect(result.status).toBe(1);
      expect(result.signal).toBeNull();
      expect(observedFilesystem(result.events)).toEqual([
        ...existingPath("docs", true),
        { kind: "fs-call", operation: "readFileSync", path: "docs/index.html" },
        { kind: "fs-throw", operation: "readFileSync", path: "docs/index.html", name: "Error", code: "ENOENT", syscall: "open" }
      ]);
      expect(result.events.filter(event => event.kind === "uncaught")).toMatchObject([
        { code: "ENOENT", syscall: "open", path: "docs/index.html", response: { headersSent: false, ended: false } }
      ]);
      expect(result.events.some(event => event.kind === "response" || event.kind === "handler-return")).toBe(false);
    } else {
      expectResponse(result, 404, "Not Found", "");
      expect(observedFilesystem(result.events)).toEqual([
        { kind: "fs-call", operation: "existsSync", path: "docs" },
        { kind: "fs-return", operation: "existsSync", path: "docs", value: false }
      ]);
    }
  });
}

for (const method of ["GET", "HEAD"]) {
  for (const environment of ["read-denied", "exhausted"] as Array<"read-denied" | "exhausted">) {
    test(`real ${method} existing index escapes ${environment} before any response`, () => {
      const result = observeServer(method, "/ready", false, environment);
      const code = environment === "read-denied" ? "EACCES" : "EMFILE";
      expect(result.status).toBe(1);
      expect(result.signal).toBeNull();
      expect(observedFilesystem(result.events)).toEqual([
        ...existingPath("ready", true),
        { kind: "fs-call", operation: "readFileSync", path: "ready/index.html" },
        { kind: "fs-throw", operation: "readFileSync", path: "ready/index.html", name: "Error", code, syscall: "open" }
      ]);
      const uncaught = result.events.filter(event => event.kind === "uncaught");
      expect(uncaught).toHaveLength(1);
      expect(uncaught[0]).toMatchObject({ code, syscall: "open", path: "ready/index.html",
        response: { headersSent: false, ended: false, finished: false } });
      expect(uncaught[0].stack).toContain("index.js:126:");
      expect(result.events.some(event => ["response", "finish", "handler-return"].includes(event.kind))).toBe(false);
    });
  }
  test(`real ${method} search-denied child yields the application's 404`, () => {
    const result = observeServer(method, "/ready/index.html", false, "search-denied");
    expectResponse(result, 404, "Not Found", "");
    expect(observedFilesystem(result.events)).toEqual([
      { kind: "fs-call", operation: "existsSync", path: "ready/index.html" },
      { kind: "fs-return", operation: "existsSync", path: "ready/index.html", value: false }
    ]);
  });
}
