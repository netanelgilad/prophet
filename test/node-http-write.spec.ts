import { execFileSync } from "child_process";
import { createBufferValue, createCommonJSLoader, evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { effectContext, effectPaths } from "../src/effects";
import { ExecutionContext, setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { createHTTPModel } from "../src/node/http";
import { ESObject, isESObject, TESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { resolveBoolean } from "../src/symbolic";
import { Any, isThrownValue, Undefined, WithProperties } from "../src/types";
import { assertPinnedNode, withModuleFixture } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

// Declared transport domain: a healthy connection, successful output, and a
// synchronous handler with no flush between write() and end(). Queued Buffer
// references are consumed at end(); the separate finish event is delivered by
// completeResponse(). Backpressure on normal writes remains an unknown boolean.
function program(handler: string, declarations = "") {
  return `
    const http = require("node:http");
    let observed = "";
    let accepted;
    ${declarations}
    const server = http.createServer(function(req, res) { ${handler} });
    server.listen(0, "127.0.0.1");
    module.exports = { server: server, read: function() { return observed; },
      accepted: function() { return accepted; } };
  `;
}

function run(source: string, inputs: { [name: string]: Any } = {}, method = "GET") {
  const model = createHTTPModel();
  const filename = "/app/write.cjs";
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...inputs }) });
  const [exports, loaded] = createCommonJSLoader({ [filename]: source },
    { builtins: { http: model.module } }).load(filename, initial);
  expect(isThrownValue(exports)).toBe(false);
  expect(isForkedCompletion(exports)).toBe(false);
  if (!isESObject(exports)) throw new Error("Expected module exports");
  const server = getProperties(exports, loaded).server;
  const [, ready] = model.completeListen(server, loaded);
  const delivered = model.deliverRequest(server, { method: ESString(method), url: ESString("/") }, ready);
  expect(delivered.result[0]).toBe(Undefined);
  return { model, exports, response: delivered.response, context: delivered.result[1], ready };
}

function observe(exports: TESObject, context: TExecutionContext, expression = "loaded.read()") {
  const [completion, after] = evaluateCode(`const observation = (${expression});`,
    setVariablesInScope(context, { loaded: exports }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  return after.value.scope.observation;
}

// The reference executes the same complete module and makes an actual request.
// Buffer creation is declared input setup, not an interpreted Buffer constructor.
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
      const response = await new Promise(function(resolve, reject) {
        const request = http.request({ hostname: "127.0.0.1", port: server.address().port,
          path: "/", method: process.argv[2], agent: false }, function(incoming) {
          const chunks = [];
          incoming.on("data", function(chunk) { chunks.push(chunk); });
          incoming.once("error", reject);
          incoming.once("end", function() {
            const body = Buffer.concat(chunks);
            resolve({ statusCode: incoming.statusCode, body: body.toString("utf8"), bytes: Array.from(body) });
          });
        });
        request.once("error", reject);
        request.end();
      });
      process.stdout.write(JSON.stringify({ ...response, observed: loaded.read(), accepted: loaded.accepted() }));
    } finally {
      if (server) await new Promise(function(resolve) {
        server.close(resolve);
        server.closeAllConnections();
      });
    }
  })().catch(function(error) { console.error(error); process.exitCode = 1; });
