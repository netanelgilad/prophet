# P042 read-only scout: complete afterConnect through first read(0)

Recommended next increment: the automatic first read(0) on the existing fresh POSIX TCP socket after normal connect and ready listeners, including P041 no-data end already pending. Model stream read-state changes and local read-start activation, return null from internal read and normally return from the selected completion handler. Retain unknown future bytes/EOF/errors and pending shutdown/timer work. Do not add an arbitrary read-start success Boolean or pretend to have read data. Do not expand public read/pause/resume/data-listener APIs in this slice.

## Evidence

Pinned Node v24.21.0, darwin arm64. Complete original lib/net.js, internal/streams/readable.js and internal/streams/state.js extracted from the installed runtime; complete official tag C++/libuv files captured locally. Source tree 955266bfdd854cd280dffd47548673914484e4c0. Paths/sizes/SHA256 in evidence.json. Nine controlled cases, exit0, state/order invariants independently asserted. No repository edits.

```
/tmp/prophet-node-24.21.0/node-v24.21.0-darwin-arm64/bin/node /tmp/prophet-p042/read-probe.cjs
```

Probe SHA256 a6cb4319e4f75fc9984f3d25b112f91938a5f4c09f310e12aefa7fa1d307d7c1; raw read-results.json SHA256 a2148c1502d760236e2ed63c9b892e330b30b873e040eb9d163a36dacc94172e. Original Socket.read/_read/end/isPaused/on/pause methods remain unchanged. TCP.connect/readStart/readStop/shutdown/close are intercepted without invoking originals; DNS/IPv6/IPC/writes guarded, zero hits. No native package execution. Connect and close callbacks are explicitly injected, not real kernel transport events. No data, EOF, timer or shutdown completion is injected. The fixture catches thrown listeners to record behavior; it is not evidence of draining jobs after an uncaught guest throw.

## Concrete source path and state order

`net.js:1963` afterConnect processes full success, refreshes the timer, emits connect then ready, and checks `readable && !self.isPaused()` before `self.read(0)`. `isPaused` (readable.js:588) uses the paused bit or explicitly false flowing state; initial flowing is null, so initial paused=false.

`net.js:1067` Socket.read uses the default no-user-buffer path then calls Duplex.prototype.read via its dynamic `.call`. `Readable.read:656` sees concrete integer zero, so no coercion/high-water-mark change. Initial empty/non-ended/constructed state passes through howMuchToRead(0)=0 without early EOF/readable emission. Empty length makes doRead=true. It sets reading=true and sync=true, then needReadable=true, and invokes `_read(highWaterMark)`.

`Socket._read:1009` sees connecting=false, live handle, handle.reading=false. `tryReadStart:999` sets handle.reading=true **before** invoking binding readStart. The ordinary return0 does not destroy the socket. Readable.read then clears sync, retains reading/needReadable, consumes no buffer contents and returns null. No data/readable/end event, nextTick, buffer allocation, remote-byte observation or timer change is caused by this prefix. afterConnect returns normally afterward (performance/diagnostic instrumentation remains excluded).

Observed state at binding entry: readable=true, length=0, HWM=65536, flowing=null, paused=false; stream reading=true, sync=true, needReadable=true, emittedReadable=false, ended=false, endEmitted=false, constructed=true; handle.reading=true; timer active. After handler returns all those facts persist except sync=false. Initial reading/needReadable/handleReading are false and initial sync is true. Default HWM65536 follows pinned POSIX internal/streams/state.js:12; Windows defaults differ and global HWM mutation is outside this model.

With P041 end before this read, writableEnded=true/writableFinished=false and shutdown still pending, while readable state follows exactly the same sequence. Queuing write-side shutdown clears native WRITABLE, not READABLE. Neither timer arm nor pending shutdown is consumed by readStart. A read subscription may later deliver many chunks; represent its active state rather than falsely treating it as one already-resolved byte result.

## Why the narrow readStart result is deterministic

C++ `StreamBase::JSMethod:657` returns EINVAL for a non-live wrapper (excluded); `ReadStartJS:151` simply dispatches virtual ReadStart. `LibuvStreamWrap::ReadStart:201` passes nonnull built-in allocation/read callbacks and the known TCP handle to uv_read_start.

