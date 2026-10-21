# P038 native findings (read-only)

Pinned oracle: `/tmp/prophet-node-24.21.0/node-v24.21.0-darwin-arm64/bin/node`, v24.21.0. Probe and raw results were saved under `/tmp/prophet-p038/native-research/`;
committed [results](native-results.json), [hash manifest](native-evidence.json) and
[whole-file discovery inventory](native-upstream-net-inventory.txt) retain evidence. Thirteen complete local scenarios, exit 0. TCP IPv4 connect is intercepted without calling the original; IPv6, IPC and DNS are prohibited. async_hooks records TCPWRAP initialization. The once-connect wrapper observes registration but delegates unchanged. An uncaughtException fixture listener records scheduled throws and allows isolated cleanup. No sockets are connected, no external traffic, and no upstream case was executed or counted as covered.

## Contract correction: no separate descriptor acquisition before return

Agree with root's correction to the initial draft. On POSIX, new TCPWrap calls uv_tcp_init, which delegates to uv_tcp_init_ex with AF_UNSPEC. That initializes handle state without new_socket. The deferred uv__tcp_connect calls maybe_new_socket, whose error return can precede connect(2). Therefore the model's submission transition includes descriptor/resource availability; do not branch on a pre-return descriptor-available Boolean. An observed TCPWRAP initialization is not an observed descriptor allocation. JS/native wrapper fatal allocation remains the general allocation gap, not an invented catchable guest Error.

