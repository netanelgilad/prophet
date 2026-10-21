# P025: fs.createReadStream and pipe, with explicit embedding-driven delivery

Implemented by Instinct in-sandbox; independent review pending.

## Goal

Resolve the measured sirv stop at fs.createReadStream(file, opts).pipe(res)
(build.js:95), a legacy host error on the unmodeled Node filesystem API
member, and complete the delivered GET /hello.txt response.

## Decision record

Native stream delivery is asynchronous: pinned Node 24.21.0 returns from
createReadStream and pipe synchronously, then delivers open -> data -> end
-> close while guest code continues. The model's existing convention for
asynchrony is explicit embedding-driven scheduling (http.completeListen,
deliverRequest, completeResponse, and the response 'finish' event fire only
when the embedding calls the operation). fs.ReadStream follows it:
createReadStream resolves the path against the virtual tree and returns a
modeled EventEmitter synchronously; the new deliverReadStream(stream,
context) embedding operation reads the contents and emits data, end and
close synchronously inside the operation. The async/sync divergence is
recorded, not hidden.

Independent Node 24.21.0 checks pinned the bounded slice: a file under the
default 64 KiB highWaterMark arrives as ONE Buffer chunk; pipe(dest)
returns dest, wires data -> dest.write(chunk) and end -> dest.end(), and
throws "TypeError: dest.on is not a function" synchronously for
destinations without an 'on' method; a missing path does not throw at
construction - the stream emits an 'error' event whose payload has code
ENOENT, and an 'error' event without a listener throws. Declared gaps
rather than silent divergences: the 'open' event (its fd argument is
unmodeled descriptor identity) rejects registration; option fields beyond
an empty object (start/end ranges, encoding, flags, fd, mode, autoClose,
emitClose, highWaterMark) reject analysis, consulting inherited fields
first; files over 64 KiB reject multi-chunk delivery; repeat delivery and
pipe after delivery reject.

One defect was caught by the spec itself during development: the fs model's
systemError helper returns a ThrownValue completion wrapper (its call sites
return it as their completion), and the first implementation passed that
wrapper as the event payload; the listener then received the wrapper and
the invocation re-threw it. The payload is the bare error object.

Specs first: eight new tests in test/node-fs-readstream.spec.ts against
pinned native controls (defaults and construction without throw, delivery
order and the single-chunk Buffer, pipe wiring and return value, the pinned
TypeError, the ENOENT error event, the unhandled-error throw, options and
repeat-delivery gaps, open-registration and multi-chunk gaps). Migrated
from measured output: sirv-request.spec.ts now asserts the COMPLETE
response.

The unchanged consumer completes: for the first time the delivered GET
/hello.txt runs the unchanged sirv handler end to end and the embedding
inspects the completed wire projection: status 200, body "hello from
sirv\n", content-type text/plain, content-length "16", last-modified from
the pinned mtime - the sirv-target pinned Node 24.21.0 reference.

Validation (sandbox, Node 24.21.0, PROPHET_NODE_BINARY pinned): full suite
and typecheck on the shipped tree (totals in the ledger); fs-readstream
and sirv-request suites green individually.
