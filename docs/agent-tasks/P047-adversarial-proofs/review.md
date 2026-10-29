# P047 review

Direct Codex ownership: root sorting specs/docs/integration, p047_arithmetic
exact-integer comparison and transfer specs, p047_counters verified two-counter
summary and specs, p047_review independent adversarial tests and full source
review. All use inherited model/configuration; no external worker or paid reset.

Sorting5 baseline tests pass without a new sorting rule, including renamed and
reversed comparisons, all concrete orderings/ties/extremes, broken final-swap
control and a stronger order query that remains unknown for possible NaN.
Transfer initially had4 intended proof failures and6 passing controls. General
safe-integer affine comparison normalization makes the proof pass for distinct,
aliased and conditional target references. Root required portable native oracle,
normal-completion assertions and caps before fact accumulation. The final helper
avoids solver recursion and value rewriting; its direct bounds are conservative.

Counter candidate design proves the actual base, arbitrary transition and exit
using two carried values with sum=index; unrelated writes/effects must decline.
The initial counter fixture mistakenly used randomNumber's[0,1) element domain;
independent review caught the narrowing and required arbitrary finite elements.
That initial fixture is not evidence for the requested domain. Later specs use
explicit finite facts and retain unknown length and both individual counts.
Root required bounded candidate/binding scans and strengthened symbolic broken
controls, aliases, unchanged input caches and pinned native witnesses.

Independent review21 tests found no false-proof bug. Its first heap-mutation
fixture used unsupported member++; equivalent explicit assignment reaches the
intended guard without adding syntax support. An unused object in another
fixture caused a conservative heap-identity decline; the residual remains in a
separate spec rather than being hidden. A fallback probe with outer budget180
exceeded30 seconds due to existing merge work and its owned process was stopped;
budget65 negative controls and matching-budget positive proof bound the review.
This is a resource limitation, not proof of a semantic false result. Three
review-fixture TypeScript casts were corrected before typecheck acceptance.

Full changed affine/loop source and integration are independently reviewed;
latest binding-cap correction gets a final rerun before frozen full validation.
Known residuals and all claimed domains are in docs/adversarial-proofs.md and the
stable implementation-gap reconciliation. No broad model-trust promotion.

Final independent rerun on frozen production:55 tests across all four adversarial
suites passed. Reviewer accepted the final256-binding/4-candidate early caps and
all changed source. Full validation/evidence follows; exact source hashes and
commands are recorded in evidence.json.

Frozen implementation 7115ffc: full suite214/6058 passes/46 historical skips,
typecheck exit0. Source/test hashes unchanged across validation. Four guard scans
and complete unchanged upstream skip inventory are bound in evidence.json.
