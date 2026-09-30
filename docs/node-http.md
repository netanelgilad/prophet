# Node HTTP compatibility and proof boundary

The HTTP reference runtime is **Node v24.21.0**, upstream commit
`955266bfdd854cd280dffd47548673914484e4c0`, matching the
[CommonJS oracle](../test/commonjs/README.md). The
[server spec](../test/node-http-server.spec.ts) contains the complete application:
its CommonJS module imports `node:http`, registers a request callback, starts
listening, and exports the server. The concrete reference loads that same module
and sends a real HTTP request through Node. It does not extract the application's
callback and call it directly.

Locally written compatibility and differential specs compare the modeled
surface with that independent runtime. They are not upstream Node conformance
cases, and passing them does not establish compatibility with the entire HTTP
module. No complete upstream HTTP case is currently claimed as passing in
Prophet. Real sockets belong only to isolated concrete reference execution;
symbolic exploration must not open a listening socket or send network traffic.

## Callback delivery and persistent state

`createServer` optionally registers an actual interpreted function for `request`.
The application can also create a server without a listener and subsequently
use `server.on("request", callback)`. The server identity,
registered listeners, startup state, and request/response state must belong to
the execution context's persistent heap. Creating or changing a server on one
symbolic path must not change another path's server.

Calling `listen` and receiving a request are distinct operations. Numeric
`listen(port[, callback])` and `listen(port, "127.0.0.1"[, callback])` are modeled
for a primary process in an explicitly successful-bind environment. With no
host, binding occurs during the call and `server.listening` is already true on
return. An explicit host first performs asynchronous lookup, so it stays false
until `completeListen`. Both forms defer the listening event: `completeListen`
delivers that event and, for an explicit host, completes lookup/binding first.
It does not choose whether an already returned omitted-host bind succeeded.
The optional listening callback is registered as a once-listener in the
same ordered registry as `server.on/once("listening", callback)`. Listening and
request callbacks execute through the shared VM invocation operation with the
server as their receiver. They receive
the **current execution context**, preserving changes to captured variables made
after registration. An event's historical snapshot is useful for inspection; it
must not rewind the context used to execute a callback.

