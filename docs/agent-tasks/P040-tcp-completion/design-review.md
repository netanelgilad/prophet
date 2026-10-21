# P040 independent design review

Conditional approval: this is a small useful step from admitted submission to the real package's connect listener, provided the following constraints are explicit. It does not complete TCP or prove package availability. No repository edits or new native experiment were performed for this review.

## Transition and facts

Register a persistent per-socket external source, whose pure eligibility requires submitted phase, admitted submission, pending unconsumed completion and a non-destroyed socket. Read those facts from the selected VM heap, not native mutable flags. Registering at creation is acceptable if eligibility remains false until submission admission. Failed/canceled/conditional resources must not become globally eligible. Direct delivery must enforce the same guard; consume before any callback so neither reentry nor a second exploration step can deliver twice.

On actual selected delivery generate and retain a fresh completion-success Boolean, with readable/writable facts only semantically relevant on success. Distinct sockets/deliveries must not share facts accidentally; repeated inspection must preserve identity/correlation. Success is an abstraction of native status===0, not a fabricated integer errno. Failure records success=false and stops before unknown Error construction, connectionAttemptFailed, destroy or error delivery. Do not label failure transport-connected. Consume completion and set public connecting=false before either status branch, matching afterConnect. Keep submissionAccepted distinct from completion success.

The default readable/writable domain must not assert full duplex. If independent Booleans conservatively include combinations not witnessed on this POSIX TCP path, document this as an overapproximation; do not describe each as observed native behavior. On success with either flag false, stop before the first unmodeled push/read/end action, before timer refresh and connect. Ordinary initial readable/writable state is an admitted invariant only while protected stream API/prototype mutations remain guarded. Recheck that domain at delivery so changes after connect do not bypass callback-time behavior.

## Success prefix and timer

For status success and both flags true, Node refreshes the existing timer before connect, then emits connect followed by ready synchronously. Preserve listener order, once removal, socket receiver, current heap and ignored return values. A callback guest throw or typed stop prevents later listeners/events/read; no queue drain occurs between connect and ready. No extra destroyed check should be invented between those emissions. Unsupported callback operations win at their actual reached point.

Refresh only an active P039 arm. Cancel its previous abstract scheduling occurrence and create a fresh active unrefed occurrence with the old arm.delay, preserving historical snapshots. Public timeout can hold a caught invalid value and is not the refresh delay. Undefined or disabled/canceled arms stay unarmed/inactive; native clearTimeout sets _idleTimeout=-1 and Timeout.refresh then does nothing. Refresh introduces neither an absolute deadline nor assumed elapsed time. Failure and partial-flag stops do not refresh. Submission alone still does not refresh.

After normally completed ready emission, stop immediately before unmodeled read(0)/pause inspection/readStart. Do not emit a normal completion-delivery return or claim reading succeeded. The unchanged checkGrowl listener calls socket.end before its supplied callback: this increment reaches that real listener and stops at end, not at a completed availability callback.

## Shared exploration and checkpoints

Use the existing HTTP/TCP shared registry and global maxEvents0/1/2. Retain waiting alternatives; waiting means no selected modeled arrival within that history, not closed/inactive/no possible future event. Registry order must not prioritize HTTP over TCP. Two eligible sockets must each be selectable; success callbacks may create other resources without mutating unrelated sibling histories.

Keep both delivery/environment HostCalls and original public socket return linked by receiver identity. The external delivery origin has no resurrected registration activation; actual interpreted callbacks establish their own activation. Existing mapCompletions deliberately retains externalEvents.active at typed boundaries, while clearing it for completed/guest-thrown delivery. Preserve this distinction, including callback-specific pending frames/effects and consumed state. Do not erase active merely to make a stopped path eligible for more exploration.

No timer/close provider is added. Thus HTTP/TCP competition is bounded only over the modeled provider set; timer-before-completion and timeout/listener mutations remain unmodeled histories, not ruled-out races. Keep that restriction in domain/gap documentation and make no exhaustive temporal or all-path claim. No new deadline/count cap is needed beyond existing horizon and VM budgets; source/history growth remains an existing resource gap.

## Required independent evidence

Tests should cover maxEvents0; wait plus delivered alternatives; one-shot eligibility; independent sockets and HTTP/TCP selection; all status/flag branches; connecting=false/consumed before callback; no guessed failure Error; full-duplex timer refresh after caught invalid timeout and no revival after zero; persistent historical arm state; connect then ready then read boundary; guest throw/typed stop in each callback; nextTick deferred until after the synchronous handler; active checkpoints/provenance through graph serialization; and unchanged checkGrowl's exact socket.end frontier before cb. Pinned controlled native probes should intercept transport and readStart, exercise afterConnect directly, and verify refresh/state/event prefixes without network traffic. Do not use an overridden _read as evidence of readStart success.

Source basis: pinned Node24.21.0 net.js afterConnect1963-2032 and _unrefTimer738; pinned internal/timers.js insertGuarded400 (negative delay no-op); timers.js unenroll73-111; current external-events.ts and evaluate.ts mapCompletions; prior completion-review.md. Official source: https://github.com/nodejs/node/blob/v24.21.0/lib/net.js .
