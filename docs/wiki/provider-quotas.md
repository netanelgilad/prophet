# Provider quotas and reset evidence

Verified 2026-10-08. This is orchestration knowledge, not Prophet runtime state.
Use the [model trust register](../agent-models.md) independently of availability.

## What actually blocked Muse

A single diagnostic response at **2026-10-08 12:04:23 UTC** for
`opencode/muse-spark-1.3-contributor-free` returned HTTP **429**,
`FreeUsageLimitError`, and **Retry-After: 42937**. Its server Date plus that delay
is **2026-10-09 00:00:00 UTC / 03:00 Asia/Jerusalem**. This is the observed
retry time for this response, not a guaranteed service-availability promise.
Do not probe/retry this model before that reset merely because a task/thread is
new. The previous eighteen-minute retry was uninformed: Atlas hid rate metadata.

[Sanitized evidence](../agent-tasks/P003-for-statement/quota-evidence.json)
contains no credentials or prompts. The same public identity and network were
used as the existing unauthenticated OpenCode free-model setup; no key/account,
VPN or IP change was used. The diagnostic sent no repository source. A separate
LongCat direct probe returned `FreeTierError` requiring the OpenCode client;
that restriction was respected by using the actual Atlas/OpenCode worker, not
by spoofing eligibility headers. LongCat then produced real tool activity in
[its separate P004 thread](../agent-tasks/P004-loop-min-specs/task.md).
This established initial LongCat availability, not its numeric quota or proof
that every free model has an independent pool.

## Published implementation and what remains unknown

Inspected immutable OpenCode source `5d9cd9b259f0456522f318a7435501d03cfbee79`:

- [IP limiter](https://github.com/anomalyco/opencode/blob/5d9cd9b259f0456522f318a7435501d03cfbee79/packages/console/app/src/routes/zen/util/ipRateLimiter.ts):
  anonymous-eligible models use daily request counters keyed by IP and UTC date.
  Default models share a daily key. An explicit per-model limit uses a model
  prefix in that key (so it is not necessarily unique per full model ID).
  The retry delay is seconds until the next UTC midnight. Successful request
  processing increments counters; one agent turn can contain many model calls.
  Default-model introductory allowances depend on lifetime use, so a threshold
  observed once is not necessarily permanent.
- [API-key limiter](https://github.com/anomalyco/opencode/blob/5d9cd9b259f0456522f318a7435501d03cfbee79/packages/console/app/src/routes/zen/util/keyRateLimiter.ts):
  a separate minute-based key/model counter exists; do not confuse it with the
  free daily cap. Upstream model/provider limits can also apply.
- [Handler](https://github.com/anomalyco/opencode/blob/5d9cd9b259f0456522f318a7435501d03cfbee79/packages/console/app/src/routes/zen/util/handler.ts)
  chooses the limiter from model configuration and emits a 429 plus Retry-After.
  [Subscription configuration](https://github.com/anomalyco/opencode/blob/5d9cd9b259f0456522f318a7435501d03cfbee79/packages/console/core/src/subscription.ts)
  loads numeric free limits from deployment configuration, not a hardcoded public
  constant. The deployed gateway can differ from the inspected source revision.
- [Installed client retry code (v1.18.21)](https://github.com/anomalyco/opencode/blob/826d9ad46a22bef0294998e08daa3c4904fea28f/packages/opencode/src/session/retry.ts)
  honors Retry-After and can wait for hours. Atlas currently maps busy and retry
  into the same active flag, omitting the next retry time from its projection.
  Thus an idle-looking active turn was likely waiting until reset, not necessarily
  a hung request. Do not interrupt and retry based only on elapsed minutes.

[Zen pricing](https://docs.opencode.ai/docs/zen/) lists these models as free but
does not publish a stable request ceiling for each promotional model. The
[Go 5-hour/week/month limits](https://docs.opencode.ai/docs/go/) describe that
subscription, not this observed anonymous daily limiter. No Go purchase or
paid fallback is authorized by the free-model experiment.

Local read-only request metadata for October 8 showed **501 completed Muse
responses** (489 with tool calls, 12 final responses), plus failed/interrupted
attempts. The local stream log recorded 504 starts and 3 stream errors. This is
consistent with a roughly 500-response ceiling, but not an authoritative exact
quota: concurrent requests, other clients on the same network and server-side
configuration are not observable in this count. Owned tasks contributed 72
(P001), 179 (P002) and 8 (P003) completed responses that day. Counts span local
projects because the server quota does not belong to this repository.

## LongCat pilot reached another limit

At 2026-10-08 12:44:43 UTC the actual OpenCode LongCat worker began receiving
HTTP429 `FreeUsageLimitError` with **"Error from provider (Console)"**. The
client made six bounded automatic attempts through 12:45:57, then became idle.
The saved final response has Date `Thu, 08 Oct 2026 12:45:57 GMT` and **no
Retry-After header**. Its reset time and numeric ceiling are unknown; do not
assign Muse's midnight reset to it. Local metadata records 88 successful
LongCat tool-call responses and one final error, all in this pilot. That count
is task usage, not a published quota. [Sanitized evidence](../agent-tasks/P004-loop-min-specs/quota-evidence.json).
The published handler adds the provider name when forwarding upstream errors;
this suggests an upstream capacity limit, not necessarily the same gateway IP
counter seen for Muse. The deployed provider configuration is not observable.

The alternative therefore made useful progress but did not provide reliable
unlimited fallback. Root sent no new model request after observing this limit
and did not sweep more models. The committed spec passed independent review as
an expected-red acceptance artifact; root finished only documentation/evidence
curation after the interrupted handoff. Availability grants no correctness trust.
No automatic retry or wake-up has been installed for either model.

## Workload policy

1. Check provider/model identity, price and known cooldown before dispatch.
   Keep one active worker total while calibration remains at that level.
2. Record error class/status, server Date, Retry-After/reset and observed response
   counts. Respect the longest applicable known shared cooldown. A reset time
   means when to retry, not a reservation or guaranteed success.
3. For current Muse planning, use **400 observed local completed responses/day**
   as a conservative dispatch warning, not an enforced/provider-published quota.
   Recent task costs (72 for the resumed concat work, 179 for forEach) imply that
   starting a large task near the observed ceiling is unreliable. Shared-IP work
   may exhaust capacity earlier. Lower the warning on earlier limit evidence.
4. Batch independent reads/checks in a worker tool call; use focused specs during
   development and full validation at an actual handoff. Reuse exact unchanged
   source evidence; never drop proof/review requirements to save requests.
5. A user-authorized free alternative may run only in its own thread/worktree and
   starts uncalibrated. Do not rotate accounts, keys or networks, hammer capped
   models, or infer free capacity from a catalog label. If the alternative reports
   the same shared cap, wait for it rather than sweeping every model.
6. Re-check once after the reported reset while supervised. Record actual recovery.
   No scheduled wake/retry is currently installed. Surfacing provider status/reset
   through Atlas is useful future infrastructure; this doc is not that feature.
