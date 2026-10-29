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
import { runFile } from "../src/cli/runtime";
import { isESFunction } from "../src/Function/Function";
import { ForkedCompletion, executionBoundaries, hasExecutionBoundary, isForkedCompletion } from "../src/execution-context/Completion";
import { getArrayElements, getProperties } from "../src/execution-context/Heap";
import { Any, isThrownValue, WithProperties } from "../src/types";
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

// Complete published sources are unchanged. The declared application options
// exercise the real extension callbacks at sirv build.js:128-129, followed by
// the existing filesystem/resource fork and completed handler closure.
for (const options of [{ gzip: true }, { brotli: true }, { gzip: true, brotli: true }]) {
  test(`unchanged sirv compression factory maps extensions: ${JSON.stringify(options)}`, () => {
    writeFileSync(join(directory, "entry.cjs"), `module.exports = require('sirv')('./site', ${JSON.stringify(options)});`);
    const result = runFile({ script: "entry.cjs", args: [], maxSteps: 100000, runtime: "node@24.21.0" }, directory);
    expect(result.diagnostic).toBeUndefined();
    expect(result.status).toBe("evaluated");
    expect(isForkedCompletion(result.completion)).toBe(true);
    expect(hasExecutionBoundary(result.completion as Any)).toBe(false);
    const fork = result.completion as ForkedCompletion;
    const returned = [fork.consequent, fork.alternate].find(leaf => !isThrownValue(leaf[0]))!;
    const failed = [fork.consequent, fork.alternate].find(leaf => isThrownValue(leaf[0]))!;
    expect(isESFunction(returned[0])).toBe(true);
    expect(isThrownValue(failed[0])).toBe(true);
    if (!isThrownValue(failed[0])) throw new Error("expected filesystem resource failure");
    expect(getProperties(failed[0].value as WithProperties, failed[1]).code).toMatchObject({ value: "EMFILE" });
    for (const leaf of [returned, failed]) {
      const activation = Array.from(leaf[1].value.environments.values()).find(record => record.has("extensions") && record.has("gzips"))!;
      expect(activation).toBeDefined();
      const extensions = activation.get("extensions")!.value;
      expect(getArrayElements(extensions as any, leaf[1])!.map(value => (value as any).value)).toEqual(["html", "htm"]);
      for (const [key, enabled, suffix] of [["gzips", options.gzip, "gz"], ["brots", options.brotli, "br"]] as Array<[string, boolean | undefined, string]>) {
        const value = activation.get(key)!.value;
        if (enabled) {
          expect(value).not.toBe(extensions);
          expect(getArrayElements(value as any, leaf[1])!.map(item => (item as any).value)).toEqual([`html.${suffix}`, `htm.${suffix}`, suffix]);
        } else expect(value).toMatchObject({ type: "undefined" });
      }
    }
    for (const file of ["sirv/build.js", "totalist/sync/index.js", "@polka/url/build.js", "mrmime/index.js"]) {
      const path = join(directory, "node_modules", file);
      expect(result.input.sources.get(path)!.text).toBe(readFileSync(path, "utf8"));
    }
  });
}

