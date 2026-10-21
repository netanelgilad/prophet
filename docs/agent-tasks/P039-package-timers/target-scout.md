# Next outbound target scout

Read-only static source inspection. No package code was run natively or interpreted, no lifecycle scripts or installs ran, and no repository files changed. Accordingly, the blockers below are source-derived, not claimed execution results. Hashes, lockfile/cache checks and downloaded source manifests are in `target-scout-evidence.json`.

## Recommended first unchanged dependency path

Use the complete `node-notifier@5.4.0/lib/checkGrowl.js` already installed and pinned in yarn.lock. It is a 536-byte CommonJS TCP client with only `require('net')` on this dependency path. The file is an internal package subpath, not node-notifier's top-level cross-platform notification API; report that distinction. Do not extract/rewrite its function, replace socket methods, or route it through a hand-written imitation.

An eventual inline Jest fixture would call the unchanged exported function with `{host:'127.0.0.1', port:23053}` and an interpreted callback. Both fields are ordinary caller input; choosing IPv4 makes the proof domain explicit. A finite host/port choice can follow after concrete baseline. Keep the entire pinned package available to the loader, while verifying that only the actual subpath and package metadata are acquired on this call. P037 observations remain reached-source evidence rather than a claim about the whole dependency graph.

The source executes:

1. Default/check input and derive port/host.
2. `net.connect(port, host)` — first known P038 host boundary: positional form is not admitted.
3. `socket.setTimeout(100)` — next immediate boundary even after positional normalization; it executes before any queued initiation can drain.
4. Register connect/error handlers. Each calls `socket.end()` and then invokes the supplied callback with true/false availability.

There is no import-time crypto, util, Promise, stream class, environment lookup or wall-clock arithmetic on this path. The ordinary language constructs are already exercised elsewhere (object reads/defaults, typeof, local function closures), but this static inspection does not prove there is no unobserved shared-VM language bug.

**Why TCP completion alone is insufficient:** the present interpreter stops before the socket returns on the positional overload. With just that overload fixed it stops at setTimeout, before queued submission, and never reaches callback registration. With both startup calls modeled, P038 can already expose real dependency-attributed pending submissions. Completion then reaches end, which needs its own transport/shutdown semantics before claiming the check returned a result.

**Suggested bounded ordering for root:** positional connect normalization and honest timeout configuration/retention are the next demonstrated startup blockers for this target; then completion/error delivery and end. Do not add setTimeout as a no-op to obtain a passing example. Timer enablement, callback registration, activity refresh and pending expiry are real state, while actual timeout delivery needs an explicit time/event model. Merely configuring 100ms is not permission to assume time never advances. Native socket timeout events do not automatically close the connection. If that timer scope is too broad for P039, choose generic TCP completion as an independent runtime increment and explicitly say it does not yet advance this unchanged package to its first submission.

Whole-package public API `require('node-notifier')` is a much larger target: index.js immediately imports `os`, utility/platform modules, all notifier implementations, and native command paths. Do not call the subpath benchmark full node-notifier evaluation. `notifiers/growl.js` actually uses checkGrowl but additionally imports utils/growly/util and constructs an EventEmitter subclass.

## Other available packages and rejected alternatives

| Exact version / path | First known source blocker and why it is not the smallest next target |
|---|---|
| growly@1.3.0, main lib/growly.js → lib/gntp.js | net import is followed immediately by unregistered crypto and util.format. Sending then uses positional connect and registers data/end listeners before startup queue drain. Successful callback writes request bytes. Useful later end-to-end GNTP client, but not just TCP completion. |
| request@2.88.0, public main | 20 direct dependencies. index requires cookies → tough-cookie → unregistered util before request.js's stream/zlib/crypto-related graph. Large HTTP/agent/proxy/cookie/body surface. Already cached but poor first bounded target. |
| forever-agent@0.6.1 | Immediate util import, http.Agent, tls, https.Agent, and util.inherits. Connection pool/agent lifecycle rather than a simple request. |
| tunnel-agent@0.6.0 | Immediate tls import, then assert/util/safe-buffer and subclassing; proxy CONNECT changes physical peer versus logical destination. Defer until transport/agent semantics exist. |
| xmlhttprequest-ssl@1.5.3 | No npm dependencies, but top-level child_process.spawn import precedes constructor. Async path later creates headers/auth/agent options and HTTP request/write/end; synchronous path spawns a subprocess and uses temp files. Not a smaller net milestone. |

