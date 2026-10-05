# Autonomous VM development

The user requested sustained autonomous progress on **2026-10-05**, including
parallel Astra agents at high reasoning effort, isolated worktrees, and focused
PRs reviewed and merged by the orchestrator. Continue into subsequent increments
without requiring approval at each milestone. This replaces the prior
master-only workflow; preserve unrelated changes in the shared checkout.

The objective remains the [symbolic runtime contract](symbolic-runtime.md):
execute real, unchanged programs against symbolic environments and retain their
conditional outcomes, effects and unfinished work. Concrete execution uses the
same representation. Security, correctness and performance consumers interpret
that result; their classifications do not become VM concepts.

## Current baseline

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

These are intended results, not claims that the branches have landed. The
[roadmap](roadmap.md), PRs and [gap backlog](implementation-gaps.md) record the
supported boundary after each merge.

Keep ownership separate while work proceeds: language/completion machinery,
Node host semantics, environment acquisition, CLI assembly/serialization, and
consumer inspection. Agree on shared types before integrating; an adapter must
not make an unsupported operation appear pure or a guessed environment appear
concrete. Node public builtins are the host boundary. Ordinary npm code stays
interpreted JavaScript.

## Following waves

1. Compose the three workstreams with the real CLI. First preserve useful pico
   request alternatives and honest remaining URL/path boundaries; then supply
   a supported explicit request domain and reproduce readable, missing and
   failing filesystem outcomes without hand-built host glue.
2. Extend bounded event exploration to state shared across successive requests.
   A useful regression arms state on one request and throws on a later request.
   Retain shorter histories and event limits; two events are not all schedules.
3. Pin a larger static-server package with real transitive dependencies. Use
   actual reached blockers to prioritize CommonJS package resolution, language
   features, filesystem enumeration/metadata and streams. Keep the initial
   no-request startup milestone separate from request coverage. Compare each
   supported behavior with pinned Node before claiming it.
4. Grow explicit environment inputs, serialization and resumability as their
   semantics become necessary. Then extend generic outbound effects and let a
   separate security consumer apply policies to the same execution graph.

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