// No sockets or lifecycle scripts: exercise real native factory and missing-file
// dispatch with an interpreted application next callback. Compression matching
// is deliberately absent; brotli still reaches its explicit RegExp /i boundary.
for (const brotli of [false, true]) test(`gzip-enabled sirv missing-file dispatch, brotli=${brotli}, has explicit coverage`, () => {
  assertPinnedNode();
  const source = `const handler = require('sirv')('./site', {gzip:true,brotli:${brotli}});
    let calls = 0;
    handler({method:'GET',url:'/missing',headers:{}}, {}, function () { calls++; });
    module.exports = calls;`;
  writeFileSync(join(directory, "entry.cjs"), source);
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ["--no-global-search-paths", "-e", "process.stdout.write(JSON.stringify(require('./entry.cjs')));"],
    { cwd: directory, encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
  expect(child.stderr).toBe("");
  expect(JSON.parse(child.stdout)).toBe(1);
  const result = runFile({ script: "entry.cjs", args: [], maxSteps: 100000, runtime: "node@24.21.0" }, directory);
  if (brotli) {
    expect(result.status).toBe("analysis-stop");
    expect(result.diagnostic).toBe("RegExp.test is not yet supported: flags (including global/sticky state)");
    expect(hasExecutionBoundary(result.completion as Any)).toBe(true);
    return;
  }
  expect(result.diagnostic).toBeUndefined();
  expect(result.status).toBe("evaluated");
  expect(isForkedCompletion(result.completion)).toBe(true);
  expect(hasExecutionBoundary(result.completion as Any)).toBe(false);
  const fork = result.completion as ForkedCompletion;
  const returned = [fork.consequent, fork.alternate].find(leaf => !isThrownValue(leaf[0]))!;
  expect(returned[0]).toMatchObject({ type: "number", value: JSON.parse(child.stdout) });
});

// The former unshift rejection now asserts real negotiation/fallback behavior.
// Complete gzip file selection and streaming are covered in sirv-gzip.spec.ts.
test("unchanged sirv gzip negotiation reaches the caller fallback for a missing file", () => {
  writeFileSync(join(directory, "entry.cjs"), `const handler = require('sirv')('./site', {gzip:true});
    module.exports = handler({method:'GET',url:'/missing',headers:{'accept-encoding':'gzip'}}, {}, function () { return 7; });`);
  const result = runFile({ script: "entry.cjs", args: [], maxSteps: 100000, runtime: "node@24.21.0" }, directory);
  expect(result.status).toBe("evaluated");
  expect(result.diagnostic).toBeUndefined();
  expect(hasExecutionBoundary(result.completion as Any)).toBe(false);
  expect(isForkedCompletion(result.completion)).toBe(true);
  const fork = result.completion as ForkedCompletion;
  const returned = [fork.consequent, fork.alternate].find(leaf => !isThrownValue(leaf[0]))!;
  expect(returned[0]).toMatchObject({ type: "number", value: 7 });
});


test("gzip-enabled unchanged sirv serves an ordinary GET without accept-encoding", () => {
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
        encoded:Object.hasOwn(headers,'content-encoding')})));
      require('sirv')('./site', {gzip:true})({method:'GET',url:'/hello.txt',headers:{}}, response);`],
    { cwd: directory, encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(native.error).toBeUndefined();
  expect(native.status).toBe(0);
  expect(native.stderr).toBe("");
  expect(JSON.parse(native.stdout)).toEqual({ status:200, body:"hello from sirv\n",
    vary:"Accept-Encoding", type:"text/plain", length:"16", encoded:false });
  const http = createHTTPModel();
  const processModel = createProcessModel({ cwd: "/app" });
  const path = createPosixPathModel({ process: processModel.process });
  const fs = createFileSystemModel({ root: fileSystemDirectory({ app: fileSystemDirectory({
    site: fileSystemDirectory({ "hello.txt": fileSystemFile("hello from sirv\n", { mtimeMs: 1759500000000 }) })
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
  const request = http.deliverRequest(server, { method: ESString("GET"), url: ESString("/hello.txt") }, ready);
  expect(isThrownValue(request.result[0])).toBe(false);
  expect(executionBoundaries(request.result[0]).map(boundary => boundary.message)).toEqual([]);
  expect(fs.createdReadStreams).toHaveLength(1);
  const streamed = fs.deliverReadStream(fs.createdReadStreams[0], request.result[1]);
  const completed = http.completeResponse(request.response, streamed[1]);
  const response = http.inspectResponse(request.response, completed[1]);
  expect(response.statusCode).toMatchObject({ value: 200 });
  expect(response.body).toMatchObject({ value: "hello from sirv\n" });
  const headers = getProperties(response.headers as WithProperties, completed[1]);
  expect(headers["vary"]).toMatchObject({ value: "Accept-Encoding" });
  expect(headers["content-type"]).toMatchObject({ value: "text/plain" });
  expect(headers["content-length"]).toMatchObject({ value: "16" });
  expect(headers["content-encoding"]).toBeUndefined();
});
