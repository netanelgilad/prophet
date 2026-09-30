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
import { assertPinnedNode, withModuleFixture } from "./commonjs/oracle";

function program(handler: string, declarations = "") {
  return `
    const http = require("node:http");
    let observed = "";
    ${declarations}
    const server = http.createServer(function(req, res) { ${handler} });
    server.listen(0, "127.0.0.1");
    module.exports = { server: server, read: function() { return observed; } };
  `;
}

function run(source: string, inputs: { [name: string]: Any } = {}, method = "GET") {
  const model = createHTTPModel();
  const filename = "/app/headers.cjs";
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...inputs }) });
  const [exports, loaded] = createCommonJSLoader({ [filename]: source },
    { builtins: { http: model.module } }).load(filename, initial);
  expect(isThrownValue(exports)).toBe(false);
  if (!isESObject(exports)) throw new Error("Expected module exports");
  const server = getProperties(exports, loaded).server;
  const [, ready] = model.completeListen(server, loaded);
  const delivered = model.deliverRequest(server, { method: ESString(method), url: ESString("/") }, ready);
  expect(delivered.result[0]).toBe(Undefined);
  return { model, exports, response: delivered.response, context: delivered.result[1], ready };
}

function read(exports: TESObject, context: TExecutionContext) {
  const [completion, after] = evaluateCode("const observation = loaded.read();",
    setVariablesInScope(context, { loaded: exports }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  return after.value.scope.observation;
}

// The same complete module receives an actual request. Capture raw socket data
// as well as the client's body: IncomingMessage trims header whitespace, which
// would conceal the literal single-space fields produced by a string source.
const nativeReference = `
  const http = require("node:http");
  (async function() {
    let server;
    try {
      const loaded = require(process.argv[1]);
      server = loaded.server;
      await new Promise(function(resolve, reject) {
        server.once("error", reject);
        server.once("listening", resolve);
      });
      let raw = "";
      const response = await new Promise(function(resolve, reject) {
        const request = http.request({ hostname: "127.0.0.1", port: server.address().port,
          path: "/", method: process.argv[2], agent: false }, function(incoming) {
          let body = "";
          incoming.setEncoding("utf8");
          incoming.on("data", function(chunk) { body += chunk; });
          incoming.once("error", reject);
          incoming.once("end", function() {
            resolve({ statusCode: incoming.statusCode, statusMessage: incoming.statusMessage, body: body });
          });
        });
        request.once("socket", function(socket) {
          socket.on("data", function(chunk) { raw += chunk.toString("latin1"); });
        });
        request.once("error", reject);
        request.end();
      });
      const headers = Object.create(null);
      const rawHeaders = raw.slice(0, raw.indexOf("\\r\\n\\r\\n")).split("\\r\\n").slice(1);
      for (const line of rawHeaders) {
        const separator = line.indexOf(":");
        const name = line.slice(0, separator).toLowerCase();
        if (!["date", "connection", "keep-alive", "transfer-encoding"].includes(name)) {
          headers[name] = line.slice(separator + 2);
        }
      }
      process.stdout.write(JSON.stringify({ ...response, headers: headers, observed: loaded.read() }));
    } finally {
      if (server) await new Promise(function(resolve) {
        server.close(resolve);
        server.closeAllConnections();
      });
    }
  })().catch(function(error) { console.error(error); process.exitCode = 1; });
`;

function real(source: string, method = "GET"): {
  statusCode: number; statusMessage: string; body: string; headers: { [name: string]: string }; observed: string;
} {
  assertPinnedNode();
  return withModuleFixture(source, filename => JSON.parse(execFileSync(
    process.env.PROPHET_NODE_BINARY || process.execPath,
    ["--no-global-search-paths", "-e", nativeReference, filename, method],
    { encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" },
      stdio: ["ignore", "pipe", "pipe"] }
  )));
}

function compare(source: string, method = "GET") {
  const native = real(source, method);
  const result = run(source, {}, method);
  const wire = result.model.inspectResponse(result.response, result.context);
  expect(wire.statusCode).toMatchObject({ value: native.statusCode });
  expect(wire.statusMessage).toMatchObject({ value: native.statusMessage });
  expect(wire.body).toMatchObject({ value: native.body });
  if (!isESObject(wire.headers)) throw new Error("Expected committed header object");
  const values = getProperties(wire.headers, result.context);
  expect(Object.keys(values).sort()).toEqual(Object.keys(native.headers).sort());
  for (const name of Object.keys(native.headers)) expect(values[name]).toMatchObject({ value: native.headers[name] });
  expect(read(result.exports, result.context)).toMatchObject({ value: native.observed });
  return { native, ...result };
}

for (const [args, status, message] of [
  ['201, { "X-Count": 2, Allow: "GET, HEAD", "Content-Type": "text/plain" }', 201, "Created"],
  ['201, "Custom reason", { "X-Count": 2 }', 201, "Custom reason"],
  ['299, { "X-Count": 2 }', 299, "unknown"],
  ['4294967496, { "X-Count": 2 }', 200, "OK"]
] as Array<[string, number, string]>) {
  test(`writeHead(${args}) commits headers before ending and returns the response`, () => {
    const { native } = compare(program(`
      const same = res.writeHead(${args}) === res;
      observed = same + ":" + res.headersSent + ":" + res.writableEnded + ":" + res.writableFinished;
      res.end();
    `));
    expect(native).toMatchObject({ statusCode: status, statusMessage: message, body: "", observed: "true:true:false:false" });
  });
}

for (const status of [200, 405]) {
  test(`a third string argument is enumerated as headers when the second argument is an object (${status})`, () => {
    const { native } = compare(program(`
      res.writeHead(${status}, { Allow: "GET, HEAD", "Content-Length": 0 }, http.STATUS_CODES[${status}]);
      res.end();
    `));
    const expected: { [name: string]: string } = {};
    const message = status === 200 ? "OK" : "Method Not Allowed";
    for (let index = 0; index < message.length; index++) expected[String(index)] = message[index];
    expect(native.headers).toEqual(expected);
    expect(native.headers.allow).toBeUndefined();
    expect(native.headers["content-length"]).toBeUndefined();
  });
}

test("ordinary primitive header values serialize without object inspection or string-hint conversion", () => {
  const { native } = compare(program(`
    res.writeHead(200, { "X-Boolean": false, "X-Null": null, "X-NaN": NaN,
      "X-Infinity": Infinity, "X-Signed-Zero": -0, "X-Latin1": "caf\\xe9", "X-Whitespace": "\\t value \\t" });
    res.end();
  `));
  expect(native.headers).toEqual({ "x-boolean": "false", "x-null": "null", "x-nan": "NaN",
    "x-infinity": "Infinity", "x-signed-zero": "0", "x-latin1": "café", "x-whitespace": "\t value \t" });
});

for (const [setup, args, message] of [
  ['res.statusMessage = "Saved";', '201, { "X-Value": "yes" }', "Saved"],
  ['res.statusMessage = "";', '201, { "X-Value": "yes" }', "Created"],
  ['res.statusMessage = "Saved";', '201, "", { "X-Value": "yes" }', ""],
  ['', '201, { "X-Value": "yes" }, null', "Created"]
]) {
  test(`default reason selection respects the current public message and nullish third argument: ${setup} ${args}`, () => {
    const { native } = compare(program(`${setup} res.writeHead(${args}); res.end();`));
    expect(native.statusMessage).toBe(message);
    expect(native.headers).toEqual({ "x-value": "yes" });
  });
}

for (const [setup, status, message] of [
  ['const original = http.STATUS_CODES; original[200] = "Original"; http.STATUS_CODES = { 200: "Replacement" };', 200, "Original"],
  ['Object.prototype[299] = "Inherited";', 299, "Inherited"],
  ['http.STATUS_CODES[200] = false;', 200, "unknown"]
] as Array<[string, number, string]>) {
  test(`default reasons read the captured status table with ordinary lookup and fallback: ${setup}`, () => {
    const { native } = compare(program(`res.writeHead(${status}); res.end();`, setup));
    expect(native.statusCode).toBe(status);
    expect(native.statusMessage).toBe(message);
    expect(native.headers).toEqual({});
  });
}

test("header copying uses own data keys even for ordinary prototype-shaped names", () => {
  const { native } = compare(program(`
    Object.prototype["X-Inherited"] = "must not copy";
    res.writeHead(200, { constructor: "ctor", toString: "string", ["__proto__"]: "data" });
    res.end();
  `));
  expect(native.headers).toEqual({ constructor: "ctor", tostring: "string", ["__proto__"]: "data" });
});

test("end retains committed status, message, headers and body rules after public values change", () => {
  const { native, model, response, context } = compare(program(`
    const fields = { "X-Value": "original" };
    res.writeHead(200, "Original", fields);
    fields["X-Value"] = "changed";
    res.statusCode = 204;
    res.statusMessage = "changed\\ninvalid after commit";
    res.end("payload");
    observed = res.statusCode + ":" + res.statusMessage + ":" + res.headersSent;
  `));
  expect(native).toEqual({ statusCode: 200, statusMessage: "Original", headers: { "x-value": "original" },
    body: "payload", observed: "204:changed\ninvalid after commit:true" });
  expect(getProperties(response, context).statusCode).toMatchObject({ value: 204 });
  const [, finished] = model.completeResponse(response, context);
  expect(model.inspectResponse(response, finished)).toEqual(model.inspectResponse(response, context));
});

for (const [args, error, status, message] of [
  ['99, "bad\\nreason", { "bad name": undefined }', "RangeError:ERR_HTTP_INVALID_STATUS_CODE", 200, "undefined"],
  ['201, "bad\\nreason", { "bad name": undefined }', "TypeError:ERR_INVALID_CHAR", 201, "bad\nreason"],
  ['201, { "bad name": undefined }', "TypeError:ERR_INVALID_HTTP_TOKEN", 201, "Created"],
  ['201, { "X-First": "ok", "X-Bad": undefined }', "TypeError:ERR_HTTP_INVALID_HEADER_VALUE", 201, "Created"],
  ['201, { "X-First": "ok", "X-Bad": "bad\\r\\nvalue" }', "TypeError:ERR_INVALID_CHAR", 201, "Created"],
  ['201, { "X-Bad": "\\u0100" }', "TypeError:ERR_INVALID_CHAR", 201, "Created"]
] as Array<[string, string, number, string]>) {
  test(`invalid writeHead arguments preserve Node's validation and partial-mutation order: ${args}`, () => {
    const { native, context } = compare(program(`
      try { res.writeHead(${args}); }
      catch (error) {
        observed = error.name + ":" + error.code + ":" + res.statusCode + ":" + res.statusMessage + ":" + res.headersSent;
      }
      res.writeHead(202, "Recovered", { "X-Recovered": "yes" });
      res.end();
    `));
    expect(native.observed).toBe(`${error}:${status}:${message}:false`);
    expect(native.headers).toEqual({ "x-recovered": "yes" });
    expect(effectPaths(context.value.effects!)[0].events.filter(event =>
      event.call.operation === "http.response.writeHead").map(event => event.kind))
      .toEqual(["call", "throw", "call", "return"]);
  });
}

test("a second writeHead rejects before validating new arguments and cannot replace committed output", () => {
  const { native } = compare(program(`
    res.writeHead(201, "First", { "X-First": "yes" });
    try { res.writeHead(99, "bad\\n", { "bad name": undefined }); }
    catch (error) { observed = error.name + ":" + error.code + ":" + res.statusCode + ":" + res.statusMessage; }
    res.end();
  `));
  expect(native).toEqual({ statusCode: 201, statusMessage: "First", headers: { "x-first": "yes" }, body: "",
    observed: "Error:ERR_HTTP_HEADERS_SENT:201:First" });
});

for (const [args, body, error] of [
  ['204, { "bad name": "value" }', "", "ERR_INVALID_HTTP_TOKEN"],
  ['204, "bad\\nreason", { "bad name": "value" }', "payload", "ERR_INVALID_CHAR"]
]) {
  test(`failed writeHead preserves the point where body suppression became sticky: ${args}`, () => {
    const { native } = compare(program(`
      try { res.writeHead(${args}); }
      catch (error) { observed = error.code + ":" + res.headersSent; }
      res.writeHead(200, "Recovered", { "X-Recovered": "yes" });
      res.end("payload");
    `));
    expect(native).toEqual({ statusCode: 200, statusMessage: "Recovered", body,
      headers: { "x-recovered": "yes" }, observed: error + ":false" });
  });
}

test("finite symbolic status/header choices preserve both proofs and genuinely unknown output", () => {
  const selected = ESBoolean();
  const source = program(`
    const fields = { "X-Shared": "yes" };
    if (selected) fields["X-Branch"] = "chosen";
    res.writeHead(selected ? 201 : 202, fields);
    res.end();
  `);
  for (const value of [true, false]) compare(`const selected = ${value};\n${source}`);
  const { model, response, context } = run(source, { selected });
  const wire = model.inspectResponse(response, context);
  const [completion, after] = evaluateCode(`
    const proved = (selected ? wireCode === 201 : wireCode === 202) &&
      fields["x-shared"] === "yes" && (selected ? fields["x-branch"] === "chosen" : fields["x-branch"] === undefined);
    const uncertain = wireCode === 201;
  `, setVariablesInScope(context, { selected, wireCode: wire.statusCode, fields: wire.headers }));
  expect(isThrownValue(completion)).toBe(false);
  expect(after.value.scope.proved).toMatchObject({ value: true });
  expect(resolveBoolean(after.value.scope.uncertain as ReturnType<typeof ESBoolean>, after.value.knowledge)).toBeUndefined();
});

test("a conditional invalid header retains its exception, recovery and output on exactly that path", () => {
  const invalid = ESBoolean();
  const source = program(`
    let caught = false;
    try { res.writeHead(201, { "X-Value": invalid ? "bad\\nvalue" : "valid" }); }
    catch (error) {
      caught = error.code === "ERR_INVALID_CHAR";
      res.writeHead(202, "Recovered", { "X-Value": "recovered" });
    }
    res.end();
    observed = caught === invalid ? "correlated" : "wrong path";
  `);
  for (const value of [true, false]) {
    const { native } = compare(`const invalid = ${value};\n${source}`);
    expect(native.observed).toBe("correlated");
    expect(native.headers).toEqual({ "x-value": value ? "recovered" : "valid" });
  }
  const { model, response, exports, context } = run(source, { invalid });
  expect(read(exports, context)).toMatchObject({ value: "correlated" });
  const wire = model.inspectResponse(response, context);
  const [completion, after] = evaluateCode(`
    const proved = invalid ? code === 202 && fields["x-value"] === "recovered" :
      code === 201 && fields["x-value"] === "valid";
    const uncertain = code === 202;
  `, setVariablesInScope(context, { invalid, code: wire.statusCode, fields: wire.headers }));
  expect(isThrownValue(completion)).toBe(false);
  expect(after.value.scope.proved).toMatchObject({ value: true });
  expect(resolveBoolean(after.value.scope.uncertain as ReturnType<typeof ESBoolean>, after.value.knowledge)).toBeUndefined();
});

for (const args of [
  '200, { "Content-Length": 0 }', '200, { "Transfer-Encoding": "chunked" }',
  '200, { Connection: "close" }', '200, { Trailer: "X-Trailer" }',
  '200, { "X-Duplicate": "first", "x-duplicate": "second" }',
  '200, ["X-Array", "value"]', '200, { "X-Array": ["one", "two"] }',
  '200, { "X-Object": { toString: function() { return "value"; } } }'
]) {
  test(`unmodeled framing, duplicates, arrays and coercion remain explicit gaps: ${args}`, () => {
    expect(() => run(program(`res.writeHead(${args}); res.end();`))).toThrow(/HTTP|Own property enumeration/);
  });
}

for (const [name, value] of [["unknownStatus", ESNumber()], ["unknownReason", ESString()], ["unknownHeader", ESString()]] as Array<[string, Any]>) {
  test(`${name} remains an explicit analysis gap instead of assuming valid header text`, () => {
    const args = name === "unknownStatus" ? `${name}` : name === "unknownReason" ? `200, ${name}` : `200, { "X-Value": ${name} }`;
    expect(() => run(program(`res.writeHead(${args}); res.end();`), { [name]: value })).toThrow(/HTTP/);
  });
}
