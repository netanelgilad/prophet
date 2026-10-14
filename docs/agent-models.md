# Worker model trust register

Effective 2026-10-08: the user permits evaluating other **free** models to maintain
progress when Muse is capped, with independent trust and separate threads.
This supersedes the earlier Muse-only waiting preference for qualified free
alternatives; it does not authorize paid models or quota circumvention.
Availability and correctness are separate. See [quota evidence/policy](wiki/provider-quotas.md)
and [review gates](agent-workflow.md#review-and-calibration).

Trust is keyed by provider, exact model ID, model/configuration revision when
known, task family and review regime. An alias/backend change requires renewed
calibration; a provider version is not a verified model-weight version. Do not
assign a numerical reliability probability from a few tasks.

| Model / family | Accepted evidence | Trust and review |
| --- | --- | --- |
| `opencode/muse-spark-1.3-contributor-free`, shared bounded Array intrinsics | P001 concat (2 source correction rounds); P002 forEach (1 round); independent probes, full suite/typecheck and CI | Early evidence of capability; zero consecutive first-review acceptances. Full code/spec/evidence review. |
| Same Muse model, loop/completion/lexical semantics | P003 scoped implementation reviewed at1170562;14 independent probes; full suite3077pass/46skip/one preserved solver failure; evidence repaired atb508ad9 | Accepted in master merge f6da7af; combined P005 suite fully green. Spec/resource/evidence corrections; zero first-review streak; full semantic review always required. |
| Same Muse model, shared equality/selection inference | P005 source e18d18e;43 independent probes plus26 existing choice tests; full124 suites/3102pass/46skip and typecheck0 | Accepted in f6da7af after candidate-order/resource refinements and one handoff metadata repair. Zero clean first-review streak; full solver review always required. |
| `opencode/longcat-2.5-preview-free`, proof-spec design | P004 corrected spec accepted for draft staging; provider interrupted final metadata handoff, which root curated | One reviewed spec artifact, zero clean first-review acceptances, no VM implementation evidence. Full review retained. |
| Other free catalog models | No Prophet evidence | Uncalibrated; no launch by automatic rotation. |
| Atlas Codex `gpt-6-sol`, high, unknown-length loop inference | P006 source0785ba6 accepted:24 independent root +54 feature checks;126 suites/3156pass/46skip and typecheck0; exact evidence hashes verified | Two B1 source correction rounds, one B2 alias/precision correction batch and evidence curation. Useful self-correction; zero clean-first-review streak. Full semantic/spec/evidence review and one worker total remain. |
| Atlas Codex `gpt-6-astra`, ultra implementation/high independent review, bounded RegExp intrinsic | P007 sourcee13d6c1:127 suites/3285passes/46skips/typecheck0;35 independent probes,17,472 matching comparisons,655,360 BMP comparisons and208 interpreted literal controls | Accepted locally after explicit deferred-coercion guards and a100% module rename for Jest discovery. Earlier rejection/not-ready verdicts retained with source binding and disclosed-case attribution. One implementation writer/full semantic review retained; no concurrency promotion. |
| Atlas Codex `gpt-6-astra`, high implementation/high independent review, String compatibility and partial-intrinsic guards | P008 source06eefd5:129 suites/3476passes/46skips/typecheck0; 27 correction probes plus original controls and65536 BMP whitespace comparisons | Accepted after restricted metadata guards, truthful deferred-name lookup/presence and superseded checkpoint updates. Original rejection and probe disposition retained. Full shared-helper review/one implementation writer remain; no trust promotion. |

Current provider/client at verification: OpenCode 1.18.21; both pilot identities
explicitly select build/high. Exact downstream backend versions are unknown.
Current concurrency remains **one active worker total**, not one per model.

Oct11: user separately requested a Codex Sol trial, superseding the free-only
selection restriction for this explicit pilot. Atlas Codex catalog version
`0.162.0-alpha.17.2` exposes `gpt-6-sol`, not a Sol 6.1 entry; runtime verified
that exact model with high reasoning. Client version is not a model-weight
version. P006 starts at a design/red-spec gate; no success or increased trust
is inferred from dispatch.

Oct10 update: P003 recovered, completed scoped review and was archived. P005
completed in a separate Muse build/high thread for generic selection reasoning,
was independently reviewed and archived. Both implementations are integrated;
no new provider error occurred after recovery. Full code/spec/evidence review remains. The user's
latest instruction is to wait through limits with the assigned worker (see
[supervised waiting](agent-workflow.md#rate-limits-and-interruption)). Earlier
free-pilot permission is not an instruction to switch models during this run.

A different model starts a new Atlas thread and worktree, reading a concise
source-bound task/handoff plus relevant wiki. Do not switch an existing thread's
model and then attribute its combined performance to one model. A resumed same
model can keep its thread. A reassignment must first stop the previous owner and
transfer a specific reviewed commit; never let two workers own the same files.

Track accepted tasks, first-review streak, correction severity, evidence accuracy,
escaped regressions and review effort for each family. Rate limits are capacity
failures, not evidence of low intelligence. Spec-only/red-probe acceptance does
not qualify a worker for less-reviewed solver or state implementation. All core
VM changes retain full semantic review regardless of pilot success.

Oct13 overnight request: use existing Atlas capacity for bounded independently reviewed draft PRs; no merges/releases or paid API/access expansion. Latest owner conversation criticized P006 quota cost and favored one capable Astra implementer. P007 used Astra/ultra; subsequent turns normally use high unless a specific hard issue warrants more. Recheck actual quota before substantial work and preserve review capacity. No model/account rotation or trust transfer.


P009 explicit owner authorization (2026-10-13/14): `gpt-6.1-sol`, high,
sole implementation writer for bounded ASCII String.toLowerCase in its assigned
worktree. This model/family starts **uncalibrated**, separately from P006 Sol and
P008 Astra. Independent `gpt-6-astra`/high accepts corrected source c52c3f4 after full semantic review. A stale parameterized predecessor assertion caused one disclosed extra freeze/full run; review found one evidence-label defect corrected by root. See [publication review](agent-tasks/P009-ascii-lowercase/publication-review.md). No first-review streak, trust transfer or concurrency promotion is inferred. Same model/account retained; no rotation,
paid API, credentials/access expansion or subagents used. Exact backend weights
are unknown; current runtime identity is owner-authorized Sol6.1/high.


P010 separately owner-authorizes the same `gpt-6.1-sol`/high writer/account for
bounded generic UTF-16 lastIndexOf, based on reviewed c06374f. Independent `gpt-6-astra`/high accepts frozen fcb650f source and evidence with no production or writer-evidence findings. One source freeze/full run; reviewer-only harness corrections are disclosed separately. See [publication review](agent-tasks/P010-string-lastindexof/publication-review.md). No trust transfer or concurrency promotion is claimed.
No subagents, model/account rotation, paid API or access expansion. Account-wide
quota at dispatch was owner-reported 52% remaining at22:19UTC, not a measured
task allowance; no live quota measurement or provider limit error is inferred.
See [P010 evidence](agent-tasks/P010-string-lastindexof/evidence.json).


P011 separately owner-authorizes sole `gpt-6.1-sol`/high Number-domain unary ~
implementation writer in the assigned worktree/account. Full independent
`gpt-6-astra`/high exact-source review is pending, with no trust/concurrency
promotion. No subagents, model/account rotation, paid API, credentials/access,
Atlas or Notion writes were used. Owner-reported account-wide 48% remaining at
23:11UTC is capacity context, not a task allowance or live measurement.

P011-R1 (Astra/high review df9ab53) rejects first source b920a64: a pre-existing
Cherow static-key metadata loss supplies a false operand to correct complement
arithmetic. Same owner-authorized sole Sol6.1/high writer performs the narrow
correction with renewed full semantic review. Original source/evidence and reviewer
history remain unchanged. No first-review streak, trust/concurrency promotion,
model/account change or rotation is inferred.
