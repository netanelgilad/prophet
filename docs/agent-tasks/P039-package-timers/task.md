# P039: unchanged dependency startup and pending socket timers

Base `8efe72bd18a46f29641d331f5c32ae895cf27c2d`, independently reviewed and locally
validated P038 candidate. It is now published after CI39672451837 passed. Branch
`agent/p039-package-timers`; Codex root and its own subagents, per owner direction.
Status: approved design; spec-first implementation/independent review underway.

The [unchanged source scout](target-scout.md) found the same concrete prerequisite
independently in two reviews: whole node-notifier5.4.0/lib/checkGrowl.js calls
positional net.connect then socket.setTimeout100 before queued transport. Generic
TCP completion alone cannot advance past those earlier calls. This task implements
those shared Node operations, without a package-specific VM rule or source edits.

[Contract](contract.md) and [independent design review](design-review.md) cover
numeric duration errors, write-before-validation, reset/zero cancellation,
persistent unrefed arm state, queued destroy and exact source/graph identity.
No absolute deadline, elapsed time, expiration provider or completed availability
check is invented. The subpath's default localhost remains outside the explicit
IPv4 input scenario; its package-main platform/child-process behavior is separate.

- environment_wiring owns net.ts and node-net-timeout.spec.ts.
- environment_scenarios owns node-notifier-startup.spec.ts, real CLI/provenance and
  controlled native API fixtures (never executing the package natively).
- semantic_review owns node-net-timeout-review.spec.ts and independent review.
- Root owns docs, audit, validation, integration and publication; no worker pushes.

The complete installed package is available unchanged. Source/manifest digests
match cached Yarn ZIP entries and the archive checksum in yarn.lock. These are
local byte/provenance facts, not a full dependency-tree attestation or current
security judgment. New temporary phin/tcp-ping comparisons were never installed,
executed, or made a dependency of this increment.

Full suite, typecheck, four gap scans, complete Test262/skipped inventory and
independent review precede exact-candidate CI and publication. Preserve19 unrelated
owner files. Capture any failed test/harness correction honestly.
