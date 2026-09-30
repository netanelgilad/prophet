import { readFileSync } from "fs";
import { join } from "path";
import { createCommonJSLoader, createConsoleModel, createFileSystemModel, fileSystemDirectory, fileSystemFile, createHTTPModel, createLegacyURLModel, createPosixPathModel, evaluateCode, isForkedCompletion,
  nodeInitialExecutionContext } from "../src";
import { isESFunction } from "../src/Function/Function";
import { ESObject } from "../src/Object";
import { effectPaths } from "../src/effects";
import { ExecutionContext, setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { Any, ESNull, isThrownValue, WithProperties } from "../src/types";
import { ESString } from "../src/string/String";
import { resolveBoolean, selectValue, strictEquality } from "../src/symbolic";
import { assumeInContext, BranchResult } from "../src/execution-context/branches";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ASTEvaluationError } from "../src/evaluate";

const packageDirectory = join(__dirname, "fixtures/pico-static-server-3.0.3/package");

function packageLoader(layout: "installed" | "checkout" = "installed",
  root: Any = fileSystemDirectory({ site: fileSystemDirectory({}) })) {
  const http = createHTTPModel();
  const consoleModel = createConsoleModel();
  const url = createLegacyURLModel();
  const path = createPosixPathModel();
  const filesystem = createFileSystemModel({ root });
  const moduleDirectory = layout === "installed" ? "/app/node_modules/pico-static-server" : "/app/fixture/package";
  // These modules promise identity only. Any attempted member access stops
  // analysis. Loading an unused import does not establish API compatibility.
  const opaque = (name: string) => Object.assign(ESObject(), {
    unknownProperties: `Unimplemented Node ${name} API`,
    unmodeledOwnPropertyInspection: `Unimplemented Node ${name} descriptors`
  });
  const context = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties,
      console: consoleModel.module, process: url.process }, "unmodeled") });
  const loader = createCommonJSLoader({
    "/app/entry.cjs": `module.exports = require(${JSON.stringify(layout === "installed" ? "pico-static-server" : moduleDirectory)});`,
    [moduleDirectory + "/package.json"]: readFileSync(join(packageDirectory, "package.json"), "utf8"),
    [moduleDirectory + "/index.js"]: readFileSync(join(packageDirectory, "index.js"), "utf8")
  }, { builtins: { http: http.module, https: opaque("https"), url: url.module,
    process: url.process, fs: filesystem.module, path: path.module } });
  return { http, consoleModel, url, path, filesystem, loader, context };
}

test("the unmodified published static-server module loads its actual arrow factory", () => {
  const setup = packageLoader();
  const [factory, context] = setup.loader.load("/app/entry.cjs", setup.context);
  expect(isThrownValue(factory)).toBe(false);
  expect(isForkedCompletion(factory)).toBe(false);
  expect(isESFunction(factory)).toBe(true);
  // Importing the factory must not create/listen to a server or read files.
  expect(context.value.effects ? effectPaths(context.value.effects).some(path => path.events.length > 0) : false).toBe(false);
  const [completion, result] = evaluateCode(`
    const callable = typeof factory === "function";
    const noPrototype = !Object.prototype.hasOwnProperty.call(factory, "prototype");
  `, setVariablesInScope(context, { factory }));
  expect(isThrownValue(completion)).toBe(false);
  expect(result.value.scope.callable).toMatchObject({ value: true });
  expect(result.value.scope.noPrototype).toMatchObject({ value: true });
});