Node implements request delivery with `server.emit("request", req, res)` in
[`_http_server.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/_http_server.js#L1293).
[`EventEmitter.emit`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/events.js#L489)
invokes ordinary listeners with the emitter as `this`. Synchronous listener
throws escape the delivery; Node does not automatically turn such a throw into
an HTTP 500 response. Promise rejection handling is a separate mechanism and
does not establish synchronous exception handling support.

[`net.Server.listen`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/net.js#L2478)
returns the server and registers its optional callback for a later `listening`
event. The [listen specs](../test/node-http-listen.spec.ts) compare both forms
against pinned Node, including callback timing, order, receiver, and return
identity. Concrete native checks use ephemeral ports or a freshly selected
available port; symbolic exploration opens no sockets. Address allocation and
startup failures remain unmodeled, so these proofs cannot establish availability
of a configured port or safety for every operating-system outcome.

Numeric ports must be integers from 0 to 65535, including negative zero. A bad
numeric port produces the interpreted `RangeError` / `ERR_SOCKET_BAD_PORT`.
Node registers the listening callback before validating the port: a caught
failure leaves that callback available for a later successful retry. Once a
server is bound, another `listen` instead throws `ERR_SERVER_ALREADY_LISTEN`
before registering a callback or validating its port. Those state changes and
throws retain their conditions when ports are finite symbolic choices.

Server and response objects now share the [EventEmitter model](node-events.md):
`on`/`addListener`, `once`, `removeListener`/`off`, and custom-event `emit` use
persistent listener lists. The model takes a listener snapshot when delivery
starts, removes a once registration before calling it, and stops delivery when
a callback throws. Conditional registration remains conditional when the event
is delivered; it does not turn into an unconditional callback.

Expose the corresponding `events` builtin from the same host environment:
`const http = createHTTPModel()` provides both `http.module` and
`http.eventsModule`, for loader builtins `{ http: http.module,
events: http.eventsModule }`. An existing shared emitter model can instead be
passed to `createHTTPModel(events)`. This preserves public method identities and
borrowed `EventEmitter.prototype.on.call(server, ...)` behavior. Separately
created emitter models represent separate environments, not two modules within
one modeled Node process.

## Explicit response headers and status catalog

The [header specs](../test/node-http-headers.spec.ts) compare complete application
modules against pinned Node. The model supports direct
`writeHead(status[, reason][, headers])` for concrete numeric statuses or finite
choices, with complete ordinary data objects or primitive header sources.
String sources enumerate their own UTF-16 character positions. Header values
must resolve to supported concrete primitives or finite choices; effectful
object conversions, getters, array header forms and open symbolic text remain
gaps. This uses shared own-property enumeration and value conversion, not a
rule for the static server's source.

`writeHead` returns the response. A successful call serializes and commits its
status, reason and explicit fields, making `headersSent` true before `end`.
It does not establish that bytes have flushed. `end` reuses that committed
state; later changes to public status fields or the original header object do
not rewrite it. If no header has been committed, `end` invokes the same
modeled `writeHead` operation to create the implicit header.

Validation order follows the pinned
[`writeHead`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/_http_server.js)
and [`_storeHeader`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/_http_outgoing.js)
implementations. A repeated write throws `ERR_HTTP_HEADERS_SENT` before new
argument validation. Status range failure precedes public assignments; invalid
reason/name/value failures retain the assignments already made while leaving
`headersSent` false. Body suppression from 204/304 is also retained if a later
header validation fails; an invalid reason fails before that suppression.
Recovery therefore does not mean the failed call rolled back every change.
Local comparisons cover these transitions, token/value errors, allowed Latin-1
and whitespace, coercion boundaries, overload selection, and symbolic choices.

`inspectResponse` exposes the committed `statusCode`, `statusMessage`, `headers`
and ended `body`. Its **headers are only the application's explicit serialized
fields**, using lower-case names and exact text values. They exclude automatic
Date, connection and framing fields; they are neither a complete wire-header
capture nor the public `getHeaders` API. The native oracle preserves raw field
values because a client's parser trims whitespace: a serialized single-space
value must not silently become an empty string in the model. Full ordering of
raw duplicate fields is not represented by this object projection.

This distinction exposes the real package's reversed arguments:
`writeHead(code, headers, http.STATUS_CODES[code])` selects its third string as
the header source. Intended fields such as Allow are ignored, and characters
become numeric field names. The [unchanged application specs](../test/pico-static-server-analysis.spec.ts)
now preserve that behavior for OPTIONS, POST and DELETE. Symbolic execution
also proves the absent Allow field for an explicitly delivered request event
whose method is known to be neither GET nor HEAD. That input overapproximates
request-event delivery; it does not prove every wire method reaches that event
(Node dispatches CONNECT separately). This reproduces an existing native reference observation; it is not a
claim of a novel vulnerability or complete request-path analysis.

The [status catalog](../src/node/http-status-codes.ts) contains all 63 entries
from the pinned release. [Catalog specs](../test/node-http-status-codes.spec.ts)
compare every key, value and enumeration position with native Node. Each modeled
HTTP environment owns an ordinary mutable table; aliases share it and mutations
remain in persistent state. Default reason lookup uses the original table even
if application code replaces the exported `http.STATUS_CODES` property.
Inherited values and conditional mutations follow shared lookup rules. Full
descriptor reflection, deletion and symbolic computed property keys remain
shared VM gaps; selecting between concrete lookups is supported separately.

## Ending a response and completing delivery

Keep application-visible response state separate from captured response output:

- A new response defaults to status 200 and an undefined `statusMessage`, with `headersSent`, `writableEnded`,
  and `writableFinished` false.
- `end` returns the response. On the supported successful path it finalizes the
  implicit headers and marks `writableEnded` true. It must preserve the status
  and body selected when the output was committed.
- `writableFinished` becomes true only when the output has finished flushing,
  immediately before the `finish` event. An `end` call and successful completion
  of transport are distinct modeled transitions. `completeResponse` marks that
  state and then invokes the current `finish` listeners with the response as
  their receiver. A listener registered after `end` but before completion still
  runs; registering after completion does not replay the event.
- Later assignment to `statusCode` or `statusMessage` must not rewrite the
  committed status/reason. A HEAD request has no wire body even when application code supplies a
  string to `end`. Status 204 and 304 also suppress a body.

These rules follow Node's
[`ServerResponse`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/_http_server.js#L204),
[`writeHead`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/_http_server.js#L407),
[`OutgoingMessage` getters](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/_http_outgoing.js#L877),
and [`end`/`onFinish`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/_http_outgoing.js#L1128).
The [pinned HTTP documentation](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/doc/api/http.md)
distinguishes `writableEnded` from `writableFinished` and documents `end`'s return
value. Local concrete checks must establish the timing for the supported live
connection rather than infer socket behavior from a detached response object.
The [lifecycle reference spec](../test/node-http-lifecycle-reference.spec.ts)
verifies that `writableFinished` is still false immediately after `end` and true
in the later finish listener for string, empty-string, and omitted payloads.
It also checks HEAD/204/304 suppression and public status mutation after output
has been committed, numeric status normalization, and UTF-8 replacement of an
unpaired surrogate. The model's inspected body is decoded UTF-8 output, not a
promise that every input JavaScript string survives encoding unchanged.

The [HTTP event specs](../test/node-http-events.spec.ts) compare complete modules
against real Node sockets for deferred finish delivery, current captured values,
listener order and removal, once registration across multiple requests, and a
finish listener throwing. The latter keeps the completed flags and committed
output while preserving writes before the throw and skipping later listeners.
Only the reference child installs an uncaught-exception observer; the analyzed
application has no invented exception handler.

## Declared environment and remaining gaps

The initial loopback proof uses an explicitly delivered successful listen completion,
then a valid request on a live connection, followed by an explicitly delivered
successful response completion. This is a bounded host schedule, not an
implementation of Node's event loop or proof over all schedules. Models preserve
the selected path, arguments, returns, throws, and persistent state through those
transitions. Rejected or unmodeled operations must not silently succeed.

The supported surface is deliberately limited to server creation with an
optional request callback, the documented numeric listen forms, the shared listener
operations above, request method/URL inspection, scoped direct `writeHead`, the
status catalog, and a string, null, or omitted `end` payload. Broader overloads, the remaining
EventEmitter APIs, request bodies/streams, Buffer payloads,
progressive header APIs, backpressure, socket aborts and errors, startup failures, timers,
promises, and arbitrary concurrent schedules remain explicit gaps until their
semantics and independent tests are added. Distinguish a language-visible Node
error from an unsupported-analysis error. Unsupported public property access or
mutation must not fabricate state or bypass the host operation's internal state.

Node also installs its own listeners on HTTP objects. Those listeners are not
pretended to be ordinary application registrations. Public `emit` and
`listenerCount` on protected HTTP lifecycle event names report an analysis gap;
applications cannot bypass transport transitions with `res.emit("finish")`, and
listener counts must not omit Node's internal listeners. Explicit embedding
transitions deliver the modeled lifecycle events. Custom events use the shared
emitter normally. Registering other reserved host events also reports a gap:
for example, `connection` on the server and `prefinish` on the response would
otherwise be accepted without the events that Node emits on the successful
schedule. Error, close, and timeout registrations likewise await their host
semantics. Listener warning thresholds include known internal registrations:
the tenth application listener for `listening` or `finish` reaches the currently
unmodeled warning boundary. `req.on` remains unsupported because registering a `data`
listener also changes the readable stream's flowing state; adding a generic
event table alone would not implement that behavior.

Status handling currently accepts concrete numbers (or finite choices of them),
normalizes them with Node's integer conversion, and supports final codes
200–999. Invalid codes produce the modeled RangeError; informational completion
and nonnumeric/open symbolic status conversion remain unsupported. A repeated
listen on an already bound server is a modeled error; overlapping listen calls
while explicit-host lookup is still pending remain unsupported. Repeated end
calls and delivery into unresolved lifecycle states also remain explicit gaps.
Unknown output strings lose their
identity through UTF-8 encoding until a more precise encoding model exists.

Header support excludes progressive `setHeader`/`appendHeader`/`getHeader`/
`getHeaders`/`removeHeader` caching, raw header arrays, duplicate case-insensitive
names, getters/descriptors, object/array value conversions and unrestricted
symbolic text. Transport-sensitive fields (`Content-Length`,
`Transfer-Encoding`, `Connection`, `Keep-Alive`, `Trailer`, `Expect`, and
`Content-Disposition`) stop analysis until their framing, encoding and state
effects are modeled. Automatic Date and connection/framing output, lenient
validation, unique-header options and complete raw wire serialization remain
outside the inspected projection. The model does not establish the absence of
automatic fields from the actual wire. General public status-message coercion,
informational responses and richer status inputs remain incomplete.

The model exposes selected field values without claiming complete prototypes or
descriptors. `hasOwnProperty` inspection of its server, response, and function
objects reports an analysis gap rather than confusing inherited accessors with
own data properties. Async and generator function kinds likewise report generic
VM analysis gaps, even without `await`/`yield`, instead of becoming ordinary
synchronous callbacks. These guards must be replaced as the relevant semantics
are implemented; they do not establish language or host conformance.

Listen currently accepts concrete numeric ports and finite choices of them;
unbounded symbolic numbers, string ports, absent ports, options objects, other
hosts, backlog overloads, closing/relistening, and cluster workers remain gaps.
Node's backlog normalization can coerce a callback to a number. The supported
ordinary function conversion produces NaN without effects; overridden
`valueOf`/`toString` methods report an explicit gap instead of dropping arbitrary
conversion effects. Inherited normalized listen options on `Object.prototype`
also report a gap rather than silently using the model's default bind behavior.

The embedding API supplies `completeListen`, `deliverRequest`, and
`completeResponse` transitions. Their traces use `http.server.listening`,
`http.server.request`, and `http.response.finish`; the middle name deliberately
does not denote Node's outgoing-client `http.request` call. These transitions
dispatch through the shared listener machinery rather than keeping a separate
single-callback path.

## Complete upstream cases reviewed

Keep each upstream case complete and unmodified when activating it. The following
cases at the pinned revision contain relevant assertions but currently require
additional capabilities:

- [`test-http-listening.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-http-listening.js)
  now has supported listener-free creation, omitted-host listening, and arrows,
  but still needs `server.close` and the upstream common/assert
  harness. Its small size does not make its full dependencies currently modeled.
