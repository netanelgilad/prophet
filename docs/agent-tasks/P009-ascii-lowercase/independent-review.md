# P009 independent review

## Verdict and binding

**Requested source `5b5727af7b7dc5cfff277eb8f0ccf63df0290516`: semantic
implementation ACCEPT; snapshot publication gate REJECT.** Its full suite fails
one stale P008 predecessor assertion. Base is
`fc7d503882dcf63d10d8277b21f46314b2ce379c`. No production correction is requested.

**Separately reviewed correction `c52c3f4e4f7c15fda4038f630fc9cb35b1bf63d6`:
ACCEPT source/spec semantics and completed validation gates.** Production bytes
are identical to `5b5727a`; the only test change repairs that obsolete assertion,
and two docs disclose the correction. One evidence-label correction (R1 below)
and root's exact-head publication/CI gates remain.

Acceptance excludes full Unicode, unrestricted inputs, and completed sirv
factory/server/request analysis. It does not automatically extend to subsequent
source changes.

Review performed solely on `review/p009-ascii-lowercase` in the assigned review
worktree. Starting HEAD `39f0c1c66378b1ff314feb26f1f8739924c9a018` differs from
frozen source only by the independent-review task document. The inventory check
compared all 295 tracked source/test files byte-for-byte with the frozen commit,
and verified all 17 source-increment file hashes. Only the independent probe,
this report, and distinct `independent-evidence.json` are reviewer deliverables.
No production repair, dependency change, writer/main mutation, agent launch,
push, merge, account/model change or external publication was performed.

## Semantic review

Reviewed every changed implementation/spec line and the complete documentation
diff. Normative references are official ECMA-262
[String.prototype.toLowerCase](https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.tolowercase),
[ToString](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-tostring),
[ToPrimitive](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-toprimitive),
and [OrdinaryToPrimitive](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-ordinarytoprimitive).
The implementation preserves the coercibility/conversion order. It admits a
strict ASCII subset of Unicode default conversion; this is a checked analysis
boundary, not an assumption that JavaScript strings are ASCII.

- The null/undefined receiver check precedes conversion and produces guest
  TypeError. Null/undefined returned *by* ordinary conversion instead become
  strings. Ignored arguments still evaluate before invocation; callee identity
  captured before their mutations is retained. Nonconstruction is inherited
  from `ESBuiltinFunction`, not a special AST recognition rule.
- Shared `withValue`, `bindNormal`, `readMember`, `invoke`, current heap reads,
  branch merging, and analysis-failure checkpoints preserve ordinary string-hint
  conversion, fallback order, current inherited valueOf replacements, throws,
  finite-choice correlations, and unknown results. Current prototype replacement
  does not change a retained intrinsic. In-place replacement of its `.call`
  changes that member without changing direct intrinsic calls.
- Stopped leaves retain reached conversion/prototype mutations and external
  effects. Guest catch/finally does not consume an unsupported/budget stop.
  Caught guest throws and normal paths may correctly join into conditional
  state. Open, late non-ASCII and budget leaves retain supported siblings.
- Symbol absence is checked before ordinary conversion. Nullish own/inherited
  hooks delegate; nonnull hooks and arrays/functions conservatively stop.
  Shared partial-host, cyclic-prototype, wrapper, descriptor, public symbol and
  legacy chunk limitations remain documented. No broader support is inferred.
- The length check runs before admission scanning and output preparation.
  Accepted input permits two linear scans, at most 65,536 output entries and
  output code units. Oversize Unicode hits the budget first. This bounds casing
  work/output separately, not arbitrary coercion, branching, prototype traversal,
  parsing or allocation failure. No native casing backend or package/source
  special case exists in the production diff.
- Metadata exposes known name/length, inherited call and absent prototype;
  restricted/unknown reads, enumeration and unmodeled writes stop honestly.
  Current replacements use ordinary heap semantics. The other 44 deferred
  String names remain accounted for; no false absent-method result was added.

## Independent evidence and target

`test/p009-independent-review.spec.ts` contains 28 passing checks: all 16,384
ASCII pairs against separately executed pinned Node results; 131 parsed mixed
strings; native/VM coercion, callee/receiver identity and mutation controls;
nullish/throw/fallback correlations; open/throw/normal state/effect frontiers;
65,535/65,536/65,537-unit controls; Unicode context/expansion/surrogate controls;
exotic/symbol and conservative metadata boundaries; complete upstream native
controls; and an actual CLI subprocess graph.

The independent CLI uses the unchanged four pinned fixture packages and the
public `sirv("./site")` factory caller. It exits 2 with the reached lastIndexOf
diagnostic. Its direct `roots`/`nodes` graph retains `tmp === "hello.txt"` in
public environment records and the mrmime source location, beside the EMFILE
throw. Each leaf's effect graph retains its own readdirSync call and matching
return/throw event with shared call identity. Raw stdout and stderr are retained
and hashed. The affected sirv suite separately verifies original fixture bytes,
source frames and native GET/HEAD/missing-file controls. Native serving is not a
claim that Prophet completed those behaviors.

Affected checks: **7 suites, 1,122 passes, 46 historical skips**, including
lowercase, trim, P008 independent controls, RegExp, sirv, all selected Test262
and runner self-tests. Independent probes: **28/28**. Final independent
**typecheck exit 0**. All use pinned Node 24.21.0 and the retained native helper
uses portable `join(__dirname, "..")` cwd. Exact argv, working directories,
environment overrides, external timeouts, exits and raw-log SHA-256 hashes are
in [independent-evidence.json](independent-evidence.json).

