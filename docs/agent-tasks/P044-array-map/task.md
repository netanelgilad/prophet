# P044: shared Array.prototype.map through unchanged sirv

Base: bcb4b148a50233306768ac838335f5e80e0c3fe5. Branch: agent/p044-array-map.
Worktree: /Users/netanelgilad/.codex/worktrees/p035-longcat-environment/prophet.
User 2026-10-29 prioritizes more generic syntax/API coverage from real packages;
the security CLI is deferred. This increment implements map used by unchanged
sirv3.0.2 build.js:128–129 to prepare compression extension lists.

## Ownership

- array_map: src/array/map.ts, src/array/prototype.ts, test/array-map.spec.ts.
- package_scout: test/sirv-map.spec.ts (independent real-package/native integration).
- map_review: test/array-map-review.spec.ts and independent semantic review.
- Root: design, documentation, gap audit, full validation, integration/publication.
No agent commits or pushes. Preserve primary checkout unrelated owner files.

## Contract and acceptance

Follow Array.prototype.map: nullish receiver TypeError, captured length,
callability before result creation, ArraySpeciesCreate semantics (or reached
explicit conservative boundaries), fresh output retaining holes, increasing
HasProperty/Get visits with current heap values after callbacks, callback
(value,index,receiver)/thisArg, CreateDataProperty of callback result, preserved
throws and typed stops at the current prefix. Ordinary bounded arrays initially;
no invented generic-object coercion or ignored constructor/species hooks.
Reuse persistent heap and branch machinery. Budget before host loops/allocation;
retain branch-volume/unknown-length limits. Test concrete and symbolic values,
mutation/growth/shrink, inherited indices, receiver/result identity, throws,
partial siblings, guarded custom species/prototype cases and count limits.
Activate complete unmodified pinned Test262 files, with pinned Node24.21.0
independent concrete controls. Start with meaningful red specs. Unchanged sirv
compression factory must advance; subsequent request gaps remain explicit.

## Completion

Independent full semantic review, affected specs, full suite/typecheck, four
gap scans and complete skipped-file reconciliation. Record commands/log hashes
and tested source snapshot. Update roadmap, next-work, array boundary, target,
ledger and wiki. Publish only the exact CI-validated candidate via fast-forward
origin/master. No security policy, native package substitution or fixture edits.

## Substep B: actual gzip request, bounded unshift

The accepted map implementation lets unchanged sirv build compression lists;
a gzip-advertising request reaches unshift. Before final validation, extend
this increment with a separate spec-first bounded unshift algorithm and independent
review. array_map additionally owns src/array/unshift.ts and test/array-unshift.spec.ts;
map_review owns test/array-unshift-review.spec.ts; package_scout owns
test/sirv-gzip.spec.ts and migration of the exact prior unshift frontier assertion.

Support ordinary dense arrays with known current length/layout and <=1024 total
result positions. Preserve argument evaluation, return new length, in-place
identity, aliases and persistent earlier snapshots. Prove indexed Get/Set cannot
invoke custom hooks (including inherited new destination setters) before atomic
persistent writes. No species/spreadability lookup belongs to this algorithm.
Sparse deletion semantics, generic receivers, custom descriptors and overflow
remain explicit boundaries; reject before guessed partial mutation. Count limits
must precede scans/copies. Test symbolic values/receivers, noargs, nullish error,
mutation order, unsupported sibling and own constructor irrelevant to unshift.
Select whole upstream cases; unchanged gzip path/native wire projection is the
integration acceptance. A text-safe precompressed-file stand-in verifies selection
and byte preservation, not compression-codec or arbitrary binary support.