`;

function real(source: string, method = "GET"): {
  statusCode: number; body: string; bytes: number[]; observed: string; accepted?: boolean;
} {
  assertPinnedNode();
  return withModuleFixture(source, filename => JSON.parse(execFileSync(
    process.env.PROPHET_NODE_BINARY || process.execPath,
    ["--no-global-search-paths", "-e", nativeReference, filename, method],
    { encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" },
      stdio: ["ignore", "pipe", "pipe"] }
  )));
}

function compare(source: string, buffers: { [name: string]: number[] } = {}, method = "GET", finish = false) {
  const declarations = Object.keys(buffers).map(name => `const ${name} = Buffer.from(${JSON.stringify(buffers[name])});`).join("\n");
  const inputs: { [name: string]: Any } = {};
  for (const name of Object.keys(buffers)) inputs[name] = createBufferValue(buffers[name]);
  const native = real(declarations + "\n" + source, method);
  const result = run(source, inputs, method);
  const wire = result.model.inspectResponse(result.response, result.context);
  expect(wire.statusCode).toMatchObject({ value: native.statusCode });
  expect(wire.body).toMatchObject({ value: native.body });
  const bytes = result.model.inspectResponseBytes(result.response, result.context);
  expect(bytes).toMatchObject({ type: "array" });
  const fields = getProperties(bytes as WithProperties, result.context);
  expect(fields.length).toMatchObject({ value: native.bytes.length });
  for (let index = 0; index < native.bytes.length; index++) {
    expect(fields[String(index)]).toMatchObject({ value: native.bytes[index] });
  }
  const observedContext = finish ? result.model.completeResponse(result.response, result.context)[1] : result.context;
  expect(observe(result.exports, observedContext)).toMatchObject({ value: native.observed });
  return { native, ...result };
}

for (const [handler, buffers, expected] of [
  ['res.write("first"); res.write(" second"); res.end(" last");', {}, "first second last"],
  ['res.write(bytes); res.end();', { bytes: [65, 195, 169, 240, 159, 152, 128] }, "Aé😀"],
  ['res.write("before:"); res.write(bytes); res.end(":after");', { bytes: [65, 0, 66] }, "before:A\0B:after"],
  ['res.write(first); res.write(second); res.end(third);', { first: [240], second: [159, 152], third: [128] }, "😀"],
  ['res.write(first); res.end(second);', { first: [195], second: [169] }, "é"],
  ['res.write(first); res.end(second);', { first: [255, 192], second: [128, 65] }, "���A"],
  ['res.write("\\ud83d"); res.end("\\ude00");', {}, "��"],
  ['res.end(bytes);', { bytes: [195, 169] }, "é"],
  ['res.write(bytes); res.end(bytes);', { bytes: [] }, ""]
] as Array<[string, { [name: string]: number[] }, string]>) {
  test(`queued strings and Buffers serialize as one byte stream: ${handler}`, () => {
    const { native } = compare(program(handler), buffers);
    expect(native.body).toBe(expected);
  });
}

test("write commits headers while end and finish remain distinct transitions", () => {
  const result = compare(program(`
    observed = res.headersSent + ":" + res.writableEnded + ":" + res.writableFinished;
    accepted = res.write("payload");
    observed = observed + ":" + typeof accepted + ":" + res.headersSent + ":" + res.writableEnded + ":" + res.writableFinished;
    res.on("finish", function() { observed = observed + ":finish:" + this.writableFinished; });
    observed = observed + ":same:" + (res.end() === res) + ":" + res.writableEnded + ":" + res.writableFinished;
  `), {}, "GET", true);
  const { model, response, exports, context, native } = result;
  // Compare after explicit finish delivery, since native already completed it.
  expect(native.observed).toBe("false:false:false:boolean:true:false:false:same:true:true:false:finish:true");
  const [, finished] = model.completeResponse(response, context);
  expect(observe(exports, finished)).toMatchObject({ value: native.observed });
  expect(resolveBoolean(observe(exports, context, "loaded.accepted()") as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
  expect(getProperties(response, context)).toMatchObject({ writableEnded: { value: true }, writableFinished: { value: false } });
  expect(getProperties(response, finished)).toMatchObject({ writableEnded: { value: true }, writableFinished: { value: true } });
  const events = effectPaths(context.value.effects!)[0].events.filter(event =>
    event.call.operation === "http.response.write" || event.call.operation === "http.response.end");
  expect(events.map(event => [event.call.operation, event.kind])).toEqual([
    ["http.response.write", "call"], ["http.response.write", "return"],
    ["http.response.end", "call"], ["http.response.end", "return"]
  ]);
  const beforeWrite = effectContext(events[0], context), afterWrite = effectContext(events[1], context);
  expect(model.inspectResponse(response, beforeWrite).statusCode).toBe(Undefined);
  expect(model.inspectResponse(response, afterWrite)).toMatchObject({ statusCode: { value: 200 }, body: Undefined });
  expect(model.inspectResponseBytes(response, beforeWrite)).toBe(Undefined);
  expect(model.inspectResponseBytes(response, afterWrite)).toBe(Undefined);
  expect(getProperties(response, beforeWrite)).toMatchObject({ headersSent: { value: false }, writableEnded: { value: false } });
  expect(getProperties(response, afterWrite)).toMatchObject({ headersSent: { value: true }, writableEnded: { value: false } });
  expect(() => model.completeResponse(response, afterWrite)).toThrow(/HTTP/);
});

for (const chunk of ['""', "bytes"]) {
  test(`an empty write (${chunk}) commits headers while capacity remains unknown`, () => {
    const { native, exports, context } = compare(program(`
      accepted = res.write(${chunk});
      observed = typeof accepted + ":" + res.headersSent + ":" + res.writableEnded;
      res.end();
    `), { bytes: [] });
    expect(native).toMatchObject({ body: "", accepted: true, observed: "boolean:true:false" });
    // Even empty writes can queue implicit header bytes. This small concrete
    // request succeeds, but the model has no socket-capacity assumption.
    expect(resolveBoolean(observe(exports, context, "loaded.accepted()") as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
  });
}

for (const [method, status] of [["HEAD", 200], ["GET", 204], ["GET", 304]] as Array<[string, number]>) {
  test(`${method} ${status} suppresses valid string and Buffer writes without backpressure`, () => {
    const { native, exports, context } = compare(program(`
      res.statusCode = ${status};
      accepted = res.write(bytes);
      observed = accepted + ":" + res.write("ignored") + ":" + res.headersSent + ":" + res.writableEnded;
      res.end(bytes);
    `), { bytes: [65, 195, 169] }, method);
    expect(native).toMatchObject({ statusCode: status, body: "", bytes: [], accepted: true, observed: "true:true:true:false" });
    expect(observe(exports, context, "loaded.accepted()")).toMatchObject({ value: true });
  });
}

test("queued Buffer aliases observe mutation before end but output survives mutation after consumption", () => {
  const { native, context, model, response } = compare(program(`
    res.write(bytes);
    bytes[0] = 66;
    res.write(bytes);
    bytes[0] = 67;
    res.end();
    bytes[0] = 68;
  `), { bytes: [65] });
  expect(native).toMatchObject({ body: "CC", bytes: [67, 67] });
  expect(model.inspectResponse(response, context).body).toMatchObject({ value: "CC" });
  const [, finished] = model.completeResponse(response, context);
  expect(model.inspectResponse(response, finished).body).toMatchObject({ value: "CC" });
  const fields = getProperties(model.inspectResponseBytes(response, context) as WithProperties, context);
  expect(fields[0]).toMatchObject({ value: 67 });
  expect(fields[1]).toMatchObject({ value: 67 });
  expect(fields.length).toMatchObject({ value: 2 });
});

test("an end(Buffer) payload is consumed before later mutations", () => {
  const { native } = compare(program('res.end(bytes); bytes[0] = 66;'), { bytes: [65] });
  expect(native).toMatchObject({ body: "A", bytes: [65] });
});

for (const argument of ["", "undefined", "null", "false", "0", "NaN", '""']) {
  test(`end(${argument}) adds no payload to earlier writes and can be repeated`, () => {
    const { native } = compare(program(`
      res.write("queued");
      const first = res.end(${argument}) === res;
      observed = first + ":" + (res.end(${argument}) === res);
    `));
    expect(native).toMatchObject({ body: "queued", observed: "true:true" });
  });
}

for (const argument of ["1", "true"]) {
  test(`end(${argument}) reports an invalid chunk before headers and allows recovery`, () => {
    const { native, context } = compare(program(`
      try { res.end(${argument}); }
      catch (error) { observed = error.name + ":" + error.code + ":" + res.headersSent + ":" + res.writableEnded; }
      res.end("recovered");
    `));
    expect(native).toMatchObject({ body: "recovered", observed: "TypeError:ERR_INVALID_ARG_TYPE:false:false" });
    expect(effectPaths(context.value.effects!)[0].events.filter(event => event.call.operation === "http.response.end").map(event => event.kind))
      .toEqual(["call", "throw", "call", "return"]);
  });
}

test("write validates a null chunk before checking an already ended response", () => {
  const { native } = compare(program(`
    res.end("done");
    try { res.write(null); }
    catch (error) { observed = error.name + ":" + error.code + ":" + res.headersSent + ":" + res.writableEnded; }
  `));
  expect(native).toMatchObject({ body: "done", observed: "TypeError:ERR_STREAM_NULL_VALUES:true:true" });
});

for (const [argument, code] of [
  ["null", "ERR_STREAM_NULL_VALUES"], ["undefined", "ERR_INVALID_ARG_TYPE"],
  ["", "ERR_INVALID_ARG_TYPE"], ["123", "ERR_INVALID_ARG_TYPE"], ["false", "ERR_INVALID_ARG_TYPE"]
]) {
  for (const method of ["GET", "HEAD"]) {
    test(`${method} write(${argument}) throws ${code} before committing output`, () => {
      const { native, context } = compare(program(`
        try { res.write(${argument}); }
        catch (error) { observed = error.name + ":" + error.code + ":" + res.headersSent + ":" + res.writableEnded; }
        res.end("recovered");
      `), {}, method);
      expect(native).toMatchObject({ observed: `TypeError:${code}:false:false`, body: method === "HEAD" ? "" : "recovered" });
      expect(effectPaths(context.value.effects!)[0].events.filter(event => event.call.operation === "http.response.write").map(event => event.kind))
        .toEqual(["call", "throw"]);
    });
  }
}

test("the first write commits status and later public status changes cannot suppress its body", () => {
  const { native } = compare(program(`
    res.statusCode = 201;
    res.write("first");
    res.statusCode = 204;
    res.end("last");
    observed = res.statusCode + ":" + res.headersSent;
  `));
  expect(native).toMatchObject({ statusCode: 201, body: "firstlast", observed: "204:true" });
});

test("chunk validation precedes implicit status validation and preserves a queued prefix on later failure", () => {
  const { native } = compare(program(`
    res.statusCode = 99;
    try { res.write(null); }
    catch (error) { observed = error.code + ":" + res.headersSent; }
    res.statusCode = 200;
    res.write("prefix");
    try { res.write(undefined); }
    catch (error) { observed = observed + ":" + error.code + ":" + res.headersSent; }
    res.end("suffix");
  `));
  expect(native).toMatchObject({ body: "prefixsuffix", observed: "ERR_STREAM_NULL_VALUES:false:ERR_INVALID_ARG_TYPE:true" });
});

test("an invalid status on write preserves the open response for recovery", () => {
  const { native, context } = compare(program(`
    res.statusCode = 99;
    try { res.write("discarded"); }
    catch (error) { observed = error.code + ":" + res.headersSent + ":" + res.writableEnded; }
    res.statusCode = 200;
    res.end("recovered");
  `));
  expect(native).toMatchObject({ body: "recovered", observed: "ERR_HTTP_INVALID_STATUS_CODE:false:false" });
  expect(effectPaths(context.value.effects!)[0].events.filter(event => event.call.operation === "http.response.write").map(event => event.kind))
    .toEqual(["call", "throw"]);
});

test("symbolic chunk selection and byte mutation remain correlated with output", () => {
  const selected = ESBoolean();
  const source = program(`
    accepted = res.write(selected ? bytes : "other");
    bytes[0] = selected ? 66 : 67;
    res.end("!");
  `);
  for (const value of [true, false]) {
    const { native } = compare(`const selected = ${value};\n${source}`, { bytes: [65] });
    expect(native.body).toBe(value ? "B!" : "other!");
  }
  const { model, response, context, exports } = run(source, { selected, bytes: createBufferValue([65]) });
  const body = model.inspectResponse(response, context).body;
  const bytes = model.inspectResponseBytes(response, context);
  const [completion, after] = evaluateCode(`
    const proved = selected ? body === "B!" && bytes.length === 2 && bytes[0] === 66 && bytes[1] === 33 :
      body === "other!" && bytes.length === 6 && bytes[0] === 111 && bytes[5] === 33;
    const uncertain = body === "B!";
  `, setVariablesInScope(context, { selected, body, bytes }));
  expect(isThrownValue(completion)).toBe(false);
  expect(after.value.scope.proved).toMatchObject({ value: true });
  expect(resolveBoolean(after.value.scope.uncertain as ReturnType<typeof ESBoolean>, after.value.knowledge)).toBeUndefined();
  expect(resolveBoolean(observe(exports, context, "loaded.accepted()") as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("a symbolic invalid chunk preserves only its exception and recovery path", () => {
  const invalid = ESBoolean();
  const source = program(`
    let caught = false;
    try { accepted = res.write(invalid ? null : bytes); }
    catch (error) { caught = error.code === "ERR_STREAM_NULL_VALUES"; res.write("recovered"); }
    observed = caught === invalid ? "correlated" : "wrong";
    res.end();
  `);
  for (const value of [true, false]) compare(`const invalid = ${value};\n${source}`, { bytes: [65] });
  const { model, response, exports, context } = run(source, { invalid, bytes: createBufferValue([65]) });
  expect(observe(exports, context)).toMatchObject({ value: "correlated" });
  const body = model.inspectResponse(response, context).body;
  const [completion, after] = evaluateCode(`
    const proved = invalid ? body === "recovered" : body === "A";
    const uncertain = body === "recovered";
  `, setVariablesInScope(context, { invalid, body }));
  expect(isThrownValue(completion)).toBe(false);
  expect(after.value.scope.proved).toMatchObject({ value: true });
  expect(resolveBoolean(after.value.scope.uncertain as ReturnType<typeof ESBoolean>, after.value.knowledge)).toBeUndefined();
  for (const path of effectPaths(context.value.effects!)) {
    const failed = resolveBoolean(invalid, path.knowledge);
    expect(failed).not.toBeUndefined();
    expect(path.events.filter(event => event.call.operation === "http.response.write").map(event => event.kind))
      .toEqual(failed ? ["call", "throw", "call", "return"] : ["call", "return"]);
  }
});

test("an unrestricted string body remains unknown through writes and UTF8 conversion", () => {
  const payload = ESString();
  const { model, response, context } = run(program('res.write("prefix"); res.write(payload); res.end("suffix");'), { payload });
  expect(model.inspectResponse(response, context).body).toMatchObject({ type: "string", value: undefined });
  const bytes = model.inspectResponseBytes(response, context);
  expect(bytes).toMatchObject({ type: "array", shape: { kind: "unknown" } });
  // Unknown arrays currently have no element contract. Index inspection must
  // stop analysis, rather than silently reporting the unknown byte as absent.
  expect(() => evaluateCode("const first = bytes[0];", setVariablesInScope(context, { bytes })))
    .toThrow("Indexed reads require known element positions or a symbolic dense array");
});

test("unknown backpressure branches do not choose either application path in advance", () => {
  const { model, response, context, exports } = run(program(`
    accepted = res.write("queued");
    if (accepted) observed = "ready";
    else observed = "wait for drain";
    res.end();
  `));
  expect(model.inspectResponse(response, context).body).toMatchObject({ value: "queued" });
  const [completion, after] = evaluateCode(`
    const proved = loaded.accepted() ? loaded.read() === "ready" : loaded.read() === "wait for drain";
    const uncertain = loaded.read() === "ready";
  `, setVariablesInScope(context, { loaded: exports }));
  expect(isThrownValue(completion)).toBe(false);
  expect(after.value.scope.proved).toMatchObject({ value: true });
  expect(resolveBoolean(after.value.scope.uncertain as ReturnType<typeof ESBoolean>, after.value.knowledge)).toBeUndefined();
});

test("symbolic body suppression preserves the status, payload and known successful return", () => {
  const suppressed = ESBoolean();
  const source = program(`
    res.statusCode = suppressed ? 204 : 200;
    accepted = res.write(bytes);
    res.end("suffix");
  `);
  for (const value of [true, false]) compare(`const suppressed = ${value};\n${source}`, { bytes: [65] });
  const { model, response, context, exports } = run(source, { suppressed, bytes: createBufferValue([65]) });
  const wire = model.inspectResponse(response, context);
  const [completion, after] = evaluateCode(`
    const proved = suppressed ? code === 204 && body === "" && loaded.accepted() === true : code === 200 && body === "Asuffix";
    const uncertain = body === "";
  `, setVariablesInScope(context, { loaded: exports, suppressed, code: wire.statusCode, body: wire.body }));
  expect(isThrownValue(completion)).toBe(false);
  expect(after.value.scope.proved).toMatchObject({ value: true });
  expect(resolveBoolean(after.value.scope.uncertain as ReturnType<typeof ESBoolean>, after.value.knowledge)).toBeUndefined();
});

for (const source of [
  'res.write("x", "utf8");', 'res.write("x", function() {});',
  'res.end(bytes, "utf8");', 'res.end(bytes, function() {});',
  'res.end(); res.write("late");', 'res.write({ toString: function() { return "x"; } });',
  'res.flushHeaders();', 'res.cork();'
]) {
  test(`unmodeled overloads, scheduling and object diagnostics remain explicit gaps: ${source}`, () => {
    expect(() => run(program(source), { bytes: createBufferValue([65]) })).toThrow(/HTTP|host property/);
  });
}
