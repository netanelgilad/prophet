# P042: fresh read registration and normal connection callback return

Base immutable P041 candidate fb84e98e0fcce0c63076298903ef9558ddc51e22; CI39677573075 pending at task start. Root and independent reviewer approved the final contract after nine pinned native controls and full JS/C++/libuv source inspection. Implementation and independent review accepted; full193-suite/5475-pass/46-skip run and typecheck passed. Exact-candidate CI/publication pending.

The automatic first read(0) after normal connect/ready should activate local reading, return null and allow net.socket.complete to return normally. Existing scheduler logic then clears active delivery and drains actual callback jobs. No bytes, EOF, shutdown completion, timer expiry, new provider or synthetic job are introduced. Pending first empty end remains compatible with the readable side. Public read/pause/resume/data-listener and custom stream domains remain guarded.

Codex root coordinates its own subagents under the explicit user override of historical Atlas workflow. Wiring owns production/core specs and earlier core migrations; scenarios owns actual CLI/unchanged dependency and native controls; review owns independent specs and prior review migrations. Only root commits and publishes. Source changes begin after meaningful red specs. All prior assertions must retain their meaning when normal histories merge; no skips or narrowed proof domain to make tests green.

Acceptance requires independent code/evidence review, full suite/typecheck, four documented scans, complete Test262 skip reconciliation and exact-candidate CI. Preserve all19 owner files. Future read/shutdown/timer events and their competing schedules remain unknown; a normally completed callback is not a terminated application or availability/security proof.

Implementation refinement: the final read guard compares current intrinsic own
presence and values per branch, preserving an untouched sibling of a conditional
mutation. Earlier operation guards remain conservative. Independent review must
cover added, removed and replaced properties as well as both callback positions;
this refinement does not admit custom stream dispatch.
