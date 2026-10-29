# P050 semantic review

Root authored the initial8 specs before production:7 rejected at the known
element-structure assertion; the pinned Node control over24 branch combinations
passed. See /tmp/prophet-p050/red.log. Production was implemented by Codex
p050_design after read-only design review; root independently reviewed all
production lines. No inherited external draft is included.

Codex p050_review authored disjoint adversarial tests and reviewed all changed
production. Its first tests ran after implementation, so no red baseline is
claimed for those. An early Object.keys(array) assertion hit an existing API
boundary; inspection was corrected to compare the stored key-order graph with
pinned Node own-property names. Object.keys array support was not added.

A meaningful holdout found that an unsupported receiver write hook ran before
new-domain admission (/tmp/p050-review-holdout.log). The implementation now
dispatches joined ordinary arrays before legacy metadata scanning and receiver
hooks. RHS effects remain observable, while the unsupported operation cannot
execute the hook. Root requested bounded inherited metadata scans; reviewer/root
also identified guard expression traversal beyond the value-choice spine. The
implementation now preflights the full expression closure, including refinements,
and tests cycle/depth rejection.

Caps:256 length-choice nodes/depth16;1024 full-expression nodes/depth32;4096
combined storage/presence/key-order work with depth32/cycle checks;256 inherited
metadata entries before includes. No loop proportional to numeric array length.
Existing vector-backed mutation remains unchanged. The new path retains absent
elements vector even after a concrete result, so vector-based methods can still
reject. Opaque/symbolic/segmented lengths, descriptors/setter execution and length
coercion are not claimed. Full suite/typecheck and frozen final review follow.

Two complete Test262 files add4variants and already passed concrete execution
before this implementation. They are compatibility anchors, not red-to-green
syntax work. The full selected corpus passed1045variants with46 historical skips.

Final independent review approved all three production files. Four suites/98
tests passed, including31 independent holdouts and the migrated P049 regrowth
expectation; typecheck passed. Seven source/spec hashes stayed unchanged. Exact
commands and hashes are in independent-review.json. A malformed reviewer guard
fixture was corrected and is not evidence of a production defect. Root inspected
the final production and test diffs; full frozen-source validation follows.
