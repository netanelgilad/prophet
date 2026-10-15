# P024: Content-Length as an ordinary explicit serialized field

Implemented by Instinct in-sandbox; independent review pending.

## Goal

Resolve the measured sirv stop at writeHead: the projection's
transport-sensitive exclusion rejected the FILES record's Content-Length
(build.js:95).

## Decision record

HTTP-007 documents the exclusion: transport-sensitive fields "reject
analysis until framing/encoding/state coupling is modeled", and its
remediation says to add each header domain "with independent Node checks,
including validation/coercion order, cache interactions, duplicate/raw
ordering, framing/body coupling, errors and conditional state".

The independent Node 24.21.0 checks for content-length found no coupling
inside the projection's domain: a bare ServerResponse accepts negative,
non-numeric and fractional values verbatim at writeHead (no validation or
coercion), stores them raw through the P023 setHeader store, and enforces
NO body-length coupling at write or end — shorter and longer bodies
complete without error. The ERR_HTTP_CONTENT_LENGTH_MISMATCH family lives
in the socket transport layer, which the projection deliberately excludes
("inspected headers are only explicit serialized fields ... not complete
wire headers"). As an explicit serialized field, content-length is
therefore no different from any other, and it is admitted; the remaining
six exclusions (transfer-encoding, connection, keep-alive, trailer,
expect, content-disposition) keep their automatic-behavior coupling and
stay excluded until each is pinned individually.

Migrated from measured output: node-http-headers.spec.ts drops the
writeHead content-length entry from its unmodeled-framing gap list (the
other exclusions stay pinned as gaps).

Specs first: four new tests in test/node-http-response-headers.spec.ts,
each paired with a native oracle (writeHead serialization and projection,
verbatim acceptance of -1/"abc"/2.5/0, setHeader-store flow through the
writeHead merge, no write/end coupling). Migrated from measured output:
sirv-request.spec.ts asserts the new stop.

The unchanged consumer advances: res.writeHead(code, headers) now
serializes Content-Type and Content-Length and completes; the measured
stop is fs.createReadStream(file, opts).pipe(res) (build.js:95), a legacy
host error on the unmodeled Node filesystem API member.

Validation (sandbox, Node 24.21.0, PROPHET_NODE_BINARY pinned): full suite
and typecheck on the shipped tree (totals in the ledger);
response-headers and sirv-request suites green individually.

Remaining frontier after this task: fs createReadStream/pipe (the
measured stop); the other five transport-sensitive exclusions await
individual pins.