- [`test-net-listen-invalid-port.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-net-listen-invalid-port.js)
  includes numeric port errors, but its complete source also needs a `net` model,
  options objects, address inspection, closing, further language support, and
  the upstream common/assert harness.
- [`test-net-server-call-listen-multiple-times.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-net-server-call-listen-multiple-times.js)
  additionally needs asynchronous error delivery and close/relisten behavior.
  The separate `test-net-listen-twice.js` uses cluster workers, a different
  environment from this primary-process model.
- [`test-http-head-response-has-no-body-end-implicit-headers.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-http-head-response-has-no-body-end-implicit-headers.js)
  still needs server address inspection, the HTTP client,
  response stream events/resume, server closing, and the common harness.
- [`test-http-outgoing-finish-writable.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-http-outgoing-finish-writable.js)
  covers both server and client writable state and additionally requires HTTP
  client requests, closing, and the common/assert harness.
- [`test-http-outgoing-writableFinished.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-http-outgoing-writableFinished.js)
  includes successful transport and three failing-flush scenarios. Complete
  execution needs custom Duplex streams, socket injection, writes, finish/error/
  close events, end callbacks, `setImmediate`, and the common/assert harness.
  Keeping only its first scenario would not count as activating this case.
- [`test-http-outgoing-finish.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-http-outgoing-finish.js)
  tests backpressure and callback/event ordering with Buffer writes, loops,
  request streams, an HTTP client, and `process.nextTick`.
