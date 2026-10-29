# P048: nonlinear, exceptional and weighted proofs

User requested three more really challenging adversarial examples. Base6eac219,
branch agent/p048-adversarial-proofs, shared worktree
/Users/netanelgilad/.codex/worktrees/p035-longcat-environment/prophet.

## Acceptance contract

1. A row operation preserves a two-by-two determinant: independent integer
   a,b,c,d,t in[-100,100], compare (a+t*c)*d-(b+t*d)*c with a*d-b*c.
   Prove the violation false using reusable exact polynomial reasoning. Every
   intermediate must be safe integer; floating/unsafe controls stay unknown.
2. A transaction saves both ordinary data fields, debits/credits with symbolic
   failure stages, returns an object, then restores snapshots in finally. Prove
   restoration and subsequent closure/returned-reference observations for same,
   distinct and symbolic alias choices. Inverse-operation rollback before a
   skipped credit must remain nonconstant with concrete witnesses.
3. Dense immutable finite-number array, symbolic length0..1000000, three locals
   increment1/2/3 on negative/zero/positive branches. Prove
   6*negative+3*zero+2*positive===6*length by verified arbitrary-step induction.
   Counts stay symbolic. Skipped zeros, wrong increments, late deviations,
   unrelated writes and exhausted proof budgets cannot produce false proofs.

Specs first with normal completion, unknown and boundary assertions. Pinned
Node24.21.0 supplies independent concrete witnesses, not all-input evidence.
No source/name recognition or convenient narrowing. New rules must bound work
before allocations/scans and preserve effects, aliases and caller read caches.
No new syntax/host semantics planned; if needed, whole Test262/host cases apply.

## Ownership and validation

Root owns transaction specs, shared docs, integration and exception fixes if
needed. p048_polynomial owns symbolic normalization/integration and polynomial
specs. p048_weighted owns counter-summary and weighted specs. p048_design supplies
independent design and later full semantic review. No subagent commits/pushes.
Preserve primary owner website files. Full changed solver review, focused and full
suite/typecheck, four gap scans/complete skip inventory, exact-candidate CI and
fast-forward origin/master publication. Maintain wiki/roadmap/gap residuals.
