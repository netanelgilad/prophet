# Pending TCP: do not move resource uncertainty earlier

P038 targets Node24.21.0 options-only IPv4 startup. See [boundary](../node-net.md),
[task](../agent-tasks/P038-net-submission/task.md) and native findings there.
Implementation f30bb9b accepted after independent20 probes and full181 suites/
5319 passes plus typecheck; candidate CI remains the publication gate.

Native wrapper initialization is not descriptor acquisition. POSIX uv_tcp_init
uses AF_UNSPEC; deferred uv__tcp_connect calls maybe_new_socket. A pre-return
resource Boolean would skip real caller code on failures. Preserve public return,
caller continuation, queued connectionAttempt and binding submission separately.
The event itself still precedes allocation/dispatch and does not prove packets.

Set initiating before calling listeners. Destroy inside connectionAttempt clears
the native handle but Node continues toward a null-handle error; it cannot reuse
the pre-initiation cancellation rule. The bounded model stops this unsupported
case. Successful submission stays pending; false admission stops before unknown
cleanup. Read-start and native close scheduling must be modeled before completing
the lifecycle. Do not fabricate close as a nextTick to finish an example.

Host validation order matters even outside successful IPv4 routing: known hostname
plus invalid numeric port throws before DNS. Falsy host values default to localhost
and cannot all be turned into fake TypeErrors. Guard excluded shapes explicitly.
Preserved callbacks are future state, not executed behavior or all-timeline safety.