for (const [argument, port] of [
  ["", 8080], ["undefined", 8080], ['{ port: 0, protocol: "http", staticPath: "/site" }', 0]
] as Array<[string, number]>) {
  test(`the unchanged HTTP factory returns its server and completes its deferred startup message: (${argument})`, () => {
    const setup = packageLoader();
    const [factory, context] = setup.loader.load("/app/entry.cjs", setup.context);
    // Assume successful wildcard binding in the model's primary process; no
    // real socket is opened. Stdout is healthy and unconfigured; delivery and
    // bind failures are not proved. Output is captured rather than written.
    // No source rewriting or extracted handler: defaults, spreads, the real
    // listener registration, and listen(port, callback) execute in the VM.
    const [completion, result] = evaluateCode(`const server = factory(${argument});`,
      setVariablesInScope(context, { factory }));
    expect(isThrownValue(completion)).toBe(false);
    expect(isForkedCompletion(completion)).toBe(false);
    const server = result.value.scope.server;
    expect(server).toMatchObject({ type: "object" });
    expect(getProperties(server as WithProperties, result).listening).toMatchObject({ value: true });

    const paths = effectPaths(result.value.effects!);
    expect(paths).toHaveLength(1);
    const events = paths[0].events;
    expect(events.map(event => `${event.kind}:${event.call.operation}`)).toEqual([
      "call:http.createServer", "return:http.createServer",
      "call:http.server.listen", "return:http.server.listen"
    ]);
    const created = events[1], listened = events[3];
    expect(created.kind === "return" && created.value).toBe(server);
    expect(listened.kind === "return" && listened.value).toBe(server);
    expect(events[0].call.args).toHaveLength(1);
    expect(isESFunction(events[0].call.args[0])).toBe(true);
    expect(events[2].call.receiver).toBe(server);
    expect(events[2].call.args).toHaveLength(2);
    expect(events[2].call.args[0]).toMatchObject({ value: port });
    expect(isESFunction(events[2].call.args[1])).toBe(true);

    expect(setup.consoleModel.inspectOutput(result)[0].chunks).toHaveLength(0);
    // Execute the actual callback, template, and console call through the VM.
    const [listenedResult, ready] = setup.http.completeListen(server, result);
    expect(listenedResult).toBe(server);
    const output = setup.consoleModel.inspectOutput(ready);
    expect(output).toHaveLength(1);
    expect(output[0].chunks).toMatchObject([
      { value: `Static server is listening http requests on port ${port}\n` }
    ]);
    expect(setup.consoleModel.inspectOutput(result)[0].chunks).toHaveLength(0);
    expect(effectPaths(ready.value.effects!)[0].events.slice(events.length)
      .map(event => `${event.kind}:${event.call.operation}`)).toEqual([
        "call:http.server.listening", "call:console.log", "call:console.stdout.write",
        "return:console.stdout.write", "return:console.log", "return:http.server.listening"
      ]);
  });
}

for (const method of ["OPTIONS", "POST", "DELETE"]) {
  test(`the unchanged ${method} handler completes and exposes the package's missing Allow header`, () => {
    const setup = packageLoader();
    const [factory, loaded] = setup.loader.load("/app/entry.cjs", setup.context);
    const [, started] = evaluateCode("const server = factory({ port: 0 });",
      setVariablesInScope(loaded, { factory }));
    const server = started.value.scope.server;
    const [, ready] = setup.http.completeListen(server, started);
    // One valid parsed request, successful binding/transport, healthy stdout.
    // The original respond function passes headers/reason in reversed order.
    const delivered = setup.http.deliverRequest(server, { method: ESString(method), url: ESString("/") }, ready);
    expect(isThrownValue(delivered.result[0])).toBe(false);
    expect(isForkedCompletion(delivered.result[0])).toBe(false);
    const [, finished] = setup.http.completeResponse(delivered.response, delivered.result[1]);
    const observed = setup.http.inspectResponse(delivered.response, finished);
    const message = method === "OPTIONS" ? "OK" : "Method Not Allowed";
    expect(observed).toMatchObject({ statusCode: { value: method === "OPTIONS" ? 200 : 405 },
      statusMessage: { value: message }, body: { value: "" } });
    // These are explicit serialized fields, excluding automatic Date/framing.
    const headers = getProperties(observed.headers as WithProperties, finished);
    expect(Object.keys(headers)).toEqual(message.split("").map((_character, index) => String(index)));
    message.split("").forEach((character, index) => expect(headers[index]).toMatchObject({ value: character }));
    expect(headers.allow).toBeUndefined();
    expect(headers["content-length"]).toBeUndefined();
    expect(effectPaths(finished.value.effects!)[0].events.filter(event => event.kind === "call")
      .map(event => event.call.operation).slice(5)).toEqual([
        "http.server.request", "http.response.writeHead", "http.response.end", "http.response.finish"
      ]);
    expect(getProperties(delivered.response, finished).writableFinished).toMatchObject({ value: true });
  });
}

