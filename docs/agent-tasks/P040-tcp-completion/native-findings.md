# P040 controlled completion oracle

Read-only research, no repository edits, package-native execution, lifecycle scripts or external traffic. Pinned Node v24.21.0, Darwin arm64. Ten scenarios in `completion-probe.cjs`; raw result `completion-results.json`; checked assertions `verification.json`; hashes/commands in `evidence.json`.

## What the fixture does and does not prove

The fixture replaces TCP.prototype.connect and records its request/handle without calling the original. It later invokes that request's original JavaScript oncomplete callback with declared status/readable/writable values. TCP.prototype.readStart is separately replaced and records/returns a configured status; its original is never called. Socket.prototype._read remains unchanged (identity asserted). IPv6 connect, IPC connect and DNS lookup have throwing guards; none were reached. Ordinary TCP wrapper allocation and native handle cleanup may still occur, but no connected native socket, read or network send occurs.

Unlike the earlier _read override, this follows Node's genuine read(0) → Socket._read → tryReadStart path until its binding entry. It establishes JS transition/ordering under controlled input, not kernel connection success, real bytes, read readiness, elapsed timeout behavior, or all possible OS statuses. It is not an upstream test run.

All probes start with ordinary explicit IPv4 options. They have one public connect callback, one later connect listener, one ready listener, and a configured 100ms socket timeout. Each queues distinct nextTicks. A wrapper records the real native timer object's refresh invocation and delegates to its original refresh implementation; it does not supply a fabricated timer. No timeout fires. Cleanup markers distinguish fixture teardown from lifecycle events caused by the injected outcome.

## Verified successful full-duplex order

For injected status0/readable=true/writable=true:

1. Public connect returns connecting=true; later the intercepted binding submission is reached.
2. After completion injection, Node sets connecting=false before timer refresh and callbacks.
3. The existing timeout refresh runs with active delay100 while connecting=false.
4. The original supplied callback runs first with this===socket and connecting=false. Its once listener has already been removed (the original function is absent from socket.listeners('connect')).
5. The connect listener added after public return runs with the same socket receiver.
6. Ready runs, still connecting=false.
7. The untouched Socket._read path reaches intercepted binding readStart. handle.reading is already true at entry. A zero result leaves the socket undestroyed; this is read-initiation admission only.
8. oncomplete returns. Only then do callback-nextTick, listener-nextTick, ready-nextTick execute, in registration order.

No native packet/read operation occurs in this witness. In a model with a typed frontier before unmodeled readStart, these queued nextTicks must remain pending; do not drain them as though the completion handler had finished normally.

## Timer refinement required for P039 state

In the invalid-public-timeout case, setTimeout(100) succeeds, then setTimeout(-1) throws and leaves public socket.timeout=-1. Completion still refreshes the old active100ms timer, then follows the ordinary callback/read order. Refresh must use the active arm delay, not public socket.timeout. The old 100ms delay remains active after completion; no new invalid-duration error occurs.

A separately disabled timer (setTimeout(100), then setTimeout(0)) has a retained native timer object with inactive state and _idleTimeout=-1. afterConnect still calls its refresh method, but it remains inactive. A model must not reactivate a canceled abstract arm just because refresh is invoked. There is no invented absolute deadline or native identity requirement here: an active refresh may become a new abstract scheduling-generation fact if the model chooses that representation, preserving the prior snapshot; native Timeout object reuse is not the identity contract.

Only admitted full-duplex success refreshes the timer before callbacks. The asynchronous refusal branch in this probe does not refresh it; destruction cancels it. Stale completion after a prior destroy is ignored before refresh or callback.

## Throws and explicit model frontiers

An Error thrown by the original connect callback propagates out of oncomplete immediately: no later connect listener, ready, or readStart. A ready-listener throw permits earlier connect callbacks but prevents readStart. In both cases connecting=false and the timer refresh prefix remain.

A separate callback throws a plain fixture sentinel object. It has the same synchronous cutoff. This is only evidence that ordinary exception propagation does not continue later stages; Node has no Prophet typed analysis-stop concept. The implementation still needs an independent VM test that its ExecutionBoundary preserves the active callback/event and suppresses later stages.

The fixture catches injected-call throws to collect state and clean up. Consequently its queued nextTicks execute after the catch. This is NOT evidence that an uncaught guest throw should continue draining jobs in Prophet or that Node would normally survive an unhandled callback exception. Ignore those post-catch fixture continuations when defining uncaught-program semantics.

## Read failure and connection failure distinctions

The read-failure case injects full-duplex success, then returns UV_EIO from intercepted readStart. The ordinary callback/ready prefix occurs. Before oncomplete returns the socket is destroyed and the timer inactive. Its nextTick error has code EIO, syscall read, followed by its error-handler nextTick and then native handle close(true). Connect/ready nextTicks queued earlier run before this error. This validates that successful connect does not justify assuming read-start availability.

The asynchronous refusal case injects UV_ECONNREFUSED after admitted submission. Node sets connecting=false, emits connectionAttemptFailed with destroyed=false, then destroys. The same Error object reaches the later error listener, which observes destroyed=true. Error-handler nextTick precedes native close(true). No timer refresh, connect, ready or readStart occurs.

The immediate-failure control returns UV_ECONNREFUSED directly from intercepted binding connect. It emits error and native close, with no connectionAttemptFailed. Its exception message contains `Local (undefined:undefined)` because this deliberately unconnected dummy handle has no actual getsockname endpoint; that message is a fixture artifact and MUST NOT become the model's general errno/message oracle. Use this case for event ordering only. Platform-sensitive errno values are recorded, not proposed as platform-independent constants.

A submitted socket destroyed before injected completion ignores that stale callback: no refresh/connect/ready/readStart. The close seen afterward is from the preceding explicit destroy, not completion delivery.

## Deferred domains and package consequence

All injected success cases use readable=true/writable=true and P038's ordinary no-extra-options socket. Partial readable/writable flags are source-inspected only: afterConnect calls push(null)/read and/or end before refresh/connect. Keep them explicit boundaries until independently modeled. Pause, write, end, destroy during completion and nondefault socket options need their own behavior; no guard was bypassed in these probes to simulate them.

The unchanged node-notifier5.4.0 checkGrowl callback's first statement is socket.end(). Therefore the useful P040 success branch should execute the real registered interpreted callback and stop at that existing end boundary, before invoking its user availability callback. That proves callback entry/source attribution, not completed Growl availability, sent bytes, shutdown, or an automatic package verdict.

Suggested P040 contract remains waiting plus explicit delivered completion, consumed-at-most-once resource state, connecting=false before callbacks, active-timer refresh from retained delay, receiver/once ordering, and a typed post-ready read-initiation frontier if readStart is deferred. Unknown/full-duplex/failure status domains must be visible, not collapsed to all-success. External-event horizon semantics need explicit root review; these local probes do not choose the CLI schedule.

Primary source copies were extracted from this same pinned binary: net.js (afterConnect, _unrefTimer, _read/tryReadStart), internal_streams_readable.js, internal_streams_destroy.js, internal_stream_base_commons.js, internal_timers.js. No source-map, policy, package-name or source-recognition rule is needed for the model.