Verified official pinned sources acquired whole under native-research/upstream:
- [src/tcp_wrap.cc](https://github.com/nodejs/node/blob/v24.21.0/src/tcp_wrap.cc), TCPWrap constructor calls uv_tcp_init.
- [deps/uv/src/unix/tcp.c](https://github.com/nodejs/node/blob/v24.21.0/deps/uv/src/unix/tcp.c), uv_tcp_init_ex, uv_tcp_init and uv__tcp_connect.

The narrowed environment API should consequently be submission(call, context) -> null (admitted pending) or explicit non-null modeled failure/unknown result, without acquisition. P038 may type-stop failure cleanup after preserving submission/outcome, rather than inventing its guest Error/close completion. A nonzero native status is not necessarily a completed syscall attempt: socket allocation can fail before connect(2). `connectionAttempt` is a Node event before this transition, not OS evidence.

## Exact supported-shape ordering

For ordinary `{host, port}` plus a callback, excluding prototype alterations/accessors/extra options:

1. Public net.connect normalizes and constructs the ordinary Socket wrapper. Native Socket initialization installs its internal stream state/listeners.
2. Socket.connect registers callback with once('connect') while connecting=false and handle absent.
3. Missing port with missing/null path throws ERR_MISSING_ARGS now, before native TCPWRAP creation. Draft explicitly excludes missing port; a typed unsupported stop is fine but must not claim this guest path is covered.
4. A fresh TCPWRAP is created. This is not an OS socket descriptor.
5. connecting becomes true.
6. lookupAndConnect reads localAddress/localPort, defaults host using options.host || 'localhost', reads port/family settings, then validates host type and NUL first.
7. Port type and range are validated after host. Correct explicit numeric ports are normalized by bitwise OR with zero (including -0 -> +0).
8. Valid explicit IPv4 queues nextTick; public return is pending. Callback remains a registered listener and has not executed.

Native errors captured (own keys apart from stack are only code and message; no address/port/syscall metadata):

| Input | Error | Message/precedence |
|---|---|---|
| host127.0.0.1, port -1/65536/1.5/NaN/Infinity | RangeError, ERR_SOCKET_BAD_PORT | `Port should be >= 0 and < 65536. Received type number (<value>).` |
| host42, port65536 | TypeError, ERR_INVALID_ARG_TYPE | options.host type error wins over invalid port |
| host containing NUL, port65536 | TypeError, ERR_INVALID_ARG_VALUE | host string-without-null-bytes error wins |
| host42, missing port | TypeError, ERR_MISSING_ARGS | missing port wins before wrapper creation/host check |
| host127.0.0.1, portnull | TypeError, ERR_INVALID_ARG_TYPE | options.port must be number or string |

Invalid numeric port retains the otherwise hidden wrapper with connecting=true, destroyed=false, native wrapper present, callback listener still registered, but no nextTick/submission is queued. Public call throws rather than returning it. The oracle observes this wrapper only through instrumentation; do not invent ordinary program access to it. No model descriptor-availability branch should obscure this known invalid-port behavior.

The draft's finite own-data options gate is a modeling boundary, not Node validation. Wrong host type/NUL/string hostname are outside its successful IPv4 domain; either implement known native errors in order, or stop as unsupported before manufacturing a competing port error. In particular `{host:42,port:65536}` cannot produce ERR_SOCKET_BAD_PORT. Accessors, inherited relevant keys and unsupported keys must stop explicitly, not throw a fake Node argument error or silently omit getter effects. Host false/0/null/empty string falls through `|| 'localhost'`, so treating all nonstrings uniformly as Node invalid-host errors is wrong. These are excluded-domain cases initially.

## connectionAttempt listeners

After ordinary pending return, nextTick emits connectionAttempt(address,port,4). Raw scenarios prove:

* Normal listener: binding hook occurs after event; socket remains connecting/pending. Connect callback is never called by admission.
* Listener throws Error: scheduled uncaught Error, no binding hook; socket stays connecting, handle present. A model guest throw must terminate that queued job's execution before submission.
* Listener calls destroy(): returns destroyed=true, connecting=false, handle=null; native internalConnect continues and throws uncaught TypeError `Cannot read properties of null (reading 'connect')`. No binding hook. close(false) follows native destruction. Therefore supporting destroy only before the initiation job is a defensible bounded slice; destroy during initiation must explicitly stop before pretending normal cancellation. Do not extrapolate the pre-nextTick guard to a post-event guard Node does not have.

P037's previous probe independently shows destroy before nextTick prevents event/submission entirely. If P038 omits destroy or any overload, its typed stop must suppress subsequent queue draining on that branch. A typed analysis stop inside an interpreted connectionAttempt callback likewise retains the active job and callback frame, with no downstream submission.

## Complete upstream candidate inventory

Official tag tree `v24.21.0` resolved to `955266bfdd854cd280dffd47548673914484e4c0`. GitHub recursive tree response was nontruncated. `native-research/upstream-net-inventory.txt` contains all 207 .js paths under test/ matching filename/path net- or tcp-; this discovery inventory includes fixtures, server-only, cluster, TLS and internet cases and is not a claim that all 207 are relevant or inspected. The saved full JSON permits replaying the exact filter.

The following 18 whole upstream files were downloaded and read, preserving complete content. Paths below are relative to test/; none are activated and none count as P038 upstream coverage. Each listed blocker applies to the WHOLE file; do not extract the convenient initial assertions and call it a passing upstream test.

| Whole upstream file | Relevance and remaining blockers |
|---|---|
| parallel/test-net-connect-options-invalid.js | Type/objectMode/array-host/NUL validation; complete file needs objectMode variants outside P038 options domain. |
| parallel/test-net-connect-options-port.js | Broad types/ranges/overloads; complete file also needs DNS family/hints, new Socket, resume, 72 live local connections, streams and async error cleanup. |
| parallel/test-net-connect-no-arg.js | Missing-argument behavior; complete file needs new Socket().connect and excluded missing options. |
| parallel/test-net-normalize-args.js | Internal normalizer/symbol fidelity; also requires server, raw/normalized array paths, new Socket and successful completion. |
| parallel/test-net-connect-immediate-destroy.js | Pre-init cancellation; also needs positional connect, server listen/close and eventual lifecycle. |
| parallel/test-net-connect-destroy.js | Destroy close delivery on fresh new Socket; requires constructor and close completion, both outside P038. |
| parallel/test-net-socket-connecting.js | Pending vs connected state; also legacy _connecting, server, connection delivery/end. |
| parallel/test-net-socket-ready-without-cb.js | ready delivery; needs DNS/new Socket/server/end. |
| parallel/test-net-socket-connect-without-cb.js | Optional callback; needs new Socket, server and complete connection/end. |
| parallel/test-net-dns-lookup-skip.js | Numeric IPv4/IPv6 avoids lookup; whole file also IPv6 where available, server and stream end. |
| parallel/test-net-blocklist.js | Attempt can precede refusal without binding; whole file uses BlockList, custom lookup, single/multiple family selection and error delivery. |
| parallel/test-net-connect-after-destroy.js | DNS/cancel regression; whole file names google.com and is unsuitable for this no-network execution. Do not run it or silently replace its address. |
| parallel/test-net-negative-zero.js | Discovery false positive for port semantics: tests BlockList subnet -0 only; not a P038 candidate. |
| parallel/test-tcp-wrap-connect.js | Binding callback identity and full-duplex flags; internal binding plus live server/shutdown/read/close, outside public boundary and P038. |
| parallel/test-net-socket-constructor.js | Constructor/fd/handle semantics; cluster fork and transferred stdio, server and stream lifecycle. |
| parallel/test-net-connect-call-socket-connect.js | Public call delegates to overridable prototype method; needs monkey patch support, server/end. Guard prototype alteration rather than claim this passes. |
| sequential/test-net-connect-econnrefused.js | Refusal cleanup/resource leaks; server, repeated rounds, DNS/default host, error completion/timers/resource introspection. |
| sequential/test-net-better-error-messages-port.js | Refusal address/port fields; default-host DNS/family selection and actual error completion. |

All original URLs use https://github.com/nodejs/node/blob/v24.21.0/test/<relative path>. The local transport-intercepted oracle is independent fixture evidence, not an upstream runner or a narrowed upstream case. P038 has no complete upstream case from this inspected set that fits its advertised pending-only domain. Record that honestly. A future runner should adopt complete cases when constructor/server/DNS/completion domains are available.

## Recommended independent P038 assertions

Admitted known-valid call: public return and continuation, once callback registered but not executed; connectionAttempt handler can observe exact address/port/family and receiver; deferred submission receives same socket identity. Numeric invalid ports produce exact Error class/code/message and no submission, including NaN/Infinity/fraction/negative. Host-invalid plus port-invalid produces host error or explicit host-domain stop, never fabricated port precedence. Missing shape/accessor/inherited keys remain typed boundaries. Throw and typed stop in attempt listener both preserve prefix and prevent submission. During-attempt destroy must stop if not specifically modeled; before-tick destroy yields no attempt only if accepted scope. Submission unknown/failure retains actual outcome state and active job; connect/error/close callbacks remain unexecuted because P038 has no completion model.
