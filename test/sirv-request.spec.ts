import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { createCommonJSLoader, createConsoleModel, createFileSystemModel, fileSystemDirectory, fileSystemFile,
  createHTTPModel, createPosixPathModel, evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { createProcessModel } from "../src/node/process";
import { createLegacyURLModel } from "../src/node/url";
import { createOpaqueBuiltinModule } from "../src/node/opaque";
import { ESObject, TESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { } from "../src/execution-context/Completion";
import { isThrownValue } from "../src/types";
import { getProperties } from "../src/execution-context/Heap";

function collectFiles(base: string, parent: string, into: Record<string, string>, prefix: string) {
  for (const name of readdirSync(join(base, parent))) {
    const rel = parent ? parent + "/" + name : name;
    const full = join(base, rel);
    if (statSync(full).isDirectory()) collectFiles(base, rel, into, prefix);
    else into[prefix + "/" + rel] = readFileSync(full, "utf8");
  }
}

// The published sirv, mrmime, totalist and @polka/url bytes load from the
// retained fixtures with no source rewrite; the entry only captures the
// factory so the test can build its own server. The driver mirrors the CLI
// runtime's assembled builtins (opaque https/querystring/stream included) so
// the request path observes the same module identities as a CLI run.
test("a delivered GET request runs the unchanged sirv handler through @polka/url parse", () => {
  const http = createHTTPModel();
  const consoleModel = createConsoleModel();
  const environment = createProcessModel({ cwd: "/app" });
  const path = createPosixPathModel({ process: environment.process });
  const filesystem = createFileSystemModel({ root: fileSystemDirectory({
    app: fileSystemDirectory({ site: fileSystemDirectory({ "hello.txt": fileSystemFile("hello from sirv\n", { mtimeMs: 1759500000000 }) }) })
  }) });
  const files: Record<string, string> = {};
  const packs: Array<[string, string]> = [["sirv-3.0.2", "sirv"], ["mrmime-2.0.1", "mrmime"],
      ["totalist-3.0.1", "totalist"], ["polka-url-1.0.0-next.29", "@polka/url"]];
  for (const [fixture, name] of packs) {
    collectFiles(join(__dirname, "fixtures", fixture, "package"), "", files, "/app/node_modules/" + name);
  }
  files["/app/entry.cjs"] = 'module.exports = require("sirv");';
  const context = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, console: consoleModel.module, process: environment.process }, "unmodeled") });
  const url = createLegacyURLModel();
  const loader = createCommonJSLoader(files, { builtins: {
    http: http.module, events: http.eventsModule, fs: filesystem.module, path: path.module,
    "path/posix": path.module, process: environment.process, url: url.module,
    https: createOpaqueBuiltinModule("https"), querystring: createOpaqueBuiltinModule("querystring"),
    stream: createOpaqueBuiltinModule("stream") } });
  const [factory, loaded] = loader.load("/app/entry.cjs", context);
  expect(isThrownValue(factory)).toBe(false);
  // The factory call, server creation and listen complete without a boundary:
  // totalist reads /app/site, mrmime resolves the text/plain content type, the
  // declared stats fields feed the header preparation, and the bound
  // viaCache.bind lookup captures the completed FILES table.
  const [setupCompletion, started] = evaluateCode(
    'const handler = factory("./site"); const server = http.createServer(handler); server.listen(0);',
    setVariablesInScope(loaded, { factory, http: http.module }));
  expect(isThrownValue(setupCompletion)).toBe(false);
  expect(isForkedCompletion(setupCompletion)).toBe(false);
  const server = started.value.scope.server;
  const [, ready] = http.completeListen(server, started);
  // Pinned Node 24.21.0 serves GET /hello.txt through the same unchanged
  // packages with status 200 and body "hello from sirv\n" (the sirv-target
  // pinned reference), and answers an ordinary Object.prototype-linked
  // headers object with no own names for a raw dispatch carrying none. The
  // delivered request declares method, url, the absent _parsedUrl cache slot
  // and that empty ordinary headers object, so the handler completes
  // @polka/url parse (both indexOf probes answer -1; the opaque querystring
  // builtin is never invoked), reads accept-encoding as undefined through
  // ordinary lookup, skips the disabled gzip/brotli negotiation, and spreads
  // the concrete default extensions into extns.push through bounded
  // ordinary-array call spread. toAssume's trailing-slash probe
  // uri.charCodeAt(len) answers 116 (the final "t"), the candidate list
  // builds, viaCache's cache[arr[i]] finds the completed FILES record for
  // "/hello.txt", and the handler reaches send(). The object spread of the
  // file headers completes, and send's
  // for-in enumeration over them visits nothing (the raw dispatch carries
  // no own header names). send's getHeader probes answer undefined (no
  // headers stored), the range branch is skipped, and res.writeHead(code,
  // headers) serializes the FILES record's Content-Type and Content-Length
  // fields (content-length is an ordinary explicit field, pinned verbatim).
  // send's fs.createReadStream(file, opts).pipe(res) (build.js:95) now
  // completes: the stream is a modeled EventEmitter, pipe wires its data and
  // end events to res.write and res.end, and the embedding delivers the file
  // bytes and completes the response. Pinned Node 24.21.0 answers GET
  // /hello.txt with status 200, body "hello from sirv\n", content-type
  // text/plain, content-length "16" and the pinned mtime as last-modified
  // (the sirv-target pinned reference).
  const delivered = http.deliverRequest(server, { method: ESString("GET"), url: ESString("/hello.txt") }, ready);
  expect(isThrownValue(delivered.result[0])).toBe(false);
  expect(isForkedCompletion(delivered.result[0])).toBe(false);
  expect(filesystem.createdReadStreams.length).toBe(1);
  const afterStream = filesystem.deliverReadStream(filesystem.createdReadStreams[0], delivered.result[1]);
  expect(isThrownValue(afterStream[0])).toBe(false);
  const afterComplete = http.completeResponse(delivered.response, afterStream[1]);
  expect(isThrownValue(afterComplete[0])).toBe(false);
  const wire = http.inspectResponse(delivered.response, afterComplete[1]);
  expect(wire.statusCode).toMatchObject({ value: 200 });
  expect(wire.body).toMatchObject({ value: "hello from sirv\n" });
  const wireHeaders = getProperties(wire.headers as TESObject, afterComplete[1]);
  expect(Object.keys(wireHeaders).sort()).toEqual(["content-length", "content-type", "last-modified"]);
  expect(wireHeaders["content-type"]).toMatchObject({ value: "text/plain" });
  expect(wireHeaders["content-length"]).toMatchObject({ value: "16" });
  expect(wireHeaders["last-modified"]).toMatchObject({ value: "Fri, 03 Oct 2025 14:00:00 GMT" });

  // Pinned Node 24.21.0 answers HEAD /hello.txt with status 200, an empty
  // body, and the same content-length, content-type and last-modified
  // headers as the GET (the sirv-target pinned reference). send() still
  // opens the read stream for the HEAD; the delivered bytes leave the
  // response body empty.
  const headDelivered = http.deliverRequest(server, { method: ESString("HEAD"), url: ESString("/hello.txt") }, ready);
  expect(isThrownValue(headDelivered.result[0])).toBe(false);
  expect(isForkedCompletion(headDelivered.result[0])).toBe(false);
  expect(filesystem.createdReadStreams.length).toBe(2);
  const headAfterStream = filesystem.deliverReadStream(filesystem.createdReadStreams[1], headDelivered.result[1]);
  expect(isThrownValue(headAfterStream[0])).toBe(false);
  const headComplete = http.completeResponse(headDelivered.response, headAfterStream[1]);
  expect(isThrownValue(headComplete[0])).toBe(false);
  const headWire = http.inspectResponse(headDelivered.response, headComplete[1]);
  expect(headWire.statusCode).toMatchObject({ value: 200 });
  expect(headWire.body).toMatchObject({ value: "" });
  const headWireHeaders = getProperties(headWire.headers as TESObject, headComplete[1]);
  expect(Object.keys(headWireHeaders).sort()).toEqual(["content-length", "content-type", "last-modified"]);
  expect(headWireHeaders["content-type"]).toMatchObject({ value: "text/plain" });
  expect(headWireHeaders["content-length"]).toMatchObject({ value: "16" });
  expect(headWireHeaders["last-modified"]).toMatchObject({ value: "Fri, 03 Oct 2025 14:00:00 GMT" });

  // Pinned Node 24.21.0 answers GET /missing with status 404 and an empty
  // body (the sirv-target pinned reference). viaCache finds no FILES record,
  // the handler falls to isNotFound, and is404's comma sequence
  // (res.statusCode = 404, res.end()) completes through the modeled
  // SequenceExpression resolver; no read stream is opened.
  const missingDelivered = http.deliverRequest(server, { method: ESString("GET"), url: ESString("/missing") }, ready);
  expect(isThrownValue(missingDelivered.result[0])).toBe(false);
  expect(isForkedCompletion(missingDelivered.result[0])).toBe(false);
  expect(filesystem.createdReadStreams.length).toBe(2);
  const missingComplete = http.completeResponse(missingDelivered.response, missingDelivered.result[1]);
  expect(isThrownValue(missingComplete[0])).toBe(false);
  const missingWire = http.inspectResponse(missingDelivered.response, missingComplete[1]);
  expect(missingWire.statusCode).toMatchObject({ value: 404 });
  expect(missingWire.body).toMatchObject({ value: "" });
  const missingWireHeaders = getProperties(missingWire.headers as TESObject, missingComplete[1]);
  expect(Object.keys(missingWireHeaders)).toEqual([]);
});
