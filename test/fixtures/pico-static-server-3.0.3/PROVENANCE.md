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

## Reference observations and scoped symbolic follow-up

- GET of a readable file returns its bytes; HEAD performs the same read but
  sends an empty wire body.
- An absent requested path returns 404 and never reaches `statSync` or
  `readFileSync`.
- OPTIONS returns 200 and POST/DELETE return 405 without touching the request
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
- The pinned release emits DEP0169 when this checkout fixture calls legacy
  `url.parse` outside node_modules. The references preserve that diagnostic;
  the installed-package path has different warning eligibility.

These concrete cases establish independent reference evidence; the scoped
symbolic follow-up below now covers the non-GET/HEAD response routes. Neither
establishes all inputs, a discovered new vulnerability, or the package's complete
file-serving flow. The analysis
spec currently loads its unchanged module and initializes the actual factory's
identifier default parameter and copies its options through shared object spread.
HTTP invocation now returns the actual server from the original
`listen(port, callback)` call, with matching create/listen effects for omitted
and undefined options (port 8080) and supplied port 0. The symbolic host domain
assumes successful wildcard binding in the primary process: `listening` is
immediately true, but the listening callback is deferred. No real socket is
opened, and address allocation and bind failures remain unmodeled.

Explicit listening-event delivery completes the original callback and template
at `index.js:138` and records its actual newline-terminated console message.
The console model assumes healthy stdout and records ordered effects without
real writes. Startup is established only in this declared domain; output failures
and bind failures remain open implementation gaps.

Delivering the actual registered OPTIONS/POST/DELETE requests now completes
through generic writeHead/end/finish operations. Prophet retains the reversed
argument behavior: status-text characters become numeric header fields, and the
intended Allow field is absent. An explicitly delivered request event with a
symbolic method known to be neither GET nor HEAD proves status 200 for OPTIONS
or 405 otherwise, an empty body and missing
Allow; whether its status is 200 remains unknown. That spec uses an unknown URL,
port 0, one successful request/finish schedule and healthy stdout. Unknown method
and URL strings overapproximate valid parsed spellings; these routes never read
the URL, and no HTTP parser or protocol-to-event dispatcher is analyzed. Node
routes CONNECT separately; the proof does not establish that every symbolic
method corresponds to a wire request reaching the request listener. Native
OPTIONS/POST/DELETE cases supply concrete independently checked witnesses.

Inspection contains only explicit serialized fields, excluding automatic Date,
connection and framing output; spaces in the serialized status-text characters
remain spaces. This is now a scoped symbolic reproduction of the independently
observed header behavior, not a novel vulnerability claim. Shared path-only
legacy URL parsing and POSIX path.join/normalize now execute the original
GET/HEAD path expression. With `/folder/../missing?download=1` and staticPath
`/site`, the computed requestPath is `/site/missing`; the shared filesystem then
checks that path. The declared empty `/site` makes existsSync
false and the original handler completes 404 with an empty body. A read-only
observer still records the preceding scope/effects without supplying results.

The new symbolic filesystem proof fixes the request to `/docs` for GET/HEAD and
chooses `/site/docs` between missing and an empty directory. The same persistent
tree feeds existsSync, statSync/isDirectory and readFileSync. Missing completes
404; an existing directory reaches the original missing-index read and throws
ENOENT (`open`, `/site/docs/index.html`) out of the registered request listener.
No headers are committed or response ended on that branch. Both conditions are
retained while the directory-existence Boolean stays unknown. Four matching
native witnesses replay GET/HEAD and both tree choices under an isolated static
root, observing 404 or the uncaught `docs/index.html` ENOENT with exit code 1.
This is a bounded symbolic reproduction with explicit witnesses, not a novel
vulnerability or automatic counterexample-generation claim.

The virtual installed source `/app/node_modules/pico-static-server/index.js`
suppresses DEP0169, while the identical source at `/app/fixture/package/index.js`
schedules it, matching the native checkout fixture. Interpreted callbacks retain
their source filenames. Neither synchronous request handler delivers the warning;
the scoped warning model provides separate default delivery under healthy stderr.
Default readable-file reads now return modeled Buffer values. Six GET/HEAD
cases for `/index.txt`, a populated `/docs/index.html` and `/asset.unknown` observe the original
`data` binding and the completed fs.readFileSync effect, including exact UTF-8
bytes. Shared `instanceof` now establishes that this Buffer is not an Error;
the actual success branch calls getMimeType and obtains the real path.parse
extension. It selects text/plain, text/html, or the fallback text/plain, then
commits status 200. Its reversed writeHead arguments still produce numeric O/K
headers instead of the intended MIME/length fields. Analysis stops at the actual
response.write lookup before end; observers supply no values or control-flow
replacements. No completed file response is claimed. Broader URL/path APIs,
language/response consumers and other filesystem
failure families remain incomplete. An HTTPS
override still reaches the opaque HTTPS API.
Broader filesystem permissions, races, symlinks, paths,
protocols, configuration, and schedules remain outside
this initial reference domain. See `docs/real-world-target.md` for the durable
analysis goal and limitations.
