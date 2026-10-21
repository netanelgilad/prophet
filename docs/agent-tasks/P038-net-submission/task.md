# P038: pending outbound IPv4 sockets and deferred submission

Base `8052b02f9290a334e3355544dbf11eac7794dd92` (published P037).
Branch `agent/p038-net-submission`. Owner: Codex root and its own subagents,
as explicitly requested by the user. Status: approved design; implementation and
independent validation underway. No completion or publication claim yet.

Supply a shared Node boundary for `net.connect`/`net.createConnection`, preserving
public return, caller continuation, the queued `connectionAttempt` listener and
deferred binding submission as distinct stages. A fresh per-submission Boolean
retains admitted pending versus unresolved immediate failure. No native transport
runs during exploration. No HTTP client, DNS, established connection, complete
stream lifecycle, dependency permission decision or malware detection is claimed.

The [contract](contract.md) contains the agreed scope, state and acceptance checks.
The [native findings](native-findings.md) preserve independent pinned Node24.21.0
observations and whole upstream candidate limitations. Root and reviewer corrected
an early resource-gate idea: fresh POSIX TCPWrap initialization uses AF_UNSPEC;
OS descriptor acquisition occurs during deferred submission, not before public
return. Allocation failure remains a generic fatal-native boundary; no catchable
pre-return errno is invented. Public connectionAttempt precedes binding dispatch
and is not proof of an OS connect syscall or packets.

## Ownership and acceptance

- environment_wiring: net model, runtime registration, core behavior specs.
- environment_scenarios: actual CLI/dependency fixtures and pinned compatibility.
- semantic_review: independent adversarial specs and source review.
- Root: generic EventEmitter registration-policy guard/specs, docs, gap inventory,
  validation and publication. Shared helper changes require coordination.

Specs precede implementation. Preserve known input alternatives, false submission
frontiers, callback throw/stop prefixes and canceled histories. Verify exact
source/origin/socket identity linkage without inventing async ancestry. Queue
completion leaves network callbacks pending. Full suite, typecheck, four gap scans,
complete Test262/skipped inventory, independent review and exact candidate CI
precede publication to master. No subagent commits or pushes.
