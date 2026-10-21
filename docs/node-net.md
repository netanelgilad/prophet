# Pending outbound IPv4 connections

P038 models an initial prefix of Node24.21.0 `net.connect` and
`net.createConnection`. Both aliases, including `node:net`, share one function.
The CLI composes this boundary with the existing shared EventEmitter and startup
FIFO. Target networking never runs natively during symbolic exploration.

## Supported call and ordering

The initial overload is `net.connect({host, port}, callback?)` with exactly the
two own enumerable data properties, ordinary or null prototype, unchanged
intrinsic defaults and an omitted/undefined/function callback. Finite supported
value choices use ordinary VM branching. Canonical IPv4 strings and numeric
integer ports0..65535 are supported; -0 becomes +0. The model preserves Node's
RangeError/code/message for invalid numeric ports after a known nonempty,
non-NUL host string, before the IPv4 routing boundary. Thus a hostname with an
invalid numeric port still throws the port error. Nonstring/falsy/NUL host forms,
missing properties, numeric-string ports, positional overloads, getters,
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

Only connectionAttempt listeners execute in this increment. Connect, ready,
error, close and connectionAttemptFailed registrations remain retained future
callbacks. Other event registrations, stream APIs and unmodeled public state
remain guarded; registration through a borrowed EventEmitter method uses the
same policy. Public emit/listenerCount stop for every name, since even other names can
have omitted native internal listeners (notably end). The socket's `node.net.socket` host slot links its persistent
phase, endpoint, submission fact and pending completion/close state. It is
inspection data, not a resumption interface.

No TCP completion/close provider is registered. `--max-events` still bounds
parsed incoming HTTP requests, not network completion. A drained queue with a
pending socket is not process exit or proof that its future callback cannot run.
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
