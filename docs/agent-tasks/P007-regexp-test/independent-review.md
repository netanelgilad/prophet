# P007 independent review

Source: `82356b687877bdf21ebb2bccd5924f7c279bc7de`
Base: `3377cfe2c8791d2113f0f6e03f331c785df2200b`
Review branch: `review/p007-regexp-test`
Reviewer: independent Codex session; no agents, external model calls, account/model changes, implementation changes, pushes or merges.

## Decision

**REJECT source82356b6**: one P1 finding, deferred array/function coercions escape as unclassified host errors and discard completion siblings. The matcher itself passed the independent admitted-domain checks. Full RegExp support is not required to address the finding; a correctly retained explicit boundary suffices.

The complete cumulative diff was reviewed: all 14 changed files, including every implementation and spec change (938 additions, 30 deletions). All 14 working-tree files match the frozen source bytes; the independent test and this review's artifacts are additions only. The review contract is retained alongside this report. This is not acceptance of full RegExp support, sirv factory completion, or all-path application analysis.

## Semantic assessment

- `src/regexp/matcher.ts` (all 216 lines): grammar admission is generic and complete before execution. Unsupported syntax in an alternative, including one under a zero repetition, cannot disappear through an early match. The compiler builds finite states and epsilon cycles; at each input position closure deduplicates before enqueueing. Deduplicating histories is appropriate for this flagless, capture-unobserved, backreference-free Boolean domain. Anchors are absolute without multiline; dot, classes, complements, escapes, lone surrogates and astral source text use UTF-16 units. Nullable repetitions and nested assertions agreed with independently generated native controls.
- Resource accounting: source/input caps precede matcher parsing; depth is checked at recursive disjunction entry; finite counts are bounded during digit accumulation; state insertion is capped; compiler visits (including state-free empty expansions), state visits and range tests share a per-invocation work counter. Unanchored positions share that counter. Iterative closure collections are bounded by the state cap. Exact and over-limit source/depth/state/input cases and empty-expansion/scan-work probes completed under an external 120-second process timeout. These limits deliberately do not bound Cherow's earlier compilation, coercion, overall branch count or graph serialization; those residual gaps remain documented.
- `src/regexp/test.ts` (all 83 lines): object receiver validation precedes ToString; ordinary-object exec dispatch/brand rejection follows conversion. Supported instances use the private identity registry, not a guest field shape. For the supported conversion domain, lastIndex is read from the current heap after input conversion and undergoes number-hint conversion even with no flags. The unused pure ToLength clamp cannot affect the Boolean result. No flagless write/reset is introduced. `bindNormal`/`withValue` route guest throws, finite choices and classified boundaries through current contexts; the legacy coercion failures described below escape this mechanism. Independent probes verify coercion mutation, nested calls, conversion failure, current-index replacement, completed siblings and unchanged prior snapshots.
- Dispatch nuance: setting `Object.prototype.exec` does **not** override the real `RegExp.prototype.exec` on native literal instances. Independent native/VM controls verify that such an inherited hook remains uncalled for literals. On an ordinary borrowed receiver, inherited callable exec is found and explicitly stopped after input conversion; a noncallable exec produces TypeError. Thus the private intrinsic dispatch is justified by the guarded prototype surface, rather than an assumption that every inherited hook is absent. Public/custom exec support is outside this slice. Custom embedding own exec/layout and Symbol.toPrimitive guards were traced against the current heap/shared symbol lookup; the existing focused tests also exercise inherited primitive hooks.
- `src/regexp/RegExp.ts`: shared test identity and nonconstructibility use the existing builtin machinery; fresh literal objects remain registered identities with frozen source/flags and persistent lastIndex. Allowing a test read does not allow writes to it. Matcher trees/states are local variables, and the registry is private; no matcher cache or native RegExp is installed in the public state graph. This does not establish JSON resumption.
- `src/ASTResolvers.ts`: the added trim check occurs only after an absent own property on the actual shared String prototype. Current own replacements are honored. It classifies the reached missing intrinsic without implementing trim or changing unrelated lookup rules; the resulting boundary retains completed filesystem siblings.
- Specs/docs: existing literal tests and runner implementation are unchanged; sirv's obsolete test-boundary assertions are replaced with stronger next-boundary/EMFILE/source/effect checks, with an actual CLI subprocess added. No assertion was simply removed to permit success, no fixture was rewritten, and no skip site was added. The new RegExp tests cover concrete, symbolic, failure and resource cases. All 15 newly activated upstream files are complete and byte-identical to pinned Test262 commit `47bf9d1db9f6e7632120ac1b1946ad092e6c214e`; all 30 strict/sloppy native variants pass. The explicit grammar and residual gap IDs agree with the implementation.

