# P041 whole upstream candidates

Five complete pinned Node24.21.0 files were acquired and read. Exact URLs and
hashes are in [manifest](upstream-manifest.json). Zero whole files are activated.

| Complete file | Remaining whole-file blocker |
| --- | --- |
| test-net-end-close.js | Custom handle, read EOF, resume, setImmediate and readable close. |
| test-net-end-destroyed.js | Live server, peer EOF, destruction and close. |
| test-net-end-without-connect.js | Raw Socket constructor, missing-handle finalization and end callback. |
| test-stream-writable-ended-state.js | Generic Writable construction, writes, callbacks and finish. |
| test-stream-writableState-ending.js | Generic Writable construction, data writes and full finalization. |

Local intercepted fixtures verify the declared prefix; they are not extracted
upstream cases or full stream conformance. Broader injected immediate status
controls do not establish those statuses are reachable on a fresh POSIX TCP socket.
