# P049: mutable sequences, search and callback state

User approved next three adversarial examples, beginning with compaction.
Base5d2e488; branch agent/p049-adversarial-compaction; worktree
/Users/netanelgilad/.codex/worktrees/p035-longcat-environment/prophet.

## Declared domains

Compaction: ordinary dense mutable arrays length0..4, each element independently
arbitrary finite Number. Every length is a separate symbolic proof, not sampled
concrete elements. Save original values; assert exact surviving prefix, length,
order, removed tail and alias identity through implications for all sign masks.
Preserve original slice snapshot. Broken advance-on-rejection and duplicated-first
variants must remain unknown, with concrete true/false witnesses.

Binary search: ordinary sorted arrays length0..4, symbolic bounded integer values
and target; declare sortedness through interpreted guards. Prove returned index
is a match or not-found implies absence. Duplicates/endpoints/empty and off-by-one
mutants are controls. Ordinary for-loop implementation avoids adding while syntax;
that existing unsupported boundary stays recorded. Shared Math.floor is required.

Settlement: explicit interpreted delivery driver with0..3 symbolic event kinds
(success/timeout/cancel), duplicates and optional synchronous reentry. Prove at
most one settlement, cleanup once iff settled, first result fixed. No-event remains
pending. Late-flag and missing-cleanup/throwing-notification mutations are controls.
This is not automatic Node event exploration or proof over arbitrary event counts.

Unknown-length arrays currently represent immutable snapshots; arbitrary-length
mutable compaction requires new sequence/store relations and is not silently
claimed from bounded ordinary arrays. No million-length proof in this increment.

## Ownership and workflow

Root: compaction specs, docs/evidence/integration. p049_filter_design: reusable
conditional member key/array length dispatch and compatibility specs.
p049_binary: binary-search and Math.floor implementation/specs and coordinated
runtime integration. p049_callbacks: settlement specs then independent complete
source review. No subagent commits/pushes. Preserve owner website work.

Spec-first, exact effects/reference order/aliases/unknown controls; native pinned
Node24.21.0 witnesses, whole relevant Test262 cases. Bound choice work before
branching and retain actual effects at stops. Full source semantic review,
full suite/typecheck, four gap scans and complete skip inventory; exact-candidate
CI then fast-forward origin/master. Keep all residual boundaries documented.
