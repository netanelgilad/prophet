# P045 semantic review

Direct Codex implementation with inherited-model subagents regexp_i and
string_startswith; p045_review owns independent tests/package/native evidence.
Root coordinated disjoint paths, inspected every production diff and corpus
selection, and owns full validation/publication. No model override/external worker.

RegExp initial red:10 missing-flag failures and4 passing boundary controls.
Final20 core specs include2304 independently computed pinned Node ASCII matrix
comparisons. Input/literal/escaped-atom ASCII guard, original-range membership
with case partner before complement, complete pattern parsing, length budgets,
input/lastIndex conversion ordering and explicit unsupported siblings reviewed.
No new admissible complete /i upstream case was found: candidate exec/capture/
global requirements stay documented, with no trimming or signature shortcuts.

startsWith initial red:39 VM failures and10 native successes. Final86 specs
include13 complete upstream files independently run in sloppy/strict Node.
Root caught an inherited design defect during implementation: the copied includes
IsRegExp shortcut could scan past intrinsic RegExp.prototype to Object.prototype.
The corrected scoped helper supplies default intrinsic match at the proper level,
honors explicit own slots, and makes cycles/partial prototype lookups typed stops.
Independent regression/native oracle confirms this correction; it landed before
reviewer's first run, so there is no independently captured red for this finding.
The legacy includes operation remains untouched and its defect stays open.
Scoped copying avoids changing unrelated conversion semantics in this increment.

Independent final review65 tests:48 adversarial API,5 Brotli,5 dev and7 existing
sirv-map migrations. Complete source review accepted ASCII class negation/ranges,
UTF-16 prefix semantics, coercion/IsRegExp order, finite correlations, limits,
prototype defaults and unknown/stopped states. Reviewer initially passed a lone
surrogate through a UTF8 source file; String.raw repaired that oracle fixture
before acceptance (two failed assertions, not a VM defect). Implementation tests
also corrected a cyclic JSON label and unsupported old-Babel as-const syntax;
these harness problems are not counted as semantic findings.

Brotli/gzip payloads are text-safe file-selection stand-ins, not codecs. Native
references run unchanged package files with local filesystem/Writable adapters;
VM setup uses declared HTTP/listen/stream delivery. Dev tests additionally run
actual CLI setup for missing and outside-site paths. They establish declared
cases only, not all paths or transport correctness. Source bytes remain unchanged.

Decision: accepted within documented domains, contingent on full suite/typecheck,
complete skip/gap audit and exact-candidate CI. Disclosed design correction is
retained in independent regression; tests are not claimed hidden holdouts. No
broad model trust promotion. Exact commands/hashes/results in evidence.json.

The first root full run ended on hangup (exit129) after47.79s and is not passing
evidence. Typecheck then found three fixture typing errors: ESObject model tag,
mixed Map value inference and own toString typing. These were corrected with
explicit partial-model metadata and types; focused86 tests/typecheck passed.
Root restarted full validation detached from tool-session hangups, retaining
original logs. Production code was unchanged by these corrections.
