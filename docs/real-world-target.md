# First real-world analysis target

## Goal and current status

Make Prophet useful to a developer of an existing Node application: identify the
conditions under which a request can cause an unhandled exception or an unwanted
effect, and prove useful behavior for the remaining declared domain. Start with
a small external project, keep its code unchanged, and then grow to larger
applications and dependency graphs. Application names and source patterns must
never become VM inference rules.

**First symbolic header finding established; filesystem analysis remains incomplete.** The first target is
[`udivankin/pico-static-server` 3.0.3](https://github.com/udivankin/pico-static-server/tree/6b553fb34e3b5b5bccf3c082bb2cae5f93b9e3be).
The complete published fixture is retained with its license and integrity
records. Independent Node specs now exercise its real server and reproduce an
escaping filesystem exception. Prophet loads the unchanged module and returns
its actual arrow factory. Invoking it now evaluates its identifier default
parameter and both options spreads, creates the modeled HTTP server, registers
its real callbacks, and returns that server from `listen(port, callback)`.
Specs cover omitted/undefined options (port 8080) and supplied port 0 under an
explicit successful-binding assumption. Delivering the deferred listening event
now executes the original template and console call, capturing its exact startup
message under the healthy-stdout assumption. Registered OPTIONS, POST and DELETE
requests now complete through generic `writeHead`, `end` and finish delivery.
For an explicitly delivered request event with an unknown method known to be
neither GET nor HEAD, Prophet proves that the
response has an empty body and omits the intended Allow field: the status is 200
for OPTIONS and 405 otherwise. The application's reversed writeHead arguments
produce numeric header names instead. Pinned Node had already exposed this
behavior; this is now a symbolic finding in the declared domain, not a novel
vulnerability claim. Shared [POSIX path](node-path.md) and
[legacy URL](node-url.md) models now execute the original GET/HEAD path expression
for supported strings, then stop at the actual `fs.existsSync` lookup. Source
placement determines whether DEP0169 is suppressed or scheduled; its default
delivery is modeled separately. No filesystem result is supplied, and the
missing-file exception has not been reached symbolically. HTTPS/fs imports
retain opaque identities; no native implementation runs during symbolic exploration.

## Why this project

The published package is an actual static-file server, with HTTP and HTTPS
entry points, a documented public factory, and runnable upstream examples. Its
[implementation](https://github.com/udivankin/pico-static-server/blob/6b553fb34e3b5b5bccf3c082bb2cae5f93b9e3be/index.js)
is one 150-line file (including comments/blanks), 3,864 bytes. It imports Node's
`http`, `https`, `url`, `fs`, and `path`; its
[manifest](https://github.com/udivankin/pico-static-server/blob/6b553fb34e3b5b5bccf3c082bb2cae5f93b9e3be/package.json)
has no runtime package dependencies. Its
[MIT license](https://github.com/udivankin/pico-static-server/blob/6b553fb34e3b5b5bccf3c082bb2cae5f93b9e3be/LICENSE)
allows a reproducible fixture with attribution. This is a small, older project,
not evidence that Prophet already scales to a modern production service.

Candidates considered on 2026-09-29:

| Candidate | Fit for the first proof |
| --- | --- |
| `pico-static-server` 3.0.3 | Selected: one small server implementation, no runtime package graph, direct HTTP/filesystem behavior, and concrete exception/effect questions. |
| [`watson/http-echo-server`](https://github.com/watson/http-echo-server/tree/a5d14b567e3d99314c5257add85dce117cdb00a5) | Also small, but its [implementation](https://github.com/watson/http-echo-server/blob/a5d14b567e3d99314c5257add85dce117cdb00a5/index.js) uses raw TCP, timers, event interception, and `get-port`/Promises. It would shift the immediate work away from our HTTP boundary. |
| [`Ealenn/Echo-Server` 0.9.2](https://github.com/Ealenn/Echo-Server/tree/2b735482f942cbd889f1d49f3ff892364d0519ac) | Real deployment/debugging tooling, but its [runtime dependency graph](https://github.com/Ealenn/Echo-Server/blob/2b735482f942cbd889f1d49f3ff892364d0519ac/package.json) includes Express, parsers, configuration, and logging. A later candidate after ordinary interpretation of those dependencies is feasible. |

## Immutable source and execution boundary

Pin these together when adding the fixture:

- Repository commit: `6b553fb34e3b5b5bccf3c082bb2cae5f93b9e3be`.
- Published package: `pico-static-server@3.0.3`;
  [registry metadata](https://registry.npmjs.org/pico-static-server/3.0.3) identifies
  that commit as `gitHead`.
- [Complete package tarball](https://registry.npmjs.org/pico-static-server/-/pico-static-server-3.0.3.tgz):
  `sha512-wn397s0nIVy5dGwfJuiWJklF+WCLtCZr6XVs+dG1QbL2Yg/+nVEampmxRbT6Dt+0hulsj5mYdUa8u6d6VZUyTg==`.
- `index.js` SHA-256:
  `5f7d9176fbc286a8d2582840c273b0c0db1cd0281d86c67dca1233f613f3c597`.
  The tarball and pinned Git source were compared during target selection and
  match. Recheck integrity when vendoring; retain the entire archive's files,
  license, and a per-file manifest, as with `tiny-invariant`.
- Concrete behavioral reference: our pinned Node **v24.21.0** and corresponding
  upstream Node revision documented in [HTTP coverage](node-http.md). Record the
  OS/path semantics too; the first filesystem domain is POSIX. This establishes
  behavior on that runtime, not every historical runtime this package used.

The spec supplies a small driver that imports the unmodified published factory
and calls its public API with declared options. Prophet evaluates the whole
package module, the factory, its actual listener registration, and `listen`.
Requests enter through the registered server callback. A direct call to an
extracted handler or a rewritten copy is not this milestone. The upstream HTTP
example is an additional reference fixture; a spec driver may choose an
ephemeral port through the public factory options without changing package code.

Only Node APIs are modeled. All application and future package dependency code
is interpreted by the shared VM. The package imports `https` even in HTTP mode:
preserve that import and module identity, and report unsupported member use;
do not delete it to get the HTTP proof through. Import availability must not
claim HTTPS behavior has been modeled. No application-specific static-server,
Express, routing, or filesystem-success shortcut is allowed.

## First questions with practical value

| Question | Useful result |
| --- | --- |
| Can an ordinary request cause an exception to escape its request listener when the requested directory exists but its default file does not? | A condition on the request and filesystem state, the original source location and exception, prior effects, and eventually a concrete reproducible request/tree. |
| Does the response actually contain the Allow field the application supplies? | Now proved absent for the declared delivered-request-event domain with method neither GET nor HEAD because writeHead receives reversed arguments; retain conditional status, actual numeric header fields and the successful-transport assumptions. |
| Which request methods reach filesystem operations? | A proof relating the method to attempted filesystem reads, rather than a handful of successful requests. |
| For a readable existing file or an absent path, what response is committed? | Status, headers/body, completion, and ordered read/response effects; HEAD's wire body must remain separate from data supplied by application code. |
| Can a filesystem failure leave a response unfinished, or can the application's apparent error-response branch actually handle it? | Classify thrown and normal paths, without converting Node failures into successful return values or inventing an automatic 500 response. |

The first question came from inspecting the original source: it checks the
requested path, may append a default filename, calls `readFileSync`, and examines
the returned value afterward. The independent Node reference now reproduces the
failure described below. This is **concrete evidence, not a symbolic finding**
or a claim of a novel vulnerability.

Later questions include whether a requested path can read outside the configured
root, including symbolic links and filesystem changes between operations. These
need richer string/path/filesystem reasoning and a carefully stated containment
policy. Merely proving normalized string paths stay under a prefix cannot prove
filesystem containment. Invalid persisted state remains a goal for the later
write-based discount application; this first server primarily reads files.

## Current executable evidence

The [reference specs](../test/pico-static-server-reference.spec.ts) load the
original package, invoke its public factory, and send real HTTP requests in
isolated Node v24.21.0 children. They record filesystem calls and response state;
an `uncaughtExceptionMonitor` observes failures without recovering them.

- GET and HEAD for a directory missing its default file throw ENOENT from
  original `index.js:126`, terminate the child with exit code 1, and never commit
  headers or end a response. The later `data instanceof Error` branch is not
  reached because `readFileSync` throws.
- Existing files and a present directory index respond successfully; HEAD
  performs the read but sends no wire body. An absent requested path returns
  404. OPTIONS, POST and DELETE do not reach request filesystem operations.
- The reversed arguments in `writeHead(code, headers, http.STATUS_CODES[code])`
  omit the intended Content-Type, Content-Length, and Allow headers on the pinned
  Node release. Characters of the status text become numeric header names. The
  reference records this behavior without repairing the package source.
- Legacy `url.parse` emits Node's DEP0169 warning for this checkout fixture,
  whose path is outside node_modules. The installed-package path is a different
  warning environment: pinned Node suppresses this application deprecation there.

The [Prophet analysis specs](../test/pico-static-server-analysis.spec.ts) load the
same package entry source and metadata without rewriting arrow syntax. Loading
creates the actual exported function without server or filesystem effects.
Factory invocation initializes the original `customOptions = {}` parameter and
merges options through shared object spread. HTTP cases then create the modeled
server, register the actual request callback, and return the server from
`listen(options.port, listenCallback)` at original `index.js:141`. The specs
assert that this returned identity is the same one recorded by the ordered
create/listen effects. No embedding-only server substitute is needed. Omitted
and undefined options use port 8080; the supplied configuration uses port 0.

The declared primary-process environment assumes successful wildcard binding,
so the hostless call exposes `listening === true` immediately while its callback
remains deferred. Explicit `completeListen` delivery now completes the original
callback at `index.js:138`, including its untagged template and modeled console
output. The ordered trace records the message ending in the configured port
(8080 or 0) and a newline. Earlier contexts retain no output. This establishes
startup only in the declared successful-bind/healthy-stdout domain; no real
socket or stdout write occurs, and allocation, bind errors, and output failures
remain open in the [gap backlog](implementation-gaps.md).

Valid request delivery enters the actual registered handler. Concrete OPTIONS,
POST and DELETE cases now complete with empty bodies, numeric character header
fields and no explicit Allow field. The symbolic case supplies an unknown string
method with the explicit facts `method !== "GET"` and `method !== "HEAD"`, an
unknown URL, the original configuration with port 0, and one successful request
and finish schedule. Its string representations overapproximate valid parsed
methods/URLs supplied to a request event; they do not implement or prove HTTP
parsing or protocol-to-event dispatch. In particular, Node diverts CONNECT to
its separate connect/upgrade handling, so not every symbolic method is a feasible
wire request reaching this callback. Concrete OPTIONS/POST/DELETE requests are
independently checked. These routes do not read the URL. It proves
`method === "OPTIONS" ? status === 200 : status === 405`, an empty body and the
missing Allow field while `status === 200` remains unknown. Both effect paths
retain the actual registered callback and one writeHead/end sequence.

The [header projection](node-http.md#explicit-response-headers-and-status-catalog)
contains explicit serialized fields, excluding automatic Date/connection/framing
output. Values under numeric header names preserve literal spaces from `"Method Not Allowed"`,
which a client's parser may trim. This supports the missing application Allow
finding; it does not claim all wire headers are absent or fully modeled.

GET and HEAD now execute the original expression
`path.join(options.staticPath, path.normalize(url.parse(request.url).pathname))`.
For `/folder/../missing?download=1` and staticPath `/site`, it computes
`/site/missing`, including the explicit normalize call and the current normalize
call inside join. The next unsupported lookup is `fs.existsSync`. A read-only
lookup observer records the actual preceding scope and effects without supplying
a filesystem method or result. This establishes path computation for the supplied
request, not file existence, URL decoding, containment or file-serving completion.
The generic [URL](../test/node-url.spec.ts) and [path](../test/node-path.spec.ts)
specs separately cover their concrete and finite-choice domains and boundaries.

The installed virtual filename `/app/node_modules/pico-static-server/index.js`
correctly suppresses DEP0169. The identical source at
`/app/fixture/package/index.js` schedules one warning, matching the native checkout
fixture's eligibility. Source filenames are captured by interpreted functions,
so the actual callback retains its origin after module loading. No warning is
delivered while this synchronous handler is still running. Independent
[warning specs](../test/node-warnings.spec.ts) cover deferred default presentation
under its declared healthy-stderr environment; arbitrary flags/listeners and a
general scheduler remain open. Next are correlated filesystem existence/type/read
outcomes and errors. path.parse for MIME selection and wider URL forms remain
later boundaries. Completion and filesystem exception classification remain
unimplemented. Overriding `protocol` to `https` still reaches the opaque
`https.createServer` member.
The [fixture provenance](../test/fixtures/pico-static-server-3.0.3/PROVENANCE.md)
records the concrete domain, original wildcard listen behavior, and file hashes.

## Explicit first analysis domain

The first useful proof is deliberately bounded and must be labeled that way:

- HTTP mode, trusted concrete factory configuration, successful startup,
  one server and one parsed request, successful transport/completion where the
  application reaches a response, and no process-level exception recovery hook.
- Symbolic request method over the declared supported parsed-method domain, and
  initially a finite symbolic choice of request targets: a regular file, an
  absent path, and a directory. Include GET, HEAD, OPTIONS, and another method;
  broaden method strings and URL strings as their semantics become supported.
- An explicit small POSIX filesystem rooted in a temporary/symbolic directory:
  readable file, missing path, directory with a present or absent default file.
  Correlate `existsSync`, `statSync`, and `readFileSync` through this shared state;
  they are not independently chosen return values. No symlinks or concurrent
  filesystem changes in this first domain. File contents may start concrete.
- Synchronous filesystem exceptions and listener propagation follow pinned Node.
  Add permission failures, races, Buffer contents, richer URL forms, repeated
  requests, startup/network failures, and other schedules as separate expansions.

Finite URL/tree choices are an initial coverage limitation, not an implicit
assumption for a claim about all URLs, filesystems, requests, or executions. A
full-module analysis means all code actually reached by this scenario uses the
real source. It does not mean all possible configurations and behaviors have
been analyzed. Keep both source coverage and domain coverage visible.

## Success criteria and next increments

1. **Reference specs and provenance: established.** The pinned complete package
   has integrity/license records and byte-for-byte Git verification. Specs own
   the driver, public options, filesystem setup, requests, and assertions for
   success, missing path/default file, HEAD, and non-reading methods. Child
   termination is distinct from ordinary HTTP errors. Preserve these cases as
   the independent reference; they are not a symbolic proof.
2. **Concrete whole-module execution in Prophet.** Close shared language gaps
   required by this source. Synchronous arrows now support module loading, and
   identifier default parameters execute when the actual factory is invoked.
   Shared data-property spread merges the original options, and numeric Node
   listen overloads now let the unchanged factory return its server under the
   declared successful-binding environment. Deferred delivery now completes its
   original template and console output under a healthy-stdout assumption.
   Scoped direct response headers and the pinned status-code catalog now complete
   OPTIONS/POST/DELETE responses. Scoped legacy URL parsing and POSIX
   join/normalize now compute the actual GET/HEAD request path before stopping at
   fs.existsSync. Source-based warning eligibility distinguishes the installed
   package from the checkout; default warning delivery is a separate transition.
   Broader URL/path APIs and filesystem behavior remain.
   Any uncovered `instanceof`/property semantics need shared support and relevant
   complete Test262 cases. Add the required Node response/Buffer, URL/path,
   filesystem, and broader listen
   behavior using compatibility specs, not target-name rules. Establish the
   actual gap list from execution rather than assuming these features work.
3. **Symbolic classification.** Run the same entire module with symbolic request
   and correlated filesystem choices. Retain every reachable normal/throw path,
   exception location, condition, ordered effects, and final resource state.
   The supplied request-event domain with a non-GET/HEAD method now proves the missing Allow field and conditional
   200/405 status. This is the first bounded effect finding, not filesystem-path
   coverage. Continue toward the existing-directory/missing-default-file exception.
   Assert a valid property, a violating path if one exists, and a result that
   must remain unknown. An unsupported operation must be recorded as a coverage
   gap, never counted as a safe path.
4. **Actionable result and replay.** Turn a feasible violating path into a concrete
   request, configuration, filesystem fixture, and event schedule, then reproduce
   the observation in pinned Node against the same unmodified source. The initial
   finite choices allow a selected concrete witness without requiring a general
   string/SMT solver. Add a general witness mechanism only when the execution
   representation supports it; failed proof and unresolved constraints are not
   evidence of a bug. A concrete reference test alone is not a symbolic finding.
5. **Expand rather than declare completion early.** Cover additional input and
   environment families, then a larger real application with more dependencies
   and writes. Preserve this target as a regression. The raw-HTTP JSON discount
   milestone and eventual Express interpretation exercise request streams,
   validation, write failures, and unwanted persisted state as that work becomes
   relevant. Express and its dependencies remain ordinary source above Node.

Shared event listeners, arrow functions, identifier defaults, data-object
spread, numeric listen overloads, untagged templates, scoped console output and
direct response headers now support startup and the non-GET/HEAD response proof.
POSIX join/normalize and path-only legacy URL parsing now reach the actual
fs.existsSync lookup, with explicit open-string and broader-API gaps. Next model
correlated filesystem existence, type and read outcomes, including failures,
toward the unhandled-exception goal. Broader headers and transport remain separate work;
the current header projection does not include automatic fields. Spread over
accessors, symbols, unknown key domains, arrays, functions, and legacy intrinsic
layouts remains a separate language backlog; these cases stop analysis explicitly.
Destructured/rest parameters and implicit arguments likewise remain gaps.
Request body streams/JSON are not needed by this static
server; do not make them a gate before demonstrating its first useful
exception/effect result.

An analysis report must distinguish **proved within domain**, **violation with
feasible evidence** (and whether replay passed), **unknown**, and **unsupported**.
These are reporting requirements, not an API already implemented. Include source
revision, Node/OS reference, assumptions, schedules/bounds, coverage gaps, and
path conditions. Only claim all relevant exception paths within a domain once
every path is accounted for, including analysis gaps and exhaustion. General
JavaScript does not guarantee that arbitrary programs can be fully analyzed.
