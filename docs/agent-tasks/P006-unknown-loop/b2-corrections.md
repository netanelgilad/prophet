# P006 B2 first review corrections

Reviewed source `752358a`; root snapshot `330322b` has byte-identical `src`.
Six independent loop probes ran with pinned Node24.21.0 and an external90s
timeout: four pass, two fail, exit1,19.557s. Full log:
`/tmp/prophet-p006-b2-review.log`. Specs are in the review worktree's
`test/p006-loop-review.spec.ts`; read them, but edit only the assigned worker
worktree. These are precision failures, not demonstrated false proofs.

1. A readonly alias before the actual carry prevents inference:
   `const seed=a[0]; let best=seed; for(...) ...best...`. The candidate scan tries
   `seed`, then returns from the entire attempt when the other binding changes.
   Find/validate the actual changed binding; failing one candidate must not
   automatically suppress a later eligible one. Preserve bounded work and
   check every changed slot by identity. Add the reordered-alias regression.
2. A readonly loop replaces an unchanged binding with a fresh unknown:
   `const seed=a[0]; for(let i=1;i<a.length;i++) {} return seed`. On length2..3,
   `scan(a)===a[0]` was true under ordinary execution and is now unknown.
   Preserve unchanged bindings. Declining this summary is acceptable if ordinary
   execution retains the result; do not demand a new no-carry theorem here.
   Add both readonly and mutable-but-unchanged alias controls.

The four passing root probes check the observable external counter, caller
indexed-read-cache isolation, pre/post output exactly once, late index-dependent
corruption, and arithmetic that invalidates the template's original range.
Root first drafted top-level positives, then scoped them to function-local loops
to match the implementation's explicit local-environment restriction. This is
a scope clarification, not an escaped defect: document the function-local-only
first domain in design, boundary docs, wiki and stable gap entries. Other
guards/progress/initialization forms remain deferred, not silently supported.

Review the proof resource-limit wording too: candidate-slot count is capped,
but cloning/scanning retained environment records is not globally bounded by
the AST or VM evaluation budgets. Record that residual alongside solver/join
costs. No new general resource-budget system is required here.

Do not change root probes or existing read-only specs. Use the same worker,
model and worktree; add regressions to your owned specs. Recheck focused cases,
then full suite/typecheck on the final source commit and refresh source-bound
evidence/audit. Keep generated logs untracked. Root will review the correction
and independently rerun the probes before integration.
