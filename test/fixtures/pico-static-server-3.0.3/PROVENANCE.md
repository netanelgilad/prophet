# pico-static-server 3.0.3 fixture

`package/` retains all nine files from the complete, unmodified published npm
archive, including its original MIT license, README, upstream HTTP/HTTPS
examples, and their static assets:

- Metadata: https://registry.npmjs.org/pico-static-server/3.0.3
- Archive: https://registry.npmjs.org/pico-static-server/-/pico-static-server-3.0.3.tgz
- Published `gitHead`: `6b553fb34e3b5b5bccf3c082bb2cae5f93b9e3be`
- Source: https://github.com/udivankin/pico-static-server/tree/6b553fb34e3b5b5bccf3c082bb2cae5f93b9e3be

On 2026-09-29, the downloaded archive's SHA-512 was checked against both the
registry's integrity value and the value recorded when selecting this target.
All nine extracted files were independently compared byte-for-byte with the
corresponding files at the pinned Git revision; all matched. `integrity.json`
records archive integrity and every published file's SHA-256. The fixture test
verifies the file set and hashes without network access. The archive itself is
not retained; these are its complete extracted contents, not a hand-picked or
rewritten implementation. No package install or package scripts are executed.

## Concrete reference domain

`test/pico-static-server-reference.spec.ts` loads the original package through
Node's real CommonJS loader and calls its public factory with `port: 0`, a
temporary `staticPath`, and `defaultFile: "index.html"`. The real registered
request callback handles a real request; it is never extracted or invoked
directly. Each case has a separate Node **v24.21.0** child process and temporary
POSIX tree, fixed readable contents, one request, no symlinks or concurrent
filesystem mutation, and no exception recovery. References are validated locally
on macOS/arm64; the spec checks POSIX separators and records its actual platform.
The Node version/revision contract is in `docs/node-http.md`.

The original factory has no host option and invokes `listen(port, callback)`, so
its ephemeral listener uses Node's default wildcard address. The reference
client connects only to `127.0.0.1`. No listener address or application code is
rewritten to disguise this limitation. No filesystem or network I/O from these
references is used as a fallback during Prophet analysis.

After loading the package, the driver observes `existsSync`, `statSync`, and
`readFileSync` by delegating to the original Node functions, preserving receiver,
arguments, return values, and thrown errors. The driver records effects in
order, separately from HTTP output and response lifecycle. It monitors
`uncaughtExceptionMonitor` to record the original error and response state;
it does not install `uncaughtException`, recover the error, or synthesize an
HTTP 500. The parent asserts the child's actual exit status and stderr.

## Observed behavior, not yet a symbolic finding

- GET of a readable file returns its bytes; HEAD performs the same read but
  sends an empty wire body.
- An absent requested path returns 404 and never reaches `statSync` or
  `readFileSync`.
- OPTIONS returns 200 and POST returns 405 without touching the request
  filesystem, including when the target names a directory without an index.
- An existing directory with its default file returns that file.
- GET and HEAD of an existing directory without `index.html` throw ENOENT from
  `readFileSync` at original `index.js:126`. The exception escapes the listener,
  and Node exits with status 1 before committing headers, ending, or finishing
  the response. The subsequent `data instanceof Error` branch is not reached.
- The package calls `writeHead(code, headers, http.STATUS_CODES[code])`. On the
  pinned Node release, its intended `Content-Type`, `Content-Length`, and `Allow`
  headers are absent. The third string is enumerated as numeric header names
  instead (for status 200, `0: O` and `1: K`). Tests retain this actual behavior
  rather than "correcting" arguments or asserting the intended headers.
- The pinned release emits its DEP0169 deprecation warning when the application
  calls legacy `url.parse`. The references preserve that diagnostic.

These concrete cases establish an independent target for future symbolic
execution, not a proof of all inputs, a discovered new vulnerability, or evidence
that Prophet already executes the package's complete server flow. The analysis
spec currently loads its unchanged module and initializes the actual factory's
identifier default parameter; it then stops at object spread in the first body
statement. Omitted, explicitly undefined, and provided options reach that same
unsupported operation. Broader filesystem permissions, races, symlinks, paths,
protocols, configuration, and schedules remain outside
this initial reference domain. See `docs/real-world-target.md` for the durable
analysis goal and limitations.
