# TCP completion is a sequence, not a success bit

Submission admission only creates pending work. A selected afterConnect callback
first consumes connecting state, then follows status and readable/writable flags.
The shared event registry must retain waiting; generating facts on eligibility
would invent observations before an arrival. Keep one stable retained outcome and
use current heap/listeners. Failure is not transport-connected and cannot acquire
a guessed errno or error-event history.

On full-duplex success, Node refreshes the existing active timer before connect
and ready. A caught invalid setTimeout may leave public timeout=-1 while its old
100ms arm is active: use arm.delay, not the public value. A canceled native timer's
refresh does nothing; an abstract model must not reactivate it. Logical scheduling
occurrence identity can change while native Timeout object identity stays the same.

Connect and ready execute synchronously before read(0). A model that stops before
reading must retain callback changes, queued nextTicks and the active external
source; it cannot drain jobs as though the native handler had returned. A callback
throw and a typed unsupported frontier have different completion/checkpoint rules.
The unchanged checkGrowl listener reaches socket.end before its availability
callback, so invoking it is progress but does not establish a completed result.

Controlled pinned-native probes should preserve Socket._read and intercept
readStart itself without calling native transport. Replacing _read only proves a
call into that replacement. Fixture catches/cleanup and sentinel exceptions are
not evidence of uncaught-program survival or Prophet's typed-stop semantics.
Zero native traffic does not imply all scheduling/lifecycle/resource cases are
covered. Timer and close arrivals remain outside P040's provider domain.

See [P040 evidence](../agent-tasks/P040-tcp-completion/task.md) and
[the runtime contract](../symbolic-runtime.md).
