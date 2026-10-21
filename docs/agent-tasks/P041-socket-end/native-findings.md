# P041 read-only scout: connected TCP socket.end() with no arguments

Recommendation: implement the public no-data `net.Socket.end()` prefix for a model-created, full-duplex connected TCP socket with no previous writes, corking, finalization, destruction, custom stream hooks, or handle mutations. Retain a pending shutdown request and return the same socket. This genuinely advances unchanged `node-notifier@5.4.0/lib/checkGrowl.js` through its `cb(null, true)` call, while the P040 post-ready read boundary still stops subsequent transport exploration. Do not manufacture a shutdown-admission Boolean or claim that this callback establishes successful shutdown, remote availability, clean close, or whole-program completion.

## Evidence and scope

Pinned installed runtime: Node v24.21.0, darwin arm64. Complete builtin sources extracted from `process.binding('natives')`: net, internal/streams/writable, internal/streams/destroy, internal/stream_base_commons. Complete official tag C++/libuv files: src/stream_base.cc, src/stream_wrap.cc, deps/uv/src/unix/stream.c. Source tree identity: 955266bfdd854cd280dffd47548673914484e4c0. Full source paths, sizes and SHA256 are in evidence.json; no repository files changed.

Controlled fixture command:

```
/tmp/prophet-node-24.21.0/node-v24.21.0-darwin-arm64/bin/node /tmp/prophet-p041/end-probe.cjs
```

Exit 0, eight cases, independently asserted result invariants. Source SHA256 c657ccb3fde94a3f89797856f9af6640efebec8aad8c8ea2a1719da4832b22a7; raw results SHA256 9df63fe89b920761475bd5d59310e4562e284a5ad6b9225d19f9bd8416ec89f5. Full raw events/state: end-results.json. Public Socket.end/_final/_read/_destroy are unchanged. TCP.connect/readStart/readStop/shutdown/close are intercepted; none calls the original native method. DNS, IPv6, IPC, native writes guarded, guard hits zero. No native package execution. Connect/shutdown/close completions are injected and labeled; this is a JS state/order oracle, not an OS/network success witness. In particular the manually injected close callback proves its handler behavior only, not actual native close scheduling.

## Exact path before end returns

`net.js:1025` delegates end to Duplex.end and returns this. `internal_streams_writable.js:810` noarg end has no chunk coercion or validation, no write. For the pristine domain it sets ending, calls finishMaybe, then sets internal ended. prefinish marks finalCalled and increments pendingcb before invoking Socket._final. `net.js:750` sees connecting false and a live handle, creates ShutdownWrap, assigns callback/handle and calls shutdown.

At intercepted shutdown entry the oracle observes writable=false, writableEnded=true, writableFinished=false, internal ending=true/ended=false, finalCalled=true, pendingcb=1, readable=true, destroyed=false, active timer unchanged. After binding return0, end returns identical socket with internal ended=true; other values unchanged. No prefinish/finish/error/close fires before return; no timer refresh/cancellation. Note public writableEnded reflects ending and is already true inside finalization, unlike the internal ended bit.

The existing connect emission continues synchronously: fixture availability-true marker -> remaining connect listeners -> ready -> readStart (intercepted). nextTick jobs scheduled by callbacks run afterward. Prophet P040 currently stops before this read stage; P041 should preserve that stop and retained queued jobs. New implementation must not drain them across the boundary.

## No invented admission/resource failure

`src/stream_base.cc:44` creates its native request wrapper and delegates; `src/stream_wrap.cc:335` dispatches uv_shutdown. POSIX `deps/uv/src/unix/stream.c:1161` returns UV_ENOTCONN only when handle is nonwritable, already shut/shutting, or closing. Otherwise it clears the handle's writable flag, retains the shutdown request, schedules internal work and returns 0. Its comment and `uv__drain:625` establish that the actual shutdown(2) syscall is always deferred until the completion stage.

Thus in the tightly stated fresh connected full-duplex/no-write/no-destroy POSIX domain, local queuing is a deterministic consequence of state, not a presumed successful external syscall. Return1 and arbitrary immediate EIO are not reachable uv_shutdown results in that domain; injected versions below test Node JS reactions only. Native/JS allocation failure remains the general fatal resource gap; do not reinterpret it as a catchable ordinary error or independently invented environment Boolean. If implementation permits previously ended/closing handles, custom hooks, other platforms or other transports, this domain argument no longer suffices and must be reviewed.

The complete C++ path excludes both apparent UV_EBUSY fallbacks in this domain. `StreamBase::Shutdown(args)` (src/stream_base.cc:168) passes the explicit object supplied by `new ShutdownWrap()`, so the empty-request NewInstance fallback at line49 is not entered. TCPWrap -> ConnectionWrap -> LibuvStreamWrap -> StreamBase/StreamResource does not override Error/ClearError; the default `StreamResource::Error()` (line673) returns nullptr. Therefore the error-message Set(...).IsNothing() fallback at line75 cannot execute for this TCP wrapper. `ReqWrap::Dispatch` (src/req_wrap-inl.h:144) calls uv_shutdown through the int-returning passthrough template (line88), retains exactly that return value, and updates weak/request counters only for err>=0. It introduces no catchable allocation/admission error. Full downloaded headers and dispatch source are included in the evidence manifest. Fatal allocation, native invariants/CHECK failures and unsupported instrumentation remain general gaps, not synthetic ordinary return-code branches.

A later syscall can succeed, fail, or be canceled; that outcome remains unobserved/pending in P041. A pending record does not claim shutdown attempted on the OS already. No selected arrival/clock/eventual delivery guarantee is justified.

