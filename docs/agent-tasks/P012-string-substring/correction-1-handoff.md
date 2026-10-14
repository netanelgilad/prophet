# P012-R1 correction1 handoff — frozen for renewed review

Corrected source/spec/docs commit **b582e2c746863d4c02697bdd28db461098aee226**, parent correction contract
**0d087b306dcb3fba1e86409e5fa624d6c68a3f6d**, branch
`agent/p012-string-substring`. This evidence-only child adds
[correction-1-evidence.json](correction-1-evidence.json), this handoff and
[correction-1-validation.json](correction-1-validation.json); it changes no tested
source, spec, earlier report or log. Original source **3ef28e197fbfae2b5081346e901d85b780c965e0**
and evidence **82cb5c170d09d786b64ecf6a6105996b11fcbff4** remain rejected by frozen
independent Astra/high commit **5273aa2cae80d24c43fe278f9f49949921ef18c2** for exactly
one P2 finding P012-R1. Corrected source requires renewed acceptance by the SAME
Astra/high reviewer. Root owns the isolated review checkout, stacked draft and
exact-head CI. No acceptance, push, merge or release is claimed.

## Correction and limits

Only `src/node/filesystem.ts` changes production behavior. The size-specific
Stats read hook now branches on current persistent own presence, then returns
the supplied current value with ordinary legacy method normalization. It admits
17 and alias replacement23, zero/negativezero/undefined/null, other primitive
values, objects/functions, open assigned values, finite alternatives and
conditional presence. Supplied data is a declared starting-state fact through
existing writeProperty, with equivalent assignment in native Node; it is not an
inference of initial native file size. Aliases, two instances and old snapshots
remain distinct. A conditional read is evaluated once; the known branch proceeds
and the genuinely unknown branch retains the typed boundary. Analysis stops do
not execute guest catch/finally. Earlier unsupported and guest FS-error siblings
preserve caller/prefix/console/heap/prototype state and matched FS call/outcome
identities.

Fresh/unprovided size still stops typed. Inherited Object.prototype.size cannot
replace unknown native own metadata. Assignment to fresh unknown size remains
the older legacy host boundary. Other Stats methods, guards, brands, inspection,
descriptors and fields remain unchanged. No native size/Date/header/network model
or wider Node semantics is added. Every original src/test file except the owned
filesystem hook stays byte-identical, including substring, ordinaryStringHint,
String registration, corpus, shared reader and P011 guards. The 31 new tests are
writer regressions for a disclosed finding, not independent holdouts.

The measured unchanged sirv frontier remains **Stats.size during toHeaders header
preparation**, with `ctype="text/plain"` and `name="hello.txt"`. Unchanged mrmime
native/VM MIME controls and lookup assertions pass; its completed activation has
`idx=6` after exactly one increment. Those locals are outside the later current
lexical chain. Callee lookup ordering remains asserted. Factory has **not returned**;
later headers, startup/network/request behavior are not claimed. Success/EMFILE
histories remain matched. The full run rechecks the inherited sirv/native/CLI
assertions without changing them.

## Checks bound to their actual revisions

Every direct command used explicit cwd
`/Users/netanelgilad/development/prophet-worktrees/sol-p012-string-substring`.
Native controls pin **Node v24.21.0** through PROPHET_NODE_BINARY; Jest host is
**v26.9.0**. Run metadata includes exact child argv/cwd, source HEAD/status,
environment overrides, UTC start/end, exits, external caps and timeouts.
Native controls record their minimal environment; arbitrary inherited writer
environment was not dumped. Raw stdout/stderr and isolated predecessor outputs
are retained and hashed.

| Check | Actual result |
| --- | --- |
| Native before production correction |12 selected passes/18 selector exclusions,30 total; not historical skips |
| Meaningful original-hook VM red |16 failures/14 passes,30 total; source manifest verifies original hook |
| Final prefreeze focused |6 suites/235 passes, exit0 |
| Final prefreeze affected |34 suites/2,021 passes/46 historical skips, exit0 |
| Prefreeze corrected typecheck/audit |exit0; working-tree checks |
| **Single clean committed full** |**140 suites/4,442 passes/46 skips/4,488 total, exit0**; external 900s, no timeout; elapsed451.244s |
| **Clean committed typecheck** |**exit0**; external 120s, elapsed10.457s |
| **Clean committed complete audit** |**exit0**; external 180s, elapsed21.402s |

