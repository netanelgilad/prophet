# P038 independent implementation review

Reviewer: Codex semantic_review. Owned only test/node-net-review.spec.ts and /tmp review artifacts. No production edits, commits, pushes or full-suite runs.

## Result and exact evidence

No remaining actionable semantic defect found in the reviewed final pending/submission scope. Independent focused run: 1 suite, 20 tests passed, exit0, approximately 1.10 seconds wall time under an external45-second watchdog. Exact argv, before/after source hashes and result are review-final-evidence.json; complete output review-final.log. All listed source/spec hashes remained unchanged during the run.

The first review-red.log is a missing-module baseline: zero assertions executed. It is not semantic-red evidence. Initial implemented source then passed15 tests (review-initial.log). review-listeners-red.log has a historical filename but is GREEN19: root's EventEmitter correction was already present when the four additional probes executed. Root separately owns the actual pre-fix two-test red evidence. Final20 includes the independent pinned native end-listener witness. These evidence distinctions prevent a false red/green claim.

## Source review coverage

Read every line of src/node/net.ts, all production changes in src/node/events.ts, src/cli/runtime.ts and src/index.ts, complete test/node-net.spec.ts and test/node-net-integration.spec.ts. Rechecked relevant EventEmitter registration/removal/emission, jobs FIFO/active-job clearing, external-event separation, typed failure checkpoints, createHostFunction effect recording and prototype/heap helpers. Reviewed final-contract.md including root's final scope decisions, native-findings.md and native JS/C++/libuv evidence.

- No pre-return descriptor gate exists. Public call returns a scheduled socket before the queued binding transition; callback registration retains a once listener without executing it. Native wrapper allocation remains outside the modeled ordinary resource outcomes.
- Submission unknown is allocated only at the reached call, stored before splitting, and reused by persistent state. Default outcomes of separate sockets are distinct. The false path preserves the normal submit result, reached effects, submission-failed phase and active queue job, then stops at unmodeled cleanup. It does not masquerade as a caught public net.connect error or a completed refusal/error/close event.
- State and outcomes live in persistent VM heap objects. WeakMap is limited to resource identity -> state identity. Queue receivers and effects retain the same socket identity. No captured registration execution context or invented interpreted activation is restored.
- Initiation sets phase before connectionAttempt emission. Guest listener throw and typed stops halt before submission; queued-only destroy during that callback stops, matching the admitted boundary rather than inventing post-event cancellation. Normal listener removal preserves the current emission's listener snapshot.
- Pre-initiation no-argument destroy updates flags and records close-pending, with no delivered close. A queued initiation rereads phase and skips canceled sockets. Repeated/post-initiation/argument destroy remains an explicit boundary.
- Shape admission rejects hidden/unknown property domains, additional keys, symbols, nonordinary prototypes and all heap-altered/conditional intrinsic Object.prototype states. The latter is intentionally conservative, including joined clean siblings, and is documented. Finite values and whole-object alternatives retain supported versus unsupported correlation.
- Numeric port errors occur after admitted known host-string validation and before IPv4/DNS routing. Hostname+invalid numeric port therefore throws the promised RangeError; unsupported host shape does not invent a competing port error. -0 normalizes to +0. No native DNS/TCP I/O occurs.
- Runtime shares one EventEmitter model between HTTP, net and the events builtin; aliases reuse the module/function identities. No net completion provider was registered and no HTTP event-horizon behavior was changed.

## Review convergence and correction

During source review I independently identified the old generic public emit/listenerCount gap: native Socket has an internal end listener, so reporting no end listeners or emitting false would be incorrect; restricted connect operations also needed typed frontiers to preserve healthy symbolic siblings. Root had independently corrected the EventEmitter policy before my four regression probes ran. The final allowedRegistrations check rejects both out-of-domain event names and restricted allowed lifecycle names with typed UnsupportedAnalysisError. Existing unrestricted EventEmitters keep their old behavior. I read the complete delta and verified symbolic healthy/stopped branches for connect/end emit/count.

The pinned native witness constructs net.connect({host:'127.0.0.1',port:0}), observes listenerCount('end')===1 and connecting===true, immediately destroys before the next tick, and checks destroyed===true with zero intercepted transport attempts. IPv4/IPv6/IPC entrypoints are replaced by throwing guards, never called through; there is no real network traffic. Node version is asserted24.21.0 and process timeout/environment isolation are explicit. This supports the missing-native-listener boundary; it is not full Socket lifecycle compatibility.

## Independent probe coverage

1. Two default submissions: exactly first-false/second-unreached, first-true/second-false and both-true histories; stored facts resolve consistently, identities differ, active jobs match stopped outcomes.
2. False submission after all public-call continuation statements; surrounding guest catch cannot intercept the analysis frontier; event/submission prefix survives.
3. EventEmitter removal during attempt retains the current snapshot ordering.
4-7. Attempt listener guest throw, explicit typed stop, destroy and protected connecting write all prevent downstream submission, retaining prefix and typed active-frame state where applicable.
8. Symbolic prequeue cancellation retains canceled and submitted normal siblings without canceled transport.
9-12. Hostname invalid-port ordering, hostname valid-port boundary, unsupported numeric host before port error, -0 normalization.
13. Conditional Object.prototype alteration never silently accepts inherited socket options; documented conservative stop allowed.
14. Correlated symbolic host/port values retain exact thrown versus unsupported paths without cross-product invention.
15. Whole options choices retain the valid sibling beside an extra-key unsupported sibling.
16-19. connect/end emit/listenerCount operations retain a typed frontier and a healthy symbolic sibling.
20. Pinned native internal-end-listener witness with canceled transport.

## Residual boundaries

This is a pending Socket/deferred binding-submission prefix. Accepted submission does not mean connection success, packets, OS syscall success, or analyzed future callbacks. DNS, other overloads, successful connection/read start, completion errors, data I/O, close delivery, reconnect and broader destroy remain gaps. Finite modeled choices do not justify an all-timeline proof or real-package coverage claim.

Host NUL detection currently scans an already-materialized concrete host string before numeric port validation; root explicitly retained/documented this linear resource gap to preserve validation order. Only canonical IPv4 parsing is bounded by15 characters. Full key enumeration and recursive visits over accumulated absent keys, existing generic EventEmitter listener-limit/unknown-name legacy guards, native allocations, graph/source size and broad recursion remain inherited resource/precision gaps. No new false resource-availability fact or ad hoc semantic depth cap was added. Trusted embedding callback/model misuse is not a guest program error, and malicious native graph mutation is outside the public VM boundary.

Review is bounded independent evidence, not exhaustive conformance, all-path coverage or a substitute for root's full suite/typecheck/candidate CI.

## Reviewed hashes

- `src/node/net.ts`: `876c2011429c8cb9b5708f877e847db07c001ce7af591365c322594fbea087f2`
- `src/cli/runtime.ts`: `43bb355aef93a029901ea49bac3435fe6fa86a918b8d181f7a28fd39cdd12957`
- `src/index.ts`: `4e23314fc595743ef4b70dac0743195d1bb910fdda9c69ae50e1a3910d37b05c`
- `src/node/events.ts`: `51ea076cb2d923e1b2e3c56c4644289768c3974f4f810f85fc1c1bd494ecbc78`
- `test/node-net-review.spec.ts`: `d33658d4c9374998c3163e76b5fd02e42e58b57f27750e2dbbe78fb36a18c30b`
- `test/node-net-integration.spec.ts`: `634d3c58f3cceb43b0f4811c721bf4705a69f8924e05eb0264d837257f68db71`
