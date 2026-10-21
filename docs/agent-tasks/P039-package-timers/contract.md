# P039 approved scope: unchanged package reaches pending TCP submission

From reviewed/locally validated P038 candidate8efe72b (CI/publication pending), implement only the demonstrated earlier blockers in the
whole unchanged node-notifier@5.4.0/lib/checkGrowl.js (SHA256
6d8fdba983f2589ac744b68437918c63e679a962c4e06007b4f81cb089fdb103).
Read target-scout.md/evidence, next-design.md final refinement, timer-review.md.
This is a package subpath under explicit caller IPv4 config, not package-main or
complete availability/network analysis. No native package/lifecycle execution.

1. net.connect/createConnection(port, host[, callback]) support explicit numeric
port, nonempty non-NUL host string validation and then canonical IPv4 routing,
reusing existing options semantics/order. Preserve original HostCall args/origin,
no duplicate fabricated public call. Numeric port invalid/hostname precedence and
-0 normalization match P038. Missing/default host, nonnumber port, extra arguments,
nonfunction callback, IPC remain typed unsupported. Finite values/options choices
must preserve correlations and normal/guestthrow/stopped siblings.
2. Socket.setTimeout(msecs), exactly one arg, phase queued only. Accept concrete
integer0..2147483647, negative numeric including fractions, nonfinite numeric
errors, finite symbolic choices. Positive fractions/overflow/nonnumbers/open
values/callback overloads and closing/initiating/submitted phases are explicitly
unsupported before sidewrites. Pristine relevant intrinsic defaults rechecked at
setter entry; altered prototype/property domains must not bypass host semantics.
3. For supported numeric values write public socket.timeout to the original VM
number FIRST. Negative/nonfinite then produces pinned RangeError/ERR_OUT_OF_RANGE,
leaving existing timer unchanged. Preserve -0 in public timeout; zero disables
active schedule. Valid positive reset clears previous arm then retains a new
abstract pending arm with concrete delay and refed=false. An arm is schedule
identity, NOT native Timeout object identity (Node may reuse that object). No
clock read, invented absolute deadline, native timer, mutable counter or event
provider. Keep public timeout separate from active arm delay so caught invalid
setter leaves the correct old active schedule. Before first setter, timeout is
Undefined. Public writes/metadata/timerhandle APIs stay guarded.
4. Persistent VM state links socket to current/previous arm facts; cancel previous
arm on reset/zero/queued destroy, preserve historical snapshots. Queued destroy
retains public timeout and native closePending while clearing active timer and
canceling submission. No additional refresh at deferred internalConnect; later
completion/read/write refresh semantics remain unsupported. Setter returns same
socket. O(1) current state per socket; history follows existing persistent VM.
5. Timeout listener registration remains unsupported in this slice (target has
none). No timeout callback, automatic destroy, timeout-as-deadline, TCP completion,
error/close/end delivery or process-exit claim. Unrefed is not inactive. Existing
HTTP arrival horizon unchanged; timer chronology remains future unmodeled work.
6. Real CLI spec executes complete pinned checkGrowl file via CommonJS loader with
{host:'127.0.0.1',port:23053} and an interpreted retained callback. Keep entire
package available, original sources unchanged and verify source/manifest hashes
plus existing Yarn provenance. Capture preimplementation actual first boundary
then replace it with assertions: helper returns; both lifecycle callbacks retained;
100ms unrefed timer pending; shared startup reaches independent submission outcomes;
known source identity/origin/socket correlation. Accepted is pending, false remains
P038 cleanupstop. Default localhost remains explicit DNS boundary. Broader function
input and package-main coverage are not silently inferred.
7. Specs-first core numeric/reset/cancel/native-validation boundaries, independent
symbolic/review probes, native transport-intercepted API fixtures with no traffic,
actualCLI realpackage scenario. Read complete relevant upstream cases and record
whole-file blockers, do not narrow upstream tests. Fullsuite,typecheck,gapscans,
completeTest262/skips inventory, independentreview,candidateCI beforemasterpush.

Ownership sharedworktree: environment_wiring owns src/node/net.ts and
 test/node-net-timeout.spec.ts; environment_scenarios owns
 test/node-notifier-startup.spec.ts (realCLI/nativefixture and /tmp provenance);
 semantic_review owns test/node-net-timeout-review.spec.ts and /tmp review.
Root owns docs/evidence/audit/publication. Coordinate any other source/spec changes.
No subagent commits/pushes. Implementation starts after root dispatches on newbranch agent/p039-package-timers.
P038 candidate remains immutable while its CI runs; neither increment may publish
before its own exact-candidate CI. Root integrates P038 independently in primary.