## Independent evidence

The review test is `test/p007-independent-review.spec.ts`. Its initial 29 tests were authored independently of worker generated expectation data. The worker's source/specs were read during review, so these are independent adversarial extensions and reruns, not a claim of blinded holdouts. While checking the worker ref for final evidence, I observed its later spec-only `4b36d385ebcc21a9a9c7070ab0938832ca16ebf6` commit about deferred array/function conversion. I then added four differently oriented reproductions (the normal branch is explored first) against the unchanged review source. Attribution is therefore a disclosed worker-overlapping defect, not an independently discovered hidden holdout. Native answers are computed in separate version-checked Node processes and never supplied to VM execution.

The subsequent implementation commit `6bae07c599c6a80d4cb199bf6e3e92fa9bb77cf9` was observed in the worker ref. It is not the requested frozen source and was not applied or reviewed here. This verdict must not be transferred to that revision.

Pinned executable: `/tmp/prophet-node-24.21.0/node-v24.21.0-darwin-arm64/bin/node`. Every command used this review worktree explicitly; `PROPHET_NODE_BINARY` points to that executable. All commands/statuses, artifact SHA-256 values, source-file hashes and provenance are recorded in `independent-evidence.json`. Full local logs use the distinct `logs/independent-p007-` prefix and remain ignored.

| Check | Result |
| --- | --- |
| Final independent adversarial spec | 29 passed, 4 failed (P1 below); 17,472 matcher comparisons across 208 patterns/84 inputs, plus 208 parsed-literal VM comparisons |
| Complete BMP classification | 655,360 Node/matcher comparisons across ten dot/class/complement patterns passed |
| Newly selected whole Test262 native controls | 15 unchanged files, 30 variants passed |
| Affected source suites | 4 suites passed; 725 tests passed, 46 historical skips unchanged; includes real sirv CLI factory/import and pinned Node GET/HEAD/missing-file controls |
| Typecheck including final review test | Passed |
| Test262 runner regression | 12 tests passed |
| Documented guard/assertion/skip/doc scans | Completed; 46 skipped filenames equal the base inventory and all appear in the gap backlog; active file count increased from 286 to 301 |
| Upstream byte verification | All 15 files match their raw files at the pinned upstream Git commit |

The actual unchanged sirv CLI factory test exits 2, emits only the roots/nodes graph on stdout, and reports `String.prototype.trim is not yet supported` on stderr. Its partial completion has the mrmime trim boundary and filesystem `EMFILE` throw, with prior `fs.readdirSync` effects retained. This is the intended advance past the two default filename regex filters; headers, completed factory/startup and requests remain unfinished in Prophet.

Final reproducibility hashes (SHA-256):

- Review spec: `ba75ba59898efc0bbf6a077f548fc4b6cd2fe596b061b696f4e85774ef79bb2a`.
- Final independent test log: `3f7abc571684df8d929fc7a18184ef729dc30baffc1f5a10446d816e9543bf15`.
- Cumulative base-to-source diff: `05efd9e18511d9f8b8986e011e5def4d76ad6aa1d50ab40f3cc30bf8172e403c`.

## P1 — retain deferred coercion failures as boundary leaves

Location: `src/regexp/test.ts:26-32`, called at lines 40 and 55. The helper establishes absence of a custom primitive hook, then delegates array/function values to legacy converters without classifying their known unsupported conversions.

