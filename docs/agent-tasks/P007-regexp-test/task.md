# P007 — bounded generic RegExp.test for unchanged sirv

Source base3377cfe2c8791d2113f0f6e03f331c785df2200b, assigned2026-10-13.
Sole implementer: Atlas Codex gpt-6-astra/ultra, existing mine account.
Worktree /Users/netanelgilad/development/prophet-worktrees/astra-p007-regexp-test,
branch agent/p007-regexp-test. Every command must explicitly use that workdir;
every edit must use its absolute path. Do not edit main or another worktree.
Do not push, merge, release, change dependencies/access, use paid APIs, spawn
agents, switch models/accounts, or execute target source natively as a fallback.
The overnight user request supersedes historical master-integration instructions:
root opens draft PRs only. One implementer total; independent strong-model review
on a frozen handoff follows. Latest Atlas conversation criticizes expensive Sol
handoff cycles; batch reads and provide one complete evidence-bound handoff.

## Outcome / scope

Remove the actual generic RegExp.test blocker reached by unchanged sirv3.0.2's
default factory. Interpret the original fixture and dependencies; preserve all
filesystem alternatives, throws, prior state/effects and next reached boundary.
Do not claim completed factory/server/request analysis unless actually reached.
Implement the smallest reusable bounded matcher and intrinsic domain that handles
sirv's two default filtering regexes, not pattern/source/name recognition.

Own src/regexp/*; focused new test/regexp-test.spec.ts; existing
 test/regexp-literals.spec.ts only to replace newly supported rejection assertions;
 test/sirv-target.spec.ts only to update actual generic progression and add a real
CLI factory graph integration assertion; test/test262.spec.ts to select whole
upstream cases, and test/test262/README.md; docs/regexp-literals.md,
docs/sirv-target.md, docs/implementation-gaps.md, docs/wiki/regexp-test.md,
docs/wiki/README.md, this task folder. Shared src/ASTResolvers.ts or existing
conversion/heap files may receive a minimal necessary integration change; do not
broaden unrelated language support. Ask root only for a real architecture blocker.

The RegExp constructor, public exec/match-result objects, public getters,
Unicode properties, descriptors, symbols and global prototype exposure are
separate work unless a tiny prerequisite is rigorously justified. Unsupported
syntax/flags/open symbolic strings/state must stop honestly with retained state.
Support finite choices through existing VM branch operations when possible;
never turn an open string into a guessed concrete Boolean. Preserve current
property mutation guards unless all newly exposed semantics are supported.

Choose/document a precise matching domain. Prefer an explicit bounded generic
matcher over relying on the host's backtracking engine. Do not use native
RegExp matching without returning a justified design to root first: a string cap
alone cannot bound pathological regex work. Match grammar/source/Unicode/backend
dependence must be explicit. No new dependency. Bounds must cover parsing,
recursion, matching state/work and allocations before expensive preparation;
exhaustion is an analysis boundary, not false/no-match. It is fine to leave flags
or constructs unsupported rather than implement all regexes in one task.

Read AGENTS.md, docs/agent-workflow.md, symbolic-runtime.md, regexp-literals.md,
sirv-target.md and actual shared call/lookup/coercion/heap/completion operations.
Primary source: https://tc39.es/ecma262/multipage/text-processing.html#sec-regexp.prototype.test
and RegExpExec/RegExpBuiltinExec. Pin concrete expectations to Node24.21.0.

## Acceptance / evidence

Start with meaningful red specs and verify native expectations before code.
- Both match/no-match for generic anchored/unanchored literals, character classes,
escapes, alternation/groups and bounded repetition necessary for unchanged sirv;
empty matches and greediness/order matter if stateful flags are admitted.
- Shared intrinsic identity, aliases, ordinary extracted .call invocation,
nonconstructibility and invalid receivers; ToString order, interpreted coercion
side effects/throws; earlier effects retained when matching stops.
- lastIndex reads/coercion even for non-global regexes; supported flags preserve
actual global/sticky success/failure/reset semantics and persistent snapshots.
Any deliberately unadmitted stateful behavior has explicit boundary controls.
- Finite conditional strings/state preserve branch correlations; open unknown
strings remain an explicit boundary rather than a guessed proof. Unsupported
matching constructs/custom dispatch remain guarded. Test failure after effects
and symbolic fork; normal siblings complete.
- Adversarial size/depth/work probes run with an external host timeout. Budget
exhaustion cannot be caught as a guest exception or reset lastIndex spuriously.
- Select complete unmodified applicable Test262 files from the pinned repository,
not fragments. Record prerequisites for unselected cases, keep skip inventory.
- Unchanged sirv factory and actual CLI JSON graph advance beyond .test, retain
filesystem-failure sibling, and state the precise next boundary. Existing pico
and all loop/solver regressions remain intact.

Pinned Node restored at /tmp/prophet-node-24.21.0/node-v24.21.0-darwin-arm64/bin/node.
Set PROPHET_NODE_BINARY to it. Existing node_modules is linked read-only for use;
do not mutate/install dependencies. Run Jest via pinned node and
.yarn/releases/yarn-3.1.1.cjs test --runInBand <focused files>; then full suite
and typecheck at handoff. Complete logs go under ignored logs/; evidence.json
records exact commands/exits/counts/tested commit and programmatic SHA256 hashes.
Run documented guards/skips audit and preserve stable residual gap IDs. Commit
source/spec/docs locally, distinguish tested source from later evidence docs.
Return exact SHAs, full diff summary, supported domain, actual application
progression, remaining gaps, full validation and evidence hashes. Freeze edits.
