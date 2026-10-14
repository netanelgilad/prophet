# P008 independent correction review — bounded source accepted

**Accept worker source `06eefd516e65bbc5d02b6bf94ddbed383f59c8d7` for the declared
trim and truthful partial-String domain.** R1 is corrected, the authorized graph
honesty repair is sound in the reviewed domain, and the worker final-source
regression gates pass. No new production blocker was found. This is not acceptance
of later runtime/spec bytes, complete String metadata, or an integration-ready
review branch: the preserved original independent spec has one superseded success
expectation that root must reconcile before integrating those probes.

This report supplements, and does not replace, [the original rejection](independent-review.md)
of `0d3b2781147e1625d90da2db5ec6e86c58a238ff`, committed in
`4e221387ca1e4a646dc2684c6de80373f0ed6102`. Its failures and original 26 probes are
unchanged. New probes are in `test/p008-independent-correction.spec.ts`; exact
commands, statuses, hashes, source comparisons and retained logs are recorded in
[independent-correction-evidence.json](independent-correction-evidence.json).

## Exact source and ancestry

The effective production baseline remains accepted P007
`750b5c690d97dd63ca304713805c59a360b748a0`; content review uses the requested
**two-dot** `git diff 750b5c6..06eefd5`, with the earlier complete review plus a
full line review of `cb2c0da..06eefd5`. P008's lineage via `1bf4dd4` shares the
same portable P007 probe correction but is not descended from `750b5c6`.
The previously established merge base is `8a2b976fff5d03589660f1fc344c4549d3c01771`;
the accepted P007 and worker parent have identical runtime/test trees. Root owns
stack alignment; no ancestry substitution was treated as source equivalence.

Worker lineage is `0d3b278` → documentation/evidence `cb2c0da` → correction
`93dcdbd49ed850f7a35d921853cd021988b69588` → final spec checkpoint correction
`06eefd516e65bbc5d02b6bf94ddbed383f59c8d7`. Reviewer source HEAD is
`463f1fc45b51dbacc376c1ea598b30558d4c71b2`, after root's corresponding copies
`c330b2c` and `463f1fc` onto review commit `4e22138`. Before tests, **all 240 worker
runtime/spec TypeScript file SHA-256 pairs matched this checkout**; they matched
again after tests. The identical `src` tree is
`3ba57e5f089858c1e9cc9602bb99b4f4bab605eb`. Worker test tree is
`4e58abc1a2970701e3082b001f895f81641cd908`; reviewer tracked test tree is
`70d2e2069e6b05a5c45222ad65e9a6d10a0a5580`. The difference is the retained original
review spec and the test262 README count correction absent from review ancestry,
not worker test-code divergence. Worker documents were reviewed through Git.

Final worker evidence commit `e3191d073fdc28d125d19bb269ef25315f8fef0c` changes
only correction evidence/handoff documentation; its runtime/spec diff from the
accepted source is empty. Its evidence JSON SHA-256 is
`238f26f46b2f674a7732310bc60821f5ab0c311b4b11a9d8072a56f60a69a8e1`.
All **139** worker source/tree/artifact/log checks matched actual bytes, including
retained original failed evidence and the final full-suite log. No redundant
reviewer full-suite run was needed.

## Complete semantic review

