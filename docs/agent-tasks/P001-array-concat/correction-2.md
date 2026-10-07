# P001 correction 2 — independent review of a3d39a8

Continue in your assigned worktree and ownership. Root reviewed your implementation,
ran independent adversarial specs in a separate review worktree, and has made no
feature implementation changes. Both specs fail on a3d39a8. Do not publish until
these are resolved, retained as regressions, and final validation is rerun.

1. Empty arrays bypass the element cap: directly invoking concat(empty,
   new Array(20000).fill(empty), context) throws host RangeError (stack overflow),
   not UnsupportedAnalysisError. Bound operand/recursion work before allocation or
   descent, including zero-length operands; choose and document a safe practical
   bound or use a bounded traversal. Test immediately below/at/above the bound,
   plus many empties. Do not turn analysis exhaustion into a guest throw.
2. Marking getObjectPrototype().unknownProperties as unresolved inherited symbol
   state still makes evaluateCode('[1].concat([2]);', context) return a definite
   result. IsConcatSpreadable is an inherited lookup for array operands too. A
   possible inherited Symbol.isConcatSpreadable=false changes native behavior.
   Prove the permitted intrinsic chain's relevant state, or stop explicitly. Do
   not blindly reuse the non-array guard: Array.prototype's known propertyAccess
   hook currently belongs to the intrinsic model, so identify justified exemptions.
   Include inherited partial metadata and symbol slots, restore any singleton
   mutations in finally, and preserve existing ordinary-array success.
3. Move size/work rejection before scans: ordinaryElements currently runs
   assertNoInheritedArrayElements (Object.keys allocation) before the cap, despite
   docs claiming every scan is bounded. Check known length/current layout first,
   then budget, then inherited-index inspection. Keep docs honest about residual
   resource limits and successful allocations.

Independent probe: /Users/netanelgilad/development/prophet-worktrees/review-p001-concat/test/p001-independent-review.spec.ts
Root log: /tmp/prophet-p001-independent-review.log (2 failed, exit 1, 6.239s).
You may read those two exact files; don't edit the review worktree. If Atlas asks
permission, report the request rather than broadening access. The failing code is
reproduced above so external reads are optional.

Also remove unused imports, distinguish a conservative whole-symbol-slot guard
from the semantic assertion that hasInstance implies spreadability, and don't say
all ordinary intrinsic cases are complete when a narrower domain remains. A
constructor shadow on an argument array is conservatively rejected even though
ArraySpeciesCreate consults only the receiver; document this residual restriction.

Commit corrections, run focused/full/typecheck, update gap audit and wiki/evidence
with exact final code commit, complete logs and actual exit status. Scope unchanged;
request a split if shared architecture changes become necessary. Stop for review.