`deps/uv/src/uv-common.c:922` rejects null stream/callbacks or closing with EINVAL; already UV_HANDLE_READING with EALREADY; missing UV_HANDLE_READABLE with ENOTCONN. The existing fresh P040 success/readable completion plus no prior reads/pause/hooks/destruction/handle mutation exclude all of these. C++ ConnectionWrap::AfterConnect:78 derives readable/writable flags from uv_is_readable/writable on actual successful connect; this is a conditional source argument, not a claim that our manually injected completion proves kernel state.

POSIX `uv__read_start` (unix/stream.c:1447) marks READING, clears READ_EOF, installs callbacks, starts the POLLIN watcher/active handle, then returns0. It does not call the allocation callback or perform a read syscall inline. There is no separate fd allocation here. Actual future read allocation, OS event-backend failures, bytes, EOF and transport errors belong after this prefix.

Subtlety: pinned uv__io_start (unix/core.c:953) can call maybe_resize and return ENOMEM, but uv__read_start ignores that int and still returns0. Do **not** invent an ENOMEM result propagated through readStart. Additionally, a normally delivered successful fresh TCP connect used the same fd's POLLOUT watcher (unix/tcp.c:343) and requires its watcher table to have been installed; unchanged fd and no loop-table shrink before this synchronous callback mean readStart needs no fresh table growth. Source here distinguishes API return from a universal resource/backend success guarantee. The model should name the local activation state it actually represents and retain the general unsupported resource/backend gap. Darwin's select-interrupt path is irrelevant for ordinary fresh TCP (`select` starts null); custom/adopted non-kqueue handles are excluded.

There is no independent arbitrary Boolean or immediate-error branch justified in this narrow path. An injected readStart EIO is useful for native JS compatibility outside this state, but is not a feasible default fresh-socket alternative.

## Nine controlled cases

| Case | Observation |
| --- | --- |
| fresh | connect callback -> other connect listener -> ready -> readStart -> handler return -> callback nextTick -> listener nextTick -> ready nextTick; read state as above |
| end-pending | shutdown interception and end return occur inside connect callback, followed by the same readStart/return/tick sequence; no finish/shutdown completion |
| pause-connect | pause sets flowing=false/paused=true; ready still emits; afterConnect skips readStart and returns; reading stays false |
| pause-ready | same skip when ready listener pauses |
| read-error injected EIO | readStart entry still has reading/sync/needReadable true; immediate destruction cancels timer, handler returns; already queued callback ticks precede error event; no synthetic bytes; fixture manually delivers close later |
| throw-connect | no later connect listener, ready or readStart; fixture catches ordinary JS exception |
| throw-ready | no readStart after the thrown ready listener; fixture catches ordinary JS exception |
| readable-listener registered preconnect | on(readable) schedules read(0) nextTick while connecting; that installs a once-connect `_read` listener. At delivery readStart occurs **before ready**, even though flowing=false and isPaused=true |
| data-listener registered preconnect | on(data) starts resume machinery and queues early read while connecting; deferred connect `_read` causes readStart **before ready**, with flowing=true |

The last two cases demonstrate why generic EventEmitter registration is insufficient for data/readable listeners. Current net lifecycle allowlist excludes them; retain that boundary. Pause/read/reentrant/custom-read states likewise cannot be silently mapped onto the pristine path.

## Queue and callback semantics

The prefix itself creates no nextTick job. Jobs queued by connect/ready callbacks are eligible only after the whole handler returns normally. Source ConnectionWrap::AfterConnect uses MakeCallback; src/api/callback.cc:149-184 performs microtask/tick processing on the callback-scope path. Controlled direct invocation records handler return before the nextTick jobs and does not attempt to reproduce all C++ async_hooks/microtask machinery.

Reuse the existing external-event callback completion and queue drain. On a normal return clear active delivery; retain completion consumed exactly once, then drain already-queued jobs before any subsequent external-event choice. Guest throw and typed boundary must retain existing distinct restoration/checkpoint behavior; never treat a Prophet boundary as a guest throw merely because Readable.read catches exceptions from _read. Public process.nextTick is currently unsupported in the CLI, so direct core queue fixtures must establish job behavior; do not silently add process API scope just to build an example.

