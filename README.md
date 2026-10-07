# Prophet

Prophet is a JavaScript interpreter whose values can be concrete or symbolic.
Concrete execution is the fully known case of the same evaluation model. The
long-term goal is a JavaScript VM with Test262 conformance and symbolic execution;
the current implementation supports a limited subset of JavaScript.

The product is a use-case-agnostic symbolic execution runtime with a primary
CLI surface: **symbolic environment → symbolic environment**, for a selected
program/runtime. Input and output use the same representation; a concrete
starting environment may be constructed when none is supplied. The result
retains conditional state, completions and observable history, including the
program's output and possible external effects. See the [runtime/state contract](docs/symbolic-runtime.md).

Security scanning, debugging, correctness and performance tools consume this
result. Sensitivity labels, policies and verdicts belong to those tools. The
CLI now emits a reference graph for CommonJS execution, automatically acquired
dependencies, console output and bounded HTTP startup with symbolic binding
outcomes. It is an inspection projection, not yet the complete
environment input/output contract. The internal TypeScript exports are not a
commitment to the eventual implementation language. The
[roadmap](docs/roadmap.md) and [security use-case plan](docs/agent-security-analysis.md)
retain the real-server and controlled Shai-Hulud goals without claiming a
complete runtime CLI or dependency scanner already exists.

