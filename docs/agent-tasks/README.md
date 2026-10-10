# Agent task and review ledger

Follow [the playbook](../agent-workflow.md). Task evidence is provisional until
independent review and integration. Keep actual thread IDs, model invocation,
base/tested/published commits and archive status here; do not imply a queued task
has run. Review depth changes require a recorded decision, not a growing test count.

Current calibration: **one active worker total; full implementation/spec review**.
See the [separate model/task-family trust register](../agent-models.md).
Numeric provider quotas are unknown. P001 recovered on 2026-10-08 after repeated
limits; dated cooldowns and actual recovery are recorded in its review. The pilot
needed two implementation corrections plus evidence corrections: no concurrency
increase or first-review acceptance streak.

| Task | Target | State | Review / knowledge |
| --- | --- | --- | --- |
| [P001](P001-array-concat/task.md) | Shared Array.concat; advance unchanged sirv | Accepted/pushed `b9c3864`; CI green; Atlas thread archived | [Two correction rounds](P001-array-concat/review.md): work limits, inherited state and invalid spec premises; full review retained |
| [P002](P002-array-foreach/task.md) | Shared Array.forEach; next reached sirv operation | Accepted/pushed `7defa45`; CI green; Atlas thread archived | [One correction round](P002-array-foreach/review.md); 12 independent probes, full suite/typecheck pass; evidence artifacts cleaned up |
| [P003](P003-for-statement/task.md) | Shared ForStatement at totalist and bounded loop-min proof | Scoped acceptance at1170562/b508ad9; thread archived Oct10; integration pending P005 | 14 independent probes pass;3077 suite passes/46 skips/one preserved solver failure; full semantic review and corrections recorded |
| [P004](P004-loop-min-specs/task.md) | Loop-min proof-spec design; LongCat pilot | Reviewed spec staged in [draft PR70](https://github.com/netanelgilad/prophet/pull/70); thread archived after provider-interrupted metadata handoff | Corrected spec accepted; 8 intended ForStatement failures; full review retained, no VM feature accepted |
| [P005](P005-selection-membership/task.md) | Generic finite-selection membership precision | Assigned Oct10 to Muse thread `ses_ed8f8d055ffeudxFh2s7rNnu4P`, branch `agent/p005-selection-membership`, base b508ad9; no implementation accepted | Full solver review; preserve reviewed loop-min assertions and NaN/unknown controls |

P003 owns the reached totalist for-loop blocker. Subsequent candidates:
the actual next sirv boundary, explicit starting-environment input for pico,
and immutable next-package scouting.
Scope each from the actual integrated result, not a speculative feature list.

P001 through P004 are archived. P005 is the sole assigned worker; it inherits
the reviewed P003 source and PR70 specs at b508ad9. LongCat recovery is not claimed. The user
asks for supervised waiting/sleep through future limits; no model rotation is
queued. PR70 stays draft until the combined P003/P005 increment satisfies every assertion.
Atlas completion does not automatically wake the orchestrator. No scheduled
retry or unattended review is configured.
This is an orchestration boundary, not a Prophet runtime feature or user policy.
