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
