# Response getHeader/setHeader surface

Implemented by Instinct in-sandbox (P023); independent review pending. Task
record: [P023](../agent-tasks/P023-response-headers/task.md); specs:
[node-http-response-headers.spec.ts](../../test/node-http-response-headers.spec.ts)
and [sirv-request.spec.ts](../../test/sirv-request.spec.ts).

The response keeps a lazily-created store of raw header values under
lowercased names, exactly as pinned against Node 24.21.0. setHeader
token-validates names and character-validates strings and array string
elements eagerly, while numbers, booleans, null, arrays and plain objects
store unvalidated; it returns the response for chaining. getHeader answers
the raw stored value or undefined, never validating read-name tokens;
getHeaderNames and getHeaders preserve insertion order, getHeaders answering
a null-prototype copy. After headers are sent, setHeader and removeHeader
throw ERR_HTTP_HEADERS_SENT while getHeader keeps answering.

writeHead merges: the wire projection is the argument's serialized fields
union the stored fields, the argument winning per lowercased name, and the
argument's raw fields also merge into the store — but only once a setHeader
call created it (a writeHead before any setHeader leaves getHeaders empty,
pinned).

The unchanged consumer advances: sirv's send() getHeader probes answer
undefined and writeHead runs until the projection's pre-existing
transport-sensitive exclusion of content-length — the measured stop, kept
deliberately. Heap gained a host-side removeProperty for removeHeader.
