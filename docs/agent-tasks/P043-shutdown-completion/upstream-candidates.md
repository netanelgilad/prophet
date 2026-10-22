# Whole Node upstream candidates

Pinned Node24.21.0; exact whole-file hashes are in upstream-candidates.json.
All five files were read without extracting executable fragments. None activated.

- test-net-end-close.js: custom handles, EOF, resume, setImmediate and process exit.
- test-net-end-destroyed.js: real server/peer EOF, connected destruction and close.
- test-net-end-without-connect.js: raw Socket construction and end callback overload.
- test-stream-writable-ended-state.js and test-stream-writableState-ending.js:
  generic Writable/custom write implementations, data and end callback overloads.

Local controlled native probes remain compatibility evidence, not upstream coverage.
