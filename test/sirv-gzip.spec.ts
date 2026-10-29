import { createCommonJSLoader, createFileSystemModel, fileSystemDirectory, fileSystemFile,
  createHTTPModel, createPosixPathModel, evaluateCode, nodeInitialExecutionContext } from "../src";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { createProcessModel } from "../src/node/process";
import { createLegacyURLModel } from "../src/node/url";
import { createOpaqueBuiltinModule } from "../src/node/opaque";
import { ESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, realpathSync, writeFileSync } from "fs";
import { copySync, removeSync } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { executionBoundaries, hasExecutionBoundary, isForkedCompletion } from "../src/execution-context/Completion";
import { getProperties } from "../src/execution-context/Heap";
import { isThrownValue, WithProperties } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

const packages = [["sirv-3.0.2", "sirv"], ["mrmime-2.0.1", "mrmime"],
  ["totalist-3.0.1", "totalist"], ["polka-url-1.0.0-next.29", "@polka/url"]];
let directory: string;
beforeEach(() => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), "prophet-sirv-map-")));
  for (const [fixture, name] of packages) copySync(join(__dirname, "fixtures", fixture, "package"), join(directory, "node_modules", name));
  mkdirSync(join(directory, "site"));
  writeFileSync(join(directory, "site/hello.txt"), "hello from sirv\n");
});
afterEach(() => removeSync(directory));

// Text-safe payloads deliberately exercise file choice and ordered output, not
// gzip compression/decompression or arbitrary binary Buffer fidelity. Sirv does
// not validate gzip bytes; it labels and streams the selected existing file.
for (const scenario of [
  { name: "selects existing gzip file", encoding: "gzip", compressed: true, expected: "gzip fixture bytes\n", encoded: true },
  { name: "falls back when gzip file is absent", encoding: "gzip", compressed: false, expected: "hello from sirv\n", encoded: false },
  { name: "keeps original file without accepted encoding", encoding: "", compressed: true, expected: "hello from sirv\n", encoded: false }
]) test(`unchanged sirv gzip negotiation ${scenario.name}`, () => {
  if (scenario.compressed) writeFileSync(join(directory, "site/hello.txt.gz"), "gzip fixture bytes\n");
  assertPinnedNode();
  // Native reference uses a Writable response adapter, real file streaming and
  // unchanged package code; no network or transport behavior is asserted.
  const native = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ["--no-global-search-paths", "-e", `const {Writable} = require('node:stream');
      const headers = {}; let body = ''; let status;
      const response = new Writable({write(chunk, encoding, done) { body += chunk; done(); }});
      response.getHeader = name => headers[name.toLowerCase()];
      response.setHeader = (name, value) => { headers[name.toLowerCase()] = String(value); };
      response.writeHead = (code, values) => { status = code;
        for (const name in values) response.setHeader(name, values[name]); };
      response.on('finish', () => process.stdout.write(JSON.stringify({status,body,
        vary:headers.vary, type:headers['content-type'], length:headers['content-length'],
        encoding:headers['content-encoding'] || null})));
      require('sirv')('./site', {gzip:true})({method:'GET',url:'/hello.txt',headers:{'accept-encoding':${JSON.stringify(scenario.encoding)}}}, response);`],
    { cwd: directory, encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(native.error).toBeUndefined();
  expect(native.status).toBe(0);
  expect(native.stderr).toBe("");
  expect(JSON.parse(native.stdout)).toEqual({ status:200, body:scenario.expected,
    vary:"Accept-Encoding", type:"text/plain", length:String(scenario.expected.length), encoding:scenario.encoded ? "gzip" : null });
  const http = createHTTPModel();
  const processModel = createProcessModel({ cwd: "/app" });
  const path = createPosixPathModel({ process: processModel.process });
  const fs = createFileSystemModel({ root: fileSystemDirectory({ app: fileSystemDirectory({
    site: fileSystemDirectory({ "hello.txt": fileSystemFile("hello from sirv\n", { mtimeMs: 1759500000000 }),
      ...(scenario.compressed ? { "hello.txt.gz": fileSystemFile("gzip fixture bytes\n", { mtimeMs: 1759500000000 }) } : {}) })
  }) }) });
  const files: Record<string, string> = {};
  function collect(source: string, target: string) {
    for (const name of readdirSync(source)) {
      if (statSync(join(source, name)).isDirectory()) collect(join(source, name), target + "/" + name);
      else files[target + "/" + name] = readFileSync(join(source, name), "utf8");
    }
  }
  collect(join(directory, "node_modules"), "/app/node_modules");
  files["/app/entry.cjs"] = "module.exports = require('sirv');";
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, process: processModel.process }, "unmodeled") });
  const loader = createCommonJSLoader(files, { builtins: {
    http: http.module, events: http.eventsModule, fs: fs.module, path: path.module,
    "path/posix": path.module, process: processModel.process, url: createLegacyURLModel().module,
    https: createOpaqueBuiltinModule("https"), querystring: createOpaqueBuiltinModule("querystring"),
    stream: createOpaqueBuiltinModule("stream") } });
  const [factory, loaded] = loader.load("/app/entry.cjs", initial);
  const [setup, started] = evaluateCode(`const handler = factory('./site', {gzip:true});
    const server = http.createServer(handler); server.listen(0);`, setVariablesInScope(loaded, { factory, http: http.module }));
  expect(isThrownValue(setup)).toBe(false);
  expect(isForkedCompletion(setup)).toBe(false);
  expect(hasExecutionBoundary(setup)).toBe(false);
  const server = started.value.scope.server;
  const [, ready] = http.completeListen(server, started);
  const request = http.deliverRequest(server, { method: ESString("GET"), url: ESString("/hello.txt"),
    headers: { "accept-encoding": scenario.encoding } }, ready);
  expect(isThrownValue(request.result[0])).toBe(false);
  expect(executionBoundaries(request.result[0]).map(boundary => boundary.message)).toEqual([]);
  expect(fs.createdReadStreams).toHaveLength(1);
  const streamed = fs.deliverReadStream(fs.createdReadStreams[0], request.result[1]);
  const completed = http.completeResponse(request.response, streamed[1]);
  const response = http.inspectResponse(request.response, completed[1]);
  expect(response.statusCode).toMatchObject({ value: 200 });
  expect(response.body).toMatchObject({ value: scenario.expected });
  const headers = getProperties(response.headers as WithProperties, completed[1]);
  expect(headers["vary"]).toMatchObject({ value: "Accept-Encoding" });
  expect(headers["content-type"]).toMatchObject({ value: "text/plain" });
  expect(headers["content-length"]).toMatchObject({ value: String(scenario.expected.length) });
  if (scenario.encoded) expect(headers["content-encoding"]).toMatchObject({ value: "gzip" });
  else expect(headers["content-encoding"]).toBeUndefined();
});
