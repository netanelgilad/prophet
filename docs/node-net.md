# Bounded outbound IPv4 connection behavior

P038 models an initial prefix of Node24.21.0 `net.connect` and
`net.createConnection`. Both aliases, including `node:net`, share one function.
The CLI composes this boundary with the existing shared EventEmitter and startup
FIFO. Target networking never runs natively during symbolic exploration.

## Supported call and ordering

The options overload is `net.connect({host, port}, callback?)` with exactly the
two own enumerable data properties, ordinary or null prototype, unchanged
intrinsic defaults and an omitted/undefined/function callback. Finite supported
value choices use ordinary VM branching. Canonical IPv4 strings and numeric
integer ports0..65535 are supported; -0 becomes +0. The model preserves Node's
RangeError/code/message for invalid numeric ports after a known nonempty,
non-NUL host string, before the IPv4 routing boundary. Thus a hostname with an
invalid numeric port still throws the port error. Nonstring/falsy/NUL host forms,
missing properties, numeric-string ports, remaining positional overloads, getters,
additional options, altered prototypes and open domains stop explicitly; these
are implementation restrictions, not a claim that Node rejects those inputs.

A valid call registers its optional once-connect callback and returns a socket
with connecting=true,destroyed=false. Caller code runs before the queued startup
job. That job moves the socket from queued to initiating and emits
connectionAttempt(address,port,4) through the real registered interpreted
listeners. A listener throw or analysis boundary stops before submission.

After normal listener delivery, a distinct modeled submission operation retains
the socket receiver and endpoint arguments. Its fresh stable Boolean outcome
records whether binding submission was admitted pending. True leaves a pending
connection. False retains the outcome and active job, then stops at the unmodeled
failure cleanup/event lifecycle. It is neither a guest exception caught around
the earlier public call nor a fabricated refusal/error/close callback. Two
submissions have independent outcomes unless a trusted embedding supplies an
explicitly shared fact. Resource availability is unresolved by default.

The native `connectionAttempt` event is not an OS connect syscall or packet.
Pinned POSIX Node/libuv source shows fresh AF_UNSPEC wrapper initialization
without descriptor allocation; descriptor acquisition can fail later during
submission. No pre-return descriptor-available branch is invented. Fatal native
wrapper/JS allocation remains the general resource boundary.

## Cancellation and incomplete lifecycle

No-argument destroy is supported only while queued, before initiation. It
returns the same socket, sets connecting=false,destroyed=true and retains a
pending native close. The queued job observes cancellation and skips both event
and submission. Repeated destroy, overloads, and destroy during or after
initiation stop. In pinned Node, destroy inside connectionAttempt clears the
handle and native JavaScript subsequently throws; silently treating it as clean
cancellation would be inaccurate.

P038 executes connectionAttempt; P040 additionally executes connect and ready
on a selected full-duplex completion prefix. Error, close and
connectionAttemptFailed registrations remain retained future callbacks. Other event registrations, stream APIs and unmodeled public state
remain guarded; registration through a borrowed EventEmitter method uses the
same policy. Public emit/listenerCount stop for every name, since even other names can
have omitted native internal listeners (notably end). The socket's `node.net.socket` host slot links its persistent
phase, endpoint, submission fact and pending completion/close state. It is
inspection data, not a resumption interface.

P040 registers TCP completion alongside parsed HTTP providers under the shared
`--max-events` horizon. No close or timer-expiration provider is registered.
A drained queue with a pending socket is not process exit or proof that its
future callback cannot run.
No HTTP/HTTPS client, DNS, IPv6, IPC, raw Socket constructor, stream read/write,
agent/proxy/pooling policy, shared descriptor pool or all-timeline result follows.
Source identity and original public call origins can be correlated through the
same socket returned publicly and used as queued/submission receiver. Deferred
work does not resurrect the old interpreted activation.

## Validation and remaining coverage

[Task and contract](agent-tasks/P038-net-submission/task.md) record spec-first
ownership and publication gates. [Native findings](agent-tasks/P038-net-submission/native-findings.md)
compare the pinned runtime using intercepted bindings without calling the native
transport. Such observations validate JavaScript ordering, not network success.
Eighteen whole upstream files were inspected; none fit this pending-only domain,
so zero complete upstream net cases are counted as covered. The complete
candidate/blocker inventory is retained; fixtures are not relabeled upstream tests.

Generic queue/evaluation work limits apply, but do not bound all native options
enumeration, allocations, listeners, source parsing or graph serialization.
Host NUL validation scans the materialized concrete string before numeric-port
validation; only the later canonical IPv4 parser rejects length>15 before parsing.
See NET-001, EVENTS-001/002, HOST-001/002, REPORT-001 and SECURITY-001 in the
[gap backlog](implementation-gaps.md). No stable gap is closed by this prefix.


## P039 positional calls and configured idle timers

The explicit positional form `connect(port, host, callback?)` reuses the same
endpoint rules while retaining original public arguments and one call origin.
Omitted/default host, string ports, IPC and ignored extra trailing forms remain
unsupported. Both public aliases use the same operation.

