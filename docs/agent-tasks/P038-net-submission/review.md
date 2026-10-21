# P038 root review

Implementation `f30bb9bc74a22845e62d0827ee9481a8bfa22264` is accepted in the
[pending TCP domain](../../node-net.md), subject to final validation/publication
below. Root read the complete net implementation, runtime/index changes, shared
EventEmitter policy, and core/integration/independent specs. Independent review
accepted exact source hashes with20 passing probes, including a pinned no-network
witness for the native Socket end listener. No remaining actionable defect was
identified within this declared prefix.

## Corrections and evidence distinctions

- Core and independent first runs failed at missing net module import, with zero
  assertions. They are spec-first suite-load failures, not semantic red evidence.
  The integration baseline genuinely executed the CLI and failed because net was
  unregistered. Its expanded baseline had9 failed CLI cases and a passing native
  oracle. Final integration has10 passing tests, including8 native scenarios.
- Core harness corrections installed fixture values in the loader global and
  ensured omitted submit actually exercised the symbolic default. Core19 passes.
- Root's generic host event-domain specs initially had4 failures/2 passes:
  unsupported names were accepted or meta-events threw legacy untyped failures.
  A typed registration guard closes that bypass, including borrowed methods.
- Root and independent review both identified omitted native internal listeners:
  public end emit/count cannot return a fabricated empty result. Root's two
  public-observation specs failed before correction; reviewer probes ran after
  correction and passed, despite a historical log filename containing red. Public
  net emit/count now stop with typed frontiers for every event name. Ordinary
  unrestricted EventEmitter behavior is preserved.
- Full-suite validation exposed one obsolete generic rejection assertion using
  net import. The test now uses still-unregistered tls; new integration assertions
  establish successful net aliases/imports. Independent review accepted this
  two-line migration; its focused21 tests passed. No test was skipped or weakened
  to conceal a remaining net behavior failure.
- Two whole-suite attempts ended with exit129 without a reported assertion
  failure or final summary. One intervening completed run reported the obsolete
  import assertion (180 suites passing, one failing). Neither interruption is a
  passing validation or a diagnosed model error. Final validation uses a detached
  runner, exact commands/log hashes and before/after source/spec hashes.

## Semantic conclusions and limits

Public invocation, pending return, caller continuation, attempt event and deferred
submission remain distinct. A fresh per-submission Boolean is stable in persistent
state; false retains a normal submission result and stops at unmodeled cleanup.
It does not turn into a catchable public net.connect error. No pre-return resource
gate was invented. Queued cancellation preserves pending close and prevents event
and submission; destroy during initiation is explicitly unsupported.

Shared queue effects retain socket identity and direct source origins without
resurrecting registration-time activation. Retained callbacks, admitted pending
submission and a drained queue are not completed connectivity or future behavior.
No TCP completion/close provider, HTTP event-horizon change, native network I/O,
package capability verdict or malware detection is claimed.

All new guards/configuration checks and narrowed shape/value/phase domains are
reconciled under NET-001, HOST-001/002, EVENTS-001/002, REPORT-001 and SECURITY-001.
Host NUL checking and accumulated key enumeration remain explicit resource gaps;
only later IPv4 parsing first rejects strings longer than15. Pristine intrinsic
prototype admission conservatively rejects conditional altered-heap records too.
Generic allocations, errno correlations and shared descriptor pools remain open.

Eighteen complete upstream files were inspected, none activated or relabeled as
covered. Fixture evidence is distinct from upstream conformance. Test262 selection
remains484 complete files/959 variants,43 parse-negative files/85 variants and46
historical skipped files; the complete inventory is retained. No stable gap closes.

## Validation and publication

Final full suite:181 suites/5319 passes/46 historical skips; typecheck exit0.
Exact commands/durations/log hashes and unchanged reviewed file hashes are in
evidence.json. Exact-candidate CI remains required before publication. Master publication must preserve all19 unrelated
owner files and verify the remote ref. Root remains responsible for integration;
no subagent has committed or pushed.