- [`test-http-response-writehead-returns-this.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-http-response-writehead-returns-this.js)
  is a small complete case for chaining `writeHead(...).end(...)` and receiving
  the supplied header/body. It still needs the common/assert harness,
  `http.get`, `server.address`/`close`, readable data/end events, array `push`,
  and `Buffer.concat`. Local chaining assertions do not activate that file.
- [`test-http-write-head.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-http-write-head.js)
  combines direct writes with progressive `setHeader`, invalid values and raw
  header arrays, duplicate-write failures, an unknown status reason, client
  requests, header inspection and stream completion. Its companion
  [`test-http-write-head-2.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-http-write-head-2.js)
  requires raw-array writes with and without cached headers, malformed array
  lengths and a three-argument overload. All scenarios and client/harness
  dependencies must run before either complete file counts as passing.
- [`test-http-write-head-after-set-header.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-http-write-head-after-set-header.js)
  compares repeated raw headers with/without a progressive cache across two
  requests. Its common/countdown/assert harness, destructured imports, request
  client, string `includes`, raw-header inspection and closing remain required.
- [`test-http-status-reason-invalid-chars.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-http-status-reason-invalid-chars.js)
  checks explicit and assigned invalid status messages, recovery before end,
  and absence of injected headers. It still needs regex-based assertion
  matching, common/countdown, HTTP client/address/close and complete delivery.
- [`test-http-status-code.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-http-status-code.js)
  and [`test-http-status-message.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-http-status-message.js)
  were also reviewed whole. They need their common/countdown/assert harnesses,
  HTTP client or raw net/stream behavior, address inspection, closing and Buffer
  APIs. Comparing the complete exported status catalog independently does not
  establish those end-to-end protocol cases.

Local specs cover the supported behavior while these dependencies are missing;
they do not replace the complete upstream cases. Express is a later consumer of
the shared VM and modeled Node interfaces, evaluated as ordinary library source,
without an Express-specific replacement.