A queued socket accepts exactly one numeric argument to setTimeout. Supported
positive integer delays through2147483647 configure an unrefed pending idle timer;
zero/-0 disables it. Reset marks the prior logical arm inactive and creates one
new active arm. The `node.net.timeout` slot points to persistent current arm state,
whose delay/active/refed facts are distinct from public socket.timeout. An arm
identifies a scheduling occurrence, not a native Timeout object (Node may reuse
that object). No wall-clock read, remaining time or absolute deadline is invented.

Negative numbers including negative fractions and nonfinite numbers are supported
guest RangeError/ERR_OUT_OF_RANGE cases: first write the public timeout value,
then throw while leaving the prior arm unchanged. Thus catching an invalid update
can leave a100ms timer active with a negative public timeout. Public -0 is preserved.
Unsupported positive fractions, overflow, nonnumbers/open values, callback/extra
arguments, altered intrinsic defaults and nonqueued phases stop before model-side
setter changes. Public property/method and private timer manipulation is guarded.

Queued destroy deactivates the arm, preserves the public timeout value and retains
closePending. Deferred IPv4 submission does not refresh the configured timer.
Future connection/read/write activity may refresh native idle timing and remains
unmodeled. An unrefed timer can still fire; it alone does not keep Node alive.
Timeout notification does not automatically destroy a socket or impose a connection
deadline. No timer provider/listener registration or delivery is added here.

The [unchanged dependency scenario](node-notifier-target.md) uses this shared
behavior to reach pending TCP submission. Startup FIFO priority explains why the
modeled prefix precedes timer callbacks. It does not prove that time never advances
or cover timer interleavings under the bounded arrival horizon.


## P040 selected completion prefix

`createNetModel` accepts an optional shared externalEvents registry and completion
HostModel. A completion model without a registry rejects as configuration error;
embeddings omitting both retain pending-only behavior. The CLI passes its shared
registry. Only admitted submissions register a provider; eligibility reads current
submitted/pending/undestroyed state. Waiting, horizon0 and eligibility checks do
not generate completion facts. A selected delivery invokes net.socket.completion
with the socket receiver and endpoint arguments, then stores a model-owned record
with stable success/readable/writable Booleans. Trusted models can correlate these
facts; the default independent facts conservatively overapproximate callback
inputs, without claiming every flag combination is a witnessed OS result.

Before status processing, completionPending becomes false and connecting becomes
false. Failure retains phase connection-failed and stops before unmodeled native
Error construction; no errno or connectionAttemptFailed/error/close is invented.
Success retains connected phase. A false readable flag stops before push/read;
a false writable flag stops before end. Both precede timer refresh and callbacks.
The original protected socket/prototype domain is rechecked at delivery.

Full-duplex success refreshes an active logical timeout occurrence using its
retained delay, even when a caught invalid setter left public timeout negative.
Its previous occurrence becomes inactive; public timeout is unchanged. Absent or
canceled arms stay inactive. Connect listeners run in actual registration/once
order, then ready. Their throws or typed stops suppress later stages. No nextTick
runs between these synchronous stages. P040 originally stopped after normal ready before read(0); P042 below advances
the pristine read prefix. Callback typed stops retain their active checkpoint and
queued work; a guest throw follows the registry's abrupt-completion rules.

The real unchanged checkGrowl connect listener first calls socket.end; P040
first stopped there before its availability callback (P041 below advances it).
Actual invocation supplies evidence
beyond mere retention, but its whole operation remains unfinished. Socket receiver
identity joins startup, submission and completion effects; deferred execution does
not restore the registration activation. Selected completion is consumed once.

HTTP and multiple sockets compete under one global horizon0/1/2. Waiting and
shorter histories remain. No timer, close, arbitrary phase chronology, eventual
arrival or all-schedule claim follows. See [contract/review](agent-tasks/P040-tcp-completion/task.md)
and the pinned native intercepted-completion findings: they preserve Socket._read
and intercept readStart before native reading, verifying ordering without traffic.


## P041 first empty end and pending shutdown

Exactly the first zero-argument socket.end is supported on a fresh connected,
full-duplex, undestroyed model socket, with no earlier write/cork/end/EOF/custom
stream hook. Retained success/readable/writable facts must establish this domain;
phase connected alone also appears at partial-flag frontiers and is insufficient.
The original property/prototype domain must remain intact. Node's Socket.end
wrapper dynamically uses Function.prototype.call, so altered or conditional
Function.prototype state is conservatively rejected before end-side changes.
Arguments (even explicit undefined), repeated end and other phases remain typed
boundaries. No unsupported input is silently treated as an empty stream.

Public writable becomes false and writableEnded true when ending is set, before
finalization. writableFinished stays false. A reusable empty-writable transition
marks finalCalled/finalPending, then invokes the traced net.socket.shutdown with
the same receiver. It retains locally pending shutdown and returns0. Internal
ended becomes true only afterward; public end returns the same socket. The
node.stream.writable and node.net.shutdown host slots retain these modeled facts,
not native request objects or resumable continuations. Public flags and end are
protected against writes/inspection of unmodeled descriptors.