The [pico startup milestone](docs/roadmap.md#next-milestone-pico-startup-through-the-cli-with-no-environment-file)
now has a bounded CLI proof **without an environment file**: the unchanged script
either reaches a waiting server and its startup message or throws an unhandled
bind Error. Explicit environment input and future-request exploration remain work.

## First CLI slice

From an installed checkout:

```sh
./bin/prophet.js --runtime node@24.21.0 -- app.cjs > result.json
```

For example, the [CLI spec](test/cli.spec.ts) runs this source without an input
environment file:

```js
if (Math.random() < 0.5) console.log("left");
else console.log("right");
console.log("done");
```

The result preserves both output histories (`left\ndone\n` or `right\ndone\n`),
their condition and a shared final write. It includes initial/current state
references and a modeled completion. Program output stays inside the graph;
Prophet writes the graph directly as `{ roots, nodes }` to stdout. Runtime
diagnostics go to stderr; implementation notes stay in docs. No target code runs natively.

The CLI captures reached local, JSON and package imports through the shared
CommonJS resolver and loader. Source bytes and positive/negative file probes are
cached across symbolic branches; evaluated modules retain each branch's own
cache state. Capture is read-only, POSIX-only and non-atomic. Unresolved bare
packages stop because external search paths are not captured. The console, HTTP
and shared EventEmitter builtins are connected. HTTPS, filesystem, URL and path
imports have stable object identities, but reached APIs stop analysis.
HTTP binding can succeed or fail symbolically without probing or opening a real
socket. After normal entry completion, the CLI drains a persistent FIFO of
supported startup jobs, executing the actual listening/error callbacks. A thrown
branch retains later jobs without executing them. It does not invent requests,
filesystem contents or a general event loop. Default stdout is modeled
as healthy; random draws stay symbolic. A stopped result retains one partial checkpoint, which may omit sibling
histories. The graph is nonresumable and future request callbacks are unexplored.
The unchanged pico example now produces the conditional startup result through
the CLI. See the [CLI format and boundaries](docs/cli.md).

## Run the specs

Behavior examples live in `test/*.spec.ts`, alongside their interpreted source,
input setup, and assertions. Run a specific spec directly through the existing
test command; do not add standalone demo files, runners, or per-example scripts.
Use **Node v24.21.0**, the pinned CommonJS reference and CI release. If Jest runs
on another release, set `PROPHET_NODE_BINARY` to a v24.21.0 executable for the
compatibility oracle. A mismatch fails explicitly rather than skipping coverage.

```sh
node .yarn/releases/yarn-3.1.1.cjs install --immutable
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/min.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/cli.spec.ts test/cli-runtime.spec.ts test/cli-graph.spec.ts test/cli-arguments.spec.ts test/analysis-failure-context.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/cli-imports.spec.ts test/cli-source-capture.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/symbolic-routing.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/unknown-length.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/lexical-environments.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/symbolic-exceptions.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/arithmetic-bounds.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/commonjs-compat.spec.ts test/commonjs-symbolic.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/commonjs-loader-compat.spec.ts test/commonjs-loader-symbolic.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/commonjs-resolution-compat.spec.ts test/commonjs-package-config.spec.ts test/commonjs-resolution-symbolic.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/commonjs-package-resolution.spec.ts test/commonjs-package-exports.spec.ts test/commonjs-package-symbolic.spec.ts test/published-invariant.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/host-effects.spec.ts test/discount-server.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/node-http-server.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/node-http-binding.spec.ts test/node-http-bind-reference.spec.ts test/node-tcp-bind.spec.ts test/host-slots-graph.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/jobs.spec.ts test/node-http-startup.spec.ts test/node-startup-reference.spec.ts test/node-opaque-builtins.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/node-http-write.spec.ts test/pico-static-server-analysis.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/commonjs-builtins.spec.ts test/node-http-lifecycle.spec.ts test/node-http-lifecycle-reference.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/node-path.spec.ts test/pico-static-server-analysis.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/node-url.spec.ts test/node-warnings.spec.ts test/node-url-path.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/node-filesystem.spec.ts test/filesystem-state.spec.ts test/filesystem-failures.spec.ts test/node-filesystem-failures-reference.spec.ts test/pico-static-server-analysis.spec.ts test/pico-static-server-reference.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/node-buffer.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/node-path-parse.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/instanceof.spec.ts test/instanceof-internal.spec.ts test/test262.spec.ts
```

- [Recursive minimum](test/min.spec.ts) proves `d[0] < min(d)` false for ten
  unknown random values, checks every element bound, and preserves uncertain
  results. No host random numbers are sampled.
- [Symbolic routing](test/symbolic-routing.spec.ts) proves that returned strings
  agree with writes observed through an object alias, while the chosen route
  stays unknown.
- [Unknown-length recursion](test/unknown-length.spec.ts) checks inferred bounds
  for minimum and maximum, an unknown length, proof work counts, summary reuse,
  and cases that must not gain unsupported facts.
- [Captured validators](test/lexical-environments.spec.ts) creates two range
  validators with independent limits. For an arbitrary finite input, acceptance
  stays unknown, accepted values satisfy the captured bounds, and disjoint
  ranges cannot both accept. The same specs check shared mutable captures,
  escaping block/catch bindings, and closures selected on symbolic paths.
- [Throwing validators](test/symbolic-exceptions.spec.ts) carries successful and
  throwing calls through expressions, callers, catch, and finally. It proves
  accepted bounds for a captured range validator over an arbitrary finite input,
  checks effects happen exactly once on each path, and keeps the bound unknown
  when the input may be NaN.
- [Arithmetic bounds](test/arithmetic-bounds.spec.ts) carries numeric limits
  through calculations. It proves a random value scaled by 10 always passes
  `range(0, 10)`, scaling by 1000 may pass or throw, and adding 11 to that scaled
  value always throws. A separate normalization function proves a [0, 1] output
  for inputs bounded by its caller's branch.
- [CommonJS source execution](test/commonjs-compat.spec.ts) compares exports,
  module scope, wrapper parameters, returns, and throws against real `.cjs`
  execution in pinned Node. [Symbolic module specs](test/commonjs-symbolic.spec.ts)
  prove bounds through an exported closure and preserve initializer effects when
  the module can throw.
- [CommonJS loading](test/commonjs-loader-compat.spec.ts) compares an explicitly
  supplied graph of `.cjs` files against Node: relative/absolute requests, cache
  identity, cycles, and failed-load retry. [Symbolic loader specs](test/commonjs-loader-symbolic.spec.ts)
  keep cache state and effects associated with each execution path and prove
  bounds through a function that loads a validator with `require`.
- [Local module resolution](test/commonjs-resolution-compat.spec.ts) checks file
  and directory selection, package `main`/`type`, and cached JSON modules against
  Node. [Configuration proofs](test/commonjs-resolution-symbolic.spec.ts) load a
  normalizer through a directory entry and prove its bounds using JSON limits,
  while preserving conditional configuration choices and mutations.
- [Package lookup](test/commonjs-package-resolution.spec.ts) and
  [conditional exports](test/commonjs-package-exports.spec.ts) compare ancestor
  `node_modules` search, self-reference, public subpaths, condition ordering,
  and target selection with Node. [Symbolic package specs](test/commonjs-package-symbolic.spec.ts)
  preserve cache identity, initialization counts, and denied imports per path.
- [Published invariant](test/published-invariant.spec.ts) executes the unmodified
  `tiny-invariant` 1.3.3 package through its real exports map. For any JavaScript
  number, it proves rejection or a normalized result in [0, 1]. The lazy message
  runs once on development rejection, never on success or in production.
  Each environment is supplied explicitly.
- [Error construction](test/error-construction.spec.ts) and
  [string concatenation](test/string-concat.spec.ts) preserve user conversion
  calls, effects, and exceptions. [Prototype state](test/prototype-state.spec.ts)
  keeps inherited values available when another path creates an own property.
- [Host effects](test/host-effects.spec.ts) retain ordered calls, returns, throws,
  object snapshots, and resource changes under their execution conditions.
- [Node HTTP server](test/node-http-server.spec.ts) interprets the full module,
  including imports, server creation, callback registration, and listen. With
  unknown method and URL strings, it proves routing, response status, and body
  under an explicit successful event schedule. Real Node checks the same source.
- [Builtin loading](test/commonjs-builtins.spec.ts) preserves canonical module
  identity and package precedence with supplied models. [HTTP lifecycle specs](test/node-http-lifecycle.spec.ts)
  preserve current closure state, callback receivers, conditional exceptions,
  and committed response output; [independent Node observations](test/node-http-lifecycle-reference.spec.ts)
  check response flags, numeric status conversion, and UTF-8 serialization.
- [Discount server](test/discount-server.spec.ts) runs a real Express 4.22.1
  endpoint on pinned Node, then symbolically evaluates the same handler with
  explicit file-write and response models. Invalid input never writes; accepted
  input writes a normalized value before 204, or propagates a write failure
  without responding. Express dispatch and its 500 response are currently
  covered by concrete reference tests only.

Specs execute JavaScript through `evaluateCode(source, initialContext)` from
`src/index.ts`. `context.value.scope` exposes the initialized, visible bindings
for inspection; unmodeled implicit bindings are omitted from that projection.
Persistent environment records hold the actual binding state and analysis gaps.
Each interpreted `Math.random()` produces a fresh unknown number in [0, 1).

## Next practical target

The North Star is to analyze existing JavaScript and its dependencies and prove
properties across the supplied input and environment domain. Unsupported behavior
and unfinished proofs must stay explicit. Automatic counterexample generation
can later consume surviving path facts; it is not required for the next VM step.

The first path toward that target is a configurable validator, followed by an
unmodified, pinned published build of `tiny-invariant`:

1. **Captured configuration:** closures retain independent bounds, share intended
   mutations, and preserve branch correlations. Covered by the lexical specs.
2. **Return or throw:** propagate calls that return on some symbolic paths and
   throw on others through callers, catch, and finally. Covered by the symbolic
   exception specs, including constructors and calls nested inside expressions.
3. **Computed inputs:** retain numeric bounds through arithmetic so validators
   can analyze transformed inputs. Covered by the arithmetic specs, including
   rounding, overflow, signed zero, and cases that must remain unknown.
4. **CommonJS compatibility:** model `require` and module state with a dedicated
   suite checked against a pinned Node runtime. Cover module execution, exports,
   caching, cycles, resolution, and failures in separate increments. Test262
   covers ECMAScript; Node's host APIs require their own compatibility tests.
   Supplied-source execution, caching/cycles, local file/directory resolution,
   JSON, package-name lookup, and exact conditional exports are covered. Patterns,
   package imports, further host APIs, and broader Node compatibility remain.
5. **Real dependency:** add the Error, string, environment, and remaining
   semantics required by the pinned library; execute its actual source in a
   spec. The actual package now proves normalization or rejection for every
   JavaScript number, including NaN and infinities, with lazy-message effects.
   Each package proof states its supported Node subset.
6. **Node host APIs and servers:** model `node:http` as the host boundary. Start
   with builtin imports, server setup and registered callback delivery, then
   response lifecycle, request body streams, and effectful application logic.
   Express and its dependencies will later execute as ordinary JavaScript above
   those boundaries. The existing discount example retains a real Express
   reference and a direct symbolic handler proof; it does not establish HTTP
   setup or dispatch. No Express-specific model belongs in the VM.
   The first full raw HTTP server proof below now passes for the scoped model.
7. **Later, replayable counterexamples:** generate a concrete violating input,
   then independently replay it against that same source. Sample testing alone
   must never establish a universal proof.

Each increment goes to `master` with focused specs and relevant Test262 cases.
Full JavaScript conformance and broader symbolic domains remain parallel goals.
The [detailed roadmap](docs/roadmap.md) records CommonJS compatibility criteria,
external-effect modeling requirements, and the Node HTTP milestones leading to
later Express proofs.

The first external application target is now the unmodified
[`pico-static-server` 3.0.3](docs/real-world-target.md), a small published Node
server with no runtime dependencies. The goal is to classify request/filesystem
paths that let an exception escape, and produce feasible evidence that can be
replayed in Node. Its source revision, first input domain, and acceptance steps
are recorded in the target document and linked from `AGENTS.md`.
[Pinned Node references](test/pico-static-server-reference.spec.ts) now reproduce
an uncaught missing-default-file error and record the package's actual headers.
[Prophet](test/pico-static-server-analysis.spec.ts) loads the unchanged module
and invokes its arrow factory with omitted, undefined, or supplied options.
Default initialization, options spreads, and `listen(port, callback)` complete
under the declared successful-bind environment. The factory returns its actual
modeled server. Delivering its deferred listening callback now evaluates its
original template and captures its console message under an explicit healthy-
stdout assumption. Real OPTIONS, POST, and DELETE requests now complete. With an
explicitly delivered request event with an unknown method constrained to exclude
GET/HEAD, Prophet proves a 200
response for OPTIONS and 405 otherwise, an empty body, and an absent `Allow`
header. The unchanged package reverses the headers/reason arguments to
`writeHead`, so Node enumerates the status text as numeric header names and
ignores its intended headers. Pinned Node references confirm this behavior.
The response status remains unknown until the method is constrained further.
This starts after protocol dispatch: traffic such as CONNECT uses other Node
events, so it does not establish a response for every possible wire request.
GET/HEAD now execute their original URL/path expression and consult the shared
filesystem. For `/folder/../missing?download=1` under a declared empty `/site`,
the computed path is `/site/missing` and the handler completes a 404 response.
An HTTPS override reaches the opaque HTTPS API.

The [legacy URL model](docs/node-url.md) parses path-style URLs with query and
fragment text, including finite symbolic choices. The [URL/path specs](test/node-url-path.spec.ts)
analyze this ordinary function:

```js
function requestPath(target) {
  return path.join("/site", path.normalize(url.parse(target).pathname));
}
```

They prove the resulting filename for either of two possible targets while the
choice remains unknown. They also prove that an empty target makes this function
throw: legacy parsing produces a null pathname, which path.normalize rejects.
Protocol/authority parsing, query objects and open symbolic text remain gaps.

The shared VM now retains an interpreted function's source filename. Node uses
that location to suppress DEP0169 for callers inside `node_modules`; the native
checkout fixture is outside that directory and does warn. Both layouts are
explicit in the integration specs. Eligible calls queue a warning once, before
argument validation. The scoped warning model keeps the queue and subsequent
stderr output in persistent state; explicit delivery represents a later tick
under default warning handling and healthy stderr. No real output is written.

The [filesystem model](docs/node-filesystem.md) represents a closed tree using
ordinary VM values and choices. For example, this input says that `/site/docs`
is either an empty directory or absent:

```ts
const directoryExists = ESBoolean();
const root = fileSystemDirectory({
  site: fileSystemDirectory({
    docs: selectValue(directoryExists, fileSystemDirectory({}), ESNull)
  })
});
const filesystem = createFileSystemModel({ root });
```

`existsSync`, `statSync` and `readFileSync` consult that same tree and retain the
same condition across calls. With the unchanged server and a GET or HEAD request
for `/docs`, Prophet now proves a 404 on the absent branch, or an escaping
`ENOENT` from reading `/site/docs/index.html` on the directory branch. The latter
branch neither commits headers nor ends the response. Pinned Node replays of
both concrete tree choices confirm the corresponding 404 or process exit from
an uncaught exception. This is a bounded reproduction of the recorded behavior,
not a novel vulnerability or a claim about every filesystem/request.

The tree has a case-sensitive UTF-8 namespace and regular files/directories,
with shared symbolic effective read/search access and descriptor availability.
It still excludes symlinks, concurrent changes, and post-open read/close/allocation
failures. Access defaults to allowed; the filesystem platform defaults to Linux
with explicit Darwin selection for differing error priority. UTF-8 reads return text; default successful reads now return fresh
[Buffer values](docs/node-buffer.md) with byte length, indexed reads/writes and
UTF-8 decoding. Bytes live in the persistent VM heap: aliases observe a write,
earlier contexts and the file retain their contents, and symbolic changes keep
their original conditions. The [Buffer specs](test/node-buffer.spec.ts) prove
correlated multibyte decoding while the resulting text remains unknown.
After reading either a regular file or a present directory index, the unchanged
GET/HEAD handler now proves `data instanceof Error` false through the shared
[prototype operation](docs/instanceof.md). It enters its original success branch
and uses `path.parse` to compute the MIME type. It now completes status 200,
`write`, `end`, and explicit finish delivery, serving the file on GET and
suppressing its bytes on HEAD. The original reversed writeHead arguments still
discard its intended MIME/length headers. A symbolic index-presence choice
classifies successful serving versus escaping ENOENT. The declared healthy
transport consumes queued bytes at synchronous end; other flush schedules and
transport failures remain open.
Stats fields/options, other path forms, filesystem writes and wider
platform/metadata behavior remain recorded gaps. Symbolic execution performs no
real filesystem I/O; native fixture creation belongs only to reference specs.

The [POSIX path model](docs/node-path.md) evaluates `join` and `normalize` for
concrete strings and finite symbolic choices, preserving the choices' conditions.
It also preserves replacement of the exported `normalize` function: `join` calls
that current function with its effects, return value, or exception. Open symbolic
strings and other path APIs remain explicit gaps. These are lexical operations;
they do not inspect files or establish that a path stays within a directory.

[Untagged templates](test/template-literals.spec.ts) use shared string conversion
and preserve substitution order, effects, and throws. The scoped
[console model](docs/node-console.md) records zero-argument or single-string
`console.log` calls in the existing effect trace. For example, the
[console specs](test/node-console.spec.ts) analyze:

```js
function announce(port) {
  console.log(`port=${port}`);
  return port > 0;
}
const port = selected ? 8080 : 3000;
const observation = announce(port);
```

With `selected` an unknown Boolean, `observation` is true. Output remains two
conditional possibilities, `port=8080\n` or `port=3000\n`; `port === 8080` stays
unknown. Capturing output does not establish real stream delivery or flushing.

## First complete server proof: Node HTTP

The [Node HTTP spec](test/node-http-server.spec.ts) owns the first complete server
program, including setup:

```js
const http = require("node:http");
const server = http.createServer(function(req, res) {
  if (req.method === "GET" && req.url === "/health") {
    res.statusCode = 200;
    res.end("ok");
  } else {
    res.statusCode = 404;
    res.end("Not found");
  }
});
server.listen(0, "127.0.0.1");
module.exports = server;
```

Prophet now interprets that entire source. `createHTTPModel()` supplies a scoped
Node boundary, registered through `createCommonJSLoader(files, { builtins:
{ http: model.module } })`. Both `http` and `node:http` select that same module.
The server retains the actual interpreted listener in persistent VM state.
The embedding explicitly delivers successful listening, a request, and successful
response completion. No real socket or automatic event loop runs in analysis.

The [spec](test/node-http-server.spec.ts) makes method and URL unrestricted
symbolic strings and proves: GET `/health` selects 200, other combinations select
404; exactly one `end` occurs; the body is `ok` or `Not found`, except HEAD sends
no body. The chosen route and response remain unknown until constrained. These
string domains include more values than valid HTTP syntax; the model starts at
an already parsed request and does not claim a protocol-parser proof.

`model.completeListen(server, context)` delivers the deferred startup event.
`model.deliverRequest(server, { method, url }, context)` returns request/response
identities and a `[completion, context]` result from executing the registered
callback. `model.completeResponse(response, context)` delivers successful output
completion. Each step uses the current context, preserving changes to captured
variables since registration. Conditional throws remain completion branches.
`model.inspectResponse` reads committed output; changing `res.statusCode` after
`end` does not change the already captured status. Trace labels distinguish
`http.server.request` from Node's outgoing `http.request` API.

The same source runs in pinned Node v24.21.0 with real HTTP requests. Further
local specs check deferred callbacks and response flags, HEAD/204/304 body
suppression, UTF-8 replacement of lone surrogates, and status normalization.
Unknown string payloads remain unknown after encoding; no unsupported identity
between original code units and decoded wire text is assumed.

[Header compatibility specs](test/node-http-headers.spec.ts) cover direct
`writeHead` overloads, validation and retry order, finite conditional fields, and
the distinction between public status fields and committed output. `end` now
uses the same header operation implicitly. `inspectResponse` adds the committed
`statusMessage` and a `headers` object containing explicit serialized fields,
with lowercased names and exact value whitespace. Automatic Date, connection,
and framing fields are excluded from this projection. It is not Node's
`getHeaders` API or a complete wire-header model.
The [status catalog](test/node-http-status-codes.spec.ts) contains all 63 pinned
Node entries and preserves mutations through ordinary VM state. Replacing the
exported table does not replace the original table used for default reasons.

This proof assumes successful `listen(0, "127.0.0.1"[, callback])`, one delivered
request, and successful response completion. The surface supports multiple
request listeners, method/URL reads, numeric status values, string/Buffer `write`
and `end` payloads, and falsy no-payload `end`. Writes queue Buffer references;
consumption at synchronous end sees their current bytes. Normal write returns
an unknown Boolean without socket-capacity facts, while suppression returns true.
Other overloads, broader stream behavior and EventEmitter APIs,
body parsing, bind failures, socket loss/backpressure, and general scheduling
remain explicit gaps. Field values are modeled before full host descriptors:
ownership inspection of partial server/response objects also reports a gap.
See [HTTP coverage and limitations](docs/node-http.md), including complete
upstream cases that cannot yet run unmodified.

[Listen compatibility specs](test/node-http-listen.spec.ts) additionally cover
numeric `listen(port[, callback])` and `listen(port, "127.0.0.1"[, callback])`,
including nonzero ports and finite symbolic choices in a primary process.
The optional bind model supplies null success or Error failure, including symbolic
choices; omitted configuration keeps the older successful-bind domain. The CLI
instead supplies unknown outcomes. Hostless `listen` attempts binding inline and
sets `server.listening` only on success; explicit host waits for lookup/binding.
Both forms defer success/error notification. The CLI drains these jobs through
the [shared startup queue](docs/jobs.md) after normal entry completion; explicit
loopback lookup appends a separate notification behind already queued work.
Invalid numeric ports produce a catchable
RangeError and retain already registered callbacks; a call on an already bound
server produces `ERR_SERVER_ALREADY_LISTEN` before registering another callback.
Unbounded symbolic ports, other overloads, custom callback conversion, inherited
listen options, and overlapping pending attempts remain explicit gaps.
[Binding specs](test/node-http-binding.spec.ts) and [isolated Node observations](test/node-http-bind-reference.spec.ts)
also cover deferred occupied-port errors, unhandled delivery and retries. Exact
OS failure relationships and shared socket/resource contention remain unknown.

Shared [event-listener specs](test/node-events.spec.ts) now cover `on`,
`addListener`, `once`, `removeListener`/`off`, `emit`, and `listenerCount`, including
conditional registration/removal, listener snapshots, reentrant once listeners,
and escaping throws. `createEventEmitterModel().module` can be supplied as the
`events` builtin. HTTP uses the same implementation for request, listening, bind-error and
finish callbacks. [Whole-server event specs](test/node-http-events.spec.ts) prove
that a finish callback runs on explicit completion, after `end`, using current
captured variables. Host lifecycle emission/counting, listener metadata events,
warning behavior, and streams remain explicit gaps; see [event coverage](docs/node-events.md).
When supplying both builtins, register `{ http: model.module, events:
model.eventsModule }` from one HTTP model, so their method identities and emitter
state belong to the same host environment. An existing event model can instead
be passed to `createHTTPModel(events)`.

Scoped POSIX path, legacy URL, correlated filesystem state and Buffer reads now
run through the real factory's GET/HEAD paths. Shared `instanceof` now follows
prototype links and preserves conditional errors. POSIX path.parse now returns
five fresh mutable fields for concrete strings and finite choices, retaining
symbolic correlations. Scoped HTTP response writes now complete the real file-serving
path; [write specs](test/node-http-write.spec.ts) compare ordered text/raw bytes,
mutations, suppression, validation and unknown backpressure with pinned Node.
Shared [choice equality](docs/symbolic-choice-equality.md) now preserves the
combined GET/HEAD proof: an existing index gives 200 and the appropriate body;
a missing index escapes as ENOENT. Every path reaches the read, without an
impossible 405 or filtering. General disjunctive relationships remain unknown.
Shared filesystem access/capacity inputs now prove 404 for inaccessible traversal,
EACCES for denied reads, EMFILE for descriptor exhaustion, or 200 with the correct
GET/HEAD body. All sixteen method/access/capacity combinations remain represented;
real Node server witnesses reproduce the failures. Descriptor availability is a
baseline at filesystem calls, not a resource pool coupled to HTTP startup.
The [pico CLI startup proof without an environment file](docs/roadmap.md#next-milestone-pico-startup-through-the-cli-with-no-environment-file)
now preserves ready/error outcomes. Next extend environment capture and future
request exploration, then explicit environment input and generic observable effects usable by
independent consumer tools. Post-open read/close failures and descriptor
lifetime remain backlog work driven by those scenarios. Header
arrays/duplicates, progressive header APIs, effectful value conversion, open
symbolic text, and transport-sensitive fields including Content-Length remain
explicit gaps in the backlog. Request body delivery and JSON parsing later lead back to
the discount application below. Finally, supply
Express's unmodified sources as ordinary CommonJS dependencies: its routing and
middleware must emerge from executing its code. Do not model `express()`,
`app.post()`, or `express.json()` as special Prophet operations.

## Later integration target: saving a discount

The [server spec](test/discount-server.spec.ts) owns this handler and its complete
Express application setup. A POST to `/discount` updates one UTF-8 file:

```js
function saveDiscount(req, res) {
  const percentage = req.body.percentage;
  if (!(typeof percentage === "number" && percentage >= 0 && percentage <= 100)) {
    res.statusCode = 400;
    res.end("Invalid discount");
    return;
  }
  const normalized = percentage / 100;
  fs.writeFileSync(discountPath, String(normalized), "utf8");
  res.statusCode = 204;
  res.end();
}
```

The real application uses `express.json()`, registers this handler, and installs
error middleware that returns 400 for malformed JSON and 500 for a write failure.
Express 4.22.1 and its dependency graph are pinned by the development dependency,
lockfile, and checked-in Yarn cache. Node v24.21.0 reference specs send actual
HTTP requests and inspect temporary files and operation order.

Prophet currently evaluates the **same handler directly**, with an ordinary
request body object and explicit synchronous host models. Every JavaScript
number is considered, including NaN and infinities; separate cases reject
unknown strings, unknown Booleans, null, undefined, objects, and arrays. On the
accepted paths the actual string payload comes from a computed number in [0, 1].
Its exact value remains unknown. The file environment is either an existing file
whose write succeeds or a missing parent/file whose write throws ENOENT before
modification. Response completion is assumed to succeed.

That is a declared subset of host behavior. Partial writes, other filesystem
failures, complete Error fields, HTTP/socket failures, and asynchronous schedules
are not modeled here. JSON parsing, middleware dispatch, and the application's
500 response have concrete Express coverage, not a symbolic server proof yet.
This remains a regression example and a later integration target. First model
the lower-level Node HTTP behavior above, extend it to body delivery and writes,
then execute Express's unmodified package source and dependencies on top of
those same boundaries. Its route and error dispatch must come from its code.

## Spec-first development

The goal is full Test262 coverage and advanced symbolic evaluation in the same
VM. Every feature should expand executable specifications and the implementation
together:

1. Start with a small spec that expresses the desired JavaScript behavior or
   symbolic conclusion. Keep the source and explicit input assumptions beside
   assertions for both proven results and results that must remain unknown.
2. For language semantics, add relevant complete, unmodified Test262 cases to
   the active corpus and extend runner support when needed. For symbolic
   features, add proof and counterexample specs; use independent concrete
   JavaScript checks where they help catch unsound conclusions.
3. Implement reusable VM semantics and reasoning rules. Do not recognize a
   sample function by its name or body, or quietly narrow its inputs just to
   make the spec pass. Record temporary strategy/input limits explicitly and
   expand them with cases such as empty/sparse arrays, NaN/infinities, aliases,
   side effects, and alternative control flow.
4. Run the affected spec files while developing. Before pushing the next
   increment to `master`, run the full specs and typecheck. Existing passing behavior must
   remain covered; unsupported or skipped cases do not count as conformance.

Boundary specs that currently expect an unsupported-analysis error protect
against false proofs. They record missing capability, not the desired final VM
behavior. When implementing that capability, replace those rejection assertions
with the appropriate JavaScript behavior and symbolic results. Keep remaining
limits visible; do not make the tests permanently enforce a shortcut.

Maintain the [implementation gap backlog](docs/implementation-gaps.md) alongside
each increment. It records known unsupported behavior, assumptions such as successful
socket binding or healthy output, legacy behavior awaiting a soundness audit,
and unverified coverage including the retained skipped tests. New limits need
an entry with evidence and a closure criterion; partial improvements must leave
their remaining cases open. This is a maintained inventory of known gaps, not
a claim that every missing JavaScript or Node behavior has been discovered.

## Values, expressions, and knowledge

These are separate concepts in the representation:

- **Values** have an identity and an internal kind such as `number`, `string`, or
  `array`. Primitive values may carry a known `value`. Internal kinds are not
  JavaScript `typeof` strings: `typeof []` and `typeof null` both produce
  `"object"`.
- **Expressions** describe computations, such as a comparison, arithmetic, or
  `select(condition, consequent, alternate)`. A comparison expression represents
  a question; it does not claim that the comparison is true. The same conditional
  representation works for numeric, string, boolean, object, and mixed results.
- **Knowledge** is a collection of facts that all hold together. Its current
  TypeScript type is `ReadonlyArray<Fact>`, where facts express numeric order,
  finiteness, exclusion of NaN, integrality, collection membership, universal
  element bounds, or the truth of a condition. There is no separate
  variant for every combination of facts. The vocabulary can grow independently
  of the value kinds and expression forms.

See [the expression and fact types](src/symbolic/model.ts) and
[the shared reasoning implementation](src/symbolic/index.ts). Values can retain
established facts, while the execution context carries assumptions valid on the
current path. The numeric module provides compatibility entry points to this
shared model.

An unknown `if`, ternary, or short-circuit condition forks evaluation with
opposite assumptions. Each branch starts from the same state. Results and
bindings merge as conditional values, preserving their guards instead of
independently forgetting which alternatives belong together. Numeric selections
also retain facts established in both alternatives. For example, `a < b ? a : b`
can carry the fact that its result is no greater than either input.

Object and array writes use a [persistent heap](src/execution-context/Heap.ts)
in the execution context. Branches keep separate property versions, so a write
on one branch cannot leak into the other. Aliases retain object identity and
observe the same merged properties. [Branch merging](src/execution-context/branches.ts)
and [statement evaluation](src/evaluate.ts) preserve early returns so the
remaining statements execute only on paths that continue.

[Lexical environments](src/execution-context/ExecutionContext.ts) similarly
separate scope identity from the current values of its bindings. A function
captures its creation environment; a call allocates a fresh activation and reads
captured values from the current path's store. Two closures can share one binding,
while calls to the same factory have independent bindings. Restoring the caller
keeps captured writes and escaping closures alive. Branch merging retains both
value choices and conditional initialization state. `let`/`const` bindings exist
before their declarations execute, with reads in that interval producing a
catchable ReferenceError; writes to initialized constants produce a TypeError.

Assuming a composed Boolean condition such as `a && b` examines its feasible
alternatives and keeps facts shared by all of them. This lets accepted validators
imply their bounds without assuming a meaning for the validator's name or body.
[Compound-guard specs](test/compound-guards.spec.ts) also protect cases that must
remain unknown, including NaN and facts belonging to only one alternative.

## Calls that can return or throw

External operations use `createHostFunction(name, model)`. The model receives
the receiver, argument values, and current execution context, and returns a VM
value or throwing completion with the updated context. It uses persistent VM
state; it must not perform the real write, response, or other external action.
No model means an explicit analysis error. An accidental exception in model
implementation also remains an analysis error, rather than a JavaScript throw.

The context's `effects` trace records call and return/throw events, operation and
function identity, and the heap and facts at each event. Branches join traces
under their original guards; a conditional write never becomes unconditional.
`effectPaths(context.value.effects)` inspects alternatives in order and keeps
their path facts. `effectContext(event, context, path.knowledge)` exposes the
object state at that event. These snapshots support inspection, not replaying
captured callbacks or asynchronous work. Models must use persistent heap updates
so retained snapshots remain valid.

Trace inspection has a configurable path limit (third argument, default 256)
and raises explicitly if exceeded. It does not limit the evaluated input domain.
Only trace choices are enumerated: payloads can remain symbolic, and the reasoner
can retain alternatives it cannot prove impossible. The generic specs include
failure after mutation; a throwing operation does not automatically undo state.

The VM can analyze this ordinary factory and the function it returns:

```js
function range(low, high) {
  return function(value) {
    if (value < low || value > high) throw "range";
    return value;
  };
}
```

For `range(0, 10)` and an arbitrary finite numeric input, Prophet proves that a
normal result equals the input and lies in [0, 10]. Inputs outside that range
reach the catch path. A surrounding finally block runs once on either path.
Which path is taken remains unknown until the input is constrained. With NaN
allowed, that bound is correctly left unknown: JavaScript's comparisons let NaN
pass this particular validator.

Expression resolvers compose evaluations through `bindNormal`: continue the
surrounding expression on normal leaves, and propagate thrown or returned
completions. `mapCompletions` handles cleanup on every leaf. This preserves a
member call's receiver, an assignment's destination, earlier argument values,
and writes made before the throw. Earlier operations are never replayed to
reconstruct a branch. Argument and initializer state stays separate per path.

`evaluateCode` returns `[completion, context]`. Normal program completion is
`Undefined`; an unconditional throw is now a `ThrownValue`, with the existing
`context.value.uncaught` and `stderr` diagnostics retained. Mixed outcomes return
a `ForkedCompletion` containing the guard and two `[completion, context]`
branches. Each leaf keeps its path facts, final bindings/heap, and diagnostics.
The second tuple item is a merged state for inspection, not a claim that every
path succeeded. Use `isThrownValue` and `isForkedCompletion` from `src/index.ts`
to inspect the first item; an empty merged stderr does not rule out a thrown
branch. Test262's runner explicitly rejects unresolved forked completions.

Arrays describe their structure explicitly (`elements`, `segments`, `symbolic`,
or `unknown`), without a `concrete` flag. A known list can contain unknown numbers;
its length and positions remain available. Knowing an array's shape is separate
from knowing every element's value.

Different unknown identities may have equal values. NaN, infinities, and signed
zero require JavaScript-specific reasoning: in particular, a false `<` comparison
only supplies the reverse order fact when both operands are known not to be NaN.

## Numeric bounds through arithmetic

For example, the VM can analyze this ordinary JavaScript function:

```js
function normalize(value, low, high) {
  return (value - low) / (high - low);
}
```

Inside a branch establishing `input >= 20 && input <= 80`, Prophet proves
`normalize(input, 20, 80)` is between 0 and 1. Outside that branch, an otherwise
unconstrained input leaves the result's bounds unknown. The same rules power
the range-validator examples; neither function receives special treatment.

[Arithmetic inference](src/symbolic/arithmetic.ts) reads each operand's bounds
and the current path's facts, then attaches ordinary `order` and `finite` or
`notNaN` facts to the resulting expression. Addition, subtraction, multiplication,
and division use a closed enclosure of their finite operand intervals. A finite
input without explicit limits uses JavaScript's largest finite magnitudes as
its limits. Both operand bounds can also establish finiteness without a separate
finite fact. Division requires an interval excluding zero. Unary plus preserves
the numeric value; unary minus reverses bounds and preserves strictness.

Binary bounds include their endpoints because rounding can turn a strict input
bound into equality. Overflow can produce an infinite bound and never gains a
finite fact. An interval [0, 0] does not become concrete zero because it can
include both signs. [Differential specs](test/arithmetic-soundness.spec.ts) check
the emitted claims against independent concrete JavaScript boundary samples;
sampling is a regression check, not how the VM establishes its proofs.

Current inference gaps remain explicit: remainder, binary operands that may be
NaN or infinite, and division whose enclosing interval touches or crosses zero
retain expressions without derived bounds. An open zero endpoint also triggers
that conservative fallback. Facts learned after an arithmetic operation do not
yet reanalyze the stored expression. General algebraic relationships between
operands are not inferred; for example, treating two occurrences of a bounded
input independently can leave `input - input === 0` unknown. These are precision
limits rather than restrictions on concrete arithmetic execution.

## CommonJS execution and loading

`evaluateCommonJS(source, filename, context)` executes supplied source and returns
`[exportsOrCompletion, context]`. Supply an already resolved, absolute filename;
the API does not read files, resolve packages, or cache executions. Calling it
twice creates two module instances, unlike repeated `require` calls in Node.

The five named wrapper parameters are `exports`, `require`, `module`,
`__filename`, and `__dirname`. The receiver and initial `exports` refer to the
same object as `module.exports`. Reassigning `exports` or `module` changes a local
parameter; normal completion reads exports from the original module object.
Top-level return stops initialization but does not supply the export value.
Throwing and symbolic completion paths preserve their state through ordinary
VM continuations. Caller scope, receiver, and strictness are restored; exported
closures retain their private bindings. The module sees modeled global-object
properties, not the caller's lexical bindings.

For example, this module can already be analyzed:

```js
const low = 20;
const high = 80;
module.exports = function(value) {
  if (!(value >= low && value <= high)) throw "range";
  return (value - low) / (high - low);
};
```

Its spec proves that `Math.random() * 60 + 20` succeeds with a result in [0, 1],
while 100 throws. Separate specs cover conditional exports, captured state,
mixed normal/throwing initializers, and exactly-once effects per path.

`createCommonJSLoader(files).load(filename, context)` adds cached loading from an
immutable map of absolute filenames to source strings. It returns the same
`[exportsOrCompletion, context]` shape. The supplied files represent a complete
snapshot without symlinks or external search paths. No host files are read.
Relative and absolute requests try an exact file, then `.js`, `.json`, `.node`,
then a directory's `package.json` main or index files. Selecting a native addon
stops analysis; it never falls through to another candidate. `.cjs` works when
explicitly named, but Node does not infer that extension.

An optional `{ builtins: { http: model.module } }` second argument registers
explicit VM values using canonical names without `node:`. Aliases share one
identity, and builtin requests take precedence over packages. Prefix-only Node
modules retain that distinction. Unregistered builtins raise an analysis error;
there is no fallback to native `require`. Registry mappings are snapshotted,
while supplied values keep their identities and use the normal persistent heap.
Bare and scoped package names search ancestor `node_modules` directories.
Self-reference and package exports take precedence over legacy file/main lookup;
exact subpaths, ordered/nested conditions, and array targets are supported.
An unexported path cannot fall through to a private file or farther package.
Resolved filenames determine cache identity across local and package aliases.
The entry is loaded as a required file, not as Node's process entry point.

The loader can analyze a consumer of the validator above:

```js
module.exports = function(value) {
  const normalize = require("./lib/normalize.cjs");
  return normalize(value);
};
```

The numeric guarantee survives the `require` call. Each loaded module enters
the cache before its body executes, so cycles see its current partial exports.
Successful loads are reused; a failed initializer is removed while its effects
and successful dependencies remain. Cache state lives in the execution context's
persistent heap. A conditional load affects only its own paths, and resuming an
earlier context resumes that earlier cache state. Finite choices of request names
are explored with their branch conditions; an unrestricted symbolic name stops
analysis explicitly.

JSON modules become ordinary VM values and share the same cache and mutable
heap as source modules. The [configuration spec](test/commonjs-resolution-symbolic.spec.ts)
loads `./normalize` through its directory main and reads `{ "low": 20, "high": 80 }`
from `limits.json`. It proves the normalized result for `Math.random() * 60 + 20`
lies in [0, 1], rejects 100, and leaves acceptance of `Math.random() * 100` unknown.
Changing a required JSON object changes later reads of that object; changing
loaded `package.json` data does not rewrite the resolver's source snapshot.

`.js` files respect the nearest package `type`. Without an explicit type,
successful CommonJS wrapper parsing permits execution; a parse failure reports
the missing ESM syntax-detection support. ESM, export patterns, `#imports`, custom
conditions, unregistered builtin APIs, and extra file formats remain gaps. Package metadata supports
valid JSON with unique, unescaped top-level keys; native-parser edge cases are
explicitly rejected rather than assuming Node uses ordinary `JSON.parse` there.

The [published-package spec](test/published-invariant.spec.ts) supplies all files
from the verified `tiny-invariant` 1.3.3 tarball without altering source or metadata.
It loads `require("tiny-invariant")` and invokes the actual library inside a
percentage normalizer. With an unrestricted `ESNumber()` input, Prophet proves
the call throws exactly when `value >= 0 && value <= 100` fails, otherwise
returns a number in [0, 1]. NaN and infinities are included. The lazy message
callback runs once on development rejection, never on success or in production;
Error names and messages are concrete. The proof supplies each environment's
`process.env.NODE_ENV`. Concrete edge inputs and callback/conversion failures
also agree with pinned Node. See the fixture's
[provenance](test/fixtures/tiny-invariant-1.3.3/PROVENANCE.md).

Shared Error constructors, `String()`, `String.prototype.concat`, and ordinary
object string conversion execute through the VM's normal calls and completions.
An object's `toString` can mutate state or throw; `valueOf` is tried when it
returns an object. Inherited Error fields use live prototype links. Heap joins
record conditional own-property presence separately from its value, so a
missing property still reaches the prototype on the appropriate path.
This follows the language's [ToString operation](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-tostring)
and [Error operations](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-error-objects),
within the supported subset described below.

The loader exposes `module.exports`, `id`, `filename`, `path`, and `loaded`.
Writes to metadata other than `exports`, other module fields, and extra require
APIs stop analysis until their behavior is modeled. Loader-generated errors
expose `name` and `code`; other fields, including
`message`, `stack`, and `requireStack`, are explicit gaps. Cycle diagnostics and
Node's temporary warning prototypes, as well as deprecated-main fallback
warnings, are not modeled. The standalone
`evaluateCommonJS` still models only `module.exports` and rejects require calls.
These guards stay with the objects across aliases, closures, and eval. Implicit
`arguments` objects similarly have a persistent unsupported binding until their
mapped/unmapped behavior is implemented. Explicit shadowing and replacement work;
a join that might retain the implicit object conservatively rejects later reads.

Direct eval in module scope and indirect eval of modeled global properties work.
Sloppy eval that would introduce global var/function declarations is explicitly
unsupported in a module's host environment until object-backed global bindings
are modeled. Strict eval declarations remain local. These are temporary coverage
gaps, not restrictions on JavaScript or Node.

See [the compatibility suite](test/commonjs/README.md) for the pinned Node source
revision, independent oracle setup, and upstream-test blockers. Its local specs
do not establish complete Node loader compatibility or upstream Node conformance.

## Validation and current limits

```sh
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/test262.spec.ts test/test262/runner.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand
node .yarn/releases/yarn-3.1.1.cjs typecheck
```

[Symbolic string specs](test/symbolic-strings.spec.ts) now prove concatenation
length bounds and recover known prefixes/suffixes with `String.prototype.slice`.
For unrestricted `text`, `("/users/" + text + ".json").slice(7, -5) === text`
is true, while the middle's contents stay unknown. Slice preserves UTF-16 units,
conversion effects/throws and finite-choice correlations; unknown indices retain
symbolic results. See [the string boundary](docs/symbolic-strings.md) for remaining
precision, API and allocation assumptions. Run the spec with
`node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/symbolic-strings.spec.ts`.

The active Test262 baseline runs **491 strict/sloppy variants of 250 complete,
unmodified files** from the revision pinned in `yarn.lock`. It covers selected
primitive comparisons, conditional/logical expressions, `typeof`, and parse
errors, plus lexical scopes, closures, shadowing, declaration hoisting, selected
eval environments, expression evaluation order, catch/finally precedence,
arithmetic primitives, unary signs, and parameter/lexical-declaration early
errors, plus Error construction/formatting, string concatenation/coercion, and
selected synchronous arrow-function behavior, default-parameter initialization,
and untagged template literals with ordinary substitution conversion. Twenty-six
complete `instanceof` files add prototype chains, invalid operands/prototypes and
evaluation order. Symbol-key syntax, getters, bound functions and Proxy behavior
remain gaps; internal symbol-slot specs do not claim public Symbol support.
Two complete object-spread cases exercise source-expression exceptions; positive
upstream spread files still need further operators, built-ins, or harness support.
Forty-five complete object declaration binding files add var/let/const defaults,
nesting, renaming, trailing commas and abrupt completion coverage. Seven complete
RegExp literal/parser cases and three array push/intrinsic cases add 20 variants.
Strictness follows actual directive
source text; escaped or parenthesized strings do not become `use strict`.
Parse-negative cases do not imply runtime support for their syntax.
Further arithmetic boundary cases need
the missing `Number` constants and global `isNaN`; the harness does not supply
host substitutes for those runtime gaps.
Historical selections remain explicitly skipped and are tracked as unassessed
activation debt in the [gap backlog](docs/implementation-gaps.md). The pinned
snapshot has **35,960 test files** after excluding `_FIXTURE.js` files; 240 selected files are about **0.67%** of that file inventory. The other
35,720 files have not been comprehensively assessed, including the 46 historical
skips. This is an activation share, not a whole-suite pass rate or a percentage
of JavaScript behavior implemented. The corpus is an old pinned revision, not
current upstream Test262. This is limited coverage, not a conformance claim. The
[runner documentation](test/test262/README.md) explains the supported assertion
harness and metadata. Test262 source always runs through Prophet; separate local
differential tests use host JavaScript as an independent concrete oracle.

The parser accepts JavaScript, so omit TypeScript annotations in interpreted
source. The known-length minimum specs execute recursive calls. The
unknown-length specs infer and verify reusable summaries as described below.

Functions support identifier parameters with defaults, lexical captures, and block/catch
scopes. [Default-parameter specs](test/default-parameters.spec.ts) cover omitted
and undefined arguments, left-to-right initialization, earlier parameter reads,
uninitialized later parameters, and initializer exceptions. Closures created in
defaults retain parameter bindings separately from body variables. A symbolic
argument that may be undefined conditionally runs its default, preserving the
result, writes, and throws on their paths. These use the shared expression and
completion operations, not a special rule for configuration objects.
[Synchronous arrow specs](test/arrow-functions.spec.ts) cover expression
and block returns, lexical `this`, current captured bindings, `.call` ignoring
the supplied receiver, conditional returns/throws, non-construction, absent own
`prototype`, and syntax-derived `length`. Arrows introduce no implicit
`arguments` binding. Interpreted functions share syntax-derived `length`;
name inference and restricted caller/arguments
accessors remain explicit metadata gaps. Pure recursive arrows can use the same
verified array summaries; lexical `this` dependencies remain outside that subset.

[Object-spread specs](test/object-spread.spec.ts) cover complete ordinary
enumerable data objects, concrete string characters, and empty copies from
null/undefined/numbers/booleans. Spread and `Object.keys` share enumeration;
own-property presence and creation order retain their path conditions. Copies
read current values, preserve nested references, and honor later overwrites.
Object literal fields now use the persistent heap too: inspect current fields
with `getProperties(value, context)` instead of assuming `value.properties`
contains their final values.

For example, with `override` an unknown Boolean:

```js
function configure(overrides = {}) {
  return { port: 8080, ...overrides };
}
const options = configure(override ? { port: 3000 } : {});
```

Prophet proves `options.port > 0`; `options.port === 8080` remains unknown.
This is ordinary property evaluation, not a configuration-specific rule.
Accessors/descriptors, symbol keys, unknown-length string keys, and enumeration
of arrays, functions, intrinsic objects, or incomplete host models remain
explicit gaps. Legacy property tables must not be mistaken for enumerable own
fields. `Object` supports fresh nullish objects and existing object identity;
primitive wrapper construction remains unsupported.

Object declaration bindings now support `var`, `let` and `const` shorthand,
renaming, defaults, nesting and finite computed keys through shared property
reads and binding initialization. Nullish inputs throw; defaults retain TDZ,
ordering and symbolic conditions. [Coverage and residuals](docs/object-bindings.md)
include primitive boxing, array/rest patterns, parameters, accessors and names.

Eval also instantiates declarations, isolates lexical names and strict
vars, and distinguishes direct caller lookup from indirect global lookup.
Its general statement completion values remain incomplete; conditional creation
of a var in an existing scope is explicitly rejected until binding presence can
be represented on each path. Rest/destructured parameter initialization,
implicit `arguments` objects, async functions, complete global-object binding
semantics, and sloppy block function
compatibility rules (Annex B) remain incomplete. Environment records
are retained in execution snapshots; reclamation of unreachable records is not
implemented yet. Binding errors now use shared Error instances. Error cause
options, stack inspection, property descriptors/accessors, exotic coercion
(`Symbol.toPrimitive`), and complete prototype mutation remain unsupported.
String wrapper construction and sloppy function receiver boxing stop analysis;
strict functions preserve primitive receivers, and sloppy nullish receivers use
their global object. Primitive own-property queries, object-literal prototype
setters, and default array/function source string conversion are explicit gaps.
Array indexing uses concrete keys.
Symbolic dense arrays retain stable element identities and guarded reads; writes
to these snapshots are currently rejected. Object-to-primitive coercions are
rejected when unsupported. Native generator implementations may return symbolic
completion trees; a native continuation that yields a fork must be expressed
with `bindNormal` rather than resumed as a single host generator.
The interpreter does not yet implement all syntax, built-ins,
property semantics, or language errors.

The reasoner is deliberately incomplete: a result can remain unknown even when
a stronger analysis could prove it. General nested choices may require
exponential exploration. Stored order facts avoid expanding every alternative
for the recursive minimum proof, but they do not solve general recursion or
arbitrary symbolic arithmetic. Verified summaries avoid unrolling the supported
unknown-length recursion described below.

## Unknown-length recursion

[The unknown-length specs](test/unknown-length.spec.ts) run recursive minimum
and an independently written maximum on a nonempty dense array whose
length is unknown. Its input contract is supplied through the VM API:

```ts
const d = symbolicNumberArray({ minimumLength: 1, element: randomNumber() });
const initial = setVariablesInScope(nodeInitialExecutionContext, { d });
const [, context] = evaluateCode(source, initial);
```

`symbolicNumberArray` comes from `src/array/symbolic.ts`, `randomNumber` from
`src/symbolic`, and `setVariablesInScope` from the execution-context module.
This supplies facts about the input, not a promise about the function. Every
valid JavaScript array length from 1 through 2^32 - 1 is initially possible;
every element is a finite number in [0, 1). No finite sample array is generated.

The [summary engine](src/Function/summaries.ts) works as follows:

1. Execute the actual function body on one arbitrary element. Ask which generic
   candidates hold: finite result, non-NaN result, a lower bound for every input
   element, and an upper bound for every input element.
2. Execute the body on an array whose length is any integer at least two.
   Temporarily use the candidates for recursive calls, after checking that each
   call receives a nonempty, strictly smaller suffix of the same snapshot.
3. Check the returned value against the first element and a fresh arbitrary
   element of the remaining suffix. Together these cover every input element.
   Discard candidates that fail, then repeat the step using only the survivors.
4. Cache and apply the summary only after the candidates stabilize. Base case,
   recursive step, and length descent jointly justify the result for all lengths.

The minimum retains the lower-bound fact; maximum retains the upper-bound fact.
Their names do not matter. A head-only or tail-only implementation does not gain
universal bounds. Tests also check changed base cases, skipped elements, and
special branches at lengths 3 and 2^32 - 1.

The specs assert `x = false` for `d[0] < min(d)` and `aboveMaximum = false` for
`d[0] > max(d)`. `min(d) < d[0]` and `d.length` remain unknown. For each function,
the proof executes one singleton body and two general-step bodies. The second
minimum call reuses its verified summary without evaluating the body again.
`getInferredSummaries(fn)` exposes these counts and the retained facts, which
the specs assert directly.

These restrictions are enforced by the implementation, not just chosen in the
spec input. The strategy is specialized to induction over array length, with a
singleton base case and the four candidate fact kinds listed above. The facts
that survive are derived from the body; the engine does not recognize `min` or
`max`. It is not yet a general recursion solver.

The sample minimum has no empty-array stopping case, so its nonempty assumption
is necessary for termination. Supporting functions with an empty base case also
requires extending the current proof strategy to check length zero. Dense
numeric arrays avoid modeling unknown holes and coercions in this first strategy.
The finite-only guard is stronger than necessary for infinities; NaN requires
careful comparison reasoning because an element-wide `<=` fact may fail even
when the original strict comparison can still be proved false. These are
implementation limits to expand through specs, not permanent VM requirements.

This first inference domain supports a pure, directly self-recursive function
with one dense numeric-array argument. Elements must have a finite numeric
contract. Supported reads are array length and literal indices; recursive
slicing uses the trusted nonnegative-start, omitted-end `slice`. Empty inputs,
possible NaN/infinity inputs, mutation, captured mutable dependencies, arbitrary
calls, loops, and unmodeled property behavior are rejected. Lexical locals and
block shadowing use ordinary VM evaluation; a path that reads before
initialization or writes a constant cannot publish an all-path numeric summary.
Captured references resolve through the function's creation environment and are
revalidated before cache use. Proof work has a budget and never turns an
unfinished proof into a fact.

A cached summary belongs to its function identity and input element-template
identity. Its universal facts refer to an immutable sequence snapshot, so they
cannot transfer to a different array's elements. This does not yet automatically
accelerate known-length arrays; those keep their existing concrete/symbolic
execution and exact results. Broader summary domains and reuse across equivalent
input contracts can be added separately.

## Development workflow

Develop directly on `master` and push focused, validated increments to
`origin/master`. The former PR stack is fully merged; its feature and review
history is preserved in [docs/stack.md](docs/stack.md).
