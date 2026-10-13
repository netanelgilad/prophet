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
