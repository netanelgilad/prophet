# P005 review

Assigned Muse Spark1.3 free build/high in Atlas thread
`ses_ed8f8d055ffeudxFh2s7rNnu4P`, base b508ad9, root delivery-doc bootstrap1a5bcfc.
Actual runtime and first reads verified2026-10-10T18:16:54UTC. One active worker;
full solver/spec/evidence review. No implementation accepted or integrated.
P003 is archived and its inherited loop-min theorem remains red, unchanged.

Root's independent review branch `review/p005-selection-membership` starts from
exact b508ad9, separate from the worker. The three disclosed no-loop reductions
are in the task; additional probes here are independently authored.

## Independent baseline

Root authored12 probes covering all six candidate orders, incomplete/fresh/equal
leaves, unconstrained numeric NaN, mixed NaN/object selection, signed zero,
post-return effects/unreachable throw, and deterministic pinned Node witnesses.
Baseline b508ad9:7 pass/5 expected failures in4.655s (four orderings plus the
impossible-throw branch); native controls pass. Review-only fixture initially
misused assertPinnedNode's void return and accessed Any.type without narrowing;
root corrected its harness/type errors before accepting this baseline. These
are reviewer mistakes, not worker defects. Final typecheck exit0.
