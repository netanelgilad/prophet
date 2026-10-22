# P043: pending shutdown completion and writable finalization

Base master45416bd7401c1bbe243daf8299654e5f7eeb6af0, published after CI39719425357. User explicitly requested this next roadmap increment. Root and its own Codex subagents implement in shared branch agent/p043-shutdown-completion; primary master retains unrelated owner files.

Status: design and native compatibility contract approved; implementation and focused tests pass; independent final review and full validation pending.

- shutdown_core owns production and new core spec after design approval.
- shutdown_native owns pinned native compatibility and actual CLI/package integration specs after design approval.
- shutdown_review owns independent specs and full semantic review.
- Root owns the contract decision, docs/backlog/wiki, full validation, integration and publication.

The target is one selected asynchronous shutdown callback on the first empty end of a fresh full-duplex socket. Preserve synchronous prefinish, later finish queue ordering, callback throw/typed interruptions, current state and waiting alternatives. Native afterShutdown ignores its status; arrival/finalization must not assert successful OS shutdown. Keep policies and verdicts downstream of the VM. No real external writes or native target package execution.

Start with meaningful failing specs. Approval of a contract does not accept its implementation. Full suite/typecheck, independent semantic review, four gap scans, complete skipped inventory reconciliation and exact candidate CI precede publication. Only root commits and pushes; no resets or paid services authorized.
