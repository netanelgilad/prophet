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
mixed or unresolved results do not establish a proof. Final review and full
validation are pending and will be recorded before publication.
