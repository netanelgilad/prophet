# P041 independent design review

Approve a **narrowed deterministic pending-submission prefix**, subject to the guards below. The current draft's default pending/synchronous/error outcome model should be removed. No repository implementation or test edits were made for this review.

## Why deterministic pending is justified here

This is a source-derived conclusion for the admitted fresh POSIX TCP state, not an assumption that network shutdown succeeds. Node ConnectionWrap::AfterConnect obtains its writable callback flag directly from uv_is_writable(handle). POSIX uv_shutdown returns UV_ENOTCONN only if the handle is not writable, already shut, already shutting, or closing. Otherwise it registers the request, clears the native writable flag and returns0; shutdown(2) runs later in uv__drain. A successful full-duplex fresh completion, intact handle, no previous end/destroy/write/cork, and synchronous callback execution establish those preconditions. Peer network activity cannot independently mutate loop-owned libuv flags during this JavaScript callback. Unsupported async hooks, stream mutation and native embedding corruption are outside this proof.

LibuvStreamWrap::DoShutdown dispatches uv_shutdown; ReqWrap::Dispatch returns its result. Return1 is not produced by this backend. The StreamBase UV_EBUSY request-object allocation route is skipped because net._final supplies new ShutdownWrap explicitly; ordinary TCP does not introduce a stream-specific Error string. Generic fatal allocation remains the existing VM/runtime gap, not a new catchable resource coin flip.

Therefore first no-argument end may deterministically retain one pending shutdown request and return the socket. Do not publish shutdown success, FIN delivery, remote receipt, finished/closed state or a native syscall outcome. No new shutdown environment option/provider is needed in this increment. My earlier generic pending-vs-other suggestion is superseded by this narrower source proof.

Primary supplemental anchors verified independently: [connection_wrap.cc84–105](https://github.com/nodejs/node/blob/v24.21.0/src/connection_wrap.cc#L84), [req_wrap-inl.h130–155](https://github.com/nodejs/node/blob/v24.21.0/src/req_wrap-inl.h#L130), [stream_wrap.h](https://github.com/nodejs/node/blob/v24.21.0/src/stream_wrap.h). Local pinned sources: stream_wrap.cc326–337, stream_base.cc44–81, unix/stream.c1161–1186 and625–660.

## Exact writable prefix and admission

Admit exactly zero arguments on the same environment's ordinary empty, constructed, unended/unerrored/undestroyed full-duplex socket. Phase=connected alone is insufficient: P040 also stores that phase on partial-flag stopped branches. Require retained success/readable/writable facts true under current knowledge. Keep unknown or partial facts, pre-connect calls, repeated end (unless deliberately implemented), buffers/callback overloads, custom hooks, writes/corking and altered domains explicit boundaries before new end effects.

Pristine checking must cover the dynamically used Function.prototype.call: pinned Socket.prototype.end invokes stream.Duplex.prototype.end.call(...), and this VM exposes mutable Function.prototype.call. Object.prototype-only checking would silently bypass a guest replacement. Guard altered/conditional call dispatch or interpret it; a conservative Function.prototype heap guard is acceptable if documented. Preserve protected socket/end/stream metadata and property writes. Native stream and handle APIs remain inaccessible.

Writable.end first sets ending. Thus public writableEnded becomes true and writable becomes false **before** _final/shutdown, while writableFinished remains false. prefinish sets finalCalled and a pending final callback before invoking _final. With return0 it does not call onFinish; afterward end sets internal ended and returns the same socket. Preserve that order around the traced shutdown call and return. No afterWrite is needed: no write or pending write callback occurred. A small reusable empty-writable transition is reasonable; a generic stream class or unreachable synchronous-finalization branches are unnecessary scope.

End itself does not refresh/cancel the current timeout. The timer already refreshed by P040 remains active with the identical arm. No prefinish, finish, close or shutdown-completion event occurs in this prefix. The readable side remains open, and normal return of the actual connect listener still leads to ready and P040's read(0) frontier. A real caller callback may throw/stop before ready; preserve its actual activation/effects and external checkpoint.

## Native evidence and deferred cases

Read the complete intercepted end-probe.cjs and end-results.json (eight controlled scenarios). The fixture retains native JS end/_final/_read/_destroy, intercepts connect/shutdown/readStart/close and guards writes/DNS/other transports. Pending0 shows ending=true/ended=false at shutdown entry, ended=true on identical-socket return, and no finish. Its caller marker proves control flow under an injected result, not real service availability or native reachability of every injected status. Read the final findings document when available before implementation acceptance; it was not yet present at this review snapshot.

Injected1/ENOTCONN demonstrate broader JS synchronous-finalization behavior: prefinish now, finish queued. Those are useful deferred controls, not fresh-POSIX default possibilities. Other injected immediate errors go through ErrnoException/onFinish/errorOrDestroy; they are not automatically public end throws. Asynchronous shutdown status is passed by C++ but net.afterShutdown ignores it and invokes its final callback without an error. A future completion provider must preserve this distinction and the separate prefinish/finish/read-end/close stages; no such provider is needed now.

## Acceptance conditions

Start genuine behavior-red specs for identical return/caller continuation, original end/shutdown HostCall identity and actual callback activation; before/after public/internal writable flags; one pending request and no duplicate submission; full-duplex guard; phase/arguments/repetition/prototype boundaries before effects; unchanged timer identity; callback throw/stop; no finish/close/error/nextTick fabrication. Preserve all P040 waiting/failure/partial completion paths, and prove absence of end calls there.

Execute the complete unchanged checkGrowl helper with explicit IPv4 config: its real connect listener calls end, then invokes the user's callback with null,true, then reaches the existing ready/read frontier if that callback returns. Report this as the application's availability report, not verified Growl response or successful shutdown. Shared external horizon stays unchanged. Timer expiry, shutdown completion and temporal interleavings remain omitted and documented; no all-path network/security claim follows.
