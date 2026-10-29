# P049 review

Direct Codex implementation and subagents, inherited model configuration. Root
owns compaction specs and shared relational reasoning; p049_filter_design owns
conditional member dispatch, p049_binary owns Math.floor, binary search and final
choice-relation refinement, p049_callbacks owns settlement specs and independent
semantic review. Only root integrates. No external worker or paid service.

## Spec-first findings and corrections

Compaction initially failed five intended length proofs with three controls
passing. Explicit finite member keys and conditional length writes now preserve
reference evaluation order, aliases and exact own-property presence after a
mixed-length merge. Writes after that merge remain a documented boundary.

Binary search first reached unsupported while syntax and Math.floor. The spec
uses an equivalent ordinary for loop; while support remains a gap. Math.floor
uses VM ToNumber before concrete-leaf rounding. Six complete unmodified upstream
files were activated. Open symbolic rounding and metadata remain unsupported.
The primitive-only undefined/Number relational correction preserves NaN behavior
without skipping object coercion. Early exploratory search runs were stopped
when spurious branches made them expensive; timeouts are not semantic failures.
Subsequent small red examples isolated strict order from ordered inequality,
finite-choice guards, sentinel exclusion, selected value identity and symbolic
pivot comparisons. No algorithm/source-name recognition was introduced.

Settlement uses existing closure/state machinery with zero through three event
deliveries and optional synchronous reentry. Native checks cover 240 declared
histories; symbolic proofs do not derive from those samples. Mutants expose late
settlement flags, skipped cleanup and cleanup after a throwing notification.
An initial unsupported compound-assignment fixture was corrected, not counted
as a reasoning failure.

Independent review covers source semantics, effect/reference order, NaN and signed
zero, object identity, unknown leaves, local budgets, and unsupported siblings.
The reviewer found an unbounded structural comparison inside the new complement
helper's claimed local cap. Root replaced it with boundedSameCondition. Existing
general solver traversal is not claimed to have acquired a global work bound.
Selection-prior reasoning requires agreement across compatible leaves; empty,
mixed or unresolved results do not establish a proof. Final known-selected-guard correction enumerates compatible alternatives even
when the selected result is already known, preserving facts needed by absence
proofs. Speculative candidate-window and Boolean canonicalization changes were
removed; original work caps remain unchanged. The existing Boolean equality
structural matcher was also conservatively bounded, not introduced by this task.
A simplified valid implication still remains unknown; see
[the exact residual](remaining-precision.md). This is not required to remain
unknown forever, and was not silently converted into a false proof.

Source commit01da0d4 includes the final TypeScript narrowing cast. The independent
reviewer's earlier run predated that cast and was stopped/restarted; only the
unchanged final source run counts as final evidence. The source01da0d4 full-suite
and restarted independent eight-suite runs were then stopped for excessive CPU
cost before their first suite completed (about two minutes and85 seconds).
These stopped runs are not passes. Prior traversal counters did not bound the
repeated direct query resolution inside each leaf; a conservative precision/work
correction and fresh frozen-source validation are required.

## Performance correction

Measured V8 profiling identified shared-fact intersections during repeated prior
exploration. Disabling only the new prior fallback restored compaction8passes in
16.9seconds; no-prior source was diagnostic only. Atomic-query restrictions,
Boolean-tree preflights and candidate-window changes did not provide the required
result and were removed. A shared128-visit budget restored compaction18.45seconds,
but initially lost the length4 search proof. Suppressing new prior inference
inside assumption construction restored all16 search/direct cases. The final
correction also stops on the first unknown/disagreeing leaf and appends a guard
truth already entailed by its enumerated selector/leaf path. Independent review
accepted those semantics; refreshed combined/full validation follows source freeze.

Final independent review approved source90231ea: eight suites/103 tests in
18.887seconds, typecheck0, all15 source/spec hashes unchanged. The42 independent
review cases include exhausted-budget isolation and try/finally restoration after
metadata exceptions. No outstanding soundness finding within declared domains.
Exact commands/environment/log hashes are in independent-review.json. No broad
trust promotion or global solver runtime guarantee follows.

The full suite at90231ea subsequently exposed a second performance regression in
the original ten-input minimum proof. It was stopped after3m27s with the earlier
CLI/Node suites passing and no complete validation result. A targeted V8 profile
isolated repeated structural truth lookups from order-edge strengthening. The
new rule must use bounded explicit disequality facts rather than invoke general
Boolean matching for every edge; renewed review and complete validation follow.

The full-expression preflight initially restored runtime but lost four original
minimum proofs. Root corrected the representation to retain the original
comparison plus an equivalent Boolean refinement, preserving aggregate order
facts. Selection guards use the compact equivalent form while numeric facts
are derived from the original relation. All25 minimum/search/finite-choice tests
passed in18.968seconds (`/tmp/p049-refinement-compact.log`). Binary subagent's
read-only review approved the equivalence and fact derivation; final independent
review and full regression validation follow. Earlier failed/stopped runs remain
regression evidence, never successful validation.

Final independent semantic review approved the compact-guard correction. Nine
suites/115 tests passed in35.019seconds, including all9 original minimum proofs
and45 independent review cases; typecheck exited0. All17 source/spec hashes
remained unchanged. Exact commands, runtime and log hashes are retained in
[independent-review.json](independent-review.json). No outstanding soundness
finding within the declared domains; full regression and publication follow.

Full regression at423bd87 completed224 passing suites and2 failing suites: three
obsolete limitation assertions expected conditional computed lookup to reject or
two valid Boolean relationships to remain unknown. The run had6235 passes,3
failures and46 historical skips (`/tmp/prophet-p049/full-suite-old-boundaries.log`);
it is not accepted validation. Reviewer owns replacement behavior specs and
independent concrete checks; production source is unchanged.

Reviewer replaced the three obsolete expectations and exhaustively checked both
status-key choices and all four Boolean assignments in pinned Node. Variable
guards/equalities remain unknown and opaque numeric keys still reject. Both
suites passed34 tests in0.929seconds; typecheck0. Root reviewed the complete
spec diff. See boundary-review.json; no production source changed.

Final frozen-source validation at f39fb04:226 suites/6238 tests passed,46
unchanged historical skips, full-suite exit0 in201.836seconds; typecheck exit0.
All tracked source/test hashes were unchanged throughout validation. Complete
audit scans and Test262 inventory are recorded in evidence.json; the following
commit changes documentation/evidence only. Exact-candidate CI precedes publication.
