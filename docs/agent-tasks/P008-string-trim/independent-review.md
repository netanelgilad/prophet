# P008 independent review — frozen source rejected

Reviewed source **0d3b2781147e1625d90da2db5ec6e86c58a238ff** against effective
P007 baseline **750b5c690d97dd63ca304713805c59a360b748a0**, using the two-dot
content diff. Verdict: **reject this source**. The trim algorithm and actual sirv
progression passed the bounded checks, but the newly exposed intrinsic gives
incorrect concrete results for restricted function metadata. The full regression
gate also remains red for a separately disclosed obsolete P007 expectation.
No later runtime bytes are accepted by this report.

Review ran only from `/Users/netanelgilad/development/prophet-worktrees/review-p008-string-trim`
on `review/p008-string-trim`. No production/worker/main changes, agents, dependency
installation, model/account switching, paid API use, push, merge or release.
Only this report, distinct evidence, the supplied review task and independent
probe spec are committed. Local ignored logs are hash-bound in
[independent-evidence.json](independent-evidence.json).

## One batched correction contract

**R1 — P1: guard restricted reads and writes on the new trim intrinsic.**
Location: `src/string/String.ts:42-46`, particularly the metadata policy at
line 45. `ESBuiltinFunction` does not supply restricted-property guards, and
the shared Function prototype does not implement its throwing accessors.
Consequently all four native-checked probes below complete with invented results:

```js
String.prototype.trim.caller;           // VM: undefined; Node: throws TypeError
String.prototype.trim.arguments;        // VM: undefined; Node: throws TypeError
String.prototype.trim.caller = 123;      // VM: creates property; Node: throws TypeError
String.prototype.trim.arguments = 123;   // VM: creates property; Node: throws TypeError
```

These can produce false absence/normal-completion proofs. Independent acceptance
probes at `test/p008-independent-review.spec.ts:130` and `:138` fail against the
frozen source after their separate pinned Node controls pass. The minimal bounded
correction is to classify these reads/writes as unsupported on the new intrinsic
and preserve reached effects/siblings; full accessor implementation is unnecessary.
Reconcile LIB-002/OBJ-001 and add native, conditional, effect-order and alias
regressions. Do not blindly forbid arbitrary ordinary properties: the independent
`extra` property control succeeds correctly. Verify `in`/own-property observations
under the chosen guard policy, rather than asserting unsupported keys are absent.