This deterministic local submission follows pinned POSIX source: the admitted
fresh writable/nonclosing/nonshutting handle satisfies uv_shutdown admission,
which queues work and returns0 before shutdown(2). Explicit ShutdownWrap avoids
the missing-request allocation fallback; default TCP Error() supplies no separate
error-string path. It is not assumed successful OS shutdown. Fatal allocation
remains the existing resource gap, and future syscall success/failure/cancellation
remains unresolved. Injected return1/ENOTCONN/immediate-error controls demonstrate
broader JS behavior, not default outcomes of this fresh domain.

End itself preserves the current timer arm and emits no prefinish/finish/error/
close, queues no finish job and introduces no event provider. Pinned afterShutdown
ignores its eventual status argument; a future provider must not invent a guest
shutdown Error from every negative asynchronous status. Generic stream handling,
read/EOF and close remain work; P043 below adds the pending shutdown callback.

The unchanged checkGrowl helper now invokes its actual supplied callback with
null,true after end returns on the full-duplex branch. This is its application
report, not verified service response, shutdown success or all-path availability.
A callback throw/typed stop halts later stages; a normal callback continues through
ready to the first read(0), now supported by P042 below with shutdown still pending.
See [source/native proof and review](agent-tasks/P041-socket-end/task.md).


## P042 first read registration

After normal connect and ready return, a fresh live connected readable socket
executes the automatic zero-byte read prefix. Pending first empty end is allowed:
write-side shutdown admission does not clear the native readable flag. Current
socket/property, Object.prototype and Function.prototype defaults are rechecked
after both callbacks, before read changes. Current intrinsic property values and
own presence are checked per selected branch so an unchanged sibling survives a
conditional mutation. Custom dispatch, pause/resume, previous
reads, data/readable listeners, user buffers and stream hooks remain guarded.

The persistent node.stream.readable slot records actual fresh POSIX defaults,
including constructed=true, length0, highWaterMark65536, flowing=null,
reading=false, needReadable=false and sync=true. The node.net.read slot begins
handleReading=false,pending=false. Internal net.socket.read(0) sets reading,
sync and needReadable; Socket._read sets handleReading before traced
net.socket.readStart. The latter returns0 and retains pending registration; read
clears sync and returns null. No bytes, EOF or future callback are implied.

This local admission follows pinned source invariants for a fresh successful
readable handle, not an arbitrary success assumption. Immediate libuv error
conditions require a closing, already-reading, unreadable or invalid handle,
excluded here. The same fd already had a watcher for successful connect. No read
syscall or buffer allocation callback runs in this prefix. Future backend,
resource and transport failures remain unresolved.

No new event, queue job, timer refresh or shutdown change occurs. The completion
handler returns normally; the existing external registry then clears its active
record and drains actual callback jobs before selecting another event. A callback
throw or typed stop prevents the read; a later queued-job stop has an idle external
checkpoint. Waiting and shorter histories remain beside completed prefixes.
P043 extends horizon0/1/2 to pending shutdown callbacks alongside HTTP/TCP
providers. Data, EOF, timer and close interleavings remain excluded. Normal return
is not application exit.
See [contract and evidence](agent-tasks/P042-read-start/task.md).


## P043 shutdown callback and writable finish

The first empty end registers a shutdown provider only after local submission.
Without an external registry it remains pending. The provider's current transport
eligibility is pure and cannot restore consumed/cancelled work. Selected delivery
consumes shutdown.pending and clears finalPending at entered finalization, then
checks the supported empty constructed writable domain. Invalid state becomes a
typed continuation boundary; it is not silently hidden by eligibility.

Node afterShutdown ignores its status and calls the final callback without error.
The ignored native argument is projected out; completion carries no syscall
success assertion. prefinished=true precedes actual synchronous prefinish emit.
Only normal return sets finishPending and queues finish on the shared FIFO.
Prefinish throw retains consumed finalization/prefinished and no finish job.
The finish job consumes finishPending and sets finished/public writableFinished
before actual finish emit. It does not repeat native needFinish checks. Public
writable=false and writableEnded=true remain; readable and timeout state are
unchanged. After normal finish callbacks, current open readable state excludes
autodestroy. Unsupported readable state stops at that reached decision.

Prefinish and finish listener registration now uses the shared EventEmitter,
including once/removal/current lexical state and actual callback origins. Native
fresh sockets have no hidden listeners for these two names. Public emit/count
remain guarded, as do end/data/readable/timeout registrations. A custom apply
boundary occurs at actual emission after preceding state changes; inherited
conditional-apply conservatism remains a shared emitter gap. No unrelated blanket
intrinsic check is inserted before known native finalization effects.

One shutdown callback consumes one external horizon step; its finish job consumes
shared job budget. Typed prefinish boundaries retain external active delivery;
typed finish boundaries retain an active job after external delivery is clear.
Guest throws preserve prior effects and prevent later jobs/events. Waiting and
shorter histories remain; horizon2 can cover TCP then shutdown on the unchanged
helper. No bytes, EOF, timer expiry, transport close, generic writable support or
process-liveness proof follows. See [contract/review](agent-tasks/P043-shutdown-completion/task.md).
