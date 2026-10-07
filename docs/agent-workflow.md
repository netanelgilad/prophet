# Agent implementation playbook

Effective 2026-10-07: the user resumed development with an **orchestrator-led,
worker-implemented** process. This supersedes the pause and the earlier unlimited
Astra worktree wave. Prophet remains a use-case-agnostic symbolic VM; real unchanged
packages reveal reusable missing semantics. Security, debugging and performance
interpretation stay outside the VM.

## Roles and task selection

The orchestrator chooses outcomes, writes bounded task contracts, launches Atlas
threads, reviews evidence/code, returns corrections to the same worker, integrates
and publishes validated results, and updates the roadmap/wiki. It does not quietly
implement the worker's feature or repair it itself. Documentation, task scoping,
independent review probes, test execution and integration are orchestrator work.
Ask the user only for a material product/architecture ambiguity or an authorization
that is actually missing; continue independently otherwise.

Workers use Atlas OpenCode **Muse Spark 1.3**. The live catalog on 2026-10-07 exposed
`opencode/muse-spark-1.3-contributor-free`; select `build` and `high` explicitly,
and verify the actual invocation. Discover the catalog each resumed session;
never silently substitute another model or paid service. One worker owns one
bounded task and one branch/worktree. Main is the integration branch. Preserve
unrelated work, particularly the untracked website files. Workers do not push,
merge, switch the main checkout, or change another worker's files.

Prioritize a reached failure in pico/sirv, a concrete semantic unsoundness, or a
small prerequisite that unlocks complete upstream tests. Name the application
step or reusable capability advanced. Split algorithms with separate observable
semantics; do not put a library's entire missing feature list into one prompt.
Scout larger immutable packages as distinct research tasks once review capacity
allows. Record provenance, real questions, current execution boundaries and why
the candidate is useful; do not install/run arbitrary package lifecycle hooks.

## Task contract

Each task lives in `docs/agent-tasks/<ID>-<name>/task.md` and specifies:

- Intended observable behavior and its link to the target or conformance goal.
- Base commit, exact worktree/branch, owned paths and forbidden changes.
- Semantics/sources to inspect, supported domains and explicit remaining gaps.
- Concrete, boundary, symbolic, unknown and effect-order acceptance cases.
- Complete unmodified Test262 cases or pinned Node controls, as applicable.
- Required commands, evidence format, completion criteria and stop conditions.

A bounded domain is an implementation boundary, not a JavaScript restriction.
Worker code must preserve state/effects before any reached unsupported operation.
No source/name recognition, native target execution, silent success, guessed
values, removed assertions, blanket test skips or source rewrites. If the task
needs a wider semantic change, return the smallest blocker and a proposed split.
Do not grow ownership or hide the problem by narrowing inputs. Corrections go
back to the worker with a reproducible counterexample and updated task version.

## Worker procedure and evidence

1. Read AGENTS, this playbook, the task and linked wiki/boundary pages. Verify cwd,
   branch and base before edits. Add intended behavior and meaningful failure or
   unknown specs first, and retain evidence that they fail for the right reason.
2. Read the actual shared machinery and applicable specification. Implement the
   reusable operation; reuse persistent heap, lookup, coercion, branch and
   completion operations. Do not copy native results into the interpreter.
3. Run focused specs with pinned Node 24.21.0 as independent concrete reference.
   Select whole upstream files; runtime exceptions cannot satisfy parse negatives.
   Include symbolic correlations and cases that must remain unknown/unfinished.
4. Update affected boundary docs, stable gap IDs and a concise wiki article.
   Reconcile guard scans and the complete skip inventory. No unsupported case or
   narrowed assumption disappears merely because the target moved forward.
5. Commit code/specs; record the tested commit and tracked source/test diff. Run
   the full suite and typecheck. Record exact commands, exit codes, counts, local
   log paths and SHA-256 hashes in `evidence.json`; do not claim commands not run.
   Evidence-only docs may follow in a separate commit, with that distinction noted.
6. Return commit IDs, owned diff, supported behavior, remaining gaps, failing
   probes, test evidence and wiki lessons. Stop editing while under review.

