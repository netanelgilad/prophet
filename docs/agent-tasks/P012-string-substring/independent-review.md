# P012 independent review — reject exact frozen source

**Reject `3ef28e197fbfae2b5081346e901d85b780c965e0` against ready P011
`22c109dd0bf67336f023f113055c3a63871684a6`.** One new P2 regression remains in
the narrowly added Stats read hook. The bounded substring implementation passes
this review's completed semantic checks; green regression results do not waive
the Stats regression. No future source or spec revision is accepted implicitly.

Review branch: `review/p012-string-substring`, initially `f10c89c` (only the review
task above the exact source). All commands used an explicit review-worktree cwd;
edits are confined to the three review deliverables and ignored review artifacts.
Worker/main/other worktrees and dependencies were inspected read-only. No agents,
production edits, provider/account/model changes, push, merge, release or access
changes. The requested review profile remains owner-authorized Astra/high on mine;
this report does not claim a new provider measurement or promote trust/capacity.

**One batched correction contract: P012-R1 — P2, preserve known current own Stats
properties before classifying an unmodeled size read.**

Location: [filesystem.ts](../../../src/node/filesystem.ts#L284), lines 284–287.
`readMember` obtains the current heap properties but calls `propertyAccess.read`
before its own-property selection ([ASTResolvers.ts](../../../src/ASTResolvers.ts#L187),
lines 187–197). The new hook throws for every `size` read, including a property
whose value is already known in that persistent heap. Its write hook falls
through, so replacing a known size through an alias succeeds and the subsequent
read still stops. This regresses the ready base and exceeds the intended
classification of the actually absent/unmodeled field.

Complete state-preparation counterexample, using the existing VM builders:

```ts
const model = createFileSystemModel({
  root: fileSystemDirectory({ file: fileSystemFile("abc") }), cwd: "/"
});
const [done, state] = evaluateCode(
  'const stat=fs.statSync("/file"); const alias=stat;',
  setVariablesInScope(nodeInitialExecutionContext, { fs: model.module })
);
// done === Undefined. This is an explicitly known starting data property,
// not an inference of file size or an implementation of Stats.size.
const seeded = writeProperty(state.value.scope.stat, "size", ESNumber(17), state);
evaluateCode('let mark=1; alias.size=23; const answer=stat.size;', seeded);
```

Pinned Node, with a real Stats object and the same known data-property setup,
returns `23`. Executing all reached implementation files directly from the exact
P011 git blobs also completes normally with `answer=23`. Frozen P012 returns
`ExecutionBoundary(kind="unsupported", message="Unmodeled host property 'size':
Node Stats fields")`; `mark=1` and the heap's own size `23` survive, but `answer`
is never initialized. Reading seeded `17` without replacement fails likewise.
The pre-seed snapshot still lacks size. Both native-checked regression assertions
remain deliberately red in [the independent spec](../../../test/p012-independent-review.spec.ts#L103).
`base-vs-frozen.json` additionally binds 92/93 loaded implementation files to
hashes of the requested base/frozen git blobs, without editing a source checkout.

This is **one newly found regression**, not the disclosed fresh Stats-size stop,
not the discarded broad-marker experiment, and not a demand to model size,
Stats descriptors, Date or headers. Fresh `stat.size=...` already hits a legacy
write admission stop in both revisions; the counterexample deliberately starts
from a known own value. Correct the hook's admission using current persistent
own-property state and normal lookup semantics. Preserve known values,
replacements, aliases, conditional values and old snapshots; keep truly
unmodeled size reads typed and other reads/writes unchanged. Add these cases to
the writer's compatibility specs and reconcile FS-001/FS-002 and boundary docs.
Retain fresh-size, guest-error, normal-sibling, caller-state and all filesystem
history checks. Do not apply a broad Stats marker or implement another host API.

The semantic review used the official [substring algorithm](https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.substring),
[ToIntegerOrInfinity](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-tointegerorinfinity),
[ToString](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-tostring),
[ToNumber](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-tonumber),
and [OrdinaryToPrimitive](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-ordinarytoprimitive).
Source excerpts are retained in the audit artifacts. The reviewed behavior is:

- RequireObjectCoercible precedes receiver string-hint conversion, then start and
  nonundefined end number-hint conversions. Direct undefined end defaults to the
  captured length; an object returning undefined converts to NaN/zero. Callee
  capture precedes arguments, `++idx` runs once, extra arguments evaluate but
  their resulting objects are not coerced. Guest throws short-circuit correctly.
- All completing observable conversions precede open-value and 65,536-unit copy
  admission, including empty/equal/clamped results and throwing end conversions.
  Genuine earlier unsupported primitive/hook conversion stops later work and
  bypasses guest catch/finally. The cap is local; Number parsing, arbitrary
  coercion, allocation, prototype depth and branch volume remain documented gaps.
- Truncation, NaN, signed zero, infinities, independent clamping and endpoint swap
  agree with pinned controls. The independent 1,810-case matrix includes numeric
  strings, overflow/subnormal endpoints, NUL, astral pairs and lone/split UTF-16
  units. No native substring backend or sample-source recognition is introduced.
- Finite receiver/start/end choices retain correlations and mandatory unknowns.
  Current fallback lookup, prototype and alias changes, captured immutable
  receiver text, console effects, mixed supported/throw/unsupported/budget leaves
  and persistent old snapshots pass. Writer and held-out tests complement one
  another; no all-input proof is inferred from these finite matrices.
- `ordinaryStringHint` preserves the prior traversal and passes the same
  `toString` finish for existing callers. Only substring supplies its local
  primitive admission. Late BigInt/Symbol/exotic/custom-hook results remain
  conservative stops. Nullish own symbol slots shadow inherited custom hooks;
  exhausted ordinary conversion remains a guest TypeError. Broader wrappers,
  descriptors and partial-host/cyclic-prototype failures remain explicit gaps.
- Standard name, length 2, nonconstruction, captured/detached identity, supported
  own presence and incomplete metadata guards pass. Only substring leaves the
  deferred registry: ten modeled names, 42 deferred names, 52 native names.
  P011 BigInt static-key guards remain unchanged and their correction suite passes.
- The exact Stats hook is size-specific. Fresh size stops retain caller prefix,
  heap/prototype/console state and call/outcome identity beside supported and
  guest ENOENT branches. Existing isDirectory/isFile brands, borrowing between
  branded objects and own method replacements pass. Invalid receivers, other
  reads/writes and property inspection retain their older conservative behavior;
  native invalid-receiver TypeError is not relabeled as modeled VM compatibility.

I reviewed the complete source/spec/doc diff and every predecessor migration.
Earlier-stop witnesses move to genuinely deferred indexOf/includes without
removing branch, oracle, effect, state, cleanup or order assertions. Supported
presence inventories gain substring observations. Consumer checkpoints move to
measured current source/environment rather than dropping state assertions.
Existing reports/manifests remain historical.

The unchanged mrmime source returns `text/plain` for `hello.txt`, retaining its
completed `tmp="hello.txt", idx=6` activation. Actual sirv stops at
`sirv/build.js:110`, `stats.size`, while preparing headers; its current body record
has `ctype="text/plain"`, and its parent parameter record has `name="hello.txt"`. The completed mrmime activation
is not a current sirv local. Direct CLI `roots`/`nodes` graphs retain the size stop,
all success readdir/stat/isDirectory call/outcome identities, and the EMFILE
readdir call/throw sibling. Factory return is not reached; no server/request or
future callback analysis is claimed. Independent native Unicode filename controls
still return MIME values, while unchanged VM lookup stops earlier at the
predecessor ASCII lowercase boundary. Substring UTF-16 support does not widen it.

Validation and provenance are recorded in [independent-evidence.json](independent-evidence.json):

| Check | Result |
| --- | --- |
| Final held-out review spec | 27 passed, 2 failed (both P012-R1), 29 total |
| Complete affected/predecessor/consumer set | 38 suites, 2,135 passed, 46 historical skips |
| Remaining state/operator/parser-adjacent checks | 7 suites, 82 passed |
| Independent typecheck | exit 0 on final review-spec bytes |
| Whole substring native controls | 43 unchanged files, 86 variants passed |
| Whole substring VM discovery | 14 files/28 variants passed; 29 files/58 exact failures retained |
| Active/skip inventory | 384 files/759 variants; base's 370 preserved; 14 added; same 46 skips |
| Writer frozen full | 139 suites, 4,411 passed, 46 skipped; exit 0, 479.971 s within 900 s |
| Writer frozen typecheck/audit | exit 0; all 1,236 source-manifest files match frozen git and checkout |

The two disjoint independent regression batches total **45 suites/2,217 passes**.
The writer full covers its frozen source/spec set, not this new deliberately red
review spec. No redundant broad full run was used to diagnose the focused defect.
Correction still requires a new exact-source full run and renewed acceptance.

The evidence handoff was checked against files, not filenames: 1,471 artifact
hashes/sizes, 22 completed source captures, 36,091 installed upstream JS files and
229 preserved artifacts reconcile. Frozen run metadata names the requested HEAD,
clean status before/after, argv/cwd/environment, start/end, cap and exit. Compact
captures reference unchanged dependency bytes by git/hash instead of duplicating
cache payloads. The consumer-classified historical archive really contains the
broad marker; consumer-updated and affected/final archives contain the size-only
hook. Earlier captures and affected-v2 are not relabeled frozen. Its four later
consumer assertion revisions and documentation differences remain distinguishable
from the complete frozen run. The interrupted writer ENOSPC archive has no
executed test record and remains failed capture evidence.

Candidate table hashes initially differ from raw files for all 43 candidates.
The delivered writer evidence explicitly labels those as standard parser-body
hashes and supplies raw hashes separately. Independent recomputation confirms
both forms, unchanged metadata, only metadata-comment removal, and all VM
classifications. This is a **disclosed labeling distinction**, not a second hidden
implementation finding. Raw whole-file identities are in the independent inventory.

Reviewer failures are retained, with attribution:

- The initial selector also discovered copied source snapshots. Its duplicate
  run used the wrong fixture-relative root and collided with per-native filenames.
  The full original Jest log and both source captures remain; overwritten
  duplicate child records cannot be reconstructed as original evidence. No pass
  claim relies on that run. Snapshot files now have `.snapshot` suffixes and
  exact test paths are selected. A rename map preserves original path identities.
- The first matrix used a raw U+2028 quoted literal (an existing parser gap), and
  one shared-conversion control assumed unary-plus object conversion support.
  Escaped literals preserve the intended code units; a supported lastIndexOf
  number-hint path replaced that unrelated control. Both original sources/logs
  remain. Neither error is charged to P012.
- The first run of the final 29-test spec hit ENOSPC saving a native record. It
  remains 26 passed/3 failed (two R1 plus resource failure). A separate unchanged
  retry completed with 27 passed/2 R1 failures; it did not relabel the earlier run.
  A final helper-only revision supplies and logs an explicit native environment;
  the complete 29 probes and typecheck were rerun on those final bytes. Earlier
  child records log environment overrides and remain labeled accordingly.
- A handoff-inspection helper assumed `.tar.gz` always meant gzip and initially
  missed `behavior-source.tar.gz`. Its retained version/attribution and tool
  traceback identify this reviewer mistake. The corrected reader autodetects
  tar format, verifies every archive member and included inventory, and passes.
  A separate graph inspection initially looked for `name` in the body record;
  it is in the parent parameter record. The corrected chain audit verifies both
  and excludes the completed MIME activation from that chain. Incidental
  nonexistent-path inspection errors are not tests or source findings.

Only this report, its evidence manifest and the independent spec are committed.
The requested task document was already committed at review start. **Root gates:**
keep this source rejected; integrate no production change from this review;
obtain the narrow writer correction, preserve both red tests and all historical
logs, run corrected full suite/typecheck and complete affected checks, and request
renewed acceptance of that exact source/spec freeze. Root owns stack integration,
review-deliverable integration and exact-head CI before publication. No merge,
release, trust increase, concurrency promotion or broader host work is authorized
by these results.
