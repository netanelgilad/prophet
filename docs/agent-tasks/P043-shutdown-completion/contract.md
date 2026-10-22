# P043 pending empty-writable shutdown completion contract

Status: proposed for root and independent semantic review before code edits.
Base: 45416bd; runtime Node v24.21.0 POSIX. Generic Node boundary; no package-specific behavior or security policy.

## Scope and external input

Advance the existing first zero-argument empty end on a live full-duplex socket. Register one shutdown provider when the traced net.socket.shutdown admits its pending request. With no external registry the existing pending-only embedding remains supported. No provider is registered on merely constructing a socket or end rejection. Registration itself creates no arrival or success fact.

The provider selects arrival of the native shutdown callback, whose afterShutdown body ignores asynchronous status and calls the final callback with no error. At the public Node modeling boundary project the ignored raw native status out: do not invent a Boolean success result, errno, peer receipt, syscall-success claim, or native call. This preserves all public behavior for all asynchronous statuses in this live pending domain, including negative status. Native intercepted 0 and EIO controls establish the same JavaScript transition. Docs explicitly retain unknown OS outcome; this does not introduce an environment status override or claim status capture.

Shared external horizon0/1/2 now admits HTTP, TCP completion, and pending shutdown completion. A fresh connected/end socket needs two arrivals from startup to reach finalization: TCP then shutdown. Waiting and shorter histories stay. Multiple sockets and HTTP compete without imposed provider priority. Next-tick FIFO drains between normal arrivals and after the last. No new clock/timer/EOF/close/data arrival is inferred.

## Persistent state and selection

Existing shutdown.pending becomes false only when selected callback delivery begins. Existing writable.finalPending becomes false at final callback entry. Add writable.finishPending=false initially; it represents a queued outstanding finish transition, not the native pendingcb integer. Existing prefinished/finished state remains meaningful. Never store mutable lifecycle facts in WeakMaps or closure variables; only immutable socket-to-state refs are outside persistent heap.

Eligibility is a side-effect-free current-state predicate on actual pending shutdown transport association + not destroyed/closing (not finalPending or other writable admission fields). It returns false after consumption, cancellation, or a different branch with no submitted end. It never generates input or changes a queue. Selected delivery rechecks eligibility, then consumes shutdown.pending at callback arrival. Final callback entry clears finalPending before later finalization guards. The provider was registered only after end established full completion, original socket domain and public writable flags. Guest changes to these fields, private stream state, and connected destruction remain guarded, so this provider association establishes those invariants without repeating end admission. Captured private writable flags are validated only after callback consumption. Invalid stream state must stop explicitly rather than silently disappear through eligibility. Supported writable state must be constructed, ending, ended, finalCalled and finalPending true; prefinished/finished/finishPending false; public writable=false, writableEnded=true,writableFinished=false. Preserve current readable and timer state.

Read actual heap state after callbacks, not registration snapshots; use immutable per-branch check arrays inside finite-choice callbacks. There is no blanket Object/Function prototype guard before callback consumption or finish writes. Socket emit and private final callback bindings are protected; shared EventEmitter checks observable custom apply dispatch exactly at emission, after prior prefinished/finished writes. Any additional prototype guard must identify a concrete dynamic lookup and occur at that lookup, preserving reached state and valid siblings.

## Final callback transition

1. Consume shutdown.pending and writable.finalPending.
2. Mark writable.prefinished=true.
3. Emit prefinish through existing EventEmitter dispatch with same socket receiver, no arguments, registration/once order, current lexical state and actual callback activations.
4. Only on normal return mark finishPending=true and enqueue a runtime-owned finish function on the shared nextTick queue with socket receiver.
5. Return normally. External registry clears its own active delivery; caller scheduling policy then drains jobs.

A prefinish listener throw retains consumed shutdown/finalPending, prefinished=true, finished=false, finishPending=false and no finish job; registry clears active on guest throw but does not drain queued user jobs. A typed analysis stop retains active external delivery. A prefinish listener may enqueue user jobs; those precede the subsequently enqueued finish job. A throw after enqueueing preserves the user jobs but still does not enqueue finish.

