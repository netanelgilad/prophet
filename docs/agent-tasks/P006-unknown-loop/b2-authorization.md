# P006 B2 authorization — verified loop transformation

Root accepts B1 source `443221795a551eb9e0fe01e4e4954e9e95ca3403` in its documented
representation scope: full source review, 18 independent root checks plus21
worker index checks pass (39 total), source/log hashes verified, worker116 focused
passes/typecheck0. No unknown-length loop proof is accepted yet.

## First clean the evidence-only handoff

Evidence commit e3800ba force-added three ignored generated .log files despite
the task's evidence policy. Remove only those three logs from tracking, retaining
their local files and evidence paths/hashes. Commit that cleanup separately.
Do not change ignore rules or delete the logs. Future logs remain local; commit
only the evidence metadata. This is handoff cleanup, not a reason to rerun the
unchanged source. Check the cumulative diff before the next handoff.

## Implement B2 now, same worker/model/worktree

The original task and phase-b.md remain the acceptance contract. Add the actual
loop verifier at the reached loop state, after real initialization/entry setup.
Own src/loops/for.ts, new src/loops/unknown-length-summary.ts, justified proof
session fields in src/execution-context/ExecutionContext.ts, and the already
owned B1 symbolic/array/AST modules when needed for shared inference. No changes
to recursive function summaries/cache or unrelated syntax/host APIs. Existing
tests remain read-only; new index and unknown-length-loop specs are yours.

Evaluate the real body/update using shared VM operations. Infer generic
loop-carried candidates, verify initialization, arbitrary transition, progress,
coverage, every supported exit, then publish only the retained proven facts.
No reducer name/source recognition, unrolling as induction, blanket input-type
promise, native target execution, or loss of current bindings/heap/effects.
Document the supported loop family; narrower syntax/progress strategies are
implementation gaps, not hidden premises. Minimum/maximum/renamed forms and
unknown/wrong reducer controls are required. The default uint32 length domain
with finite nonconstant elements must be included.

Use binding identities for every changed slot. A var/external counter is
observable after the loop and must have its proved exit relationship. Body-local
temporary declarations may be distinct from carried bindings; other writes must
be represented or make inference decline. Preserve lexical environments and
scope cleanup. An arbitrary index must retain late index-dependent branches.
Exact safe-integer successor reasoning may be added generically to the shared
endpoint rules; do not infer floating-point algebra or termination from a budget.

Proof state must be private, including nested symbolic read caches and mutable
evaluation budgets. Do not leak candidate facts, speculative effects, new array
reads, or consumed caller budget from a declined proof. A cached element's input
interval cannot silently become a carried invariant: validate membership/range
or drop it when a transition changes the value. Omit summary caching. Ordinary
fallback must retain the real reached state/effects and unfinished outcomes.

The original Phase A test corrections in phase-b.md still apply: actual VM/native
edge comparisons, honest distinction between completed unknown and unfinished,
real throw/normal leaf checks, aliases/state changes and no duplicate pre-loop
output. Keep source, assumptions and assertions in specs. Root has separately
prepared loop-state/effect/counterexample probes; screenshots are not VM evidence.

Update affected stable gap entries, boundary docs, design and wiki. No gap closes
from one passing minimum. Run focused index/loop/recursive/selection/quantified
regressions during development. Once the intended source/specs are complete,
commit, then run the full existing suite and typecheck on that exact source with
pinned Node24.21.0. Complete the documented guard scans and46-file skip inventory.
Use external timeouts for exploratory unknown-length runs; record inconclusive
timeouts honestly. Full-suite logs must retain exit statuses, not filtered output.
Generate evidence hashes programmatically and verify them against the actual
tested commit; new docs-only evidence may follow separately.

Return clean source/evidence commits, scope/limits and findings for full root
review. Do not publish or archive yourself. B1 acceptance does not waive B2 review
or establish a first-review/model trust streak. Keep one worker total.
