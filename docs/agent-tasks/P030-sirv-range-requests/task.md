# P030: header-carrying dispatch, range read streams; sirv 206 completes

Implemented by Instinct in-sandbox; independent review pending.

## Goal

Complete the sirv range-request path end to end: deliverRequest carried no
headers, and fs.createReadStream rejected every option field, so send()'s
range branch (build.js:72-90) could not run.

## Decision record

Pinned Node 24.21.0 matrices framed both halves.

Range read streams (host fs controls): {start,end} slice the delivered
bytes inclusively; start-only reads to EOF and end-only reads from zero;
an oversized end clamps without error; start at or past the size delivers
no data event - only end and close, with bytesRead 0; a negative,
fractional or greater-than-end start/end throws a RangeError with code
ERR_OUT_OF_RANGE synchronously at construction; undefined fields behave as
absent. The model validates fields at construction in option order before
path work, stores the range in the stream facts, and slices at delivery;
the 64 KiB single-chunk bound now applies to the slice. Non-number fields
stay a typed boundary; the RangeError preserves type and code without an
invented message.

Header-carrying dispatch: pinned raw HTTP requests expose an ordinary
Object.prototype-linked headers object whose own names are the lowercased
dispatched headers. deliverRequest's input gains an optional headers
record, declared as concrete name/value pairs; absent keys still answer
undefined through ordinary lookup (the object stays deliberately
unmarked).

String.split over concrete receivers was a hidden blocker on the same
line: sirv's `range.replace('bytes=', '').split('-')` crashed the legacy
segmented-representation implementation (self.value assumed to be a chunk
array). Concrete receivers now split through pinned host semantics
(omitted separator yields the whole string, empty separator splits
characters, adjacent separators keep empty elements); the symbolic
segmented path is untouched, and RegExp separators and limit arguments
stay typed boundaries (LEGACY-002 updated).

Specs first: seven fs-readstream-range tests against the pinned controls,
seven string-split pinned-oracle tests including the exact sirv shape
`'bytes=2-5'.replace('bytes=', '').split('-')` destructured through the
array binding pattern, and the sirv-request wire case host-pinned against
the unchanged packages: GET /hello.txt with Range "bytes=2-5" answers
status 206, body "llo ", content-range "bytes 2-5/16", content-length
"4", accept-ranges "bytes", content-type text/plain and the pinned
last-modified. The range opens a third read stream whose slice delivers
the four bytes.

Honest migrations: node-fs-readstream's gap test moved its rejection pin
from {start: 0} (now supported) to {encoding: "utf8"}; sirv-target.md and
LEGACY-002 reworded.

Validation (sandbox, Node 24.21.0, PROPHET_NODE_BINARY pinned): full suite
green on the shipped tree (totals in the ledger);
fs-readstream-range, string-split, node-fs-readstream and sirv-request
suites green individually. Amended 2026-10-15: the typecheck claim above
was wrong - the shipped tree carried two latent TypeScript errors in
src/string/split.ts (an implicit-any arrow parameter and a
split(undefined) call the ES2015+ lib typings reject), because the suite
runner's SUITE_DONE line is unconditional and was misread as a clean
typecheck. Runtime semantics were always correct (all specs green); P032
fixes the types and hardens the validation to grep for "error TS".

## Frontier after P030

Other header-carrying requests: accept-encoding negotiation (needs gzip
streams) and if-modified-since (needs Date construction). The declared
stream gaps remain: 'open'/fd registration, option fields beyond numeric
start/end, >64KiB multi-chunk slices, repeat delivery. Non-number range
fields, non-string split separators and split limits stay typed
boundaries.