With horizon2, normal completion now permits TCP->TCP, HTTP->TCP, TCP->HTTP histories and waiting alternatives that P040/P041's read frontier prevented. Test those actual histories; never mark a pending read/shutdown/timer as an analyzed future event. Bounded callback completion is not process exit or full stream execution.

## Small reusable state/API proposal for root review

Introduce an empty-readable first-read transition shared with future modeled streams only after they establish the same prerequisites. Candidate `node.stream.readable` state: constructed, length=0, highWaterMark=65536, reading, sync, needReadable, ended, endEmitted, flowing=null, paused=false; preserve any additional facts actually needed for later inference. A socket transport slot can record read-active false->true independently of stream reading; native handle-reading changes before the call, so do not conflate those checkpoints if recording internal effects. Neither record should imply bytes received or known EOF absence forever.

Trace automatic `net.socket.read` with args[0]=0 and return Null, and `net.socket.readStart` with no args and return0; retain identical socket receiver and ordinary native caller origin (no invented guest activation). Public read lookup can remain unsupported until its contract is separately implemented. Internal modeled readStart has no HostModel outcome configuration. At readStart entry the stream is already reading/sync/needReadable; after return sync clears. Keep end/shutdown/timer state unchanged and permit completion to return Undefined normally.

Revalidate relevant socket/intrinsic guards **after** user connect and ready callbacks: dynamic isPaused/read/_read, the read wrapper's Function.prototype.call, prototype/property domain, stream hook/handle state. A callback may have changed a default after completion-entry validation. Guard unsupported reads/writes/descriptors of read/paused/buffer/high-water-mark internals, not just recognized package behavior. Any newly exposed public properties must report correct initial/final observations; avoid introducing a broad public Readable implementation by implication.

Support only fresh admitted full-duplex completion (with or without one P041 empty end), constructed/readable/live/unpaused/not reading/no EOF/no error, empty buffer, default HWM, no user buffer/onread/decoder/object-mode/manual-start/custom hooks, lifecycle-only listener registration and ordinary prototypes. Existing connect option narrowing and socket access guards can establish many of these; document the actual reasoning rather than initialize unknown buffers as empty by fiat.

## Required tests / deferred work

- Core initial/readStart-entry/final heap facts and effect call/return order; Null read result and complete-return identity; end-pending state/timer arm unchanged; no read-data/finish/close/timer fabrication.
- Queued job executes only after normal completion return and active event clearing; job throw/stop prevents later external selection; callback throw/stop prevents read initiation.
- Two sockets and HTTP/TCP competition at horizons0/1/2, once-only consumed completion, independent active-read state and untouched sibling histories. Graph identities/activation origin remain shared correctly.
- Actual unchanged complete checkGrowl with explicit IPv4: helper returns initially, actual connect listener runs end then actual null,true caller callback, automatic read activates, selected completion returns to waiting state; remaining unknown work retained. Failure/partial/waiting siblings never claim available=true. No all-path protocol verdict.
- Guard callbacks that alter Function.prototype.call/defaults or try pause/read/data/readable APIs; tests must preserve typed boundaries before invalid read-side mutations.
- Durable native fixture preserves the nine cases as local API evidence, not feasible-path claims for injected EIO or full upstream coverage.

Two whole official cases downloaded/read, zero executed: test-stream-readable-reading-readingMore.js requires generic Readable, writes/push/unshift, chunks, EOF, listeners and resume/ticks; test-net-server-pause-on-connect.js requires servers, writes, data delivery, resume and close. Neither entire case fits. Hashes in upstream/manifest.json; no extracted coverage claim.

Deferred: all actual read/alloc/EOF/error delivery, timers, shutdown completion, public read/pause/resume/flowing/data/readable behavior, adopted handles, non-POSIX backends, diagnostic/performance/async_hooks subscriptions, process.nextTick public API, Promise/microtask scheduling, generic Readable construction and future resumption. Completing afterConnect is a bounded useful step, not completion of the network program.
