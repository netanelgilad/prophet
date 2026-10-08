# P004 — Loop minimum proof specs / LongCat calibration

State: reviewed spec artifact staged 2026-10-08; provider interrupted final
handoff, and root curated documentation/evidence. Runtime assertions remain red.
See [draft PR70](https://github.com/netanelgilad/prophet/pull/70), [review](review.md) and
[root evidence](review-evidence.json). Thread archived after task closure.
Originally assigned 2026-10-08. New, separate Atlas LongCat 2.5 Preview Free thread;
no Muse trust transfers. Atlas thread `ses_ee4968dbdffezuWu3XARIEtS01`,
actual runtime verified build/high. One worker, full review. This is a **spec design task**,
not implementation of loops and not a claim that a new proof currently passes.
Base: `c89c0b73bbaab0645d345600a39d500a48b6c2a6`.
Branch: `agent/p004-loop-min-specs`.
Only worktree: `/Users/netanelgilad/development/prophet-worktrees/longcat-p004-loop-min`.

## Outcome

Prepare a small, meaningful spec file for P003's loop feature, reconnecting the
original recursive minimum example to an ordinary loop with mutable local state:

```js
function minimum(a) {
  let best = a[0];
  for (let i = 1; i < a.length; i++) {
    if (a[i] < best) best = a[i];
  }
  return best;
}
```

For ten independent symbolic Math.random values, the desired future assertion is
`d[0] < minimum(d)` concretely false, and the result is <= every member. The
engine must derive that through actual comparisons and current bindings; the
name/source is not an intrinsic. Ordinary bounded execution is the first goal.
Unknown length needs separate reusable loop-invariant inference; do not pretend
bounded unrolling proves it or change the recursive summary engine in this task.

## Ownership and constraints

Own only test/loop-min.spec.ts, docs/wiki/loop-minimum.md and
this directory's evidence.json. Read task, AGENTS and playbook, test/min.spec.ts,
test/unknown-length.spec.ts, test/array-foreach.spec.ts and relevant helpers as
needed. Ignore older Muse-only preference in repository docs: the user's latest
instruction authorizes assessing other free models in separate threads, with
separate trust. Use only LongCat2.5 Preview Free through OpenCode, build/high.
No production source, runner, dependencies, existing specs, fixture, main checkout
or other worktree changes. No helpers/scripts/npm runners, no skips or TODO tests,
no pushes/merge or additional agents. Dependencies are linked; do not install.
Ask root for material scope uncertainty, not the user.

## Required spec design

Keep cases small (roughly 8-12 focused cases; no giant matrix). Include:
- Ten-symbol requested false result; preserved unknown element/result values and
  no host Math.random sampling. Assert every-member non-strict bound and aliases.
- Unknown controls: strict reverse, unrelated random and ordering of independent
  elements must remain unknown. Native controls cannot prove symbolic universals.
- Exact concrete loops: singleton, ties, negative/mixed finite values. Native
  Node24.21.0 independently validates concrete expectations before VM assertions.
- Rename the function and include analogous maximum or deliberately wrong reducer
  so future success cannot come from recognizing 'min' or blanket min facts.
- Real loop state: selection updates and a post-return alias retain relationships.
- NaN/empty/infinity/signed-zero boundaries compared with Node if expressible in
  existing language; do not label this implementation Math.min or assert the
  finite lower-bound theorem for NaN. Explain assumptions, not hard-code domains
  into VM. Unknown length stays a documented follow-up, not a test asserting a
  guessed unsupported message or marking desired proof complete.

Run specs on the existing baseline and retain expected red results caused by
unsupported ForStatement. Ensure native comparisons really run and pass for ALL
concrete cases before their VM assertions; one failing first case must not mask
later oracle checks. Use existing pinned-Node helpers. A red test or harness
mistake is not evidence of future correctness. Record failures honestly and
separately; no requirement to make the baseline pass without loop implementation.

Use /tmp/prophet-node-24.21.0/node-v24.21.0-darwin-arm64/bin/node for Yarn and
PROPHET_NODE_BINARY. Run only the new spec plus typecheck (full suite stays red
until integration with P003, so do not spend quota running it). Commit only your
owned files and evidence, with exact commands/status/counts, tested revision,
local ignored logs and programmatically validated hashes. Root will review every
spec and native expectation, then stage accepted specs for P003; red specs must
not be cherry-picked into master before the feature satisfies them. Wiki entry
must explicitly say proposed acceptance, not implemented facts. Stop editing on
handoff. Runtime evidence and rate/availability are separate from model trust.
