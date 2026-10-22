# P043 independent semantic design review (provisional)

Reviewed current P042 net/writable/readable models, event emitter, shared FIFO queue and external provider registry; read pinned Node v24.21.0 net.js afterShutdown and internal/streams/writable.js onFinish/prefinish/finish from the retained source captures. Final P043 design was not yet present at this review checkpoint.

## Required semantics (initial checklist; final revisions below)

- afterShutdown invokes the stored final callback with no argument regardless of asynchronous transport status. Delivery establishes callback arrival, not successful shutdown syscall, peer receipt, transport closure or process completion. No artificial success Boolean may govern the finalizer.
- onFinish consumes the pending final callback, sets prefinished before synchronous prefinish emission, then queues finish only after normal return. A throw or unsupported listener retains preceding state/effects and never queues that finish continuation.
- The queued finish decrements its pending callback bookkeeping and marks finished before emitting finish. The first empty end overload has no end(callback) callbacks. Public writableFinished becomes true before finish listeners. Writable remains false, writableEnded true.
- Fresh readable input remains pending with endEmitted false. The automatic-destroy condition is therefore false, with no implicit close/error/EOF. Revalidate this admitted domain after user callbacks before bypassing native post-emit checks.
- Revalidate current socket/intrinsic/readable/writable facts at external callback and queued finish, preserving finite symbolic choices. Avoid captured contexts and mutation of a shared checks array across branches. A conditionally altered prototype must not discard its healthy sibling.
- The existing shared registry must consume shutdown once, retain waiting and shorter histories, and compete with other current providers. Register from reached shutdown submission, not socket construction. Startup or connect callback completion cannot immediately deliver shutdown outside the explicit external horizon.
- A normal external callback clears external.active before draining jobs. Guest throws clear active but leave queued jobs unexecuted; unsupported callback execution retains active. An unsupported finish job retains job.active while external.active remains empty.
- Listener invocation provenance identifies the actual prefinish/finish callback entry and current lexical state; registration is not invocation. Once removal, listener snapshots, additions/removals and receiver identity follow shared EventEmitter semantics.

## Review acceptance

Conditional approval of this narrow domain pending final design/native cases. Independent specs should include normal versus waiting shutdown state; event horizon one versus two; prefinish/finish state and job ordering; throw/stop at each callback; finite listener/prototype state; no duplicated completion; pending read/timer identities; and cross-socket/provider competition. Existing unsupported write/end overload/destroy/read paths remain explicit gaps.

## Final design review

Read `/tmp/prophet-p043/design.md` after the core revisions. Approve its narrow no-status-input contract and stage ordering, subject to root acceptance and specs. The initial broad guard suggestion above is superseded: finalization accesses protected own socket/private state, so unrelated Object/Function prototype changes do not justify stopping before callback consumption or finish writes. Shared EventEmitter applies its existing custom-apply guard exactly at emission; conditional apply conservatism remains an existing gap.

The selected callback consumes shutdown.pending and finalPending before onFinish-domain validation. The queued finish has no native needFinish recheck; it writes finished/public writableFinished before actual finish dispatch. The readable autoDestroy check follows normal finish callbacks, retaining their effects even when current readable facts are unsupported. These corrections avoid manufacturing earlier boundaries.

One clarification requested: eligibility should represent actual pending transport/live association, not quietly filter malformed internal finalization state. If pending finalPending/stream facts are invalid while shutdown remains pending, selection should consume the arrival and retain an explicit unsupported continuation. Normal guest-accessible supported operations preserve the invariant, but model-owned boundary tests should establish the distinction.

Independent source evidence: pinned writable onFinish lines888 onward, queued finish951 onward; pinned net afterShutdown774 onward. Native finish-throw control confirms writableFinished=true and prefinished=true before escaping the listener, with readable/timer still pending and destroyed=false. No production or tests edited during design review.
