# P005 — Correlated selection membership

Assigned 2026-10-10 to Atlas Muse build/high thread
`ses_ed8f8d055ffeudxFh2s7rNnu4P`. Exact free model:
`opencode/muse-spark-1.3-contributor-free` (live catalog verified at dispatch).
Worktree `/Users/netanelgilad/development/prophet-worktrees/muse-p005-selection`,
branch `agent/p005-selection-membership`, reviewed source base
`b508ad9f18bdcb2edef7adba3df70a5fd0b3e9e7`. Root delivery-doc bootstrap follows
that base without implementation changes. P003 is idle and archived; one active
worker total. Atlas cwd starts at main: use this assigned absolute worktree for
every edit and command. Do not touch main, other worktrees or Atlas internals.

Root's [fixed-snapshot reductions](reduction-evidence.json) sharpen the blocker:
with independent symbolic booleans and finite symbolic a/b/c, selecting
`first ? a : second ? b : c` proves `selected === a || selected === b || selected === c`;
selecting `first ? c : second ? b : a` leaves the same exhaustive disjunction
unknown. An unrolled sequence of comparison/assignment selections also fails.
All complete normally, so this is generic, candidate-order-sensitive reasoning
precision, not missing loop execution. The passing ordering is a regression
control; do not describe all three-way selections as unsupported.

## Outcome

Use ordinary conditional selection, identity/equality knowledge and short-circuit
evaluation to prove a finite selected value is one of its possible inputs, when
JavaScript strict equality permits that conclusion. The motivating expression is
`m === a || m === b || m === c`, where `m` came from nested selections of the
three finite symbolic numbers. The minimum function's name/source and loop shape
must not matter. Preserve bounds, aliases and must-remain-unknown controls.

First reduce the missing theorem to ordinary nested conditional expressions
without a loop. Diagnose which generic relationship is lost or cannot be derived.
Do not implement a minimum-specific fact, source recognizer, sampled proof or
unconditional assumption that an equality disjunction is exhaustive.

## Owned scope

Owned production surface: the smallest rule in `src/symbolic/index.ts`
and, only if justified in the design note, its existing knowledge model. Changes
to operators, branch merging, heap, loop execution or public state schema require
an explicit bounded scope review first. Do not add a solver dependency or expand
unknown-length loop inference. This is solver/state semantics and always receives
full code review, regardless of prior model calibration.

Use `test/symbolic-selection-membership.spec.ts` for generic proof/negative cases;
retain every reviewed assertion in `test/loop-min.spec.ts`. Keep original recursive
minimum and unknown-length specs as regressions. Record actual precision/resource
limits in the stable implementation backlog and relevant wiki; never turn the
failing reviewed assertion into an unknown expectation or skip to obtain green.

## Acceptance and independent evidence

- Generic nested selections of three finite symbolic values prove exhaustive
  membership through equality and `||`; renamed variables and reordered candidate
  lists work. Incomplete candidate lists and an unrelated fresh value stay unknown
  where both outcomes are feasible. Repeated/aliased candidates remain sound.
- Known branch guards, correlated comparisons and post-return aliases preserve
  their current relationships; both the original minimum/maximum bounds and the
  wrong-reducer controls remain unchanged.
- NaN is a critical countercontrol: a selected NaN need not equal even itself.
  Unknown numbers that may be NaN cannot inherit a finite-number theorem. Include
  mixed choices, infinities, signed zero and concrete aliases using exact
  JavaScript equality behavior. Do not confuse strict equality with SameValue.
- Evaluate deterministic finite assignments with pinned Node 24.21.0 independently
  of Prophet; these are soundness checks for derived rules, not an all-path proof.
  Include false/unknown controls, not only valid theorems. New inference must not
  manufacture contradictory branch facts or hide unfinished analysis.
- Keep inference resource growth explicit and bounded where new exploration is
  introduced. A stopped/unknown result is preferable to an unsound proof; existing
  limits must not be removed to make one sample pass.
- Focused specs, full suite, typecheck, gap/skip audit and programmatically generated
  evidence on an exact commit are required before integration. No worker push or
  shared-checkout edits. Root reviews independent probes and integrates only green.

## Delivery and scope boundaries

Owned: `src/symbolic/index.ts`; `src/symbolic/model.ts` only with a justified
design note; new `test/symbolic-selection-membership.spec.ts`;
`docs/symbolic-choice-equality.md`; relevant SYM-001/SYM-004 portions of
`docs/implementation-gaps.md`; `docs/wiki/selection-membership.md`;
`docs/wiki/loop-minimum.md`; `docs/for-statement.md` and `docs/wiki/for-statement.md`
only to reconcile the previously unresolved membership theorem; this task's
`design.md` and `evidence.json`. Root owns task/review/ledger/model/roadmap/wiki
index files. Existing tests are read-only unless root grants a precise review
expansion. No existing assertion may be weakened, including the reviewed loop
minimum spec. No dependency, public schema, CLI or loop-driver changes.

Read AGENTS, `docs/agent-workflow.md`, the runtime/state contract, this task,
`docs/symbolic-choice-equality.md`, `src/symbolic/index.ts`, its model and relevant
existing choice/min specs. Work spec-first; add a brief design note identifying
the exact lost relationship and why the proposed rule is sound for NaN and
identity before implementation. New source inference deserves full review.
Do not retry the deferred normal/continue loop join: it is unrelated scope.

Pinned node binary for both Jest and native oracle:
`/tmp/prophet-node-24.21.0/node-v24.21.0-darwin-arm64/bin/node` (v24.21.0).
Set `PROPHET_NODE_BINARY` to the same path. Use existing Yarn Jest commands,
first the new spec, then loop-min/choice-equality/min/unknown-length, then full
suite and typecheck on a committed source snapshot. Run documented guard/skip
audits. Preserve complete logs in /tmp and record explicit paths, SHA256,
commands, statuses, stage and tested source commit in evidence.json. Generate
and revalidate hashes programmatically; inspect each log's result, not just its
hash. Evidence-only docs may follow separately; verify the final cumulative
diff and clean tree. Stop editing after handoff. Do not push.

Report bounded blockers rather than widening the task silently. The orchestrator
stays active and waits through provider limits; never substitute another model
or issue duplicate work. This assignment is not evidence of implementation.