test("a delivered request event with an unknown non-GET/HEAD method proves Allow absent while status remains conditional", () => {
  const setup = packageLoader();
  const method = ESString();
  const [factory, loaded] = setup.loader.load("/app/entry.cjs", setup.context);
  const [, started] = evaluateCode('const server = factory({ port: 0 });',
    setVariablesInScope(loaded, { factory }));
  const server = started.value.scope.server;
  const [, ready] = setup.http.completeListen(server, started);
  // Explicit domain: one delivered request event, a method other than GET/HEAD,
  // arbitrary parsed URL, successful completion. Strings overapproximate actual
  // handler inputs; CONNECT/upgrade wire dispatch is outside this transition.
  const constrained = assumeInContext(assumeInContext(ready,
    strictEquality(method, ESString("GET")), false), strictEquality(method, ESString("HEAD")), false);
  const delivered = setup.http.deliverRequest(server, { method, url: ESString() }, constrained);
  expect(isThrownValue(delivered.result[0])).toBe(false);
  expect(isForkedCompletion(delivered.result[0])).toBe(false);
  const [, finished] = setup.http.completeResponse(delivered.response, delivered.result[1]);
  const observed = setup.http.inspectResponse(delivered.response, finished);
  const [, verified] = evaluateCode(`
    const correctStatus = method === "OPTIONS" ? status === 200 : status === 405;
    const missingAllow = headers.allow === undefined;
    const emptyBody = body === "";
    const uncertain = status === 200;
  `, setVariablesInScope(finished, { method, status: observed.statusCode,
    headers: observed.headers, body: observed.body }));
  for (const name of ["correctStatus", "missingAllow", "emptyBody"]) {
    expect(verified.value.scope[name]).toMatchObject({ value: true });
  }
  expect(verified.value.scope.uncertain).toMatchObject({ value: undefined });
  const paths = effectPaths(finished.value.effects!, finished.value.knowledge);
  expect(paths).toHaveLength(2);
  for (const path of paths) {
    const chosen = resolveBoolean(strictEquality(method, ESString("OPTIONS")), path.knowledge);
    expect(chosen).not.toBeUndefined();
    const writes = path.events.filter(event => event.kind === "call" && event.call.operation === "http.response.writeHead");
    expect(writes).toHaveLength(1);
    expect(writes[0].call.args[0]).toMatchObject({ value: chosen ? 200 : 405 });
  }
});

for (const method of ["GET", "HEAD"]) for (const layout of ["installed", "checkout"] as Array<"installed" | "checkout">) {
  test(`the real ${method} handler normalizes the request path and returns 404 for the missing file (${layout})`, () => {
    const setup = packageLoader(layout);
    const [factory, loaded] = setup.loader.load("/app/entry.cjs", setup.context);
    const [, started] = evaluateCode('const server = factory({ port: 0, staticPath: "/site" });',
      setVariablesInScope(loaded, { factory }));
    const server = started.value.scope.server;
    const [, ready] = setup.http.completeListen(server, started);
    // A read-only observer retains the original path computation. The shared
    // filesystem model then resolves the path from the declared empty /site.
    let boundary: TExecutionContext | undefined;
    const observed = ExecutionContext({ ...ready.value, validateRead: (_object: object, name: string, current: TExecutionContext) => {
      if (name === "existsSync") boundary = current;
    } });
    const delivered = setup.http.deliverRequest(server, {
      method: ESString(method), url: ESString("/folder/../missing?download=1")
    }, observed);
    expect(isThrownValue(delivered.result[0])).toBe(false);
    expect(isForkedCompletion(delivered.result[0])).toBe(false);
    const [, finished] = setup.http.completeResponse(delivered.response, delivered.result[1]);
    expect(setup.http.inspectResponse(delivered.response, finished)).toMatchObject({
      statusCode: { value: 404 }, body: { value: "" }
    });
    expect(boundary).toBeDefined();
    expect(boundary!.value.scope.requestPath).toMatchObject({ value: "/site/missing" });
    const calls = effectPaths(boundary!.value.effects!)[0].events.filter(event => event.kind === "call");
    expect(calls.filter(event => event.call.operation === "url.parse")).toHaveLength(1);
    expect(calls.filter(event => event.call.operation === "path.posix.normalize")).toHaveLength(2);
    expect(calls.filter(event => event.call.operation === "path.posix.join")).toHaveLength(1);
    // Node suppresses DEP0169 for the installed layout. The native reference
    // loads outside node_modules; that declared checkout layout queues it.
    expect(setup.url.warnings.inspectPending(boundary!)[0].warnings).toHaveLength(layout === "checkout" ? 1 : 0);
    expect(setup.url.warnings.inspectOutput(boundary!)[0].chunks).toHaveLength(0);
  });
}

