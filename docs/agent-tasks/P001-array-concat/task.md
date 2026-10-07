# P001 — Shared Array.prototype.concat

Task version: 1, amended by [correction 1](correction-1.md) and
[correction 2](correction-2.md). Worker: Atlas OpenCode Muse Spark 1.3, build/high.
State: provider-limited during revision; [review and resumption record](review.md).
Base: `999236fd4c0dc68972434c91d6e4895edc6fa8a2`.
Worktree: /Users/netanelgilad/development/prophet-worktrees/muse-p001-concat
Branch: agent/p001-array-concat

## Outcome

Implement one reusable bounded Array.prototype.concat operation so the unchanged
sirv default factory passes its current concat read and preserves whatever next
operation is still unsupported. Do not implement forEach, loops or regex matching.
No sirv-specific implementation, fixture edits or target bypass.

## Ownership and procedure

Read AGENTS, docs/agent-workflow.md, docs/wiki/vm-foundations.md, docs/array-push.md,
docs/sirv-target.md and the relevant shared array/heap/symbol/branch operations.
All edits and commands must target the named worktree. Atlas session cwd may be
main: use explicit tool workdir or absolute paths. Do not modify the main checkout.

Own src/array/concat.ts (new), the minimal registration in src/array/prototype.ts,
test/array-concat.spec.ts (new), test/sirv-target.spec.ts boundary assertion,
test/test262.spec.ts selection, affected docs/array-push.md, docs/sirv-target.md,
docs/implementation-gaps.md, test/test262/README.md, and
 docs/wiki/array-concat.md plus this directory's evidence.json. Shared helper
changes may be proposed if necessary; report the reason before expanding scope.
Do not edit test262/runner.ts, pinned fixtures, package manifests/lock, CI,
parser, solver, CLI schema, AGENTS or another task. No push or merge.

## Semantics and bounds

Inspect the ECMAScript concat algorithm and the pinned complete Test262 files.
Use actual current receiver/argument state, not initial .value/property snapshots.
Start with ordinary known-layout arrays and primitive arguments; array elements
may contain arbitrary VM values and aliases. Support concatenated arrays, holes,
empty arrays, non-mutation, fresh result identity, and shallow object references.
Test conditional values/receivers where shared branching supports them; preserve
correlations and snapshots. Symbols/species/constructor lookup are observable:
support the proven ordinary intrinsic case and stop explicitly before any
unmodeled custom lookup/spread/species effects. Do not silently ignore constructor
shadows, internal well-known symbol slots, inherited numeric properties, partial
host objects, custom access hooks or prototype changes. Follow existing typed
boundary practice; a narrowed implementation is not a JS input restriction.

Keep unsupported open/segmented/symbolic-layout arrays and maximum-length/overflow
explicit. A practical allocation limit is an analysis boundary, not a language
throw or invented result. Nullish receivers need actual TypeError semantics;
other generic/boxed receivers may remain explicit unsupported cases. Metadata:
name concat, length 1, nonconstructible; use existing shared intrinsic machinery.

## Acceptance evidence

Start with failing specs for fresh shallow result, receiver/argument evaluation
order and throws, aliases, multiple arguments, holes versus own undefined,
non-mutating snapshots, ordinary inherited lookup or explicit boundary, unknown
and exotic/custom species/spread boundaries, symbolic element/receiver choices,
and supported siblings surviving a typed unsupported sibling. Independently
compare supported concrete cases with pinned Node; never synthesize expectations
from the implementation. At least one legitimate result must remain unknown.

Activate appropriate complete unmodified Test262 concat cases that really fit
implemented semantics. Do not trim cases, add runtime substitutes to the harness,
or count unselected files as passing. Update the real sirv spec from the concat
boundary to the actual next boundary and assert the retained state/progress.
Do not change original package bytes. Update relevant gaps/candidate inventories.

Run focused specs during development. Use the existing commands, with
PROPHET_NODE_BINARY=/tmp/prophet-node-24.21.0/node-v24.21.0-darwin-arm64/bin/node
and that same executable for Yarn:

    node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/array-concat.spec.ts test/array-push.spec.ts test/sirv-target.spec.ts test/unknown-length.spec.ts test/test262.spec.ts test/test262/runner.spec.ts
    node .yarn/releases/yarn-3.1.1.cjs test --runInBand
    node .yarn/releases/yarn-3.1.1.cjs typecheck

Here `node` means the pinned executable above. Dependencies are already supplied
by the orchestrator; do not install/update them. Capture test-first evidence,
commands, exit codes, counts, tested commit, log paths/hash, residual gaps and wiki
contribution in evidence.json. Commit code before final verification, then add
an evidence-only commit. Report exact commits and stop. If a blocker needs a
larger representation change, explain it; do not broaden the task or rewrite tests.