All six package versions and inspected files match their existing Yarn cache ZIP bytes; each ZIP SHA-512 exactly matches a checksum present in yarn.lock. These are existing local dependency provenance facts, not fresh registry-signature verification or a judgment about current security suitability.

## Tiny new sources inspected, without installation

For comparison only, downloaded two dependency-free tarballs under /tmp after checking metadata and imposing 1MB compressed/unpacked limits. Complete archives were manually copied as regular files with path traversal/link rejection. SHA-1 and SHA-512 SRI matched npm registry metadata. No signature trust claim, npm commands, lifecycle scripts or package execution.

* [phin@2.9.3 metadata](https://registry.npmjs.org/phin/2.9.3): 3,805 compressed bytes, 8,081 unpacked bytes, four files. Public main lib/phin.compiled.js is 3,279 bytes. It imports http/https/url/querystring, then unregistered zlib/util; import also reads util.promisify/custom. GET options include hostname/port/path/method plus headers/auth/parse/stream and the original caller options. Reaching real HTTP dispatch thus needs generic import/export support, correct request options/agents, and ClientRequest.on/end. Completion-only net work cannot bridge this. This is a reasonable later tiny **public HTTP package** benchmark, not P039's smallest net path. Package's compiled public entry must remain unchanged; do not strip its zlib/util imports or option keys because the chosen request does not use compression.
* [tcp-ping@0.1.1 metadata](https://registry.npmjs.org/tcp-ping/0.1.1): 2,608 compressed bytes, 6,911 unpacked bytes, four files. Public ping/probe imports only net, but first call uses new net.Socket, then process.hrtime before positional Socket.connect. It also configures timeout and destroys during connect/error callbacks. Clock/constructor/timer/reconnect domains make it larger than checkGrowl, though an appropriate later complete package target.

A metadata request for phin@1.9.0 returned 404; no source was acquired or used. Do not infer support from a nonexistent version. No further version shopping is recommended merely to find source that happens to fit the current model.

## Provenance anchors and acceptance shape

Chosen file SHA-256:
`6d8fdba983f2589ac744b68437918c63e679a962c4e06007b4f81cb089fdb103`

node-notifier package.json SHA-256:
`6e14169f6c3301bcb7746ed4816760dccbdf8362616f06b68c3e0f740dd9c5c9`

Yarn cache: `.yarn/cache/node-notifier-npm-5.4.0-11e1acc831-72e66e03fd.zip`; SHA-512:
`72e66e03fd0544c23302ba3d53c1a502809aee15b8c9406c79d5294e9bcfe04b43dc39c7b208c1f72912e6ddf93d6f9e0e830b135f424604b3d9e5822090d831`

Later HTTP candidate phin public entry SHA-256:
`66fae4d74cd874dae90bc83709eef549c4281cede534b4c6960f1ce8946d4243`

Required next test once root scopes implementation: unchanged checkGrowl file loaded through a real CommonJS fixture, no native client execution; actual CLI graph shows original source hash and origin, then correct stop at currently unmodeled operation. As each generic blocker is implemented, replace that stopped assertion with its modeled state and the next reached boundary. A pending submission is not connected, timeout expiry is not automatic close, socket.end is not completed transport, and a retained callback is not an executed availability verdict. Preserve unsupported/failure/waiting alternatives; never rewrite the target to manufacture a detection example.
