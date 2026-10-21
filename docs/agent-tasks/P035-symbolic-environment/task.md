# P035 — explicit symbolic starting inputs through the CLI

Owner resumed sustained roadmap work on 2026-10-21: useful symbolic evaluation
of real unmodified packages, eventually a defensible automatic Shai-Hulud finding.
Base: 573f8cca86225a7c4fa1491d76f936bff413d22d (reviewed P012–P034 integration).
Worker: Atlas OpenCode LongCat 2.5 Preview Free, build/high; one worker total.
Muse initial launch was permanently rejected as deprecated before any tokens/tools.
This is a separate free design pilot, not quota rotation; full review remains.
Worktree: /Users/netanelgilad/.codex/worktrees/p035-longcat-environment/prophet
Branch: agent/p035-longcat-environment. Primary checkout is read-only.

## Design gate first

Read AGENTS, docs/agent-workflow.md, docs/symbolic-runtime.md, docs/roadmap.md,
docs/cli.md, docs/external-events.md, docs/node-http.md, docs/node-filesystem.md,
and the integration-2026-10-21 review. Inspect actual CLI/runtime/provider machinery.
Write design.md ONLY, then stop for orchestrator review. No production/test edits
yet. Propose a small runtime-oriented JSON --environment input slice; identify
exact schema, validation/budgets, default/omitted meanings, modeled state retention,
relative path resolution, provenance, identities/correlations, arrival semantics,
and an executable red-spec plan. Include any smaller split needed. Do not invent
full snapshot resumption or declare the complete state contract solved.

## Intended first outcome

A real CLI invocation can declare supported symbolic starting facts and finite
parsed request inputs, then analyze unchanged pico's actual startup/request
callbacks without caller VM objects or handler glue. Retain zero-arrival/waiting,
bind errors, resource errors, completed concrete/finite-URL reads/missing-index
paths and reached unsupported siblings. Sirv remains an unchanged-source regression
and motivates later stream scheduling; no automatic stream-drain feature in P035.

Prefer named primitive Booleans/strings, references, and Boolean-selected finite
choices reusing VM values (not separately sampled executions). One named value
must retain identity and correlations across resource facts and event fields;
fresh per-arrival inputs and shared initial unknowns must be distinguished.
Start with existing filesystem descriptor/open-ordering facts and HTTP parsed
method/URL choices plus concrete headers if a coherent bounded design. Keep bind
outcomes default symbolic; bind-profile authoring, process.env, arbitrary heap and
closed filesystem trees may be separate increments. Explain every excluded field
and reject unknown/malformed input rather than silently ignoring it. Input authoring
is data, never an eval/native JS builder. Core state must not contain security labels,
policy verdicts, backlog IDs or test-inspection prose.

## Acceptance planning

- CLI option parsing, missing/duplicate/unreadable/malformed/version/type/reference
  failures; validation completes before target interpretation/observations.
- No-environment behavior retained; stdout roots/nodes only, diagnostics stderr.
- Concrete and finite choice method/URL requests on unchanged pico, native benign
  controls, failure branches, repeated identity correlations, unused values visible.
- Two arrivals use invocation-time state and preserve shorter histories; specifying
  request domains does not force arrival, successful bind, successful IO or transport.
- Unknown strings remain unknown; unsupported continuation retained; no domain
  narrowing, success assumption, source matching or fake effect delivery.
- Bound bytes/node count/edges/depth/strings/choice expansion before host work;
  malformed or cyclic references reject, no prototype pollution through names.
- Complete default regression suite and typecheck before publication. Host changes
  need pinned Node24.21.0 controls; no Test262 claim for a CLI schema.
- Update stable gap IDs REPORT-001/HOST-002/HTTP-001/FS-002 as applicable; full guard,
  assertion/skip inventory; all46 existing historical skips retained and reconciled.

## After design acceptance

Only then implement red specs followed by generic code. Proposed ownership:
src/cli/{arguments,main,runtime,environment}.ts (new environment parser allowed),
minimal generic provider-input seam in src/node/http.ts, focused specs including
unchanged-pico real CLI subprocess coverage; docs/cli.md, docs/external-events.md,
docs/symbolic-runtime.md, docs/implementation-gaps.md and one wiki article.
Request a split before modifying solver/serializer/core representation or broadening
host semantics. Root owns task/ledger/roadmap/status, independent holdouts and integration.

Use pinned binary /tmp/prophet-node-24.21.0/node-v24.21.0-darwin-arm64/bin/node
(prepend its directory to PATH, set PROPHET_NODE_BINARY to same). Existing Jest
command only. Shared node_modules may be symlinked; no install/lifecycle scripts.
Keep complete logs in /tmp/prophet-p035; record exact tested revision, commands,
exit codes, counts and generated hashes. Commit implementation/tests before full
suite; separate evidence-only commit allowed; freeze under review. No pushes,
merges, main edits, model rotation, paid fallback, quota reset, real target writes,
network sends or subprocess execution, or additional workers. Preserve all unrelated
work. Stay on the assigned worker through provider limits; report actual retry info.
