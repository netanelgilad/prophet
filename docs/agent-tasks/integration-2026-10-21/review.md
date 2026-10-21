# Instinct integration review — 2026-10-21

## Scope and provenance

Owner request: integrate, review, validate and publish all Instinct draft work.
Integration base: `0881d9ee32b2133f65eb9e0496d6553830cf3ee3` (`origin/master`).
Candidate: `e183ed98edcf82c1f95937143e2dec58577b36dd`
(`origin/agent/p034-review-p1-fixes`), including P012–P034 and P030's branch.
P007–P011 are already integrated: master's tree exactly equals `22c109d`.
The initial combined index was verified byte-for-byte equal to the candidate.
Linear integration commits preserve master's existing history;
original source/evidence commits remain available through the source branches.

The independent reviewer read the entire changed production diff and relevant
specs. The orchestrator reviewed test changes, target evidence, inventories,
integration and subsequent corrections. The single correction worker is finished;
there is no trust or concurrency promotion. Nineteen unrelated owner files in
the primary checkout are recorded by SHA-256 and preserved.

## Initial validation and review findings

On the unchanged candidate, pinned Node v24.21.0 validation passed: 161 suites,
5,072 tests, 46 historical skips; typecheck exit 0. These passing tests did not
establish semantic correctness. Independent native controls and regression
probes identified wrong admitted outcomes in string boxing, lexical for-in
initialization/prototype enumeration, no-match RegExp replacement, HTTP header
validation/partial failure state, and filesystem stream branch/lifecycle state.
The independently authored probes pass after correction.

Fresh pinned Node requests against the unchanged sirv packages independently
confirm the range 206, matching-validator 304 and stale-validator 200 projections
in `test/sirv-target.spec.ts`. They are concrete evidence, not all-path proofs.
The original local host-test comments were insufficient evidence on their own.

The Test262 inventory is 484 complete unmodified active files / 959 variants,
including 43 parse-negative files / 85 variants. All 114 additions to master's
370 files are retained; no prior active case is removed. All 46 historical
skipped filenames match both master's selection and the backlog inventory.
The draft's 381/753 count was stale. The integration additionally activates
`includes/searchstring-is-regexp-throws.js` after fixing the RegExp rejection;
its complete two variants run without changes. No complete upstream Node compatibility
case is newly claimed; TEST-004 remains open.

## Corrections and residual domain

- String boxing retains concrete UTF-16 data, length, indices and primitive
  extraction. Slot-dependent APIs and symbolic indexed reads remain guarded.
- Array binding follows current length and permanent iterator exhaustion, with
  explicit ordinary-iterator admission. for-in honors lexical-head TDZ, current
  intrinsic-prototype additions and symbolic head choices.
- No-match RegExp replacement preserves replacement coercion and lastIndex
  effects. includes checks RegExp identity and declared match overrides before
  search conversion. Custom unsupported hooks stop at their reached boundary.
- Stream file/error outcomes are persistent branch state; callback bytesRead,
  closed and error/close observations match native controls. Arbitrary custom
  pipe destinations are rejected because their setup effects were not modeled;
  the supported sirv-to-HTTP pipe continues to pass. Conditional delivery retains
  healthy siblings beside typed unsupported branches.
- HTTP rejects numeric names, preserves ordinary value-conversion effects and
  partial raw-store changes, and rejects unresolved symbolic validation instead
  of inventing success/errors. Effectful nested header-array conversions remain
  explicit gaps. Incoming header facts require parsed lowercase token keys.
- Independent input/output/operand/key/depth caps bound the newly admitted
  synchronous operations. Broader legacy algorithms still have the limitations
  recorded in the gap backlog; these are not blanket resource guarantees.

The original eleven independently authored counterexamples all failed against
the draft and pass after correction. Additional guards, native stream lifecycle
controls, and complete Test262 RegExp rejection variants supplement them.
The first full regression run failed four cases (159 suites / 5,096 tests
passed, 46 skipped) and caught the new 1,024 total-argument cap rejecting
existing 1,500/3,000-argument supported calls. The total cap was raised to 4,096
and a 4,097 boundary regression added; individual spread and spread-count caps
remain. The existing large-call success assertions are retained unchanged.

A later attempted Number.prototype mutation test hit an existing explicit guard;
that was a reviewer false alarm, not a removed working behavior.

## Acceptance

Correction review and full local validation are accepted at
`f5d0b911961781de90b4f6990cb3106e588ace98`: 163 suites / 5,102 tests passed, 46 unchanged historical
skips; pinned Node v24.21.0; typecheck exit 0. The 25 independent review cases,
two native stream controls, native sirv range/validator controls and Test262
inventory/guard/assertion/skip/documentation audits pass. See
[evidence.json](evidence.json) for source trees, commands and evidence hashes.

The evidence-only follow-up changes no source or tests. Publication requires the
exact candidate's GitHub `test` and `type-check` checks to pass, then a fast-forward
to `master` under the owner's direct-push authorization. GitHub check runs and
master's commit history record publication; protections are not changed.
Historical task evidence remains historical, including rejected snapshots and
incorrectly reported typecheck runs. No worker trust or concurrency promotion.