| Changed area | Review and independent result |
| --- | --- |
| Heap private registry | The lazy WeakMap is keyed by intrinsic identity, copies deferred names into a private Set, and registers existing typed-boundary identity. It does not add guest properties or schema fields. Laziness supports module cycles. Low-level own presence remains a fact about modeled storage. The guard is invoked only for absent-own branches; it does not globally reinterpret ordinary absence. |
| AST member lookup | The one-name String/toLowerCase special case is removed. Current own properties resolve first, including explicit undefined and conditional replacements; only the absent branch consults deferred knowledge before prototype fallback. Thus a deferred standard own method cannot accidentally use an Object.prototype replacement. Ordinary custom names and ordinary objects retain their lookup behavior. |
| Object.prototype.hasOwnProperty | Existing receiver/key coercion and partial-host inspection guards remain. Splitting the existing own-presence result before guarding the false branch preserves conditional presence/correlation. Key-conversion effects that create an own replacement are observed. Receiver alternatives, undefined own values, ordinary false results, and required unknowns pass independent controls. Shared invocation, branch and heap helpers were reviewed, not assumed safe from their names. |
| String.prototype registration | Seven modeled names plus 45 deferred string-keyed names match all 52 native own string names in pinned Node. Independent probes discover the inventory from Node rather than importing the worker array. All 90 deferred read/presence checks stop honestly. Known names, aliases, replacements, primitive lookup and snapshots stay precise. Existing primitive split/substr implementations and internal URL charCodeAt mutation assumptions remain explicitly documented residuals; this does not implement the rest of String. |
| Trim metadata | Existing marker machinery now makes own inspection typed. Restricted caller/arguments reads and writes stop honestly through aliases in both branch orders, retaining prefix/RHS effects and normal siblings. Node controls confirm actual TypeError behavior; VM boundaries intentionally are not catchable guest TypeErrors. Known name/length, call/prototype access, and allowed replacements remain usable. Unknown metadata is conservatively excluded, as detailed below. |
| Checkpoint specs | The P007 trim rejection checkpoint now asserts actual supported trim result, branch correlation, effects and a mandatory unknown; its native replacement assertion is preserved. The String.prototype object-spread checkpoint now asserts typed boundary/message, prefix and normal sibling. Seven unrelated legacy layout cases are unchanged. Every added/changed correction spec line was reviewed. |
| Algorithm and target | Trim algorithm and resource limits are unchanged from the original complete review. Repeated independent whitespace, coercion, nullish, effects, prototypes, finite branches and inclusive budget checks pass. Actual unchanged sirv runtime/CLI still reaches the typed toLowerCase boundary at mrmime/index.js:443 with source/effects and the EMFILE sibling retained. Fixture/package, public graph/schema, regexp production, and P007 independent probe bytes are unchanged. |

The guard uses static knowledge only to refuse an unmodeled observation. It does
not assert runtime absence, guessed string values, success of coercion, or a new
String API implementation. Private-registry graph inspection confirms no deferred
name table or registry field is serialized. Existing `roots`/`nodes` output remains.
Typed boundary branches preserve reached context without executing guest catch or
finally as if analysis failure were a JavaScript exception.

The original native-checked semantics remain covered: 65,536 BMP whitespace
comparisons, 134 interpreted edge/interior/UTF-16 inputs, generic receiver
conversion order and RequireObjectCoercible, ignored arguments after their
ordinary evaluation, captured method/prototype mutation, budget boundaries and
unknown-vs-proof controls. The original report links the relevant ECMA operations;
these and actual complete Test262/pinned Node behavior, not Grok's checklist, are
the authority. No new full-conformance or all-path sirv claim is made.

## Batched findings and explicit probe disposition

**R1 closed:** all four original caller/arguments read/write probes now pass their
honest-stop expectations. Eight new alias/branch-order controls confirm effect
and sibling retention. No production correction remains requested for R1.

**G1 closed:** the stale P007 trim checkpoint is corrected with success assertions,
not simply removed. The first correction `93dcdbd` exposed another stale legacy
String.prototype inspection checkpoint; `06eefd5` updates only that case. The
worker preserves both earlier failing full-suite histories. Final full suite is green.