For this VM, executable specs, native controls, exact source and graph assertions
are evidence. Screenshots/video suit future visual surfaces; they do not prove
VM semantics. A passing test count or a worker's confidence is not a proof of
all paths or conformance. Logs can be mistaken or stale: reviewers bind evidence
to the actual commit and independently rerun selected adversarial cases and CI.

## Review and calibration

Begin at **one active worker**, reviewing every changed implementation/spec line.
Review the domain, rejection placement, effects, aliasing, holes/absence, current
prototype state, branching, failure paths and target assertion—not just the happy
path. Keep independent adversarial probes outside worker-owned expectations until
review; then retain useful regressions in specs through a worker revision.
Never accept a test that merely mirrors the implementation.

Record each round in its task's `review.md`: model/version, task/prompt version,
review scope, independent commands, concrete findings, revision count, evidence
mismatches, escaped defects, decision and next prompt improvement. Keep the
[review ledger](agent-tasks/README.md) current. Confidence belongs to a task family
and evidence pipeline; it is not blanket trust in a model.

Initial calibration policy (adjust only with recorded evidence):

- Three consecutive first-review acceptances in the same low-risk task family,
  with independent reruns and no regression, permit two disjoint workers.
- After ten such accepted tasks across at least two integrated checkpoints,
  permit at most three workers if review backlog and provider limits allow.
  Low-risk repetitive code may receive targeted review plus full-diff sampling
  on at least every third task. Scope/test/evidence review always remains.
- Solver rules, branch joins, coercion/effects, loaders, schedulers, serialization
  and representation changes always receive full semantic review. A defect or
  unverifiable evidence lowers concurrency/review trust immediately; return to
  one worker for that family until the cause and prompt are repaired.

These thresholds are conservative operating rules, not measured reliability
probabilities. Increased parallelism must fit review capacity: no more than one
completed unreviewed task per active worker, no shared-file ownership, and one
integration/full-suite lane. Test success alone never relaxes semantic review.

## Rate limits and interruption

The free model has provider limits; the catalog exposes no numeric quota. Do not
invent requests/minute or assume free means unlimited. Record actual 429/error,
Retry-After/reset information, timestamp, thread and retry outcome in the ledger.
Use one active worker initially. Respect provider backoff; if absent, wait at
least 60 seconds, then increase delay (120, 240 seconds, capped at 15 minutes).
Poll Atlas thread status at a modest cadence and inspect before resending: an
active/retrying turn must not receive a duplicate prompt. Do not create extra
threads/accounts to evade a limit or silently switch models. During cooldown,
review completed evidence and maintain docs. Persistent quota exhaustion leaves a
faithful checkpoint; ask about changing provider only when progress requires it.

## Atlas lifecycle, integration and durable knowledge

Use Atlas's project/thread APIs or CLI to create, inspect, send and archive; the
project-status JSON CLI owns board updates. Link tasks to the actual provider and
thread ID. User authorization covers the worker prompts for this workflow, not
blanket approval of every command a worker might request. Check any approval
against the scoped task and existing authorization; never infer permission from
its presence in a queue.

Atlas currently creates project threads at the project repo path. Task prompts
must name their separate worktree and require explicit tool working directories
or absolute edit paths. Verify the resulting diff stayed there. Do not mutate
Atlas's project repoPath to route a worker or edit its database directly.

After acceptance, integrate onto current master, preserve other work, run required
combined tests/typecheck and push. Record exact published commit and CI results.
On completion/rejection/cancellation, save the task result, review and reusable
wiki lessons before archiving its Atlas thread; verify archived state. Archive
means retained history, not deletion. Keep a blocked worker unarchived while a
reply/cooldown is still needed. Never archive unrelated user threads.

The [LLM wiki](wiki/README.md) is shared by all agents: concise source-linked facts,
semantic traps, recipes and corrected decisions. Each assertion carries evidence
and a verified revision or an explicit unverified label. Update existing pages,
avoid duplicate stale narratives, and preserve corrections. Task logs belong in
the ledger, feature gaps in implementation-gaps.md, product direction in roadmap;
the wiki links these rather than replacing them.
