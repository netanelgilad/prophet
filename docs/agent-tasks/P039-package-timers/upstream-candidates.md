# P039 whole upstream candidates

Read complete pinned Node24.21.0 files, retaining original bytes under the local
research directory and URL/hash/size in [manifest](upstream-manifest.json).
None executed or activated: zero complete upstream coverage claimed.

| Complete file | Whole-file blocker |
| --- | --- |
| test-net-settimeout.js | net server, data/write, localhost DNS, optional setter callback, Socket instanceof, global timer, connected destroy and server close. |
| test-net-can-reset-timeout.js | Server accept, resume/write/end, actual timeout delivery, stream callbacks and default-host connect. |
| test-net-socket-timeout-unref.js | Live server, connect delivery, callback setter, Socket/server unref and process-liveness behavior. |
| test-net-timeout-no-handle.js | new Socket without handle, timeout listener/expiration and global timer keeping process alive. |

P038's complete test-net-connect-options-port.js and test-net-normalize-args.js
remain broader than this explicit numeric port/IPv4/callback positional slice.
Do not trim those cases and count their extracted assertions as upstream coverage.
Independent transport-intercepted local fixtures verify admitted semantics only.
