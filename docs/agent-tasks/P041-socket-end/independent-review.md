# P041 independent review — accepted after two demonstrated corrections

No remaining concrete correctness finding in the reviewed domain. Approval covers the first empty end on a pristine full-duplex POSIX TCP socket and the corrected finite completion-record handling, not full shutdown/network/stream behavior. Only test/node-net-end-review.spec.ts and /tmp review artifacts were edited by this reviewer. No production edits, commits, pushes or full-suite run.

## Findings and resolution

1. **Admitted finite completion-record choices crashed and lost siblings (P040 origin).** A valid completion model returning selectValue(choice,fullDuplexRecord,partialReadableRecord) passed completion-record validation, but net.socket.complete read properties of the merged choice without selecting a record. It threw a native TypeError before supported callbacks. Independent19th probe demonstrated this on net.ts c29637b3; review-record-choice.log/evidence.json records18passes/1failure. This re-opened the earlier P040 acceptance before publication; it is not classified as malformed configuration or an out-of-domain case. Corrected with withValue(outcome,...) before reading/retaining selected record fields.
2. **Captured mutable end checks contaminated conditional record siblings (new P041).** Root and reviewer independently noticed record-dependent pushes into one captured array. The direct embedding-admission20th probe demonstrates that a retained choice(partial,full) stopped both branches instead of retaining one healthy end. review-conditional-red.log/evidence.json records18passes/2failures on the same source. This probe inspects admission over conditional retained state; it does not claim the stopped external event has been resumed by a guest program. Corrected with branch-local selectedChecks concatenation, leaving the captured base checks unchanged.

Both probes now pass. The P040 review is reaccepted only together with the correction in this candidate and new exact-candidate gates; the previous green corpus did not cover the failing finite-record case.

## Evidence chronology, without overstating red coverage

- review-red.log/evidence.json: initial18fail run against unchanged P040 f86f4ab4 contained17 actual behavioral/state failures and one reviewer-generated JavaScript syntax error (missing semicolon after Function.prototype.call assignment). The syntax failure is not feature-red evidence.
- review-initial.log/evidence.json: first implementation gave17passes/one same harness syntax failure. Fixed only the test string; original18 then passed.
- review-record-choice.log and review-conditional-red.log: genuine two new defects described above, stable source hashes, no harness error.
- review-corrections.log/evidence.json: all20 P041 probes pass on corrected cb70a5fa revision.
- review-final.log/evidence.json: final frozen production and specs below, **38/38 pass across20 P041 +18 existing P040 independent probes**, pinned Node24.21.0, external45-second timeout, exit0, stable before/after hashes.
- review-typecheck.log/evidence.json: typecheck exit0. Diff check clean. Root owns full-suite/audits/CI/publication.

## Final exact hashes

- `src/node/net.ts`: `a04d82bc94fa80b29537a1ec45103c85fffe39bb6890683f7b86c31041cf3ce1`
- `src/node/writable-end.ts`: `6cc7fe2b3acae2401058d38cf158da6752c99f2058d1c7e8d70c6acb048b785e`
- `test/node-net-end-review.spec.ts`: `f51a39afb2ae0ee27749b8e0a15ab58671c66991ebb6d9179b5ea28795833170`
- `test/node-net-end.spec.ts`: `4f0647013915025e558810db7526232fe15a79525bc1cecb07050b0b19740df1`
- `test/node-net-end-integration.spec.ts`: `defbbd1c4fef3058ffb8936d9ebf3d6d3d49cf68c3fb30e0b41126ec22f1e0ad`
- `test/node-notifier-startup.spec.ts`: `e13f6a196bcc307beba6203c2134657687103139494e074b552e8df4dca82a13`
- `test/node-net-completion-review.spec.ts`: `e9a041c1f2af55423cc780273739039223c3b87e8a4ce2f971b1ddcd2b4ef848`

## Review coverage and source conclusion

Read the final design, native-end-findings.md, pinned JS writable/end/_final sources, C++/libuv submission proof, complete P041 production diff, writable-end helper, core specs, complete durable eight-case native integration fixture, and unchanged checkGrowl integration migration. Independently verified the supplemental ConnectionWrap/ReqWrap primary sources during design review. The helper is a bounded empty-writable transition whose caller proves prerequisites; it is not a full generic Writable implementation.

The admitted source proof entails local pending return0: completion's writable flag reflects uv_is_writable; the fresh undestroyed/unended/unwritten synchronous lifecycle excludes the immediate ENOTCONN conditions; the supplied ShutdownWrap skips the missing-request allocation route; dispatch adds no new ordinary failure return. Actual shutdown(2) runs later and may fail/cancel. No new symbolic success Boolean or guessed resource branch is warranted at local queuing, and no OS success is asserted.

Tests independently verify ending/public writableEnded before traced shutdown versus internal ended after return; same receiver/HostCall/activation identities; public writable=false, writableFinished=false; unchanged current timer arm; no new jobs/events; guard-before-effects for Function.prototype.call, Object.prototype, arguments, phases, repetition and protected writes; fresh versus queued-destroyed observations; partial/failure retained facts; separate sockets and heap histories; callback throw versus typed-stop checkpoint behavior; and the two conditional-state fixes.

The new read-only public status values are consistent with earlier phases: queued writable=true; queued destroy sets writable=false but leaves ended/finished false; failed/partial completion frontiers precede unmodeled destroy/end changes; only admitted end sets ending/ended. WeakMaps hold immutable identity links, while mutable writable/shutdown facts live in the persistent VM heap. End admissions use saved full completion facts, not phase alone. The only guard walk is a fixed-size list; no new arbitrary cap or provider was introduced.

Final integration source verifies the complete unchanged package calls socket.end then its real cb(null,true), with end-return preceding callback and callback activation parented by the actual dependency listener. It distinguishes normal callback return/read frontier, guest throw and typed stop. Waiting/failure/partial paths do not call end. Source/manifest hashes and pending state remain visible. The eight-case native fixture retains JS end/_final/_read/_destroy and intercepts transport/shutdown/read/close; no real target package/native network operation runs. Injected1/ENOTCONN/EIO and callback statuses are broader JS compatibility controls, not feasible default branches or OS evidence. Its close callback is explicitly manual and proves no native scheduling. Reviewed source/evidence rather than claiming an independent rerun of those already-green integration cases.

## Remaining boundaries

First noarg end only; repeat, data/encoding/callback overloads, connecting/destroyed/partial states, modified prototypes/hooks, writes/corking, future final callback, prefinish/finish, EOF/autodestroy/close and native shutdown outcome remain unsupported or pending. Timers can expire in omitted histories; no full scheduling, availability, security or all-path claim follows. The package's true argument is its own report, not verified Growl response. The later asynchronous native shutdown status is ignored by Node afterShutdown; future modeling must preserve that distinction. General native allocation, registry/graph/custom-environment resource limits remain existing gaps.

Review spec frozen; no further edits planned.
