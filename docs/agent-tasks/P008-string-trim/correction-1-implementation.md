# P008 correction 1 implementation and review handoff

Starting head `cb2c0da6707ae0e4999712eda886f5819cc48947` retains the original
source `0d3b278`, evidence and one-failure full suite. Root supplied
[correction-1.md](correction-1.md) and explicitly authorized the bounded repair;
no approval is missing. Only the superseded checkpoint in test/regexp-test.spec.ts
is changed, with its original native trim replacement assertion retained verbatim.
P007 implementation and independent probes remain read-only.

## Implementation

- Register the closed standard String prototype's seven modeled and 45 deferred
  own string names in a private generic partial-intrinsic map in Heap.ts. Its
  label and name set do not enter the public value graph. No special String name
  remains in the AST member-read path.
- On reads and hasOwnProperty, split current heap own presence first; only the
  absent side calls the generic deferred-name guard. This prevents false absence
  while retaining current/conditional replacements and explicit undefined.
  Low-level heap storage, other closed objects and supported fields stay precise.
- Mark String.prototype and trim's partial metadata with the existing typed
  boundary mechanism. Existing Object.keys/spread guards preserve state and
  siblings without adding descriptors. Known trim metadata remains usable;
  unknown fields and unsupported metadata writes stop conservatively.
- Preserve trim algorithm/resource limits and unchanged sirv/CLI progression.
  Do not implement toLowerCase/trimEnd/padStart/other String methods or `in`.
  Existing internal host mutation checks, including URL's charCodeAt assumption,
  remain outside this public-read/own-presence correction and are documented.

## Evidence discipline

Root-disclosed native-backed observations are regression inputs, not hidden
holdouts. Initial seven native controls pass. Before production edits, the saved
red spec diff produces 16 failures (false absence or legacy metadata inspection
errors), with 155 other tests passing. The authorized P007 test already passes
against supported trim; it was an obsolete checkpoint, not a new production bug.

First implementation passes seven affected suites / 282 tests and typecheck.
Additional final specs audit all 52 pinned prototype names natively, all 45
unsupported read/presence pairs, and typed metadata writes/reads. No Test262 file,
fixture, dependency or skip is changed. Source/spec/docs will be committed and
frozen before the full suite (900-second cap), focused stress checks, typecheck
and complete guard/assertion/skip/docs audit. Exact commands/logs/hashes will be
recorded in the separate correction-1-evidence.json; prior logs remain immutable.

See [string limits](../../symbolic-strings.md#truthful-partial-string-surface-p008-correction-1),
[gap reconciliation](../../implementation-gaps.md#p008-correction-1-reconciliation),
[wiki lessons](../../wiki/string-trim.md) and [contract](correction-1.md).
Independent strong review is pending. No push, merge, release, delegation,
account/model switch or credentials/access expansion occurs in this correction.


## Validation-discovered inspection checkpoint

The first frozen correction source `93dcdbd` completed its full suite in 365.663
Jest seconds (367.94 external seconds): 128 suites passed / 1 failed, 3475 tests
passed / 1 failed / 46 skipped. Typecheck passed. The sole failure was the existing
parameterized `test/object-spread.spec.ts` String.prototype case, which still
expected a legacy host throw for both spread and Object.keys. The authorized
inspection correction instead returns the intended typed unsupported boundary.

That String-only checkpoint is migrated to typed-boundary/message assertions,
with preserved prefix state and a normal sibling. All seven other legacy layout
cases retain their original source and assertions; no test count or skip changes.
This is the necessary regression expectation update for the concrete authorized
own-inspection repair, not an additional production feature. All production
bytes remain identical to `93dcdbd`; a new spec/docs source commit precedes the
final full-suite rerun. The earlier failed correction run stays separately in
`logs/p008-correction-1/`; final logs use `logs/p008-correction-1-final/`.

## Final frozen validation

Final source/spec revision is `06eefd516e65bbc5d02b6bf94ddbed383f59c8d7`.
Production bytes are identical to correction implementation `93dcdbd`; only the
String inspection checkpoint and its documentation changed between those commits.
All final checks use native pinned Node v24.21.0 and the assigned worktree:

- Full suite: 129 suites passed; 3476 tests passed, 46 unchanged skips, 3522 total.
  Jest time 382.043 seconds; external elapsed 384.24 seconds, within the 900-second
  cap. Exit 0, no timeout.
- Focused validation: 10 suites passed; 1017 tests passed, 46 unchanged skips.
- Typecheck: exit 0 (7.35 seconds).
- Discovery: 129 suites, no production files discovered. Guard/assertion/skip/docs
  scans, scope checks and diff checks pass. Complete inventory retains 341 active
  Test262 files / 673 variants and all 46 historical skipped files; no correction
  adds or changes a Test262 case. All 128 complete trim candidates / 256 native
  variants pass in pinned Node.
- Recomputed hashes verify 54 correction artifacts, 13 changed source/spec/doc
  files, upstream file inventories, and all 40 original handoff artifacts.

[Correction evidence](correction-1-evidence.json) binds exact commands, environment,
log paths, exits, timings and hashes to the tested revision. Both earlier failed
full runs remain unchanged and explicitly recorded. This final documentation and
manifest are committed separately from source/specs; no runtime or spec bytes
change after validation. Unchanged sirv/actual CLI still stops at the typed
toLowerCase boundary while retaining the filesystem alternatives. Remaining String
APIs, descriptors and the unconfirmed/pre-existing `in` issue stay deferred.

Complete local handoff; frozen for independent strong review. Nothing is pushed,
merged or released.
