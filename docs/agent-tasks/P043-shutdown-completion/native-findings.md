# P043 native shutdown completion findings

Pinned Node v24.21.0 darwin arm64. Read-only design scout; no repository changes. Complete Node builtin net and internal/streams/writable sources and complete P041 official C++/libuv sources were inspected; source identity and hashes retained in evidence.json. Public Node builtins remain the model boundary.

## Proposed domain and exact transition

Use the existing pending first noarg shutdown on a live, connected, pristine full-duplex socket, no writes/cork/error/destroy, open readable side. Register shutdown completion as an eligible external source only when its pending request exists. Waiting is retained, and selecting this delivery consumes the same bounded event horizon as TCP/HTTP. Shutdown delivery cannot precede its submission. It is not a timer, deadline or eventual-delivery guarantee.

net.js afterShutdown ignores every callback argument and calls its saved writable final callback with no error. Native completion status zero and EIO have identical JavaScript state/effects. Do not add a symbolic success/failure branch to finalization or equate finish with a successful syscall. The minimal selected event can carry no status because none is observed; if status is retained as an environment input its value must remain unknown rather than silently zero. Neither representation establishes syscall success.

Writable onFinish decrements pendingcb (conceptually consumes finalPending), checks needFinish, sets prefinished=true, and synchronously emits prefinish. During prefinish writable=false, writableEnded=true, writableFinished=false, internal ended=true, finalCalled=true, pendingcb=0. Only after that emission returns normally does it increment pendingcb and enqueue the internal finish callback through nextTick. There is NO finish-scheduled fact before the emission. A prefinish exception propagates out of afterShutdown, retaining prefinished=true and no finish job. Prophet typed stops likewise must preserve actual prefix and active callback, not become catchable guest errors.

The queued finish callback decrements pendingcb then sets finished/public writableFinished=true before emitting finish. No end(callback) callbacks exist in the admitted exact-zeroarg domain. A finish listener throw propagates with finished=true. Normal finish checks autoDestroy; the current readable side is open, so no destroy/close occurs. Native finalization neither refreshes nor cancels the active timer, and keeps readable/handle reading true. No new byte/EOF/read result or peer property follows.

Native stream state itself has no finishScheduled field; if modeled this represents pending queue work and must match enqueue/dequeue/throw boundaries. Revalidate current supported socket/prototype/readable/writable domain before operations; callback mutation can require an explicit stop. Do not clear active external delivery early to get queue draining across a callback stop. Normal delivery clears external active through existing registry, then drains FIFO; finish listener runs in a job, not a second external event.

## Controlled native evidence

end-probe.cjs exit0, six cases: normal completion, EIO completion, no completion, prefinish throw, end reentrancy from prefinish, repeated end while pending. Assertions check ordering/flags, no finish on throw, timer object+idleStart unchanged, and reading unchanged. Original Socket.end/_final/_read/_destroy are retained. TCP.connect/readStart/readStop/shutdown/close are all intercepted without calling originals. Writes, DNS, IPv6, IPC are guarded. Guard hits zero; native package code is never executed. Timer100 uses only the short fixture turn; no timer fired. Manual completion injection proves JS transition behavior, not actual OS scheduling.

Observed ordering on selected normal completion: synchronous prefinish; handler returns; previously queued nextTick; prefinish-listener nextTick; finish; nextTick queued after completion returned; finish-listener nextTick. There are zero preexisting native prefinish/finish listeners on this Socket. Those two public events can therefore be added to modeled registration allowlist without omitted-native-listener cardinality for these event names, although public emitter/count surface remains separately unsupported.

prefinish-throw is caught by the fixture only at the injected completion boundary to inspect its exact prefix: prefinished=true,pendingcb=0,finished=false; no finish job/event. That catch is oracle instrumentation, not a supported process recovery claim. Separate finish-throw-probe.cjs exits1 as expected: uncaughtExceptionMonitor observes sentinel, writableFinished=true, pendingcb=0, no destroyed/error state, and later queued markers do not run. Monitor does not recover execution. finish-throw-results.json records pre-exit state.

Native repeated end and end inside prefinish return identical socket without a second shutdown. P043 may retain the existing repeated-end guard explicitly; supporting it is an independent surface expansion. Callback public writes/hooks/destruction unsupported by Prophet must remain typed boundaries rather than inferred successful finalization.

## Whole upstream cases

Re-read all five complete unmodified cases in P041 upstream manifest: test-net-end-close.js (custom handle, EOF, resume, setImmediate, exit); test-net-end-destroyed.js (live server and peer EOF/close); test-net-end-without-connect.js (new Socket,end callback); test-stream-writable-ended-state.js and test-stream-writableState-ending.js (generic Writable/custom _write/data/end callbacks). None is whole-executable in this domain. Zero cases activated. Local probes are independent compatibility evidence, not extracted upstream tests.

## Integration acceptance

Unchanged node-notifier checkGrowl under explicit IPv4 reaches end and user callback on first selected TCP completion. With horizon2 the second selected shutdown completion can finalize writable while reading/timer remain pending. Retain zero/one-event histories, failed/partial TCP states, and competition with other eligible providers. Use actual complete source/package hashes and activations. No package-specific policy/verdict, no all-path package proof.
