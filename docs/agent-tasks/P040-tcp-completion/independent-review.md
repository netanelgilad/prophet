# P040 independent semantic review — accepted within declared domain

No remaining concrete correctness finding in the reviewed candidate. This is bounded completion-prefix support, not full network/lifecycle coverage or an all-path claim. Reviewer edited only test/node-net-completion-review.spec.ts and /tmp evidence; no production edits, commits, pushes or full-suite execution.

## Exact candidate

Read the complete new net completion implementation and production diff (net model, CLI shared registry wiring, public export and CLI help/diagnostic changes), core completion specs, complete integration spec including the controlled native fixture, and both migrated integration files. Final stable SHA256 values:

- `src/node/net.ts`: `f86f4ab45a7ed7db555737332a3f9b5c1506b502d0a31f998b85e1a2cedbe0ea`
- `src/cli/runtime.ts`: `68cb769ee81748e013431deae905dd4532fb291f588315605b00a303f870363b`
- `src/index.ts`: `0d3c45b65ea9c8088f9bfbbc1876aaa77019bdecb9f8c2c337a87ffccabb1826`
- `src/cli/arguments.ts`: `18110c5f968cbd0abd4187edac45ec3b3848548718ceb1df313478c7038909cc`
- `src/cli/main.ts`: `29026e8ec718469409dded8eb67223c8bdfc6cee3520c7244a9c51d2181cd9a3`
- `test/node-net-completion-review.spec.ts`: `e9a041c1f2af55423cc780273739039223c3b87e8a4ce2f971b1ddcd2b4ef848`
- `test/node-net-completion.spec.ts`: `ea39bc7c269659be2126cabf193f15f63565fa57916d7bb64c3b37fde60c5a80`
- `test/node-net-completion-integration.spec.ts`: `f6707c9c917481e36707ce7e99dd0c7c133f571b4eecb31e4a2ae7dc3554ead0`
- `test/node-notifier-startup.spec.ts`: `ffdec7c60a047548392ceee3abe76594eea65475dbccc62cc32abc4841a49881`
- `test/node-net-integration.spec.ts`: `f1bcd1c1384bc33e25e6a475c21d1d7fb330920a09f2510b31358bfaed6d64c0`

## Independent evidence

- review-red.log/evidence.json: 9/9 genuine behavioral failures against unchanged P039 production; module imports compiled, missing behavior failed assertions.
- review-expanded-red.log/evidence.json: 16/16 genuine behavioral failures against unchanged P039 production. Two later correlation/environment-stop probes were first run after implementation; they are regression probes, not claimed red evidence.
- review-initial.log/evidence.json: all18 pass on initial fd73964a production revision.
- review-final.log/evidence.json: all18 pass on the final hashes above, stable before/after, pinned Node24.21.0 with external45-second watchdog. Command is existing Jest through pinned Node/Yarn; exit0.
- review-typecheck.log/evidence.json: typecheck exit0. No semantic result inferred from typechecking alone.

Independent tests cover lazy facts at startup/horizon0/waiting; four distinct reached frontiers; consumption/connecting state; original once callback/current later-listener order; removal snapshot semantics; old100ms active-delay refresh after invalid public timeout; no canceled-arm revival; preserved heap history; guest throw versus typed-stop active checkpoints; late intrinsic changes; independent selectable sockets; unused/malformed environment configuration; current-heap outcome reads and copied record isolation; direct repeated-delivery rejection; shared Boolean correlation; and environment typed-stop checkpoints without fabricated facts.

## Source and integration review

Eligibility is pure and state-based; registration occurs only after admitted submission. Facts are allocated only at actual selected arrival, validated from the current heap, copied into a model-owned record, and retained before callback branching. Completion/connecting state is updated before status processing; failure does not invent an errno/Error or connected phase. Partial flags stop before stream operations, timer refresh and callbacks. Full-duplex refresh uses old active delay, then emits connect and ready before a typed read frontier. No refresh or callback occurs at mere submission. Existing mapCompletions preserves active typed-stop checkpoints and clears completed/guest-thrown deliveries. Callback activations arise at invocation; no registration stack is resurrected.

Root/core's separate descriptor audit corrected acceptance of hidden extra accessors. I reviewed its final Reflect.ownKeys/descriptors/current-key-plus-history check and its core regression: native getters are not invoked. My earlier green run did not test or discover this issue; final18 rerun includes the correction. Invalid custom-model results are configuration errors, not invented guest transport errors. Trusted native model corruption remains outside the hardening claim.

I flagged the queued-cancellation integration's unnecessary horizon reduction; it now retains horizon2. Submission-prefix cases legitimately move to explicit0 and new tests exercise delivered completions at1/2. Final integration verifies shared HTTP/TCP competition, waiting, source/activation/HostCall aliases, guest throws, and the unchanged checkGrowl callback's socket.end lookup frontier before its availability callback. The core/new CLI scenarios do not fabricate a normal completion-handler return or readStart result.

Read the entire ten-case pinned-native fixture and its external research evidence. It retains Socket._read, intercepts original transport connect/readStart, guards DNS/IPv6/IPC and executes no package code natively. The success and read-failure controls distinguish callback/ready/readStart ordering; timer refresh uses retained delay; stale completion is ignored. Sentinel native throws are ordinary exception evidence only. Post-catch nextTicks do not establish behavior after an uncaught VM throw. Immediate-failure dummy-handle messages are not generalized to modeled errors. I did not independently rerun that already-green integration fixture; reviewed exact source and integration-evidence.json, while my18 probes were independently executed.

## Residual limits

Default Boolean combinations conservatively overapproximate callback inputs; no claim that each occurs physically. No completion errno/Error construction, partial stream transitions, read initiation, bytes, TCP end/close/error lifecycle, timer expiry, full scheduling or resumption is modeled. Existing timers can expire in omitted interleavings; waiting is limited to the modeled provider set. One selected TCP arrival reaches a frontier/throw, so another event must not proceed afterward.

Default outcome creation/publication is fixed-size. Custom-record validation can scan a large key/history set and is not a constant-time admission proof; no new resource cap was introduced. Registry/graph growth and trusted custom-model work remain gaps. Root owns full suite, final audit and exact-candidate CI/publication. Review spec is frozen with no further edits planned.
