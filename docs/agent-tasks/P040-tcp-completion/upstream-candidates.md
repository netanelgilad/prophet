# P040 complete upstream candidate re-review

Root reread four whole pinned Node24.21.0 files acquired in P038, with exact
[URLs/digests](upstream-manifest.json). No file is activated or counted as covered.

| Whole file | Remaining whole-file blocker |
| --- | --- |
| test-net-socket-ready-without-cb.js | Server accept/close, DNS localhost, new Socket, connect(address), end and native shutdown. |
| test-net-socket-connect-without-cb.js | Server/Socket constructor, address inspection, hostless/IPv6 inputs, end and lifecycle completion. |
| test-net-socket-connecting.js | Server accept, default host, legacy _connecting getter, end and close. P040 supports the selected callback's ordinary connecting value only. |
| test-net-connect-econnrefused.js | Dynamic server port/close, default host/autoselection, exact refusal errors, repeated rounds, global timer, active-resource/process-exit inspection. |

P039's timer files still need timer delivery/server/stream/process-liveness APIs.
Preserving complete source and recording blockers avoids presenting extracted
assertions or local binding-intercepted fixtures as upstream conformance.
