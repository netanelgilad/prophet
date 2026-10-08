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
| Same Muse model, loop/completion/lexical semantics | P003 quota-blocked before implementation | No accepted task in this family; full semantic review always required. |
| `opencode/longcat-2.5-preview-free`, proof-spec design | P004 active calibration; no accepted handoff yet | Untested. Full line-by-line/native-oracle review. No trust inherited from Muse or inferred from availability. |
| Other free catalog models | No Prophet evidence | Uncalibrated; no launch by automatic rotation. |

Current provider/client at verification: OpenCode 1.18.21; both pilot identities
explicitly select build/high. Exact downstream backend versions are unknown.
Current concurrency remains **one active worker total**, not one per model.

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
