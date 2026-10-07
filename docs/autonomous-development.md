# Autonomous VM development

Historical wave. The pause below was superseded by the user's 2026-10-07
[Atlas Muse orchestration workflow](agent-workflow.md); retain this record as
evidence, not current operating instructions.

The autonomous worktree wave began on **2026-10-05**. After a quota interruption,
the user requested on **2026-10-07** that we finish the nearest milestone, push all
completed work, and **hold for a new task-and-agent workflow**. That instruction
supersedes the open-ended continuation plan below. Preserve unrelated changes in
the shared checkout and the separately added downstream authorization-history goal.

The objective remains the [symbolic runtime contract](symbolic-runtime.md):
execute real, unchanged programs against symbolic environments and retain their
conditional outcomes, effects and unfinished work. Concrete execution uses the
same representation. Security, correctness and performance consumers interpret
that result; their classifications do not become VM concepts.

## Starting baseline

At `d5ecf19386c098d71f23d2d7903bf49f5a9a6c14`, the CLI runs the unchanged
pico-static-server 3.0.3 HTTP example through CommonJS loading, server setup and
a bounded startup queue. The result retains successful startup with its original
console message and a waiting server, or an unhandled symbolic bind failure.
It does not execute incoming requests. The validated baseline has 2,382 passing
specs and 46 existing skips; neither count is a conformance claim.

## Parallel work and integration gates

| Workstream | Intended result | Review evidence |
| --- | --- | --- |
| Incoming events | A generic persistent registry explores no arrival or one eligible external event; HTTP provides parsed request arguments through the registered listener. | Unknown `/crash` versus ordinary URL, current closure/listener state, multiple and conditional servers, no request after failed startup, actual CLI graph. |
| Unfinished branches | Explicit unsupported/budget boundaries retain their exact state while supported sibling branches continue. | Both branch orders, nested choices, throwing siblings, queue state, guest catch/finally distinction, unexpected implementation errors remaining failures. |
| Filesystem acquisition | A read-only adapter acquires reached concrete observations for a generic open filesystem state, with uncaptured entries distinct from missing entries. | File/miss/directory, lazy contents, repeated observations, permissions, symbolic resource availability, symlink/nonregular/binary boundaries, pinned Node comparisons. |
| Integration and next target | Assemble these shared pieces in the CLI, run pico requests, and select a larger immutable npm fixture and dependency graph. | No application-specific VM shortcuts, exact source provenance, completed and unfinished paths in one result, regression/native comparisons. |

These workstreams form the completed integration milestone; they do not claim
full input or schedule coverage. The [roadmap](roadmap.md), PRs and
[gap backlog](implementation-gaps.md) record the supported boundary.

Keep ownership separate while work proceeds: language/completion machinery,
Node host semantics, environment acquisition, CLI assembly/serialization, and
consumer inspection. Agree on shared types before integrating; an adapter must
not make an unsupported operation appear pure or a guessed environment appear
concrete. Node public builtins are the host boundary. Ordinary npm code stays
interpreted JavaScript.

## Current integration and following waves

The reviewed integration increments add object declaration bindings, incomplete
execution leaves, read-only filesystem capture, shared warning scheduling,
POSIX resolve and process cwd, opaque callable identity, and bounded histories
through two incoming events. The focused PRs retain the review history. Review caught a provider-choice continuation correlation defect and a
directory-name alias/absence defect. Focused fixes preserve those regressions
in the combined validation. Independent enumeration review also rejected sparse
or inherited observation entries. Final array review exposed legacy methods
that guessed inherited-hole results; those reached cases now stop explicitly.

1. Assemble the actual CLI environment. Preserve pico's completed OPTIONS/405,
   waiting and bind-failure alternatives beside GET/HEAD open-URL boundaries.
   Then add a supported explicit input environment so requests and filesystem
   alternatives can be supplied through ordinary VM state, without test-only glue.
