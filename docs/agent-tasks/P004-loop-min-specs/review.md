# P004 LongCat calibration review

Model: `opencode/longcat-2.5-preview-free`, build/high, OpenCode1.18.21;
actual runtime verified. Thread `ses_ee4968dbdffezuWu3XARIEtS01` and
worktree `longcat-p004-loop-min`; base `c89c0b7`. No Muse trust transfers.
Task family is specification design; this is not VM implementation acceptance.

LongCat produced actual model/tool work while Muse remained daily-capped. Its
direct endpoint required the actual OpenCode client, so the pilot uses Atlas;
no eligibility/header or identity workaround was used. See
[quota evidence](../P003-for-statement/quota-evidence.json).

Early [correction 1](correction-1.md): worker created an out-of-scope temporary
spec, tried JSON.stringify on cyclic whole scope, and used filtered pipelines
that hid failed commands (including a mistyped pinned-Node path). Root required
removal of only the worker-owned scratch file, full logs/real statuses and
specific-value assertions. Worker acknowledged and removed it. These are
procedure/evidence defects, not language failures or an accepted handoff.

Atlas/OpenCode snapshots can attribute root's concurrent main-document edits as
patch items in a worker transcript because the thread cwd is main. Review actual
write/edit calls and worktree diff; the observed main docs were root's edits,
not evidence that the worker changed main. No worker production source edits.

State: awaiting final owned specs/native controls/evidence for full review.
