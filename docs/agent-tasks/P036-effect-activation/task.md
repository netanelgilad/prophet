# P036 — interpreted activation and host-effect origin

Base: published `007afa2c043d94ce3131d594c46bcf0eac59ab3c` (P035).
Owner: Codex root `01a15f01-bb95-7473-af10-3f01d7370982`, following the user's
2026-10-21 instruction to implement directly with its own subagents.
Branch: `agent/p036-effect-activation`; shared isolated worktree, disjoint edits.
Status: implementation `fea6942` independently accepted; full174 suites/5233 passes,
46 historical skips and typecheck pass. Exact-candidate CI/publication pending.
[Review](review.md), [evidence](evidence.json).

## Outcome

Preserve the actual dynamic interpreted call ancestry and direct executing file
when a modeled host invocation starts. A downstream dependency permission tool
can later map those files to verified package instances. This increment adds no
package resolution identity, outbound API, policy, permission or verdict.

## Contract and design review

- `ExecutionContext.value.activation` is an optional immutable linked record:
  `{ target, sourceFile?, parent? }`. Target is the existing interpreted function
  identity; sourceFile is its captured lexical file; parent is the invocation
  context's active frame, never the function's creation-time active frame.
- Enter at createFunction's implementation before receiver boxing and parameter
  initialization. Ordinary returns/fallthrough/guest throws restore the caller;
  analysis stops retain the entered checkpoint. Function creation is not entry.
- Reconcile activation at branch joins after leaf restoration. In particular,
  a mixed return/throw tree must not resurrect the original callee-active base.
  Balanced ordinary branches share the same restored identity.
- `HostCall.origin` freezes current sourceFile and activation at call entry.
  Call/return/throw share the same call and origin. Current unknown source stays
  unknown, including eval; do not recover a filename from an ancestor.
- Constructors, CommonJS wrappers, aliases/bound calls and actually invoked
  callbacks pass through the shared entry seam. Native adapters and eval itself
  gain no invented interpreted frame. Deferred invocation uses its current
  dynamic ancestry, not the completed registration call chain.
- Proof-session interception hooks are internal inference machinery. Trial
  executions must not publish speculative activations as application history.
  Do not change summary eligibility or proof answers to obtain coverage.
- Context graph projection includes activation and shares target/parent identities.
  No AST coordinates, security labels, callback-registration lineage or synthetic
  native frames. This is not a complete V8 stack or execution log.

Root reviewed two proposals before dispatch. Independent review found the stale
base-context branch-join risk and pre-body failure checkpoint requirement.
It also identified proof-trial leakage. Root accepts O(1) linked metadata without
an added semantic depth limit: it never copies/walks the ancestor chain on entry.
General interpreter/graph native recursion remains an explicit resource gap;
externally bounded moderate-depth probes must establish no observed regression.
No arbitrary-depth support is promised and ancestry must never silently truncate.

## Work ownership and validation

- environment_wiring: production source, test/interpreted-activation.spec.ts.
- environment_scenarios: test/effect-origin-integration.spec.ts.
- semantic_review: test/interpreted-activation-review.spec.ts and independent
  implementation review. Root owns task/boundary/backlog/wiki docs and integration.
- Specs precede implementation, preserving raw red evidence. Cover dynamic file
  ancestry, nested/cached imports, aliases/constructors/callbacks, eval/Function,
  parameter/boundary checkpoints, symbolic mixed completions, summary success and
  failure, immutable origins and graph aliases. Native compatibility checks must
  keep source execution semantics separate from Prophet-only metadata.
- Pinned Node24.21.0; affected specs, then full suite and typecheck. Reconcile all
  four documented gap scans and the complete skipped Test262 inventory. No
  Test262 activation is expected because this is generic observation metadata.
- Independent semantic source/probe review, then exact-candidate CI before
  fast-forward/push to origin/master. Preserve unrelated owner files.