## Queued finish transition

Validate the runtime-owned queued job association and finishPending=true. Native finish does not re-run needFinish: do not invent a current-writable guard which suppresses its writes. Mark finishPending=false, finished=true and public writableFinished=true BEFORE emitting finish. The admitted program surface prevents writable/private stream changes that would require broader behavior; such guest operations already stop when reached. Emit actual interpreted listeners through shared emitter. On normal completion, the unchanged live readable side means autoDestroy does not destroy the duplex. Do not cancel/refresh timers, consume pending reads, set destroyed/closePending, emit close/error, or claim process exit. Check current readable endEmitted only after normal finish callbacks at the native autoDestroy decision. Full completion admission establishes enabled readable and default autoDestroy; guest raw-state/option/private API mutation is unavailable, and no EOF provider exists. Therefore endEmitted=false establishes the remaining no-destruction condition for this prefix. Any unsupported readable state is a boundary at this reached decision, after finished writes and listener effects. Callback throw or typed stop halts later work and follows existing JobQueue active semantics.

The reusable empty-writable module should own completion and finish state-order helpers, parameterized by emit/enqueue callbacks. Net owns transport admission, provider association, domain checks and public socket binding. Keep arbitrary writable API/end arguments/write/cork/destroy-after-connect/raw handle APIs guarded.

## Event admission

Permit prefinish and finish registration using existing on/addListener/once/off/removeListener behavior. Native scout confirms zero hidden listeners for these names on fresh Socket, so no extra internal counts. Existing end has a hidden listener and remains guarded. Public emit/listenerCount for every host lifecycle event remain guarded. No data/readable/timeout/end registration expansion. Custom apply handling and listener-limit boundaries remain shared EventEmitter behavior. Independent regressions exposed the custom-apply guard as an ordinary error dropping sibling histories. P043 narrowly classifies that one guard and captures its actual emitter branch as a typed unsupported boundary, preserving preceding prefinished/finished writes and waiting siblings. Other legacy guards remain unchanged; local emission checkpoints retain their precise stage. In particular conditional custom apply resolution can conservatively stop the whole shared dispatch instead of preserving an untouched sibling; this inherited precision limitation is documented rather than changed in P043.

## Specs before implementation

Core: horizon0/1 retains pending finalization; horizon2 selects exactly one shutdown completion and final job; full state/effect ordering, alias identity, no invented success; prefinish/user tick/finish ordering; once/removal/current lexical state; prefinish throw and typed stop; finish throw and typed stop; queued-job exhaustion preserves finish pending; no repeat delivery; timer/read state preserved; no-end/queued destroy/unadmitted/partial TCP never gains shutdown provider; finite conditional end retains normal/waiting branches; multiple sockets share global event budget; mutated intrinsic valid sibling remains valid. Rejections retain state before unsupported mutations.

Integration: actual CLI unchanged checkGrowl helper reaches same actual cb(null,true), then supported shutdown callback/finalization with horizon2 while read/timer remain pending. HTTP/TCP/shutdown competition, source origins, stdout graph schema and residual unknowns stay visible. Update prior expectations only where actual newly supported arrival expands histories; do not skip old boundaries elsewhere.

Native: pinned original Node JavaScript with intercepted transport methods, no real external I/O or package execution. Assert status0/EIO equivalence, public/internal flags at prefinish/finish, jobs before/after finish, listener exceptions and no autoDestroy for pending readable. Whole upstream candidate inventory remains distinct from fixtures; complete upstream activation only if genuinely supported.

Residual gaps: transport syscall outcome capture, incoming data/EOF/read errors, idle expiry, connected destruction, async cancellation/close, nonempty writes, broader stream overrides, future timeline/resumption, resource failures, all-path/npm/security coverage. No gap closure inferred from one fixture.
