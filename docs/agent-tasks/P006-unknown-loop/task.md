# P006 — Verified unknown-length loop summaries

Assigned 2026-10-11. Source base: `22739fa3856ad83244a643445fbac80ae16cc15d`.
Model pilot: Atlas Codex `gpt-6-sol`, high reasoning; live catalog has no model
named Sol 6.1. This is a separate, uncalibrated solver-design/implementation
trial, explicitly requested by the user, not a Muse quota fallback.
One worker total; full semantic review. Thread ID is recorded in review.md.

Work only in `/Users/netanelgilad/development/prophet-worktrees/sol-p006-unknown-loop`,
branch `agent/p006-unknown-loop`. Atlas starts at main: every tool command must
name the assigned worktree and every edit must use its absolute path. Do not
edit main, other worktrees, Atlas, dependencies, protection settings or publish.

## Outcome

Derive reusable loop-carried knowledge by evaluating ordinary JavaScript, so
this function over a nonempty immutable dense finite-number array of unknown
length proves `input[0] < reduce(input)` false:

```js
function reduce(a) {
  let best = a[0];
  for (let i = 1; i < a.length; i++) {
    if (a[i] < best) best = a[i];
  }
  return best;
}
```

No min/name/source recognizer, trusted reducer contract, sampling, fixed number
of unrolls masquerading as induction, native target execution, or silently
narrowed input. Candidate invariants may be generic templates, but must be
validated against the evaluated initialization and transition before use.
Concrete execution remains a subset. Existing bounded-loop behavior must remain.

## Phase A: design gate (current authorization)

Read AGENTS, docs/agent-workflow.md, docs/symbolic-runtime.md, the unknown-length
milestone in docs/roadmap.md, docs/wiki/loop-minimum.md, docs/for-statement.md,
src/loops/for.ts, src/Function/summaries.ts, src/array/symbolic.ts,
src/symbolic/model.ts, relevant symbolic operations and context validation hooks.
Understand the existing recursive proof; do not assume it generalizes to loops.

Own only this task's `design.md`, `evidence.json` and new
`test/unknown-length-loop.spec.ts` in this phase. Start with proof obligations
and executable red specs, run them with a host timeout, and stop for root review
before editing production source. Commit your design/spec artifacts locally.
Return the smallest viable implementation scope and exact production files.

Explain initialization, arbitrary iteration with current carry values, both
conditional update paths, prefix extension, exit, and integer progress/termination.
Explain how quantified membership/order connects to real array identities and
indices, and how failed candidates are removed without circular reasoning.
Show why checking a few concrete lengths is insufficient. Identify representation
changes if required: CollectionRegion currently uses numeric endpoints and array
reads accept concrete indices. Do not conceal a needed prerequisite as a helper.
Account for every modified binding and heap/effect dependency, aliases, shadowing,
captured state, arbitrary calls, exceptional exits, and failed proof execution.
State when inference declines and ordinary execution/boundaries remain.
Do not consume real caller effects or publish speculative proof-state mutations.
Describe local work limits and cache soundness; omitting caching is acceptable.

## Acceptance design/spec matrix

- Minimum, renamed/restructured equivalent and maximum inferred from actual code.
- Finite numeric domain beyond just Math.random's [0,1); singleton and varied
  unknown length bounds; a guaranteed-present later index and an aliased suffix.
- Positive lower/upper bounds; strict reverse and unrelated value remain unknown
  when both are feasible. Preserve selected-element knowledge if soundly derived;
  explicitly identify any prerequisite preventing membership in this increment.
- Wrong reducer (last element or best + 1), skipped index/stride, incorrect guard,
  no progress and index mutation cannot acquire a false universal fact.
- Mutation, captured mutable dependencies, effects, abrupt exits, NaN/empty/sparse
  or custom property lookup cannot borrow the supported proof domain. Preserve
  earlier real state/effects when a reached operation stops. Do not demand normal
  completion from genuinely unsupported inputs or assert unknown from a boundary.
- Concrete finite/NaN/empty/infinity/signed-zero controls agree with pinned Node.
  Deterministic witnesses check false/unknown premises; they are not induction.
- Existing recursive unknown-length, ten-item loop-min, selection, loop lexical
  and completion specs remain intact. Existing tests are read-only.

Specs keep interpreted source, assumptions and assertions together. Check normal
completion before inspecting proof values; positive specs must fail for the
missing feature, not incidental syntax or wrong harness expectations. Minimize
helpers. No new example runner, skipped tests or new npm scripts. Symbolic proof
rules have no Test262 equivalent; identify any new language semantic surface that
would require whole unmodified upstream cases in the implementation phase.

## Evidence / next gate

Pinned node for Jest/native controls:
`/tmp/prophet-node-24.21.0/node-v24.21.0-darwin-arm64/bin/node`.
Set PROPHET_NODE_BINARY to that same path and run the existing Yarn Jest command
via `.yarn/releases/yarn-3.1.1.cjs test --runInBand test/unknown-length-loop.spec.ts`.
Use an external host timeout; Jest alone cannot stop synchronous exploration.
Record actual source revision, commands, statuses, full local log paths and
programmatically generated SHA256 hashes. Distinguish intended red evidence
from validated behavior. Do not claim full-suite green in a red-spec design gate.

Root will review the design/specs and authorize a bounded implementation scope.
Then source + focused regression tests, full suite/typecheck, complete guard/skip
audit, backlog boundaries, wiki and exact-commit evidence are required before
acceptance. Root integrates linearly and verifies exact-head CI before master
publication. Worker never pushes. Stop editing at each handoff. No subdelegation
or model substitution. Record blockers rather than expanding scope silently.
