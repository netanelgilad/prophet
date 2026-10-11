# P006 implementation scope — 2026-10-11

Phase A `0f891185bb348f09614067ab63fba9f7c20229e7` supplies a suitable inductive
outline and representation split. This approves a direction, not a solver proof.
Continue in the same assigned worktree/model/thread with full semantic review.

## B1: representation checkpoint (authorized now)

Own `src/symbolic/model.ts`, `src/symbolic/index.ts`, `src/array/symbolic.ts`,
`src/ASTResolvers.ts`, and new `test/symbolic-array-index.spec.ts`. Retain the
Phase A loop specs. Implement guarded symbolic integer array reads, snapshot/index
correlations and symbolic region endpoints needed by an arbitrary transition.
Fix the demonstrated bypass of declared unmodeled indexed reads in that shared
path, with concrete-index regression coverage. No loop summarization yet.

First specify exact new types/operations in design.md. Separate index identity,
presence, view offset and actual length: same sequence does not imply same index,
and different indices may contain equal elements. Same-index equality and region
inclusion require path facts. Preserve concrete regions/recursive summaries.
Unrepresentable presence/membership stays an explicit boundary, not invented
presence or undefined. Bounded finite-index selection may improve precision, but
the arbitrary-index path must not enumerate the length range. Bound reasoning
work, including region-containment/comparison recursion; avoid circular derivation
through the quantified fact being checked. Observer queries cannot mutate facts.

Test repeated symbolic reads, independent/aliased indices and sequences, equality
refinement, slice offsets, present/absent/uncertain presence, invalid numeric keys,
NaN/signed zero, customized lookup and changed heap. Preserve ordinary semantics
or honest boundaries outside this numeric-read domain. Do not silently extend
symbolic writes/calls. New ordinary property semantics require complete relevant
Test262 cases; symbolic representation itself has no Test262 equivalent.

Commit B1, run focused index/quantified-fact/recursive/existing-loop regressions
and typecheck, bind evidence to the exact source, then STOP for root review before
B2. The Phase A loop specs remain intentionally red at this intermediate point;
do not publish or claim full-suite green. No worker push or subdelegation.

## B2 direction (requires B1 review first)

Use loop-level application at the actual reached state after real initializer
and entry setup. Do not replay pre-loop guest effects. Update the design's private
initialization description. Intended additional ownership: src/loops/for.ts,
new src/loops/unknown-length-summary.ts and justified proof-session fields in
src/execution-context/ExecutionContext.ts. Existing recursive summary dispatch/cache
is out of scope. Proof calls cannot silently use trusted whole-function summaries
or bypass validation. Omit caching.

Track every carried write by actual binding identity, including an externally
declared counter's observable final value. Fresh arbitrary iterations retain
index-dependent branches; late deviations cannot borrow a uniform reducer proof.
Check exact integer successor/coverage within safe numeric bounds, never a
floating-point shortcut. No fact escapes a failed progress/exit/dependency check.
Preserve ordinary fallback and real earlier effects; isolate speculative state.

## Corrections required before final acceptance

- Native edge controls currently run only Node. Compare Prophet's concrete
  results with the same independent observations, including NaN/holes/empty,
  infinity and signed zero.
- Add a positive proof over the default uint32 unknown-length range with finite
  nonconstant elements and bounded inference work. Small upper bounds and a
  constant 1025/1026 example alone do not exercise the stated full domain.
- Invalid progress/coverage may decline to bounded fallback. Existing scope()
  assertions at lengths 3..48 must not force unsupported summary domains. Retain
  completed unknown controls at small lengths (including unknown lengths) where
  fallback completes and a separate explicit unfinished large unsupported case.
  Record changed premises; never weaken a required positive theorem.
- Inspect both guest-throw and normal leaves in the throwing-branch test; merely
  observing a fork without an analysis boundary is insufficient.
- Cover pre-loop array values, aliases/shadowing and state changes between calls.
  Real output before a summarized loop occurs once; unsupported body effects run
  ordinarily, without speculative effects leaking. Legacy array-write error
  classification remains a documented residual unless implementation needs it;
  no broad heap/host cleanup ownership is granted.

Also own your design/evidence, new index/loop specs, affected stable gap entries
in docs/implementation-gaps.md, docs/for-statement.md, and new
docs/wiki/unknown-length-loops.md. Root owns task/review/phase-b/ledger/trust/roadmap
and wiki index. Existing tests are read-only. No dependencies, public policy
fields, unrelated syntax/host APIs. Final acceptance requires all intended specs,
full suite/typecheck, complete gap/skip audit and exact-source evidence. Root
integrates linearly and verifies exact-head CI before master publication.
