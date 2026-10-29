# P046 semantic review

Codex regexp_i owns the shared decoder and focused specs; p045_review owns
independent API/package/native evidence. Root owns corpus, semantic oversight,
docs/audit and publication. No model override or external paid worker.

Spec-first evidence:40 initial focused tests fail on the missing global; root's
12 whole upstream files/24 variants fail; unchanged sirv positive ASCII and
once-decoded-percent scenarios miss files that pinned Node serves. Reserved and
malformed controls already passed because sirv catches errors, demonstrating why
catch-only cases cannot establish the missing global's behavior.

Initial implementation: iterative strict UTF8 decoding, exact reserved escape
preservation, single decoding, raw UTF16 copying and ordinary ToString. Root
identified unbounded symbol-prototype recursion; implementation added a256-object
budget before traversal work and exact/over-depth cases. Independent80 API plus6
package and42 implementation tests passed before the conversion correction below.

Unicode fixtures exposed an existing separate gap: cached factory and dev request
lookup reach mrmime's non-ASCII toLowerCase boundary. Native succeeds for all
six package cases; VM specs retain that boundary, zero streams and, in dev mode,
the actual decoded pathname. They do not pretend to serve the Unicode file.

During final inspection, the implementer identified a bypass: an own null/undefined
Symbol.toPrimitive slot may shadow a partial parent, then shared ordinary method
lookup can throw a legacy host error. Root required a scoped per-reached ordinary
method admission instead of blanket preinspection: preserve own shadows, current
heap state, conversion effects, conditional paths and unreached fallback behavior.
This R1 correction needs renewed independent review and final validation. The
128-test pre-correction success is retained as historical evidence, not acceptance
of the final corrected source. No legacy converter outside this operation is
claimed repaired.

R1 correction passed142 targeted tests (89 independent,6 package,47 worker).
Root then identified a second builtin route: an own absent primitive hook and
borrowed intrinsic Object.prototype.toString can bypass admission guards and
reach the intrinsic's own legacy Symbol.toStringTag traversal. Reviewer captured
four red cases: partial self, partial parent, cyclic chain and over-depth chain.
Root authorized only that shared intrinsic helper's typed boundary/depth fix,
not a blanket wrapper around arbitrary conversion callbacks. This R2 scope
expansion requires affected Object specs and renewed full-source review.

R2 red attribution correction: partial-self initially failed at a fixture's
undeclared property assignment before decoder entry; initializing the own slot
repairs that fixture. Partial-parent/cycle/unbounded-depth were production reds.
Corrected helper review passes99 independent cases plus6 package and47 worker
cases. A final conditional-prototype cleanup received renewed source review and
expanded6-suite1256-pass validation, with46 unchanged historical skips/typecheck0.
Root migrated three console tests from legacy thrown errors to typed boundaries,
checking retained prefix state, absent guest catch/output and completed siblings.
Console+opaque suites pass84 tests; opaque specs needed no change.

Final read-only review accepts frozenf581992, including root's console migrations:
original native tags and exact guard messages remain, with typed boundary, prefix,
no-catch/no-output and completed sibling assertions added. One precision residual
is documented: decoder admission conservatively rejects direct symbolic internal
prototype links; the shared tag helper's branch support is not universal lookup
support. Full validation remains the final local gate.

Frozenf581992 full validation completed:210 suites,6003 passes,46 historical
skips, typecheck0; tracked/untracked source and test hashes unchanged across
validation. Four gap scans and complete inventory accompany evidence.json.
Final documentation-only changes describe residual conditional-prototype limits
and correct the historical standard-library summary; tested runtime source is
unchanged. Exact candidate CI is required before publication.
