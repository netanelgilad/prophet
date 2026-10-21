# P040: selected TCP completion through actual callbacks

Base P039 candidate `5afe23a62f055c4a2462b39f05458d3f93f03538`, with184 suites/
5362 passes/46 historical skips, typecheck and independent review accepted.
P039 candidate CI39674392064 passed and is published. This separate branch
`agent/p040-tcp-completion` develops from that immutable checkpoint. Status:
implementation and independent review accepted;187 suites/5403 passes/46
historical skips and typecheck pass. Exact-candidate CI/publication pending.

[Contract](contract.md), [independent design review](design-review.md), and
[pinned controlled native findings](native-findings.md) define the exact prefix.
The shared event registry selects an admitted pending socket or waiting. Fresh
completion facts remain stable in the graph. Full-duplex success runs actual
connect then ready callbacks; earlier callback boundaries win, otherwise analysis
stops before unmodeled read(0). Failure and partial flags stop before their first
unmodeled transition. The unchanged checkGrowl callback reaches socket.end before
its caller's availability callback. This does not complete the package operation.

- environment_wiring owns net model, runtime/index wiring and core spec.
- environment_scenarios owns CLI/package/native integration specs and migration
  of explicit startup-only assertions to horizon0, with new delivery coverage.
- semantic_review owns independent regression specs and complete diff review.
- Root owns CLI help, docs, provenance/audit, validation, integration and push.

Only root commits/pushes. The user explicitly replaced external Atlas workers
with Codex and its own subagents. No external worker retry is active.
Full suite, typecheck, four scans, complete Test262/skipped inventory, independent
review and exact-candidate CI are required before publication. Preserve19 owner
files. No timer/close provider, native network/read or package execution occurs.