2. Keep two-request stateful proofs (arm then fire), current listeners/providers,
   intervening/final jobs and incomplete callback state. No bounded run claims
   every future timeline; repair lost correlations before broadening the horizon.
3. Unchanged sirv 3.0.2 and its three pinned dependencies now import in the assembled
   CLI. RegExp literal state now survives evaluation and CLI graph serialization. Its
   default factory now executes two regex pushes and reaches the explicit
   Array.concat boundary. Extend shared
   language semantics there, then follow actual blockers through ordinary
   arrays, directory enumeration, loops, file metadata and streams. Native
   references retain GET, HEAD and 404; symbolic request coverage is still work.
4. Grow explicit environment input, graph portability and resumability alongside
   demonstrated needs. Generic outgoing effects will support separate security,
   debugging and performance consumers; VM values do not carry those policies.

Target selection is evidence-driven: inspect complete immutable sources and
licenses, retain integrity manifests, and acquire archives without installation
scripts. Do not replace a difficult package with a rewritten toy while calling
it a real-package result. Keep pico and existing proof examples as regressions.

## Merge discipline

Each implementation starts with specs and meaningful boundary/unknown cases.
Agents use independent branches/worktrees and prepare focused PRs. The
orchestrator reads the changes, resolves shared contracts, requests corrections
or adds adversarial specs, and merges after full tests and typecheck pass.
Revalidate integration changes and check CI for the resulting revision. Reuse
completed checks when no changed behavior or merge concern warrants repetition.

Reconcile every new guard, assumption and precision limit with stable backlog
IDs. Rerun the documented inventory and account for every historical skip.
Documentation must distinguish a completed result from an unfinished branch;
retained functions are not automatically analyzed callbacks. CLI stdout remains
exactly the reference graph (`roots` and `nodes`), with diagnostics on stderr.
Do not add policy verdicts, project-status prose or backlog IDs to runtime state.

## Handoff at the pause

The milestone is the assembled default Node environment plus real CLI import of
unchanged sirv and its three dependencies. Pico's bounded incoming exploration
retains completed OPTIONS/405 responses, waiting and binding failures alongside
GET/HEAD URL-parser boundaries. Sirv's default factory creates two distinct regex
values, appends them through shared Array.push, then stops at the unimplemented
Array.concat read with its exact state retained. The runtime emits the same bare
graph, with no consumer policy or project status fields.

Resume only after the new workflow is specified. Candidate tasks are ordinary
Array.concat/forEach to move the actual sirv factory forward; shared for-loop
semantics (including lexical iteration scopes and Empty/UpdateEmpty completion);
and explicit environment authoring for concrete/finite pico URL and filesystem
proofs through the CLI. The interrupted loop worktree has **no implementation**;
its design notes are not a completed feature. RegExp matching, Stats metadata,
streams, unrestricted schedules and portable resumption remain separate gaps.

## Validation and review record

Final local validation on 2026-10-07 used pinned Node v24.21.0: **119 suites,
2,851 passing tests, 46 existing skips**, plus a clean TypeScript check. The
selected Test262 corpus is **250 complete files / 491 variants**. The gap audit
reconciled 94 source files, 119 spec files, 65 open gap groups, the complete
46-file skip inventory, and documentation links. None of these counts is an
all-path or full-conformance claim.

Focused review history remains in PRs #52–#69: plan (#52), filesystem capture
and CLI connection (#53/#58), incoming event exploration (#54/#61), pinned sirv
(#55), unfinished branches (#56), POSIX resolve (#57), object bindings (#59),
shared warnings/process (#60/#62), opaque functions and typed boundaries
(#63/#64), directory enumeration and observation validation (#65/#67), provider
correlation repair (#66), assembled environment (#68), and regex literals (#69).
The closing milestone also includes the interrupted shared-array commits
`678dc69`/`0f48e89` and the independently reviewed inherited-element repair
`121b4a3`, replayed into the integrated linear history. The temporary process/path
spike is superseded by the committed process model and identical integration spec;
it is not additional unfinished feature work. Unrelated website files remain
outside this milestone.
