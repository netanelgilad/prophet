# P040 root review

**Subsequent finding — 2026-10-22:** P041 independent review demonstrated that
a trusted completion model returning a finite choice of full/partial records
crashes when the completion continuation reads the joined value without selecting
a record first. This admitted-domain finding reopens acceptance. P040 publication
was held; the correction, regression and combined validation are recorded in
[P041](../P041-socket-end/task.md). The review below preserves the earlier evidence.

Implementation `d6dfabaffc7a7896de737c3d9152d126dc69f89a` is accepted within the
[declared completion prefix](../../node-net.md#p040-selected-completion-prefix).
Root read the complete production diff, core/independent/integration specs,
shared registry/checkpoint implementation and pinned native evidence. Independent
review accepted the final source hash with18 passing probes. No remaining concrete
correctness finding was identified in the admitted domain.

## Corrections and evidence distinctions

Core first run had14/14 genuine behavioral failures before production edits.
Independent first/expanded runs had9/9 and16/16 genuine failures; two later
correlation/environment-stop probes were first run green and are regression
coverage, not retroactively claimed red evidence. The actual CLI's first red
showed missing completion delivery while retaining existing submission behavior.

A descriptor audit found an invalid trusted completion record with a hidden
nonenumerable extra accessor was accepted. Its new regression failed1/15 before
correction. Current-heap descriptors/raw keys and key history are now checked
without executing native getters;15 core and98 affected tests pass. Invalid
configuration remains a configuration error, never a guessed guest transport error.

Independent review identified a needlessly reduced cancellation-test horizon.
It remains2, as does the no-call import case. Only submission-prefix assertions
move to explicit0, while new actual CLI tests cover delivered TCP and shared
HTTP/TCP histories at1/2. This preserves canceled-source ineligibility coverage.
Three integration suites pass23 tests; the final identity assertion rerun passes7.
Root CLI argument regression checks pass41. No new skipped test was introduced.

## Semantic conclusions

Only an admitted submission registers a provider. Eligibility/waiting/horizon0
allocate no completion facts. Selection records stable Boolean identities from
the current heap; consumption and connecting=false precede status processing.
Failure and partial flags stop at their first unknown error/stream transition.
Full-duplex success refreshes an active old-delay timer and executes actual
connect/ready callbacks, preserving once removal, receiver identity, current
listeners and synchronous order. Public invalid timeout values do not replace
active arm delay; canceled arms are not revived. Historical heaps remain intact.

A callback throw/typed stop suppresses later stages. Typed read/callback frontiers
retain the active external source and queued jobs; they do not fabricate a normal
delivery return or permit a second event. The unchanged complete checkGrowl source
now executes its connect listener and reaches socket.end lookup before its caller's
availability callback. Source/manifest identity and dynamic origins are retained;
deferred callbacks do not restore registration activation.

The ten-case controlled pinned Node fixture preserves Socket._read and intercepts
connect/readStart without invoking native transport or package code. Native
sentinel throws are exception evidence only, and fixture catches do not prove
uncaught-program recovery. No lifecycle/OS outcome claim is based on the dummy
handle's error-message details. Four complete upstream cases were reread; none
can run whole in this prefix and none is counted as covered.

## Limits and validation

Default independent flags overapproximate callback inputs; they are not a claim
that every combination is physically reachable. Error construction, partial
stream handling, reading, end/close, timer expiry, arbitrary scheduling and
resumption remain gaps. Custom-record validation may enumerate accumulated keys;
only default outcome creation/retention is fixed-sized. Existing host allocation,
registry/history/graph growth and evaluation-budget limits remain explicit.
No stable implementation gap or package capability/incident claim is closed.

Final full suite:187 suites/5403 passes/46 historical skips; typecheck exit0.
Reviewed source/spec hashes are unchanged throughout. Test262 remains484 complete
files/959 variants,43 parse-negative files/85 variants and46 historical skipped
files, reconciled against the full documented inventory. Four scans are retained
in evidence.json. Exact-candidate CI precedes publication and remote-SHA readback;
root preserves19 unrelated owner files. No subagent commits or pushes.
