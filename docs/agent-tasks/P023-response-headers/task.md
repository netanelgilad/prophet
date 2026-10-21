# P023: Response getHeader/setHeader surface

Implemented by Instinct in-sandbox; independent review pending.

## Goal

Model the Node HTTP response header surface consumed by sirv's send()
(build.js:67-95): getHeader, setHeader, getHeaderNames, getHeaders,
hasHeader, removeHeader, and writeHead's merge with the setHeader store.

## Semantics

Pinned against Node 24.21.0 ServerResponse controls
(test/node-http-response-headers.spec.ts pairs every behavior with a native
oracle):

- Names: setHeader token-validates names (TypeError ERR_INVALID_HTTP_TOKEN,
  the pinned message, numbers stringifying into it); storage and lookup are
  lowercase in both directions. Read-side names only require strings: a
  non-string read name is a TypeError (ERR_INVALID_ARG_TYPE) while an
  invalid token string simply answers absent.
- Values store RAW: strings and array string elements are
  character-validated eagerly (TypeError ERR_INVALID_CHAR), undefined is a
  TypeError (ERR_HTTP_INVALID_HEADER_VALUE with the pinned message), and
  numbers, booleans, null, arrays and plain objects store unvalidated.
- setHeader returns the response for chaining; removeHeader returns
  undefined; getHeaders answers a null-prototype copy; getHeaderNames and
  getHeaders preserve insertion order.
- After headers are sent, setHeader and removeHeader throw Error
  ERR_HTTP_HEADERS_SENT while getHeader keeps answering.
- writeHead merges: the wire projection (state.headers) is the argument's
  serialized fields union the stored fields, the argument winning per
  lowercased name. The argument's RAW fields also merge into the store, but
  only once a setHeader call created it (pinned: a writeHead before any
  setHeader leaves getHeaders empty; afterwards new argument names appear
  raw in the store).
- Heap gains a host-side removeProperty mirroring writeProperty's
  properties/presence/key-order bookkeeping.

The unchanged consumer advances: send's getHeader probes answer undefined
(no stored headers), the range branch is skipped, and res.writeHead(code,
headers) serializes the FILES record's Content-Type and Content-Length
fields. The measured stop is the projection's pre-existing
transport-sensitive exclusion of content-length (build.js:95), kept
deliberately; relaxing it is a later decision.

Specs first: test/node-http-response-headers.spec.ts (10 tests, each paired
with a native oracle). Migrated from measured output: sirv-request.spec.ts
asserts the new stop.

## Boundaries and gaps

- The transport-sensitive exclusions (content-length, transfer-encoding,
  connection, keep-alive, trailer, expect, content-disposition) are kept
  exactly as the projection defined them; they now bound the sirv GET at
  writeHead.
- Array header values remain an unsupported conversion at serialization
  (the projection is single-value-per-name); they store and read back raw.
- Symbolic names or values defer through the shared unsupported path;
  conditional headerStored/storeCreated states fork through
  evaluateBranches.
- On a writeHead serialization failure the store is not updated (ordering
  unpinned natively); the store update also skips effectful coercions the
  serializer already rejects.

Validation (sandbox, Node 24.21.0, PROPHET_NODE_BINARY pinned): full suite
and typecheck on the shipped tree (totals recorded in the ledger);
response-headers, headers, write, lifecycle, events and sirv-request suites
green individually.

Remaining frontier after this task: the content-length transport-sensitive
decision at writeHead (the measured stop), then fs createReadStream/pipe.