The only corrected committed-source full invocation was:

```sh
python3 /Users/netanelgilad/development/prophet-worktrees/sol-p012-string-substring/logs/p012/correction1/run-correction1-v1.py frozen-full 900 node .yarn/releases/yarn-3.1.1.cjs test --runInBand
```

Typecheck used the same helper with `frozen-typecheck 120 node
.yarn/releases/yarn-3.1.1.cjs typecheck`; audit used `frozen-audit 180 node
logs/p012/correction1/audit-correction1-v1.cjs`. All three have identical source
manifests and empty before/after git status at exact source commit b582e2c746863d4c02697bdd28db461098aee226.
No source change followed them. Precise Jest summaries, all 13 run records,
enumerated affected suites, snapshot memberships and failed source identities
are in the new evidence.

Full reruns all 43 complete substring native files/86 variants successfully.
Complete VM dispositions retain 14 supported files/28 variants and 29 inactive
files/58 error-bearing variants. Raw installed-file and standard parsed-body
hashes are separately recomputed, with only metadata comment removal verified;
no executable source/assertion trimming. Active corpus remains 384 files/759
variants and 46 historical skipped files, with names/metadata/bytes unchanged.
Audit recomputes 36,091 installed JS hashes, 48 fixture files, 870 protected
dependency/source/report files, 310 original source/spec/report identities and
all 1,472 old artifacts, plus all three original reviewer deliverables against
their frozen commit. Guard/assertion/skip/key-route/checkpoint/boundary scans and
backlog reconciliation are retained. No conformance or gap-group closure claim.

## Evidence, failures and storage

Evidence binds all 1,241 tested tracked files to SHA256 and Git blob identity,
all 994 correction artifacts across four isolated roots, source/metadata
hashes and complete exact included/excluded snapshot lists. Separate direct
recomputation verifies these, every prefreeze archive member and excluded HEAD
blob, original preservation baseline and frozen reviewer hashes. The builder's
completed records are hashed by correction-1-validation.json; post-generation
verifier stdout/run are separately retained, with explicit self-reference
exclusions. Tested-source manifest SHA256 is
`a21e67d6efd9ec918b507094575b8ed80454fb9cac34314cad4c42e45cb564f7`.

Retained failed correction attempts are attributed: focused-first and
branch-inspection inspected the raw value of a symbolic Boolean instead of
resolving its leaf knowledge; production already matched the final hook.
Typecheck-first found unused test bindings. Corrected checks use resolveBoolean
without weakening proof expectations. Meaningful VM red retains the actual
original-hook failure; native-red was green. None is an independent reviewer
failure. All original failed evidence remains unchanged, including the
32,700,928-byte partial original affected archive with no run.json and no test
execution.

Root paused the writer solely for shared storage depletion after green targeted
checks. Approved recovery preserved original archive content, paths, modes and
mtimes; its initial measured delta was negative 7.2 MiB and later free-space growth
was independent, so no physical-reclaim claim is made. Small root recovery
manifests are retained under correction1/resource-recovery. Writer resumed above
6 GiB, monitored real space during the full run and performed no cleanup or
dependency edits. Compact versioned prefreeze captures omit reproducible cache
payloads and reference unchanged committed bytes by HEAD/hash. Clean frozen
source is fully recoverable with Git; no duplicate per-run dependency archive.
All old helpers, logs, archives, manifests, reports and reviewer files retain
their bytes.

[Correction contract](correction-1.md), [filesystem boundary](../../node-filesystem.md),
[substring boundary](../../string-substring.md), [backlog](../../implementation-gaps.md)
and [lesson](../../wiki/string-substring.md) reconcile this scoped repair. Sole
requested profile remains gpt-6.1-sol/high, existing mine account; owner 35% at
01:26UTC and 34% at03:12UTC are account-wide context, not a live per-feature
forecast. No provider errors, account/model/plan/reset/access changes, agents,
install, other-worktree edits, push/merge/release or Notion writes. Writer stops
here for renewed same-reviewer acceptance, retaining review/correction reserve.
