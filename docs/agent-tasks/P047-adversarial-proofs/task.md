# P047: three adversarial symbolic proofs

User approved the three proposed examples: conditional three-value sorting,
aliased transfer conservation, and two-counter classification over symbolic
array length. This explicitly prioritizes reasoning over the queued Unicode API
increment. Base98e3a90, branch agent/p047-adversarial-proofs, worktree
/Users/netanelgilad/.codex/worktrees/p035-longcat-environment/prophet.

## Contract

Each correct function must reduce its violation flag to concrete false while
inputs remain symbolic. Broken sorting (omit final swap), transfer (cache target
before subtraction), classification (skip zero) must retain both witnessed
outcomes. No function-name/source recognition or sampling-as-proof.

Sorting: arbitrary finite Number inputs, ties/signed zero included; no NaN.
Transfer: ordinary mutable numeric data properties; source and target may alias.
Integer initial values[-1000000,1000000], integer amount[0,1000], exact arithmetic.
Classification: dense immutable finite-number array, symbolic length[0,1000000],
no getters/proxies/mutation; both counters increment exclusively and total equals
length. Verify inductive base, arbitrary step, writes/effects and exit. Do not
silently reduce the domain to fixed small arrays or concrete choices.

## Ownership and acceptance

Root coordinates baseline sorting specs/implementation and docs/integration.
Assigned subagents own arithmetic/transfer and counter-loop changes on disjoint
paths, with independent semantic review. Ownership specifics in messages apply.
Only root commits/pushes. Existing owners' primary-checkout files stay untouched.

Specs first in test/*.spec.ts with source, assumptions and assertions together;
record meaningful red/current baseline and pinned Node24.21.0 concrete witnesses.
Include boundaries, broken controls, renamed/reordered equivalent programs,
mutation/correlation/NaN/rounding checks as relevant. Reuse shared semantic rules.
No added language semantics without relevant whole Test262 activation; new proof
rules need proof/unknown tests, not merely concrete corpus counts. Maintain
stable gap IDs, wiki, roadmap/next-work, complete skips and four scans. Full suite,
typecheck, independent complete solver review and exact-candidate CI before
fast-forward master publication. No paid services/reset credits/security CLI.
