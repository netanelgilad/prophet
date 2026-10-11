# B1 review correction batch 1

Reviewed source `effcdd7a` (exact full SHA in git), handoff evidence `3eb9e95`.
Root review-only snapshot `0a2431e` has byte-identical src plus independent specs.
Do not merge/cherry-pick root snapshot commits. Read its test file and retain
useful cases in your owned specs; they become disclosed review regressions.

Root command (pinned Node, existing Yarn/Jest, external 60s timeout) on
`test/p006-review.spec.ts`: 11 passed, 3 failed, 3.231s, exit1; complete log
`/tmp/prophet-p006-b1-handoff-review-final.log`. Review test:
`/Users/netanelgilad/development/prophet-worktrees/review-p006-unknown-loop/test/p006-review.spec.ts`.
An earlier combined run passed all14 worker specs beside two root failures;
the added concrete-region preservation probe exposes the third.

## Required corrections before B2

1. **Inherited hook soundness:** `noInheritedIndex` checks numeric own properties
   and flags but ignores prototype `propertyAccess`. With a snapshot length1..2,
   `a[1]` invents an Undefined alternative despite a custom Object.prototype
   indexed read hook. The root test installs/restores a hook returning99 for
   index1. Retain an honest boundary when inherited lookup is not verified.
   Array.prototype's default read hook returns undefined, but its identity must
   be justified, not a blanket exemption for any hook on that object. You may
   additionally edit `src/array/prototype.ts` solely to expose/check the trusted
   default hook identity if needed. Test both intrinsic prototypes and current
   heap/property overrides; do not execute an unknown hook while proving purity.

2. **Existing concrete-region regression:** an ordinary numeric region [0,10)
   and member region [3,4) no longer instantiate their bound when130 unrelated
   finite facts exist. `proveEndpointOrder` applies the new128-fact cap even when
   both endpoints are concrete and need no symbolic reasoning. Preserve the old
   concrete-region path; caps on new symbolic work must not silently remove it.

3. **Affine index prerequisite:** `tail=a.slice(2); tail[i]===a[i+2]` stops for an
   integer i in1..8 and array minimum length12. Support the bounded exact integer
   arithmetic/position normalization needed here and by the upcoming successor
   proof, with rules in the already owned symbolic/array modules. Verify actual
   numeric operands, integrality and exact safe bounds; never apply algebraic
   reassociation to arbitrary floating-point arithmetic. Include offset aliases,
   subtraction, noninteger/maybe-NaN/unsafe-range controls. If a wider source
   change is genuinely needed, return that precise dependency before editing it.

4. **Budget test quality:** the endpoint-budget test's150 chain nodes lack
   integer facts, so the result also remains unknown without budget exhaustion.
   Add a within-budget eligible proof and a corresponding over-budget case.
   Keep claims limited to the actual local budgets and document residual costs.

The draft's branch-cache issue was independently exposed in root snapshot
2d65416, but Sol independently corrected it before handoff; both root cache
probes pass on effcdd7a. This is recorded as overlapping pre-handoff detection,
not a delivered cache defect. Preserve those controls alongside your own cases.

B1 remains under review, not accepted. Continue same model/worktree, no B2 or
push. Re-run the focused regressions and typecheck on a committed corrected
source snapshot, keep the new negative cases, reconcile affected docs/gaps and
update exact-commit evidence. Return a clean handoff and stop for root review.