Verified the writer's corrected-source evidence programmatically: **132 suites,
3,757 passes, 46 skips**, full-suite exit 0 under its external 900-second cap;
**1,025 focused passes**, and **typecheck exit 0**, all explicitly bound to
`c52c3f4`. Recomputed 146 artifact/log/changed-file/candidate hashes and the
aggregate over all 295 tracked source/test files; compared current writer files
to the commit. Aggregate SHA-256:
`af5a0f0ef76604751aa7cac68204022324f2f51028eec1e54b0cddc79c4cfe77`.
The reviewed writer evidence SHA-256 is
`dc0a07e3b655b008293ff4ebe663eeab0a599d2958f37560a4a501044ca3daa6`.
No redundant reviewer full suite was run.

Development native/red logs establish the intended missing-intrinsic failure
(12 selected native passes; red 192 failures/696 passes/46 historical skips),
but their inherited `40ed41d` HEAD does not identify the uncommitted specs used.
The separately retained **first-frozen** focused run really binds 998 passes
to `5b5727a`, and its typecheck passes. Neither that focused run nor any
prefreeze 998-pass run establishes a passing full suite.

The writer's first exact-source full suite at `5b5727a` failed the old
native-discovered P008 supported-name inventory: 131 passing suites, one failing
suite, 3,756 passes, one failure and 46 skips. I independently reproduced that
same stale assertion (26 passes/one failure in its spec) after discovering the
writer's already-recorded self-correction. This is not a hidden reviewer finding
or a defect in lowercase semantics.

Reviewed every line of the subsequent `5b5727a..c52c3f4` delta: the supported-name
list adds only lowercase, with native and VM assertions for callable presence,
own presence and actual `abc` output; two documents disclose the failed freeze.
All other predecessor assertions remain intact. `git diff ... -- src` is empty.
The review worktree deliberately remains on the requested frozen source; none
of the writer's test/doc changes were copied into it. Renewed acceptance of the
corrected snapshot relies on this exact delta review, identical production
bytes, independent native/VM controls, and separately verified corrected-source
writer checks. Original-source failures are never relabeled as green.

## Whole upstream selection and audit

All 27 lowercase candidate files were hash-verified against the official tc39
repository at `47bf9d1db9f6e7632120ac1b1946ad092e6c214e`, without editing the
installed dependency. All 54 whole strict/sloppy native variants pass.
The ten added files execute unchanged through the existing VM runner; no harness
code changed. The runner rejects unfinished, unresolved, wrongly thrown and
nonconcrete assertion results. The active corpus grows 341 to 351 whole files
(673 to 693 variants), with no removed baseline file. Complete historical skip
names, hashes and metadata reconcile to the same 46 files; only the existing
generated skip site remains.

A11 was explicitly disclosed before review: its inherited `.hasOwnProperty`
lookup is outside the conservative metadata surface. Its failed activation is
not an existing baseline removal, a new skip, or evidence requiring broader
metadata support. The complete case remains inactive with its precise blocker;
borrowed own-presence and known length have supported native/VM controls.

Reran the documented unsupported-guard, assertion, skip, boundary-document and
diff scans. The new guards/cap/coercion and metadata limits map to the existing
P009 reconciliation under LIB/OBJ, STRING/SYM/LEGACY, REPORT/SECURITY, FS/TARGET,
and TEST IDs. No ID closes. Unicode/locale casing, lastIndexOf/substring and
later host behavior remain explicit. Scans and selected tests are not full
JavaScript/Node conformance evidence.

## Batched finding

**R1 — Evidence-only correction before publication.** In the reviewed writer
`evidence.json`, `commands.final-development.snapshotNote` says
`Frozen source/spec/docs at recorded revision`, while that record is the
prefreeze working-tree run at inherited HEAD `40ed41d` (998 passes). The writer's
evidence generator classifies every `final-` prefix as frozen, accidentally
including `final-development`. Relabel this record as a development run, retain
its original revision/log/hash, and revalidate the evidence. Do not substitute
it for `first-frozen-focused` or `final-focused`. This finding concerns evidence
attribution, not runtime behavior; the correctly bound final-source checks above
remain valid. No production repair or full-suite rerun is requested for this
label-only fix. It was independently found while inspecting the delivered
manifest, unlike the writer's already-disclosed predecessor correction.

## Attribution and remaining gates

No hidden production soundness defect was found. The review probes were authored
independently after reading the task and delivered code/specs; their categories
overlap the disclosed writer matrix and P008 review lessons. They are independent
reruns and additional adversarial combinations, not a claim that overlapping
cases were secret holdouts. A11 and the writer's development corrections were
already disclosed and are not attributed to this reviewer. The later stale P008
checkpoint was found and corrected by the writer before my independent reproduction.

Two failed reviewer runs are retained. The first supplied `.console` instead of
`.module` from the console-model factory. The second expected three distinct
completion leaves after catch, overlooking the valid join of caught/normal paths.
Both were reviewer harness/expectation errors. The final test proves the joined
branch correlation and effect histories; neither failure required a production
change. Native expectations did not fail. Initial probe hashes are distinguished
from the final retained probe hash.

Root still owns the R1 evidence correction/revalidation, stacking the review
deliverables on the corrected source, draft-PR publication and exact-head CI. Any later implementation/spec change needs renewed acceptance;
this review supplies no merge/release authorization or model-trust promotion.