Minimal symbolic counterexample (initial `selected = ESBoolean()`):

```js
let effects = "before";
const r = /a/;
const candidate = selected ? "a" : ["a"];
try {
  r.test(candidate);
  effects = "done";
} catch (e) {
  effects = "caught";
}
```

The concrete Node control `/a/.test(["a"])` returns true. Within the explicitly deferred VM domain the correct bounded result is a normal true-branch sibling with `effects === "done"` and an unsupported alternate retaining `effects === "before"`; the unsupported operation must not become a guest throw. On frozen82356b6, `evaluateCode` instead throws a host `Error("Default array string conversion is not yet supported")` at `src/ASTResolvers.ts:204`; no forked completion is returned. The previously explored normal sibling is lost.

The same failure occurs for `r.lastIndex = selected ? "a" : ["a"]; r.test("a")`. Replacing the deferred array with `function sample() {}` fails in both argument/index positions with `Error("Function source string conversion is not yet supported")` at `src/Function/prototype.ts:34`. All four separate pinned-Node controls return true before the review assertions fail. The final review test has four red cases and complete stack logs; they intentionally assert retained boundaries rather than blessing the host failures.

Requested correction: keep these declared unsupported coercion domains as typed analysis leaves at the reached context (or implement their actual semantics), preserve the already completed sibling and earlier effects, and cover both ToString and lastIndex conversion. This does not request array/function conversion implementation or expanded RegExp API support. No production repair was made in this review.

## Retained boundaries and gate status

No additional P0/P1/P2 finding. The review did not expand the acceptance domain to flags, public exec, captures/results, lookaround/backreferences, exotic conversion, descriptors, dynamic construction or open symbolic strings. Explicit boundaries and budget leaves are acceptable results for those declared gaps. Test262's selected subset and these differential comparisons are evidence for this increment, not a proof of full conformance.

Worker full-regression evidence for the requested frozen source was not delivered before this rejection and is not relied upon. A later source/spec run cannot silently substitute for frozen82356b6 evidence. The independent affected suites, runner tests and typecheck were executed; no redundant full suite was started. The four source-bound failures are sufficient to reject, regardless of a passing broader regression.