This is a newly reachable P008 result, although the missing shared Function
prototype behavior also predates P008 for some other builtins. Before P008,
accessing trim itself stopped. The accepted P007 RegExp.test intrinsic already
demonstrates explicit restricted-property guards; copying older unguarded string
intrinsics does not justify the new wrong answers. Normative basis is
[AddRestrictedFunctionProperties](https://tc39.es/ecma262/2025/multipage/ordinary-and-exotic-objects-behaviours.html#sec-addrestrictedfunctionproperties),
installed on Function.prototype by
[CreateIntrinsics](https://tc39.es/ecma262/2025/multipage/executable-code-and-execution-contexts.html#sec-createintrinsics).
Pinned Node v24.21.0 confirms all four observations.

**G1 — required regression gate, already disclosed by the worker.**
`test/regexp-test.spec.ts:205-214` still requires trim to stop. The source-bound
worker full suite has **1 failed, 3448 passed, 46 skipped** tests, **128 passing
suites / 1 failing suite**. My focused rerun independently reproduces that exact
obsolete assertion. Root must authorize/own the narrow expectation update under
the existing P007 ownership restriction. The worker's unapplied patch in evidence
commit `cb2c0da6707ae0e4999712eda886f5819cc48947` moves the retention/replacement
test to `.trim().toLowerCase()`; it is a reasonable correction, not evidence of
a successful run. Keep actual trim success assertions. This was not independently
discovered or hidden by the worker, and is not counted as a new worker semantic
defect. A final-source full suite/typecheck and fresh independent review of the
correction remain mandatory before acceptance/publication.

## Source, ancestry and evidence reconciliation

The merge base is `8a2b976fff5d03589660f1fc344c4549d3c01771`. Accepted `750b5c6`
adds the portable P007 native-probe cwd correction and publication notes there.
Worker parent `1bf4dd45d488654132b683ce83ec9f0380f006e2` carries the same correction
after task-scoping commit `f02cc66`; `0d3b278` directly descends from `1bf4dd4`.
The two parents' `src` trees are both `1f3c2c9ea616e73c08bc123d5bb71684a6083a24`
and `test` trees both `d9746fa76cef19146528accf9130b0a9d8416276`.
Their only content difference is the P008 task document. Thus the requested
two-dot comparison properly excludes an already accepted portability change;
P008 is not a direct descendant of `750b5c6`. Root still owns eventual stack alignment.

I reviewed every changed implementation/spec line: all 59 lines of trim.ts,
the six-line registration, the narrow AST lookup substitution, all 170 worker
trim-spec lines, the sirv assertion changes, every new Test262 selection, and
the affected task/string/sirv/backlog/wiki/corpus documents. Shared conversion,
heap, branch, invocation, prototype, enumeration and analysis-failure machinery
were inspected to establish what the new code actually inherits.

While review was running, `agent/p008-string-trim` advanced to `cb2c0da`, containing
evidence and documentation corrections only. `git diff 0d3b278 cb2c0da -- src
'test/*.spec.ts'` is empty. I read that evidence through Git without moving this
checkout. All **72** source/tree/artifact/command-log hash checks matched actual
bytes, including the complete failed full-suite log and empty successful
typecheck log. The full run finished within its 900-second cap. Therefore no
redundant full-suite run was performed. Evidence validation is not source acceptance.

## Bounded behavior that passed

| Area | Independent evidence / review result |
| --- | --- |
| Whitespace | Every BMP single unit (65,536 comparisons) agrees with native trim; 134 interpreted edge/interior/UTF-16 inputs agree and are idempotent. FEFF/NBSP trim; U+0085/U+180E/U+200B, NUL, lone surrogates and astral content remain where required. |
| Coercion | Nullish rejection precedes conversion; ordinary string-hint order, noncallable fallback, primitive returns, interpreted throws and live replacement of valueOf agree with Node. Argument evaluation occurs first; trim ignores argument conversion. |
| Identity and state | Stable nonconstructible intrinsic, name/length/prototype reads, borrowed receivers, String.prototype conversion, captured trim surviving its own replacement during conversion, own extra property and prior snapshots behave as asserted. Primitive strings bypass altered object conversion hooks. |
| Symbolic results | Unknown booleans and finite method choices retain correlations and mandatory unknowns. A three-leaf open-string/guest-throw/normal frontier preserves conversion mutation on every leaf. Existing worker open-number/chunk boundaries also pass. |
| Bounds | Inclusive 65,536-unit scan/output cap, both over-cap and million-unit worker cases, and independent 65,535/65,536/65,537 controls pass. Cap follows conversion, precedes scans/slice, and retains state beside guest-throw/normal siblings. It is an analysis stop, not a catchable error. |
| Declared exclusions | Customized arrays/functions remain explicit before their converters. Nonnull own/inherited Symbol.toPrimitive stops; null/undefined hook slots correctly permit ordinary conversion. Shared partial-host/cycle/getter/wrapper limitations remain disclosed, including legacy partial checkpoints. No demand to expand these domains. |
| Reflection | Object.keys(trim), Object.keys(String.prototype), descriptor calls and name/length writes stop through existing legacy guards; they do not return invented enumeration results. Restricted caller/arguments read/write is the distinct failing surface R1. |
| Actual target | Rerun actual unchanged sirv runtime and CLI specs: trim advances to the toLowerCase MemberExpression in unchanged mrmime/index.js:443; graph remains roots/nodes, includes the unsupported leaf with source frame/readdir effects and the EMFILE sibling. All 26 published package files retain provenance hashes. No factory/server/request-analysis completion claim. |

The scanning rule agrees with [TrimString](https://tc39.es/ecma262/multipage/text-processing.html#sec-trimstring)
and [lexical whitespace](https://tc39.es/ecma262/multipage/ecmascript-language-lexical-grammar.html#sec-white-space).
Its cap does not bound arbitrary interpreted coercion, prototype depth, input
construction, fork volume, serialization or guarantee allocation success. Those
residuals remain accurately recorded; no backlog ID is closed by these tests.

## Complete corpus and attribution

Actual additions are **40 complete files / 80 strict/sloppy variants**, giving
**341 active files / 673 variants**, with **128 trim candidates / 88 inactive**.
The frozen documents' 41/82/87 counts are wrong; the worker independently corrected
them in evidence-only `cb2c0da` before this review's findings. Candidate table rows
already match the actual file set. I executed all 128 original files, including
original harness/includes, independently in pinned Node: **256 variants, zero
failures**. No fragments or modified fixture code were substituted. Every active
trim file's body was inspected; the VM runner executes whole source with strict
prefixes and existing explicit harness boundaries.

The complete **46 historical skipped filenames** exactly match `750b5c6`, are all
documented, and their metadata/byte hashes match the worker inventory. All 387
active-plus-skipped metadata/hash rows and all 256 native variant hashes match.
The single historical generated skip site is unchanged; no new skip/todo exists.
The focused stale-test rerun's 97 selector-excluded tests are not historical or
new source skips. Documented guard/assertion/skip/boundary scans were rerun and
saved; they are an inventory, not proof of total JS/Node compatibility.

The supplied checklist disclosed whitespace/coercion/metadata areas in advance;
the independent probes use newly authored witnesses/native expectations and do
not import worker answers. They are not claimed to be wholly hidden holdouts.
Worker separator-encoding and strict-replacement self-corrections are not reviewer
findings. No semantic false alarm was converted into R1.

A separate untracked `test/p008-root-boundary-probes.spec.ts` appeared during
review and identifies its probes as root/Grok-disclosed work. I inspected and
preserved it without editing, running or committing it. Its Object.keys concerns
overlap checks above: on these frozen bytes enumeration already stops, so an
invented enumeration claim is a false alarm (a typed-only test can still fail
on a disclosed legacy guard). Missing trimEnd/padStart and prototype-presence
claims concern pre-existing unchanged missing-standard-API lookup/presence debt;
they are not newly added implementations and do not authorize broadening P008.
R1 instead concerns the newly reachable trim function's concrete wrong answers.

## Validation and remaining gates

Independent final spec: **22 passed / 4 failed**, the four failures all R1;
earlier independent draft: 20 passed / 2 restricted-read failures. Final typecheck
exit **0**. Affected suites: **799 passed / 46 historical skips across 6 suites**.
Discovery includes specs only, no `src/test.ts`. Every command, environment,
status, log path and generated hash is in the distinct evidence manifest.

Next gates: worker's narrow R1 correction and regression update; exact revised
source review; green full suite/typecheck on that final source; reconciliation
of final docs/audit/probe disposition; root-owned stack alignment and draft PR/CI.
Review artifacts intentionally retain the failing acceptance probes. This review
is frozen; later bytes require another source-bound review.
