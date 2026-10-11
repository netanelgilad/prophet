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
| Atlas Codex `gpt-6-sol`, high, unknown-length loop inference | P006 design/spec pilot started Oct11 at user request; no accepted result yet | Uncalibrated; separate from Muse. Design gate then full semantic/spec/evidence review; one worker total. |

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
