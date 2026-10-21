# P041: first empty socket end and the actual dependency callback

Base P040 candidate `6cec38a17dcc08d13d92e4d9f5b1a59c51d1e01f`, with187 suites /
5403 passes /46 historical skips, typecheck and independent review accepted.
Branch `agent/p041-socket-end` develops separately while immutable candidate
CI39675598027 passed, but publication is held for the correction below.
Status: implementation and independent review accepted after both fixes; combined
full validation running. Earlier P040 CI is not sufficient for this new tree.

The [final contract](contract.md) supersedes an initial three-outcome proposal.
[Independent review](design-review.md) and [native findings](native-findings.md)
verified that a pristine full-duplex connected POSIX socket's first empty end
queues shutdown locally and returns0 before the OS syscall. Root read the exact
JS/C++/libuv path and approved this state-derived prefix. An artificial admission
Boolean would introduce unreachable outcomes in this specific domain. Future
shutdown success/failure/cancellation remains unknown and no provider is added.

- environment_wiring owns net, any reusable empty-writable transition, and core spec.
- environment_scenarios owns real CLI/native end integration and unchanged helper spec.
- semantic_review owns independent end specs and final full semantic review.
- Root owns docs, gap/upstream audits, validation, integration and publication.

Only root commits/pushes. User direction is Codex plus its own subagents, no
external Atlas worker retry. First behavior-red specs must run before source edits.
Full suite/typecheck, four scans, complete Test262/skipped reconciliation,
independent review and exact-candidate CI precede publication. Preserve19 owner files.

The actual unchanged helper can call its user's callback with null,true after
end returns. This is the package's report on the selected full-duplex branch,
not a Growl protocol response, successful shutdown, closed transport or all-path
security verdict. Normal callbacks still reach P040's read(0) frontier. Public
writableEnded reflects ending before internal ended; prototype-call dispatch and
all admitted lifecycle facts require guards. Repeat/arguments/other phases remain
explicitly unsupported. No timer refresh, finish/error/close or native I/O is added.


## Inherited completion correction

Independent P041 review added a valid completion model returning a finite choice
between complete records. P040's continuation attempted to read the joined value
without selecting a record and crashed. The new19th independent case failed
while the original18 passed. P040 publication was held before any master push.
This increment must correct record selection and preserve each branch's outcome,
state and callback behavior. The end guard must also use branch-local check arrays
rather than accumulating fields across conditional-record continuations.
Earlier P040 green validation remains historical; the corrected combined tree
requires independent review, full validation and its own exact-candidate CI.