test("overriding the real factory's protocol reaches the explicitly unmodeled HTTPS API", () => {
  const setup = packageLoader();
  const [factory, context] = setup.loader.load("/app/entry.cjs", setup.context);
  // A later spread overrides DEFAULT_OPTIONS.protocol. Preserve the actual
  // HTTPS import/branch; an opaque module identity is not an API model.
  expect(() => evaluateCode('factory({ protocol: "https" });', setVariablesInScope(context, { factory })))
    .toThrow("Unmodeled host property 'createServer': Unimplemented Node https API");
});


function completionLeaves(result: BranchResult): BranchResult[] {
  return isForkedCompletion(result[0])
    ? completionLeaves(result[0].consequent).concat(completionLeaves(result[0].alternate)) : [result];
}

for (const method of ["GET", "HEAD"]) {
  test(`the unchanged ${method} handler classifies symbolic filesystem state as 404 or escaping missing-index ENOENT`, () => {
    // Same request and application source on both paths. A closed, stable,
    // case-sensitive tree has either no docs entry or an empty docs directory.
    // No index file is supplied in either state. Binding/transport/stdout use
    // the existing declared success domain; no process exception recovery hook.
    const directoryExists = ESBoolean();
    const root = fileSystemDirectory({ site: fileSystemDirectory({
      docs: selectValue(directoryExists, fileSystemDirectory({}), ESNull)
    }) });
    const setup = packageLoader("installed", root);
    const [factory, loaded] = setup.loader.load("/app/entry.cjs", setup.context);
    const [, started] = evaluateCode('const server = factory({ port: 0, staticPath: "/site" });',
      setVariablesInScope(loaded, { factory }));
    const server = started.value.scope.server;
    const [, ready] = setup.http.completeListen(server, started);
    const delivered = setup.http.deliverRequest(server, { method: ESString(method), url: ESString("/docs") }, ready);
    expect(isForkedCompletion(delivered.result[0])).toBe(true);
    const leaves = completionLeaves(delivered.result);
    expect(leaves).toHaveLength(2);
    for (const [completion, context] of leaves) {
      const exists = resolveBoolean(directoryExists, context.value.knowledge);
      expect(exists).not.toBeUndefined();
      const response = getProperties(delivered.response, context);
      const events = effectPaths(context.value.effects, context.value.knowledge)[0].events;
      const filesystemCalls = events.filter(event => event.kind === "call" && event.call.operation.startsWith("fs."));
      if (exists) {
        expect(isThrownValue(completion)).toBe(true);
        if (!isThrownValue(completion)) throw new Error("Expected escaping file-read exception");
        expect(getProperties(completion.value as WithProperties, context)).toMatchObject({
          code: { value: "ENOENT" }, syscall: { value: "open" }, path: { value: "/site/docs/index.html" }
        });
        expect(response.headersSent).toMatchObject({ value: false });
        expect(response.writableEnded).toMatchObject({ value: false });
        expect(filesystemCalls.map(event => event.call.operation)).toEqual([
          "fs.existsSync", "fs.statSync", "fs.Stats.isDirectory", "fs.readFileSync"
        ]);
        expect(filesystemCalls[3].call.args[0]).toMatchObject({ value: "/site/docs/index.html" });
        expect(events.some(event => event.kind === "throw" && event.call.operation === "http.server.request")).toBe(true);
        expect(events.some(event => event.call.operation === "http.response.writeHead")).toBe(false);
      } else {
        expect(isThrownValue(completion)).toBe(false);
        expect(response.headersSent).toMatchObject({ value: true });
        expect(response.writableEnded).toMatchObject({ value: true });
        expect(filesystemCalls.map(event => event.call.operation)).toEqual(["fs.existsSync"]);
        const [, finished] = setup.http.completeResponse(delivered.response, context);
        expect(setup.http.inspectResponse(delivered.response, finished)).toMatchObject({
          statusCode: { value: 404 }, body: { value: "" }
        });
      }
    }
    expect(resolveBoolean(directoryExists, delivered.result[1].value.knowledge)).toBeUndefined();
    expect(setup.filesystem.inspectRoot(ready)).toBe(root);
  });

  for (const target of ["/index.txt", "/docs"]) test(`the real ${method} ${target} Buffer passes instanceof and reaches path.parse`, () => {
    const setup = packageLoader("installed", fileSystemDirectory({ site: fileSystemDirectory({
      "index.txt": fileSystemFile("café 😀"),
      docs: fileSystemDirectory({ "index.html": fileSystemFile("café 😀") })
    }) }));
    const [factory, loaded] = setup.loader.load("/app/entry.cjs", setup.context);
    const [, started] = evaluateCode('const server = factory({ port: 0, staticPath: "/site" });',
      setVariablesInScope(loaded, { factory }));
    const server = started.value.scope.server;
    const [, ready] = setup.http.completeListen(server, started);
    const observations: TExecutionContext[] = [];
    const mimeLookups: TExecutionContext[] = [];
    // Observe the actual local binding after readFileSync returns. This hook
    // supplies no values and changes no source, filesystem result or control flow.
    const observed = ExecutionContext({ ...ready.value,
      validateBinding: (_environment: object, name: string, context: TExecutionContext, access: string) => {
        if (name === "data" && access === "read") observations.push(context);
      },
      validateRead: (object: Any, name: string, context: TExecutionContext) => {
        if (object === setup.path.module && name === "parse") mimeLookups.push(context);
      } });
    let boundary: ASTEvaluationError | undefined;
    try {
      setup.http.deliverRequest(server, { method: ESString(method), url: ESString(target) }, observed);
    } catch (error) {
      if (!(error instanceof ASTEvaluationError)) throw error;
      boundary = error;
    }
    expect(boundary).toBeDefined();
    expect(boundary!.message).toContain("Unmodeled host property 'parse'");
    expect(boundary!.ast).toMatchObject({ type: "CallExpression", callee: { type: "MemberExpression",
      object: { type: "Identifier", name: "path" }, property: { type: "Identifier", name: "parse" } } });
    expect(observations).toHaveLength(1);
    expect(mimeLookups).toHaveLength(1);
    expect(mimeLookups[0].value.scope.url).toMatchObject({ value:
      target === "/docs" ? "/site/docs/index.html" : "/site/index.txt" });
    const reached = observations[0];
    const paths = effectPaths(reached.value.effects!);
    expect(paths).toHaveLength(1);
    const events = paths[0].events;
    const reads = events.filter(event => event.call.operation === "fs.readFileSync" && event.kind === "return");
    expect(reads).toHaveLength(1);
    const read = reads[0];
    expect(read.call.args[0]).toMatchObject({ value: target === "/docs" ? "/site/docs/index.html" : "/site/index.txt" });
    expect(read.kind === "return" && read.value).toBe(reached.value.scope.data);
    expect(events.some(event => event.call.operation === "http.response.writeHead")).toBe(false);
    const [, inspected] = evaluateCode(`const bufferProof = data instanceof Object && !(data instanceof Error) &&
      data.length === 10 && data[3] === 195 && data.toString() === "café 😀";`,
      ExecutionContext({ ...reached.value, validateBinding: undefined, validateRead: undefined }));
    expect(inspected.value.scope.bufferProof).toMatchObject({ value: true });
  });
}
