# Development stack

| Layer | Branch | Base | Pull request |
| --- | --- | --- | --- |
| Shared concrete/symbolic VM | `revive-symbolic-min` | `master` | [#23](https://github.com/netanelgilad/prophet/pull/23) |
| Test262 baseline and CI | `stack/test262-baseline` | `revive-symbolic-min` | [#24](https://github.com/netanelgilad/prophet/pull/24) |
| Unknown-length recursion | `stack/unknown-length-recursion` | `stack/test262-baseline` | [#25](https://github.com/netanelgilad/prophet/pull/25) |
| Spec-first development workflow | `stack/spec-first-workflow` | `stack/unknown-length-recursion` | [#26](https://github.com/netanelgilad/prophet/pull/26) |
| Lexical environments and captured validators | `stack/lexical-environments` | `stack/spec-first-workflow` | [#27](https://github.com/netanelgilad/prophet/pull/27) |
| Symbolic call completions | `stack/symbolic-call-completions` | `stack/lexical-environments` | [#28](https://github.com/netanelgilad/prophet/pull/28) |
| Symbolic arithmetic bounds | `stack/symbolic-arithmetic-bounds` | `stack/symbolic-call-completions` | [#29](https://github.com/netanelgilad/prophet/pull/29) |
| Host compatibility and effectful server roadmap | `stack/host-runtime-roadmap` | `stack/symbolic-arithmetic-bounds` | [#30](https://github.com/netanelgilad/prophet/pull/30) |
| CommonJS source execution | `stack/commonjs-execution` | `stack/host-runtime-roadmap` | [#31](https://github.com/netanelgilad/prophet/pull/31) |
| CommonJS loading, cache, cycles, and retries | `stack/commonjs-module-cache` | `stack/commonjs-execution` | [#32](https://github.com/netanelgilad/prophet/pull/32) |
| Local CommonJS resolution and JSON configuration | `stack/commonjs-local-resolution` | `stack/commonjs-module-cache` | [#33](https://github.com/netanelgilad/prophet/pull/33) |
| Package lookup, conditional exports, and published invariant proof | `stack/commonjs-package-exports` | `stack/commonjs-local-resolution` | [#34](https://github.com/netanelgilad/prophet/pull/34) |
| Error construction, string conversion, and all-number library proof | `stack/error-string-coercion` | `stack/commonjs-package-exports` | [#35](https://github.com/netanelgilad/prophet/pull/35) |
| Conditional host effects and the Express discount North Star | `stack/guarded-server-effects` | `stack/error-string-coercion` | [#36](https://github.com/netanelgilad/prophet/pull/36) |
| Node HTTP full-program reference and host-boundary roadmap | `stack/node-http-north-star` | `stack/guarded-server-effects` | [#37](https://github.com/netanelgilad/prophet/pull/37) |
| Builtin registration and symbolic Node HTTP lifecycle | `stack/node-http-lifecycle` | `stack/node-http-north-star` | [#38](https://github.com/netanelgilad/prophet/pull/38) |
| Shared event listeners and first real application target | `stack/node-event-listeners` | `stack/node-http-lifecycle` | [#39](https://github.com/netanelgilad/prophet/pull/39) |
| Real static-server references and lexical arrow functions | `stack/pico-static-server-reference` | `stack/node-event-listeners` | [#40](https://github.com/netanelgilad/prophet/pull/40) |
| Default parameters and conditional initializer effects | `stack/default-parameters` | `stack/pico-static-server-reference` | [#41](https://github.com/netanelgilad/prophet/pull/41) |
| Shared object spread and conditional own-property order | `stack/object-spread` | `stack/default-parameters` | [#42](https://github.com/netanelgilad/prophet/pull/42) |
| Numeric Node listen overloads and deferred startup callbacks | `stack/node-listen-overloads` | `stack/object-spread` | [#43](https://github.com/netanelgilad/prophet/pull/43) |
| Untagged templates, console effects, and maintained implementation gaps | `stack/console-template-startup` | `stack/node-listen-overloads` | [#44](https://github.com/netanelgilad/prophet/pull/44) |
| Response headers, status catalog, and the real server's missing Allow proof | `stack/http-response-headers` | `stack/console-template-startup` | [#45](https://github.com/netanelgilad/prophet/pull/45) |
| POSIX path operations and conditional path-building proofs | `stack/node-posix-path` | `stack/http-response-headers` | [#46](https://github.com/netanelgilad/prophet/pull/46) |
| Legacy URL parsing, deferred warnings and source provenance | `stack/node-legacy-url` | `stack/node-posix-path` | [#47](https://github.com/netanelgilad/prophet/pull/47) |
| Shared symbolic filesystem state and missing-index exception proof | `stack/node-filesystem-state` | `stack/node-legacy-url` | [#48](https://github.com/netanelgilad/prophet/pull/48) |
| Buffer-valued reads and persistent symbolic bytes | `stack/node-buffer-reads` | `stack/node-filesystem-state` | Pending publication |

Current development tip: `stack/node-buffer-reads`.

Create the next feature branch from that tip and open its PR against the tip.
Keep each layer independently reviewable and validated. Update this record when
adding a layer or when merges change the appropriate PR bases. Do not combine
new features into the older foundation PRs.
