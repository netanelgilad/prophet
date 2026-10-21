# Socket idle timers: public value is not the active schedule

P039 [contract](../agent-tasks/P039-package-timers/contract.md) follows pinned
Node24.21.0 setStreamTimeout and getTimerDuration. Independent design review
accepted the bounded queued-only configuration; implementation validation pending.

Node writes socket.timeout before validating duration. After setTimeout100 then
a caught setTimeout(-1), the public value is-1 but the active timer remains100.
Do not derive scheduling from the public field. Valid reset clears/rearms; zero
cancels. Logical arm identity may change while native Timeout identity is reused.
Unrefed is not inactive; timeout is idle notification, not automatic cancellation.

Fresh IPv4 queued initiation does not refresh a later configured timeout. Future
connection/read/write activity does. Queued destroy cancels the arm while retaining
public timeout and separate pending native close. No timer callbacks are explored
in this startup prefix; do not silently infer that the configured100ms never elapses.

The complete unchanged node-notifier checkGrowl helper needs positional connect
and timeout configuration before the existing queue can reach submission. Solving
TCP completion alone would not bypass those earlier blockers. Keep the internal
subpath benchmark distinct from the package's full platform API and all inputs.