**Integration gate: preserve and reconcile original concrete control 9.** The
unchanged original 26-probe run is **25 passed / 1 failed**, not all green. Its
compound metadata control begins with `String.prototype.trim.extra = 17` and
expects normal completion. New `unknownProperties: "String.trim metadata"` stops
that write; direct inherited metadata helpers/presence outside the modeled set
are also conservative. Native permits the extra property. This is a precision
loss, not a newly invented native result. It is allowed by root's correction
contract's explicit partial-metadata/conservative-exclusion policy and disclosed
in worker boundary/gap docs. The earlier review's recommendation to preserve
arbitrary extras is superseded by that authorization; it is not silently treated
as satisfied. A new separate native-backed probe verifies the boundary, RHS state
and normal sibling. Root must explicitly adapt/dispose the obsolete success
checkpoint when integrating review tests, preserving this history; no skip,
expectation weakening or old-probe rewrite was made here. Acceptance is of the
bounded worker source, not of a claim that this review checkout's complete suite
would pass unchanged.

**Reviewer false alarm preserved:** the first new probe draft used the unsupported
comma/SequenceExpression in an assignment RHS and expected its side effect. VM
correctly stopped earlier with an empty trace; that was a test-author error, not
a source defect. Initial run was 24 passed / 1 failed. The final probe uses an
ordinary function call; an explicit SequenceExpression diagnostic preserves the
explanation. Final new suite has 27 passing tests. Both logs remain hash-bound.

**Disclosure attribution:** the three false-absence observations and two legacy
own-enumeration errors were Grok-disclosed and root-reproduced before this correction.
They are relevant authorized regressions, not hidden independent findings. The
root diagnostic's five related cases now pass. Enumeration previously raised a
legacy error rather than fabricating keys; the actual repair is typed graph/state
retention. Its sixth `in` case establishes pre-existing unimplemented operator
behavior, not a confirmed false Boolean. It was selector-excluded, remains deferred
under LANG-001, and the untracked root diagnostic is neither edited nor committed.

## Validation, upstream inventory and remaining gates

All independent native helpers use pinned Node **v24.21.0** via
`PROPHET_NODE_BINARY=/tmp/prophet-node-24.21.0/node-v24.21.0-darwin-arm64/bin/node`
and a portable checkout cwd. Discovery selects specs and excludes `src/test.ts`.

| Validation | Result |
| --- | --- |
| Original 26 probes, unchanged | 25 pass / 1 documented superseded success expectation fails; all four R1 guards pass |
| New independent correction probes | 27 pass, exit 0 |
| Root disclosed diagnostics | Five related pass; one `in` selector exclusion |
| Nine affected suites | 1,025 pass / 46 historical skips, exit 0 |
| Final independent typecheck | Exit 0 |
| Verified worker final full suite | 129 suites pass; 3,476 pass / 46 skipped / 3,522 total; exit 0; 382.043 Jest seconds, within 900-second cap |
| Verified worker final focused/typecheck | 1,017 pass / 46 skips across ten suites; typecheck exit 0 |

The complete corpus remains **40 added files / 80 variants**, **341 active files /
673 variants**, **128 trim candidates / 88 inactive**. All 256 complete original
trim candidate native variants were rerun by the unchanged independent probe;
all pass. All 387 active-plus-skipped metadata/hash rows and all 256 native variant
hashes match worker evidence. All **46 historical skipped filenames** are unchanged
from accepted P007 and documented. No fixture, runner, selected corpus or source
skip was changed by the correction. Selector exclusions are not historical skips.
Guard/assertion/skip/boundary scans were rerun and reconciled with LIB-002, OBJ-001,
LANG-001 and existing documented residuals. Inventory is not a conformance proof.

Remaining gates belong to root: align the accepted P007/P008 stack and carry the
worker's corrected documentation/evidence; reconcile the retained independent
metadata success checkpoint before integrating probes; inspect the exact integrated
diff and run appropriate final integration/CI gates before the draft PR/publication.
Any later runtime/spec changes require source-bound review; this report does not
accept them prospectively. No further production correction is requested here.

Review stayed on `review/p008-string-trim` in the assigned review tree. No production,
worker/main edits, agents, account/model changes, paid APIs, push, merge, release or
stack alignment were performed. Only this correction report, separate evidence and
new independent probe spec are committed, then frozen.
