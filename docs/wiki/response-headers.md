# Response getHeader/setHeader surface

Implemented by Instinct (P023), corrected during the
[integration review](../agent-tasks/integration-2026-10-21/review.md). Task
record: [P023](../agent-tasks/P023-response-headers/task.md); specs:
[node-http-response-headers.spec.ts](../../test/node-http-response-headers.spec.ts)
and [sirv-request.spec.ts](../../test/sirv-request.spec.ts).

The response keeps a lazily-created store of raw header values under
lowercased names, exactly as pinned against Node 24.21.0. setHeader
requires string token names (numeric names throw ERR_INVALID_HTTP_TOKEN),
validates header text with observable ordinary object conversions, and stores
the raw value; it returns the response for chaining. Open symbolic text and
unsupported conversion/array domains stop explicitly. getHeader answers
the raw stored value or undefined, never validating read-name tokens;
getHeaderNames and getHeaders preserve insertion order, getHeaders answering
a null-prototype copy. After headers are sent, setHeader and removeHeader
throw ERR_HTTP_HEADERS_SENT while getHeader keeps answering.

writeHead merges: the wire projection is the argument's serialized fields
union the stored fields, the argument winning per lowercased name, and the
argument's raw fields also merge into the store — but only once a setHeader
call created it (a writeHead before any setHeader leaves getHeaders empty,
pinned). Earlier raw-store writes survive a later invalid header, matching
Node's incremental setHeader calls.

Content-Length is an ordinary explicit serialized field (P024): pinned
Node 24.21.0 accepts any value verbatim at writeHead and enforces no
body-length coupling without a socket — the transport layer this
projection excludes. The other six transport-sensitive exclusions keep
their automatic-behavior coupling.

The unchanged consumer advances: sirv's send() getHeader probes answer
undefined and writeHead completes; P025 then models
fs.createReadStream/pipe and the delivered GET completes end to end.
Heap gained a host-side removeProperty for removeHeader.
