# Product direction

Prophet is a use-case-agnostic symbolic execution runtime: for a chosen program
and runtime, it transforms a symbolic starting environment into the resulting
symbolic environment, with concrete execution as the fully known case. Prioritize
the implementation-language-independent CLI and [runtime/state contract](docs/symbolic-runtime.md);
security, debugging and performance tools consume its results and own their
policies, classifications and verdicts ([roadmap](docs/roadmap.md)).

# Repository workflow

Work directly on `master` and push validated changes to `origin/master`, as
requested by the user. Preserve unrelated work in the shared checkout. PRs
#23–#51 are historical; the autonomous worktree wave and its review evidence are
recorded in [the handoff](docs/autonomous-development.md). On 2026-10-07 the user
asked to finish the nearest milestone, push it, and then hold for a new task-and-agent
workflow. Do not start another autonomous feature wave until that workflow is
provided. Repository protections remain in force.

Develop toward full Test262 coverage and advanced symbolic evaluation by adding
specs and extending the shared VM to satisfy them. Concrete execution remains a
subset of symbolic execution; preserve JavaScript semantics in both.

The durable product goal is useful analysis of real, unmodified Node applications:
identify conditions leading to unhandled exceptions or unwanted state/effects,
and prove useful properties across explicitly declared inputs and environments.
Read [the runtime/state contract](docs/symbolic-runtime.md) and the relevant
milestone in [the roadmap](docs/roadmap.md), [real-world target](docs/real-world-target.md),
or [downstream security use case](docs/agent-security-analysis.md) when choosing
an increment. The CLI now runs the unchanged pico HTTP startup script **without
an explicit environment file** through a bounded startup queue: success retains
the waiting server and startup output; bind failure retains its unhandled Error.
Follow [the acceptance criteria and remaining work](docs/roadmap.md#next-milestone-pico-startup-through-the-cli-with-no-environment-file);
explicit environment authoring and full resumption follow, library exports are
optional, and deeper host modeling follows demonstrated blockers. The first external
target is pinned `pico-static-server` 3.0.3: evaluate its complete server setup and
request handling, classify filesystem failure paths, and eventually replay a
concrete violating case in pinned Node. It is a target, not a completed proof or
a claimed new vulnerability. Prefer the smallest reusable feature that advances
the current roadmap milestone; existing health/discount examples remain regression and integration
milestones. Then grow to larger applications and dependency graphs. Keep source
and dependency provenance, proof domains, unknown results, and unsupported paths
visible; neither sampled runs nor partial coverage justify an all-path claim.

Build the CLI from generic conditional state/effect graphs. The CLI composes
CommonJS loading, read-only filesystem observations, POSIX path and declared
process cwd, legacy URL warnings, and HTTP setup on a shared persistent queue.
Bounded incoming exploration retains zero, one or two request histories and
classified unfinished branches beside completed outcomes. Keep the parsed-event
input domain and explicit horizon visible in docs. The next larger target is
[pinned sirv and its three dependencies](docs/sirv-target.md): unchanged imports
now complete; factory execution exposes further shared language/host gaps.
Node public built-ins remain the modeling boundary.
CLI stdout contains the graph (`roots`/`nodes`) directly. Do not wrap it in a
report with hand-written model-domain or limitation prose, or relocate that
prose into graph nodes. Runtime diagnostics use stderr; implementation boundaries
belong in docs/backlog. Represent actual environment facts as modeled state.
Keep test inspection helpers and backlog IDs out of the public state schema;
preserved callbacks are not already-analyzed future behavior. Follow the
[callback/execution distinction](docs/symbolic-runtime.md#conditional-history-and-callback-knowledge)
when adding automatic symbolic event exploration.

Keep behavior examples in `test/*.spec.ts`, with interpreted source, explicit
input assumptions, and assertions together. Run individual spec files through
the existing Jest command (for example,
`node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/unknown-length.spec.ts`).
Do not create standalone example programs, custom example runners, or npm
scripts for individual examples. Use helpers only when specs share real setup.

Start each feature with specs for its intended behavior and meaningful boundary
cases. For language semantics, activate relevant complete, unmodified Test262
cases and implement required runner support. For symbolic reasoning, assert both
valid proofs and results that must remain unknown; use independent concrete
checks when useful. Implement reusable operations and inference rules, never
recognition of a sample function's name or source.

Host APIs need their own compatibility specs. CommonJS/`require` and Node APIs
are outside Test262: follow a pinned Node release's behavior, use suitable
complete upstream cases, and compare local fixture specs with that Node runtime.
Keep host coverage and language coverage distinct, and record unsupported cases.
See [the proof roadmap](docs/roadmap.md) for the module-loader acceptance criteria
and the goal of modeling side-effecting functions through a Node `http` server.
Start at Node host APIs: interpret the application's module imports, server
creation, listener registration, and listen call, then deliver modeled request
events through the registered callbacks using the shared VM. Express and its
dependencies are later ordinary interpreted JavaScript; do not introduce
Express-specific VM models or infer routing/body parsing from a handler test.
External effects must preserve path conditions, ordering, state changes, return
values, and failures. Validate models against independent concrete behavior;
do not execute real external writes during symbolic exploration or silently
treat unknown effects as pure. Direct handler tests are a stepping stone, not
evidence that Node HTTP setup/dispatch or Express itself has been analyzed.

Treat narrowed input domains, unsupported-analysis errors, and skipped tests as
explicit implementation gaps. Do not silently narrow an input to make a proof
pass. When expanding a supported case, replace its rejection spec with assertions
for the actual language behavior and symbolic result. Full Test262 conformance
is the goal, not a claim justified by the currently selected corpus.

Maintain [the implementation-gap backlog](docs/implementation-gaps.md) in every
feature increment. Reconcile all new or changed unsupported guards, narrowed domains,
environment/scheduling/success assumptions, legacy fallbacks, precision limits,
and skipped tests against its stable IDs; record deferred work even when it is
outside the immediate roadmap. Successful binding, resource availability, and
successful external writes/flushes are assumptions to track, never silently
established facts. Update affected boundary docs and upstream candidate lists.
Preserve residual gaps when adding partial support, and retain closed entries
with the implementing commit or PR and boundary/failure/symbolic/upstream test evidence.
One passing example is not closure. Rerun the documented scans and reconcile the
complete skipped-file inventory before publishing; the audit is not a claim of
complete JavaScript or Node coverage.

Run affected specs during development, then the full suite and typecheck before
pushing each increment. See the README's spec-first workflow for current examples
and proof limitations.

When sharing screenshots or other local images in chat, attach and render the
image content inline; do not provide only a local file link.
