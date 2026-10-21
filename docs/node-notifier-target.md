# Unchanged node-notifier dependency subpath

Target: complete node-notifier5.4.0/lib/checkGrowl.js, invoked through its exported
function with explicit `{host:'127.0.0.1',port:23053}` and an interpreted callback.
The entire installed package remains available without source rewrites. This is
an internal package subpath, not coverage of node-notifier's platform notification
entry point, its complete dependency graph, or arbitrary input configurations.

[Scout and exact provenance](agent-tasks/P039-package-timers/target-scout.md) retain
source/manifest hashes and the Yarn-cache checksum verified against yarn.lock.
No package/lifecycle code executes natively. Pinned native compatibility fixtures
exercise Node builtins with transport intercepted; they do not run this target.

The original536-byte helper derives port/host, calls net.connect(port,host), sets
a100ms idle timeout and registers connect/error callbacks. Both callbacks later
call socket.end and report a Boolean to their caller. P039 advances the startup
prefix through caller return and deferred symbolic submission, retaining the
unrefed timer and callbacks. Accepted submission remains pending; immediate
failure retains P038's explicit cleanup frontier. Neither callback/end path nor
a completed Growl availability result is claimed. The helper has no timeout
listener: configuring the timer does not itself make a timeout callback close it.

The first real CLI red reached the exact unchanged helper's positional connect
frontier before socket return. Generic positional/timeout semantics replace that
stop; no filename/function-name recognition enters the VM. Original HostCall
arguments, dynamic source origins, socket/timer aliases and roots.program byte
identities support downstream attribution. They do not supply npm grants/policy.

Default localhost remains a DNS frontier, while explicit IPv4 is a declared caller
input. Broader config errors, full connection/error/timeout/close delivery, end
and transport completion, retries and all-timeline proofs remain open. The next
actual callback frontier must be measured rather than inferred from registration.
