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

## Draft review (not acceptance)

[Scope tightening](correction-2.md) stopped extended preliminary exploration.
The first owned nine-test draft required [semantic/harness corrections](correction-3.md):
its native random sampling computed the always-false requested comparison but
expected both outcomes; even its proposed reverse predicate would remain a flaky
sampling test. Root required deterministic witnesses. The generated interpreted
arrays also used unrelated Array.from support, and the alias assertion did not
actually read the alias. Root requested an explicit independent-order unknown.
The worker independently noticed the reversed-predicate mistake after running,
but the sampling approach and extra language dependency still needed review.

Root independently ran the concrete and boundary groups on spec snapshot SHA-256
`56a9314d058a9502d7244a48fd702ca87b4ad9185675b1fa54bb234be5d165f8` in the review
worktree. All seven ordinary and eleven boundary native cases reached their VM
checks. Both groups then failed on missing scope values; seven other tests were
filtered by the command, not committed skips. Log: `/tmp/prophet-p004-first-review.log`.
A suspected source-newline escaping defect was **not reproduced** and was withdrawn.
The helper must assert normal completion so future red evidence identifies the
actual reached VM boundary instead of a missing-property matcher.

[Boundary review](correction-4.md) additionally requires exact returned values:
comparison-only checks cannot distinguish NaN from undefined. The oracle must
check its pinned Node version at invocation as well as beforeAll (Jest24 behavior).
These are spec-design defects/corrections, not accepted VM behavior or evidence
of provider failure. Root has not repaired the worker's tests itself.

## Independent corrected-spec result

Accepted as a proposed acceptance **specification** for draft publication,
not as loop support. Source commit
`d9f4ed4661faacc46608b605ad5623b214072ce7` has spec SHA-256
`c8ea4affb8fa1a1f2714393f1ae70eec307128a7bf1b2a6b8e9857afe0b52b13`.
Full line-by-line review and independent focused rerun: **1 passed / 8 failed**,
with all eight failures explicitly at unsupported ForStatement. The two native
witnesses, seven ordinary values and eleven boundary observations passed.
Typecheck passed in isolated `review-p004-loop-min`; an earlier attempt in the
P003 review worktree found unrelated root-fixture diagnostics, recorded separately.
See [independent evidence](review-evidence.json).

[Wiki correction](correction-5.md) separates proposed VM behavior from verified
native observations, fixes the symbolic domain to actual Math.random inputs,
records that the no-sampling assertion is currently unreached, and fixes the
artifact link. No new runtime source, boundary, Test262 selection, skip or gap
closure is part of this task; LANG-001/SYM-003 remain open. The red spec stays
outside master until P003 supplies the generic semantics and all assertions pass.

Calibration: one useful corrected spec artifact; no first-review acceptance,
no implemented VM task, and no concurrency/review-depth increase. Five correction
notes include procedural, semantic and documentation findings; reviewer false
alarms/refinements are explicitly separated. Root also sent too many piecemeal
follow-ups; next prompts should bundle full-draft findings and bound initial reads.
Exact-value checks, deterministic in-domain witnesses and normal-completion
checks are now in the playbook. Availability is separate from competence.

## Provider-interrupted handoff and root curation

LongCat became idle after HTTP429 from upstream Console with no Retry-After;
[quota evidence](quota-evidence.json) records 88 successful model responses and
six automatic failed attempts. No root retry/model rotation followed. Worker
committed spec `d9f4ed4` and wiki correction `112404f`, but did not finish its
evidence handoff. Root accepted the independently reviewed spec without changing
its bytes, retained the pending worker domain clarification, fixed the wiki
relative link and verified/curated metadata in `1f83a1f`. These documentation
contributions are root work, not evidence of a clean independent worker handoff.

Full independent suite: **121 passed suites / 1 expected-red suite; 2,986 passed /
8 expected ForStatement failures / 46 unchanged skips**, 315.189 seconds. Isolated
typecheck passes. Draft branch `agent/p004-loop-min-specs` is published; red specs
are not on master. No worker reply is needed to close this spec-design task;
P003 owns the pending loop implementation. Archive follows the saved review.

Published [draft PR70](https://github.com/netanelgilad/prophet/pull/70), branch
head `1f83a1fe4af3e443247dcfd57a05b0cf6d0030ac`. Keep draft until P003 makes all
assertions pass; expected-red CI is not a passing feature gate. Thread archived
at **2026-10-08T12:53:27.172Z**, verified through project thread list (conversation
snapshot still had stale null metadata). No active worker or scheduled wake is
left behind. Muse P003 remains idle/unarchived pending its known retry time.
