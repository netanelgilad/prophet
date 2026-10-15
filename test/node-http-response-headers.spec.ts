import { execFileSync } from "child_process";
import { createCommonJSLoader, evaluateCode, isForkedCompletion } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { createHTTPModel } from "../src/node/http";
import { isESObject, TESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { nodeInitialExecutionContext } from "../src";
import { isThrownValue, Undefined } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

const nodeBinary = process.env.PROPHET_NODE_BINARY || process.execPath;

function program(handler: string) {
  return `
    const http = require("node:http");
    let observed = "";
    const server = http.createServer(function(req, res) { ${handler} });
    server.listen(0, "127.0.0.1");
    module.exports = { server: server, read: function() { return observed; } };
  `;
}

function run(handler: string) {
  const model = createHTTPModel();
  const filename = "/app/response-headers.cjs";
  const [exports, loaded] = createCommonJSLoader({ [filename]: program(handler) },
    { builtins: { http: model.module } }).load(filename, nodeInitialExecutionContext);
  expect(isThrownValue(exports)).toBe(false);
  if (!isESObject(exports)) throw new Error("Expected module exports");
  const server = getProperties(exports, loaded).server;
  const [, ready] = model.completeListen(server, loaded);
  const delivered = model.deliverRequest(server, { method: ESString("GET"), url: ESString("/") }, ready);
  expect(delivered.result[0]).toBe(Undefined);
  return { model, exports, response: delivered.response as TESObject, context: delivered.result[1] };
}

// Native oracle: the pinned fact holds for Node 24.21.0's ServerResponse.
// The source runs against a real ServerResponse and must define proof true.
function pin(source: string) {
  assertPinnedNode();
  const native = execFileSync(nodeBinary,
    ["-e", `const http = require("http"); const res = new http.ServerResponse({ method: "GET" }); ${source};process.stdout.write(JSON.stringify(proof));`],
    { encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(JSON.parse(native)).toBe(true);
}

describe("response getHeader/setHeader surface", () => {
  test("setHeader stores raw values under the lowercased name and getHeader reads them", () => {
    pin(`res.setHeader("X-A", "1"); res.setHeader("X-N", 5);
      const proof = res.getHeader("x-a") === "1" && res.getHeader("X-a") === "1" && res.getHeader("x-n") === 5;`);
    const { exports, context } = run(`
      res.setHeader("X-A", "1"); res.setHeader("X-N", 5);
      if (res.getHeader("x-a") === "1" && res.getHeader("X-a") === "1" && res.getHeader("x-n") === 5) observed = "ok";
    `);
    const read = run_read(exports, context);
    expect(read).toMatchObject({ value: "ok" });
  });

  test("getHeader answers undefined for absent names and does not validate read names", () => {
    pin(`const proof = res.getHeader("x-nope") === undefined && res.getHeader("x y") === undefined;`);
    const { exports, context } = run(`
      if (res.getHeader("x-nope") === undefined && res.getHeader("x y") === undefined) observed = "ok";
    `);
    expect(run_read(exports, context)).toMatchObject({ value: "ok" });
  });

  test("setHeader returns the response for chaining", () => {
    pin(`const proof = res.setHeader("x-a", "1") === res;`);
    const { exports, context } = run(`
      if (res.setHeader("x-a", "1") === res) observed = "ok";
    `);
    expect(run_read(exports, context)).toMatchObject({ value: "ok" });
  });

  test("an invalid setHeader name throws the pinned TypeError", () => {
    pin(`let code = "", message = "";
      try { res.setHeader("x bad", "1"); } catch (e) { code = e.code; message = e.message; }
      const proof = code === "ERR_INVALID_HTTP_TOKEN" && message === 'Header name must be a valid HTTP token ["x bad"]';`);
    const { exports, context } = run(`
      let code = "", message = "";
      try { res.setHeader("x bad", "1"); } catch (e) { code = e.code; message = e.message; }
      if (code === "ERR_INVALID_HTTP_TOKEN" && message === 'Header name must be a valid HTTP token ["x bad"]') observed = "ok";
    `);
    expect(run_read(exports, context)).toMatchObject({ value: "ok" });
  });

  test("an invalid string value throws ERR_INVALID_CHAR and stores nothing", () => {
    pin(`let code = "";
      try { res.setHeader("x-a", "a\\nb"); } catch (e) { code = e.code; }
      const proof = code === "ERR_INVALID_CHAR" && res.getHeader("x-a") === undefined;`);
    const { exports, context } = run(`
      let code = "";
      try { res.setHeader("x-a", "a\\nb"); } catch (e) { code = e.code; }
      if (code === "ERR_INVALID_CHAR" && res.getHeader("x-a") === undefined) observed = "ok";
    `);
    expect(run_read(exports, context)).toMatchObject({ value: "ok" });
  });

  test("getHeaderNames and getHeaders serve lowercase names in insertion order with raw values", () => {
    pin(`res.setHeader("X-B", 2); res.setHeader("x-a", "1");
      const names = res.getHeaderNames(); const all = res.getHeaders();
      const proof = names.length === 2 && names[0] === "x-b" && names[1] === "x-a"
        && all["x-b"] === 2 && all["x-a"] === "1" && Object.getPrototypeOf(all) === null;`);
    const { exports, context } = run(`
      res.setHeader("X-B", 2); res.setHeader("x-a", "1");
      const names = res.getHeaderNames(); const all = res.getHeaders();
      if (names.length === 2 && names[0] === "x-b" && names[1] === "x-a"
        && all["x-b"] === 2 && all["x-a"] === "1") observed = "ok";
    `);
    expect(run_read(exports, context)).toMatchObject({ value: "ok" });
  });

  test("hasHeader answers presence and removeHeader clears it", () => {
    pin(`res.setHeader("x-a", "1");
      const before = res.hasHeader("X-A") && !res.hasHeader("x-zz");
      res.removeHeader("x-a");
      const proof = before && !res.hasHeader("x-a") && res.getHeader("x-a") === undefined;`);
    const { exports, context } = run(`
      res.setHeader("x-a", "1");
      const before = res.hasHeader("X-A") && !res.hasHeader("x-zz");
      res.removeHeader("x-a");
      if (before && !res.hasHeader("x-a") && res.getHeader("x-a") === undefined) observed = "ok";
    `);
    expect(run_read(exports, context)).toMatchObject({ value: "ok" });
  });

  test("setHeader and removeHeader after writeHead throw ERR_HTTP_HEADERS_SENT, getHeader still answers", () => {
    pin(`res.setHeader("x-a", "1"); res.writeHead(200, {});
      let setCode = "", removeCode = "";
      try { res.setHeader("x-b", "2"); } catch (e) { setCode = e.code; }
      try { res.removeHeader("x-a"); } catch (e) { removeCode = e.code; }
      const proof = setCode === "ERR_HTTP_HEADERS_SENT" && removeCode === "ERR_HTTP_HEADERS_SENT"
        && res.getHeader("x-a") === "1";`);
    const { exports, context } = run(`
      res.setHeader("x-a", "1"); res.writeHead(200, {});
      let setCode = "", removeCode = "";
      try { res.setHeader("x-b", "2"); } catch (e) { setCode = e.code; }
      try { res.removeHeader("x-a"); } catch (e) { removeCode = e.code; }
      if (setCode === "ERR_HTTP_HEADERS_SENT" && removeCode === "ERR_HTTP_HEADERS_SENT"
        && res.getHeader("x-a") === "1") observed = "ok";
    `);
    expect(run_read(exports, context)).toMatchObject({ value: "ok" });
  });

  test("writeHead argument fields enter the store raw only once a setHeader created it", () => {
    pin(`res.writeHead(200, { "X-New": "wire-only" });
      const proof = res.getHeader("x-new") === undefined && res.getHeaderNames().length === 0;`);
    const empty = run(`
      res.writeHead(200, { "X-New": "wire-only" });
      if (res.getHeader("x-new") === undefined && res.getHeaderNames().length === 0) observed = "ok";
    `);
    expect(run_read(empty.exports, empty.context)).toMatchObject({ value: "ok" });
    pin(`res.setHeader("x-a", "1"); res.writeHead(200, { "X-New": 7 });
      const proof = res.getHeader("x-new") === 7;`);
    const created = run(`
      res.setHeader("x-a", "1"); res.writeHead(200, { "X-New": 7 });
      if (res.getHeader("x-new") === 7) observed = "ok";
    `);
    expect(run_read(created.exports, created.context)).toMatchObject({ value: "ok" });
  });

  test("content-length serializes as an ordinary explicit field through writeHead", () => {
    pin(`res.writeHead(200, { "Content-Length": 15 });
      const proof = true;`);
    const { model, exports, response, context } = run(`
      res.writeHead(200, { "Content-Length": 15 });
      observed = "ok";
    `);
    expect(run_read(exports, context)).toMatchObject({ value: "ok" });
    expect(getProperties(model.inspectResponse(response, context).headers as TESObject, context))
      .toMatchObject({ "content-length": { value: "15" } });
  });

  test("content-length values pass verbatim with no writeHead-time validation", () => {
    pin(`let accepted = 0;
      for (const value of [-1, "abc", 2.5, 0]) {
        const r = new (res.constructor)({ method: "GET" });
        try { r.writeHead(200, { "Content-Length": value }); accepted = accepted + 1; } catch (e) {}
      }
      const proof = accepted === 4;`);
    const { exports, context } = run(`
      let accepted = 0;
      try { res.writeHead(200, { "Content-Length": -1 }); accepted = accepted + 1; } catch (e) {}
      if (accepted === 1) observed = "ok";
    `);
    expect(run_read(exports, context)).toMatchObject({ value: "ok" });
  });

  test("content-length flows through the setHeader store and the writeHead merge", () => {
    pin(`res.setHeader("Content-Length", 5);
      res.writeHead(200, {});
      const proof = res.getHeader("content-length") === 5;`);
    const { model, exports, response, context } = run(`
      res.setHeader("Content-Length", 5);
      res.writeHead(200, {});
      if (res.getHeader("content-length") === 5) observed = "ok";
    `);
    expect(run_read(exports, context)).toMatchObject({ value: "ok" });
    expect(getProperties(model.inspectResponse(response, context).headers as TESObject, context))
      .toMatchObject({ "content-length": { value: "5" } });
  });

  test("a bare ServerResponse enforces no body-length coupling at write or end", () => {
    pin(`const few = new (res.constructor)({ method: "GET" });
      few.writeHead(200, { "Content-Length": 10 }); few.write("hello");
      let fewer = "no-throw";
      try { few.end(); } catch (e) { fewer = e.code; }
      const more = new (res.constructor)({ method: "GET" });
      more.writeHead(200, { "Content-Length": 2 });
      let exceeded = "no-throw";
      try { more.write("hello"); } catch (e) { exceeded = e.code; }
      const proof = fewer === "no-throw" && exceeded === "no-throw";`);
    const { exports, context } = run(`
      res.writeHead(200, { "Content-Length": 10 });
      res.write("hello");
      let fewer = "no-throw";
      try { res.end(); } catch (e) { fewer = e.code; }
      if (fewer === "no-throw") observed = "ok";
    `);
    expect(run_read(exports, context)).toMatchObject({ value: "ok" });
  });

  test("writeHead merges stored headers with its argument winning per lowercase name", () => {
    pin(`res.setHeader("X-A", "stored"); res.setHeader("X-B", "kept");
      res.writeHead(201, { "X-A": "arg" });
      const proof = res.getHeader("x-a") === "arg" && res.getHeader("x-b") === "kept" && res.headersSent === true;`);
    const { model, exports, response, context } = run(`
      res.setHeader("X-A", "stored"); res.setHeader("X-B", "kept");
      res.writeHead(201, { "X-A": "arg" });
      if (res.getHeader("x-a") === "arg" && res.getHeader("x-b") === "kept") observed = "ok";
    `);
    expect(run_read(exports, context)).toMatchObject({ value: "ok" });
    const projection = model.inspectResponse(response, context);
    expect(getProperties(projection.headers as TESObject, context)).toMatchObject({
      "x-a": { value: "arg" }, "x-b": { value: "kept" } });
  });
});

function run_read(exports: TESObject, context: any) {
  const [completion, after] = evaluateCode("const observation = loaded.read();",
    setVariablesInScope(context, { loaded: exports }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  return after.value.scope.observation;
}
