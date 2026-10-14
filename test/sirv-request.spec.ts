import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { createCommonJSLoader, createConsoleModel, createFileSystemModel, fileSystemDirectory, fileSystemFile,
  createHTTPModel, createPosixPathModel, evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { createProcessModel } from "../src/node/process";
import { createLegacyURLModel } from "../src/node/url";
import { createOpaqueBuiltinModule } from "../src/node/opaque";
import { ESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { isThrownValue } from "../src/types";

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
  // pinned reference). On a raw dispatch a fresh IncomingMessage reads
  // req._parsedUrl as undefined, so @polka/url's parse probe falls through to
  // its own computation: raw.indexOf('#', 1) and raw.indexOf('?', 1) both
  // answer -1 for "/hello.txt", search stays the empty string so the opaque
  // querystring parse is skipped, and parse writes the cached object back on
  // the request. The handler then destructures pathname and reaches for
  // req.headers['accept-encoding'] (sirv build.js lines 171-172): the
  // delivered request declares only method, url and the absent _parsedUrl
  // cache slot, so that read is the measured legacy host stop.
  expect(() => http.deliverRequest(server, { method: ESString("GET"), url: ESString("/hello.txt") }, ready))
    .toThrow("Unmodeled host property 'headers': Node HTTP incoming request API");
});