Normative cross-checks used [RegExp.prototype.test](https://tc39.es/ecma262/multipage/text-processing.html#sec-regexp.prototype.test), [RegExpExec](https://tc39.es/ecma262/multipage/text-processing.html#sec-regexpexec) and [RegExpBuiltinExec](https://tc39.es/ecma262/multipage/text-processing.html#sec-regexpbuiltinexec), with Node24.21.0 as the concrete oracle. The completion-preservation requirement comes from this repository's runtime/state and independent-review contracts.

The independent review supplied no production fix and did not modify worker/main or worker expectations. No draft PR readiness or integration claim is made by this review artifact.


## Correction review — 2026-10-13 — source6bae07c

Requested source: `6bae07c599c6a80d4cb199bf6e3e92fa9bb77cf9`; correction base: `82356b687877bdf21ebb2bccd5924f7c279bc7de`. Root applied the correction to this review tree through cherry-picks `7ccd3aebcafe21ab3ae306cb4dc7d83cc66c9f62` and `adca14d785ccb0889536feda9e223089919674ce`. I verified all 291 source, existing test/fixture and affected boundary-document files byte-for-byte against the requested source before execution, then rechecked their SHA-256 values. No production or worker spec was edited.

**Exact-source gate verdict: REJECT / not ready. The coercion correction itself is accepted and closes independent-p007-F1 for source6bae07c.** A separate deterministic Jest discovery failure prevents the required full regression gate from passing. The original82356b6 rejection and `independent-evidence.json` above are preserved; their historical report/probe hashes resolve at review commit3179469. New records are in `independent-correction-evidence.json`, with a distinct `logs/independent-p007-correction-` prefix.

### Bounded delta assessment

The complete82356b6..6bae07c delta comprises the shared conversion helper, four worker regression cases, and three boundary/wiki/backlog documents. The new guard applies after finite-choice resolution and before array/function primitive conversion. Typed boundaries therefore carry the current branch checkpoint rather than escaping through the shared legacy converters. For a lastIndex stop, already-completed input conversion effects are retained. Primitives and ordinary objects retain their existing order, dispatch, conversion and matching behavior; no matcher, resource-budget, state schema or sirv-specific operation changed.

Customized arrays/functions are intentionally excluded before either conversion hook runs. This is an explicit narrowing recorded in REGEXP-001/LIB-002 and all affected docs, not a claim that native JavaScript rejects these values. The four worker specs retain exact native true controls and the stopped/normal siblings; the independent four former red probes exercise the opposite branch orientation and now pass. Two additional review tests exercise six cases: input conversion mutates lastIndex to a deferred value while preserving its alias/prior snapshot, and customized array/function input/index receivers stop before their hooks execute. Both pass.

The first new alias assertion compared an unresolved raw heap choice directly with its selected object and failed. This was a reviewer assertion error: the heap intentionally preserves the choice while branch knowledge determines its value. The refined assertion uses shared `withValue` under the stopped branch to check the selected reference. The initial log is retained, followed by the successful final rerun; this was not a production defect or a relaxed behavioral expectation. The original33 probe expectations remain unchanged.

### Final source-bound checks

| Check | Observed result |
| --- | --- |
| All original33 independent probes plus two refinements | 35 passed; 17,472 pattern/input comparisons, 208 interpreted literal controls and 655,360 BMP comparisons rerun successfully |
| RegExp test/literal, sirv target and selected Test262 suites | 4 suites passed, 729 tests passed, 46 unchanged historical skips |
| Typecheck with final review probes | Exit0 |
| Actual unchanged sirv CLI factory/import checks | Passed; trim boundary and EMFILE filesystem sibling retained |
| Completed worker full regression on exact6bae07c | Exit1; 127 suites passed, one failed; 3,285 tests passed, 46 skipped |
| Independent default Jest discovery | Includes `src/regexp/test.ts` |
| Independent targeted discovery-failure reproduction | Exit1, empty-suite failure |

The worker's completed `logs/p007/discovery-runs.json` binds its full run to source6bae07c, the pinned Node executable, exact argv/environment, timeout900s, exit1 and duration367.057s. The full log completed normally (not a timeout). I inspected it, verified its SHA-256 against the recorded value, and copied the manifest and referenced outputs into this review tree. The full log SHA-256 is `4f9d25ab623ea4d500b5c99d377f4b5a93e1867c78f6525df2553b2f06c5c51e`. All three completed runs in that manifest had matching hashes. The worker task-folder `evidence.json` was not yet present; the completed source-bound run manifest and full log establish the failure directly. No duplicate full suite was launched.

### P2 — production filename is selected as an empty Jest suite

Location: `src/regexp/test.ts` (module filename, present in source6bae07c). The unchanged standard `yarn test --runInBand` discovery includes this production implementation file. Since it defines no tests, Jest fails with `Your test suite must contain at least one test.` The worker's source-bound full log identifies this as its only failing suite; independent `--listTests --runInBand` plus a targeted `src/regexp/test.ts` run reproduce it on the exact review bytes.

This is a deterministic repository/test-discovery defect, not an environmental permission, Node-version, dependency, or timeout issue. Behavioral test success does not satisfy the required full-suite gate. Move the implementation outside the test naming pattern (or otherwise correct discovery) and validate the actual resulting source before any ready claim. The worker's later `e13d6c1448ee6a34db0d00d5536f1f99eb02f87c` rename commit was observed but is outside the requested source and is not applied, accepted or covered by this verdict. No source repair was made here.

Final review-probe SHA-256: `8fcc4d6f8dcc2b2e108484f9c81d75484749a15b1bb626e673dd7b3ba326a7d7`.
Final probe log SHA-256: `a21fc7e66b4b95824d75b7f18d830cbfe6b19809a0b9fb1e685be8aba137d931`.
Correction diff SHA-256: `8f79148b5138a0eba16625dca0f1f6f140a5908decd642673bbdebcd34da4161`.

Only this appended review, new correction evidence and probe refinements are committed by the reviewer. Root's pre-existing edit to `independent-review-task.md` is preserved unstaged. No push, merge, model/account change, delegation or production edit occurred. Review frozen after this bounded correction verdict.


## Final bounded review gate — 2026-10-13 — sourcee13d6c1

**ACCEPT `e13d6c1448ee6a34db0d00d5536f1f99eb02f87c` for the declared P007 domain. No outstanding review or regression gate blocker.** Both independent-p007-F1 (deferred conversion completions) and independent-p007-F2 (Jest discovery) are closed for this exact source. Prior source-specific rejection/not-ready decisions and both previous evidence manifests remain unchanged.

Root applied the rename through review-tree commit `462be989bf1baaf1c8836c91d5a5450c13975bb1`. I reviewed the entire6bae07c..e13d6c1 delta: a100% content-identical rename from `src/regexp/test.ts` to `src/regexp/intrinsic.ts`, the corresponding single import replacement in `RegExp.ts`, and the wiki discovery lesson. The old implementation path is absent. The291-file source/test/boundary-doc mapping matches the requested source; no production edit was made by this reviewer.

Evidence reuse is explicit, not a new execution claim. The35 independent probes and exhaustive comparisons last ran on6bae07c (recorded above). Their implementation dependencies remain identical after the path mapping, with the only executable text difference being the verified import path. In particular, both old `src/regexp/test.ts` and new `src/regexp/intrinsic.ts` hash to `4b031a60ddcf95f942c9067b4aadd7386e936788638b3bc359a535bb6227ada6`; `matcher.ts` remains `e70bd541c3f946fcce7f5c5b4b3b4ba8d04f5341e1695930ba719afbe3a61aa1`; the independent probe file remains `8fcc4d6f8dcc2b2e108484f9c81d75484749a15b1bb626e673dd7b3ba326a7d7`. I verified the prior passing log and probe hashes before reusing that semantic evidence. The broad investigation/full suite was not rerun by the reviewer.

Fresh checks on exacte13d6c1:

| Check | Result |
| --- | --- |
| Default Jest discovery | 127 actual source suites; neither production helper path is selected |
| Review worktree discovery | 128 suites: the same127 plus the independent review-only probe suite |
| Regex test/literal and actual unchanged sirv integration suites | 3 suites / 136 tests passed; actual CLI boundary/EMFILE assertions and pinned Node controls pass |
| Typecheck | Exit0 |
| Verified worker focused run | 5 suites / 741 tests passed, 46 historical skips |
| Verified worker full run | 127 suites / 3,285 tests passed, 46 historical skips; exit0, no timeout |

The final worker `docs/agent-tasks/P007-regexp-test/evidence.json` is now present and explicitly names tested sourcee13d6c1. I inspected it and the completed full log, verified all12 final run log hashes/statuses, all39 artifact hashes/sizes, all14 changed-source hashes against git blobs and this review tree, the two recorded red-source hashes and the pinned Node binary hash. Its inventory confirms the unchanged46 historical skips and no closed gap IDs. Saved copies and exact commands are recorded in `independent-final-evidence.json` and `logs/independent-p007-final-*`.

Worker full-suite log SHA-256: `694913cb15b9ca32a4a56bc69cfc43e3cd19fb15723d0cc98f12b17c66811cd5`.
Worker evidence snapshot SHA-256: `ee007d2eca960a4331f18d4365a4c3bdae3556969a64784c48a5c84bee4d018a`.
Fresh reviewer focused log SHA-256: `18f1be855ea2fa74ee9cff637f6aef45a04402a633f9178650cda127920fc52a`.

There is no environmental verification issue or stale-source substitution. Acceptance remains limited to the documented bounded flagless matching/coercion domain and the stated sirv progression, not full RegExp conformance or completed application analysis. Only the appended report and final review evidence are committed here. Root's contract edit remains untouched/unstaged. No push, merge, agent, production repair or model/account change occurred; final review is frozen.
