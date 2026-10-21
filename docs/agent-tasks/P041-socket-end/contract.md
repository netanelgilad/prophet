# P041: first empty socket.end through pending shutdown

Read-only final design, revised after the native source review. No repository
changes. Pinned Node24.21.0 sources and controlled probes are in this directory;
this proposal supersedes the provisional three-outcome shutdown model.

## Domain and useful result

Support exactly the first zero-argument `socket.end()` on a fresh ordinary POSIX
TCP socket whose selected P040 completion is successful, readable and writable.
Require current connected/not-connecting, undestroyed/nonclosing state, unchanged
socket/protected properties and intrinsic defaults, and no writes, corking, prior
end, errors, EOF, shutdown or stream-hook changes. These facts follow from the
admitted lifecycle; never default an unknown writable buffer or handle to empty.
Check saved full-duplex completion facts as well as phase: phase alone also exists
at P040 partial-flag frontiers. Guard the pristine `Function.prototype.call`
lookup used dynamically by Node's Socket.end wrapper, before state changes.

Arguments, connecting/failed/partial states, repeated end, writable callbacks,
custom hooks and modified prototypes stop with typed boundaries before end-side
changes. Public writable status properties are read-only modeled observations;
property writes and descriptor/prototype mutation remain guarded. No name/source
recognition, special package callback invocation, new configuration or HostModel
outcome API is required.

This lets unchanged node-notifier@5.4.0 checkGrowl, under its explicit IPv4 input,
execute its real `socket.end(); cb(null,true)` connect listener. The report is an
application callback value, not proof of Growl protocol response, successful OS
shutdown, delivered FIN or closed transport. A thrown callback still prevents
ready; otherwise P040 emits ready then retains its existing read(0) frontier.

## Native proof: submission is deterministic in this domain

Socket._final constructs/passes ShutdownWrap to handle.shutdown. Thus the
StreamBase::Shutdown branch that allocates a missing request and can return
UV_EBUSY is not entered. Fresh LibuvStreamWrap uses StreamResource::Error(), which
returns nullptr. Its finalizer dispatches uv_shutdown without a separate resource
admission allocation. Generic fatal JavaScript/native allocation remains the
existing runtime gap, not an invented catchable failure branch.

Pinned POSIX uv_shutdown returns UV_ENOTCONN only when not UV_HANDLE_WRITABLE,
already shut, shutting or closing. The selected successful writable completion
and untouched fresh lifecycle entail the opposite flags. Therefore the first
shutdown returns 0, clears native writable eligibility and retains a shutdown
request. With an empty write queue it feeds the loop; it does not yet call
shutdown(2). No native callback can interleave with this synchronous connect
listener to alter those invariants. This is a conditional source proof, not an
assumption that shutdown succeeds.

Return1, UV_ENOTCONN and other immediate statuses in intercepted probes validate
Node JS control behavior outside this admitted slice; they are not default
feasible branches. The actual later shutdown(2) can succeed, fail or be canceled.
Its completion remains unresolved. C++ forwards its status, but net.afterShutdown
ignores that parameter and calls the writable final callback with no error; a
future provider must preserve that distinction.

## Persistent state and ordering

Add a reusable empty-writable finalization transition, usable by another modeled
stream only after it establishes the same prerequisites. No full stream class or
HTTP request-end claim follows. Suggested socket links:

* `node.stream.writable`: `{constructed, ending, ended, finalCalled,
  finalPending, prefinished, finished}` with fresh true/false initial facts.
* `node.net.shutdown`: `{pending}` initially false, becoming true at the actual
  submission. This is a logical pending operation, not a native request pointer.

A guarded zero-argument end marks ending=true first. Public `writable` becomes
false and `writableEnded` true at that point; `writableFinished` remains false.
needFinish is true for the admitted constructed empty stream. Mark finalCalled
and finalPending true; then trace `net.socket.shutdown` with the same socket
receiver, representing uv_shutdown's deterministic return0. Set shutdown.pending
true and retain it. Only after that internal operation returns set ended=true;
return the identical socket from `net.socket.end`.

Public writableEnded reads ending, not ended. Keep that distinction even though
both are true on normal return. No final callback has run, so prefinished and
finished remain false. No write/afterWrite, uncorking, timer refresh/cancellation,
prefinish/finish/error/close emission, or nextTick job is introduced. Current
P039 timer identity, delay and active status remain unchanged by end itself.
Preserve actual public call arguments/source activation and internal receiver
identity without inventing a public JS call or interpreted activation.

## Limits and acceptance

No new external provider, clock, deadline, count cap or horizon extension. Future
shutdown completion and its onFinish→prefinish→queued finish/autoDestroy/close
chain remain pending. Existing HTTP/TCP selection bounds and timer-interleaving
limits remain visible; no full chronological execution or process-exit result.

Specs must first demonstrate the old end lookup frontier, then cover normal
return identity; state before/after shutdown; unchanged timer; independent
sockets; retained pending work; exact call/return/activation ordering; successful
full-duplex versus stopped partial/failure facts; callback throws; and guarded
arguments, repeated end, property writes and altered Function.prototype.call.
Native probes retain original JS stream machinery and intercept transport with
zero real connect/shutdown calls. Separate return0 prefix assertions from injected
out-of-domain immediate/completion statuses; probes alone do not establish
physical feasibility. Compare state getters during submission and after return.

The real unchanged package spec must verify its source hash and interpreted
connect frame, execute the supplied callback only after end returns, and stop at
P040 read(0) with shutdown still pending. Whole upstream candidates include
net-end-close, net-end-destroyed, net-end-without-connect and writable ending-state
cases; their server/write/EOF/destroy/full-finish prerequisites remain explicit.
Do not truncate those tests or claim they pass. Full regressions/typecheck,
boundary docs and stable-gap reconciliation are required before publication.

Source references: Node v24.21.0 lib/net.js (_final, end, afterConnect),
lib/internal/streams/writable.js (end, needFinish, prefinish, finishMaybe,
afterWrite), src/stream_base.cc (Shutdown, Error), src/stream_wrap.cc (DoShutdown),
and deps/uv/src/unix/stream.c (uv_shutdown, uv__drain). Acquired originals and
controlled native evidence are retained beside this design.
