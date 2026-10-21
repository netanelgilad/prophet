# P036 independent semantic review

Reviewed current production changes in Function/Function.ts, execution-context/{ExecutionContext,branches}.ts, effects/{index,model}.ts, and cli/graph.ts against the accepted task contract and prior read-only design review. Also traced unchanged invoke/construct/CommonJS/eval/summary/effect/scheduler paths relevant to entry and restoration. Reviewer owns only test/interpreted-activation-review.spec.ts; no production edits, commits or pushes.

## Evidence

- Before implementation: independent-red.log and independent-red.json, external 30-second timeout, pinned Node24.21.0, exit1, 8 failures. Before/after selected source hashes identical. Each failure was missing activation/origin; existing language behavior and checkpoints reached the expected assertions. No incorrect native expectation was counted as a feature red.
- Current implementation: independent-focused.log and independent-evidence.json, external 30-second timeout, pinned Node24.21.0, exit0, 9 passes. All listed production/spec hashes identical before/after this run. Evidence is bound to file hashes, not a yet-uncreated implementation commit.
- Between red and green, the graph assertion was made independent of whether an optional absent parent field is omitted or explicitly undefined: count frame records by their encoded shared target reference. This is a reviewer assertion refinement, not a production correction.

## Review findings and decision

No remaining actionable production defect found in the reviewed source snapshot. The design-review findings are addressed: activation is entered before boxing/admission with a failure checkpoint; mapCompletions restores ordinary completion leaves but preserves stopped leaves; mergeContexts explicitly reconciles the restored identity and rejects mismatches; proof interception sessions do not manufacture trial frames. HostCall and origin are frozen once at call entry, with the same call identity retained by existing effect recording. Generated/eval direct source remains unknown. Frame parent is the invocation context's active identity, not creation ancestry.

Independent probes cover:

1. Symbolic mixed return/throw through catch and finally, including caller and top-level follow-up effects; no callee resurrection after merge.
2. Pre-body sloppy-string-boxing budget stop with entered target/file/parent.
3. Legacy parameter-pattern admission failure carrying an entered-target checkpoint.
4. Default-initializer boundary beside a completed sibling with restored caller.
5. Actual recursive-summary inference and cache reuse preserving the outer activation, with no speculative effect/frame.
6. Failed singleton recursive proof retaining actual caller ancestry instead of a trial fold frame.
7. Direct eval and Function-generated invocation: unknown direct source retained; generated activation has unknown lexical file and actual parent; caller continuation restores known source.
8. Twenty-five recursive invocations sharing one target, distinct frozen frame identities, no parent cycles, successful graph serialization and shared target references.

The core and integration owners separately cover call/return/throw identity, constructors, defaults, synchronous host callbacks, cross-file/CommonJS behavior, deferred callbacks and public graph output. Their tests are disclosed overlapping evidence, not hidden reviewer holdouts.

9. Direct generator consumption of an early typed boxing error still throws ExecutionBudgetError with the entered checkpoint; the embedding must use the existing capture boundary if it wants an ExecutionBoundary completion. The metadata change does not silently introduce a new conversion contract.

Final source after the core freeze adds a second receiver-bound checkpoint around parameter admission. Re-reviewed that change and reran all nine probes with stable final hashes. The mergeContexts mismatch guard is reached only for ordinary joins: partial boundary trees are returned before mergeContexts, while returned/thrown invocation leaves restore one common dynamic caller identity. Rejecting an unexpected mismatch is an honest internal failure rather than inventing a shared chain. No legitimate mismatch regression was found in the reviewed control flow.

## Limits

The new entry record is O(1) and shares parents; no activation-specific depth cap was added. The moderate depth probe is regression evidence only. Existing interpreter host recursion, graph DFS recursion and retained-graph size remain general resource limits; arbitrary depth is not established. Proof hooks are trusted internal inference machinery. This metadata is interpreted dynamic ancestry and direct source, not a V8/native stack, source-coordinate map, package/security attribution, registration lineage, or an all-path execution log. The graph remains an inspection projection.

Final full-suite/typecheck/CI and publication belong to root. Any later source edits require hash comparison and affected reruns before calling this final-source evidence.
