# P044 independent semantic review

Codex root plus its inherited-model subagents (array_map implementation,
package_scout independent package/native integration, map_review independent
adversarial review). Task v1 map, v2 adds distinct spec-first unshift substep.
No external worker or model override. Source names/bytes are not inference rules.

## Map

Initial independent baseline: 18 tests,13 failed/5 boundary controls passed;
nine native snippets succeeded before missing-feature failures in Prophet.
The delivered map passed those initial controls. Independent review then found
one genuine defect: an embedding-supplied inherited indexed propertyAccess hook
could be treated as absence on a hole. New19th test failed; implementation added
a reached lookup guard. The guard preserves callbacks before the unsupported
hole. Map final review:111 passing tests across map core/review and forEach.
Root inspected the algorithm, captured-length/current lookup semantics, branch
continuations and private result snapshots. No custom species can expose the
intermediate array; final allocation identities remain fresh. Sparse conditional
results must select branches before subsequent writes; unknown layout remains a
stop. Quadratic bounded snapshot copying and uncapped branch volume are explicit.

## Unshift

Independent initial baseline13 cases:9 failed/4 boundaries passed; six native
controls succeeded. Expanded review found one genuine defect after15 tests
passed: a trusted hook object and read function did not establish unchanged
write-function identity. Regression16 failed on an in-place mutation. A separate
write identity helper now guards new destination writes without adding that
irrelevant premise to read-only map. Final independent55 tests/3 suites passed.
Root inspected dense current source proof, constructor/species irrelevance,
ordinary new-target Set proof, limits before scans, persistent writes and noargs.
Sparse/conditional-presence and generic receivers remain declared boundaries.

## Package and upstream evidence

Unchanged sirv factory, gzip selection/fallback/plain paths and explicit Brotli
/i stop have22 passing tests across four package suites. Native references use
actual unchanged code, controlled local files and Writable adapters (no network).
Text-safe .gz bytes establish selection/headers/stream bytes, not gzip codec or
arbitrary binary support. Early package harness header-shape error was corrected
before genuine red; it is not counted as a VM defect. Unsupported map sentinels
in three prior array suites now use deferred every/filter; new behavior specs
replace map's old rejection coverage. Nine map and one unshift Test262 files run
whole/unmodified (20 variants). A tentative map delete case was withdrawn because
shared delete is unsupported, recorded as inactive rather than silently trimmed.

Two review findings were disclosed to implementation and retained in dedicated
review specs; final reruns are independent executions, not hidden holdouts.
All source frozen after the second correction. An initial root full run was
interrupted for that correction and is not passing evidence. Exact final full
suite/typecheck, source hashes, scans and log hashes are recorded in evidence.json.
Decision: semantic review accepted within documented domain, publication contingent
on full validation and exact-candidate CI. No broad model trust promotion.