## Complete controlled case results

| Case | Observation |
| --- | --- |
| return0, no completion | end returns same socket; writableEnded=true, writableFinished=false; shutdown remains pending; no prefinish/finish/error; timer stays active |
| return0 then completion status0 | completion synchronously emits prefinish, then enqueues finish nextTick; finish sets writableFinished=true; readable remains true, no automatic destroy/close, timer stays active |
| return0 then completion status EIO | same JS behavior as status0, no error event: afterShutdown ignores status and invokes callback with no argument |
| return1 injected | prefinish inside end before return; finish nextTick; no error; generic JS path, not reachable pristine POSIX TCP return |
| return ENOTCONN injected | same synchronous finalization as return1; **not** emitted as a shutdown Error; excluded-state compatibility witness |
| return EIO injected | _final constructs Error code EIO/errno -5/syscall shutdown/message `shutdown EIO`; synchronous destruction cancels timer, close request retained; end still returns socket and caller marker runs; error emitted nextTick; no readStart; not a reachable pristine POSIX return |
| binding throws injected Error | writable prefinish catches it and destroys; end still returns, later error event; fixture exception is not a native resource claim or Prophet typed stop |
| repeat noarg end while pending | same socket returned, only one shutdown request, no duplicate finalization; completion behaves normally |

`net.js:773` afterShutdown ignores its arguments and calls saved final callback; `src/stream_base.cc:755` passes status to that handler. Therefore writable finish is specifically **not** evidence of an error-free shutdown syscall. In pending success/error completion cases, prefinish-listener nextTick is queued before finish itself, which is queued before later jobs added after completion returns. In immediate-finalization cases, a job scheduled before end runs first; prefinish listener's job then finish run before a job scheduled after end. No automatic close occurs with readable still open. `_destroy` and generic destroy queue error nextTick and request native close independently; our close injection is deliberately manual, and no real close-loop ordering is claimed.

## Small reusable implementation contract for root review

- Public operation `net.socket.end`, modeled through normal host invocation and existing origin capture, returns same receiver. No package names/source recognition or availability/security labels.
- Accept exact zero arguments initially; other end overloads explicitly stop before mutation. No writes/cork/custom hooks exist in current socket model, but document this as a guard/domain rather than an inferred absence of all possible stream behavior.
- Require known connected full-duplex live state. Keep queued/connecting, failed/partial completion and closing/destroyed states separate unsupported boundaries. End-before-connect requires the native deferred connect listener and is not this increment.
- Preserve state describing writable ending/ended=true, finished=false and pending shutdown. Keep readable true, socket alive, connecting false, existing timeout arm/refreshed identity unchanged. Avoid binding-specific request identities pretending to be user-accessible native objects. Exact host-slot field names are an integration choice; public state getters, if exposed, must agree.
- First noarg end records one pending shutdown; repeated noarg end in that same pending state can be supported idempotently (native witness available) or explicitly retained as a gap. Do not submit twice.
- No transport-shutdown completion provider in this slice. The pending fact states only that local shutdown was queued after the public call; no OS syscall success or completion. No extra symbolic success Boolean is needed before end returns in the supported POSIX state. Further transport completion must eventually model ignored-status behavior and shutdown cancellation/lifecycle ordering.
- Existing P040 connected callback and ready execution continue, then existing read boundary. Keep origin tied to the actual interpreted dependency callback. Caller callback is actually invoked synchronously from the dependency callback; it has that dynamic activation parent, not a stored registration parent.
- Generic stream error trapping must never catch/reclassify Prophet typed stops as guest Errors merely because Node catches guest throws around `_final`.

## Required independent tests if approved

1. Core end noargs inside connect listener: same socket return, state prefix, timer identity unchanged, pending shutdown fact, no finish/error/close and actual caller continuation.
2. Repeated end noargs pending does not duplicate; unsupported overload/phase stops retain correct pre-mutation state, and public flags remain consistent.
3. Actual CLI unchanged complete pinned checkGrowl module/package: full completion branch reaches `cb(null,true)` and user callback state/effects, then stops at P040 read boundary; callback activation chain, source hashes, socket/outcome/timeout aliases retained. Startup maxEvents0 waiting branch and completion failure/partial branches remain distinct; none invokes user availability callback. A callback throw ends earlier with genuine guest throw, not a forced read boundary.
4. Controlled native fixtures above durable inline in existing Jest spec; distinguish reachable pending path from injected generic return-code behavior. No native package execution, transport calls or invented OS success.
5. If exposing writable flags globally, check pre-end true/false defaults and post-end false/true/false across symbolic completion branches. Preserve histories and conditional state rather than mutate sibling outcomes.

## Whole upstream case inspection (not execution/coverage)

Downloaded and read five entire unmodified official v24.21.0 cases; manifest with hashes in upstream/manifest.json. None fits this increment whole. test-net-end-close.js requires injected custom handle, read EOF, resume, setImmediate and readable close; test-net-end-destroyed.js requires live server/peer EOF and close; test-net-end-without-connect.js requires new Socket and end(callback); test-stream-writable-ended-state.js and test-stream-writableState-ending.js require generic Writable construction, data writes and callback/finish. Zero upstream cases executed; controlled local cases are not extracted upstream coverage.

Remaining boundaries: data/encoding/callback end overloads, writes/backpressure/corking, end while connecting, destroyed/no-handle finalization, shutdown completion timing/status/cancellation, reads/EOF/half-close, finish/close/timer delivery, generic stream constructors and custom hooks, descriptors/resource limits/fatal allocation, non-POSIX implementation. Advancing helper callback execution is useful; it is not an all-path availability or supply-chain verdict.
