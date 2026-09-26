# Development stack

| Layer | Branch | Base | Pull request |
| --- | --- | --- | --- |
| Shared concrete/symbolic VM | `revive-symbolic-min` | `master` | [#23](https://github.com/netanelgilad/prophet/pull/23) |
| Test262 baseline and CI | `stack/test262-baseline` | `revive-symbolic-min` | [#24](https://github.com/netanelgilad/prophet/pull/24) |
| Unknown-length recursion | `stack/unknown-length-recursion` | `stack/test262-baseline` | [#25](https://github.com/netanelgilad/prophet/pull/25) |
| Spec-first development workflow | `stack/spec-first-workflow` | `stack/unknown-length-recursion` | [#26](https://github.com/netanelgilad/prophet/pull/26) |
| Lexical environments and captured validators | `stack/lexical-environments` | `stack/spec-first-workflow` | [#27](https://github.com/netanelgilad/prophet/pull/27) |
| Symbolic call completions | `stack/symbolic-call-completions` | `stack/lexical-environments` | Pending |

Current development tip: `stack/symbolic-call-completions`.

Create the next feature branch from that tip and open its PR against the tip.
Keep each layer independently reviewable and validated. Update this record when
adding a layer or when merges change the appropriate PR bases. Do not combine
new features into the older foundation PRs.
