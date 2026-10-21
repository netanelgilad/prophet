# Second real application target: sirv

After pico's initial CLI/event integration, grow the same VM against
[`sirv` 3.0.2](https://github.com/lukeed/sirv/tree/1135207e92c40354543cbd15c763c7a61d79d432).
It serves static files through Node HTTP and includes real runtime dependencies.
Its cached/default and development modes exercise different filesystem behavior;
its original code also needs binding patterns, loops, ordinary array/string
operations, dates, regular expressions and streams. These are reusable runtime
capabilities, not a reason to add a sirv-specific model.

The complete immutable [fixture and provenance](../test/fixtures/sirv-3.0.2/PROVENANCE.md)
pin sirv plus mrmime 2.0.1, totalist 3.0.1 and @polka/url 1.0.0-next.29.
[Specs](../test/sirv-target.spec.ts) verify all published bytes and obtain native
GET, HEAD and missing-file reference behavior from pinned Node. The current
Prophet run resolves conditional exports and imports all four unchanged packages
through the assembled CLI environment. The export is the actual interpreted
factory, with no filesystem or HTTP operations during import. The real CLI
subprocess now serializes this import and its nested function definitions into
the ordinary graph. [RegExp literal values](regexp-literals.md) allocate fresh
VM state without native objects leaking from retained ASTs. Calling the public
factory with a directory evaluates two regular-expression literals and appends
 them through the shared persistent Array.push intrinsic. The default ignores
 `[].concat(opts.ignores || [])` now evaluates through the shared bounded
 Array.concat operation, and the empty result's `forEach` completes through the
 shared bounded Array.forEach operation with zero visits. Totalist's ordinary
 `for` loop then walks the directory entries through the shared bounded
 ForStatement operation, and the factory reaches sirv's ignore-filter RegExp
 `.test` inside the walk callback. Both flagless filters now run through the
 [bounded generic matcher](regexp-literals.md#bounded-regexpprototypetest-p007)
 on the unchanged filename. Header preparation reaches mrmime.lookup's
 `('' + extn).trim()` through the shared bounded String.trim intrinsic, and bounded ASCII `.toLowerCase()`; it then
 computes `idx === 5` through bounded generic UTF-16 String.lastIndexOf,
 then computes Number-domain unary `~` and selects the alternate of `!~idx`.
 Shared bounded generic UTF-16 substring now executes the already-resolved
 callee's argument `++idx` exactly once and completes unchanged mrmime lookup:
 `tmp === "hello.txt"`, `idx === 6`, result `"text/plain"`. Those completed
 activation records remain in persistent state, outside the later current
 lexical chain. Header preparation then completes `stats.size` with the
 observed byte count (16 for `site/hello.txt`) through the
 [bounded Stats.size and Stats.mtime model](node-filesystem.md#bounded-statssize-and-statsmtime-and-the-p012-r1-boundary),
 so `Content-Length` and `Last-Modified` (a bounded-Date `toUTCString` of the
 observed mtime) are set and header preparation completes. The ASCII filename
 `name.normalize()` is then the identity (bounded ASCII normalize), and
 `name.replace(/\\+/g, ...)` with no backslash in the filename is the
 identity through the bounded no-match RegExp replace, so the `FILES` key
 expression completes with the completed `toHeaders` activation (ctype
 `text/plain`, headers object) retained outside the current totalist
 callback chain. `viaCache.bind` then captures the completed FILES table
 through bounded Function.prototype.bind, and **the factory returns its
 request handler closure**: the CLI exits 0 with empty stderr and the
 completion fork's healthy leaf is the returned function value, preserving
 every directory/stat/isDirectory call/outcome identity beside the EMFILE
 readdir call/throw sibling. No package source rewrite is introduced.
 Sloppy primitive receiver boxing now invokes the bound handler, and a
 delivered GET /hello.txt request runs unchanged @polka/url parse to
 completion: the delivered request declares its absent _parsedUrl cache
 slot, and bounded generic UTF-16 indexOf answers both of parse's probes
 (-1 for "/hello.txt"), so the handler observes parse's computed pathname
 and reads req.headers['accept-encoding'] as undefined through the
 declared ordinary empty headers object (pinned Node 24.21.0 raw-dispatch
 control), skipping the disabled gzip/brotli negotiation; bounded
 ordinary-array call spread then completes extns.push(...extensions), toAssume's
 trailing-slash probe uri.charCodeAt(len) answers 116 through bounded
 charCodeAt, the candidate list builds, viaCache's cache[arr[i]] finds
 the completed FILES record, and the handler reaches send(), where the
 object spread of the file headers completes and send's for-in
 enumeration over them visits nothing (the raw dispatch carries no own
 header names), and the getHeader probes answer undefined through the
 modeled setHeader store. res.writeHead(code, headers) serializes the
 FILES record's Content-Type and Content-Length fields and completes
 (content-length is an ordinary explicit serialized field: pinned Node
 24.21.0 stores and would send the application's value verbatim and
 enforces no body-length coupling without a socket transport, which the
 projection excludes). send's
 fs.createReadStream(file, opts).pipe(res) (build.js:95) completes
 through the modeled fs.ReadStream: pipe wires data and end to res.write
 and res.end, the embedding delivers the file bytes and completes the
 response, and the inspected wire projection matches the pinned Node
 24.21.0 reference for GET /hello.txt (status 200, body "hello from
 sirv\n", content-type text/plain, content-length "16", last-modified
 from the pinned mtime). HEAD /hello.txt completes with the same
 headers and an empty body, and GET /missing falls through isNotFound
 to is404's comma sequence and completes with status 404 and an empty
 body - both matching the pinned reference through the bounded sequence
 (comma) expression resolver (P026). Stream delivery is an explicit
 embedding operation matching the model's scheduling convention; the
 'open'/fd event, option fields beyond bounded numeric start/end ranges
 and multi-chunk flows are declared gaps. Header-carrying range requests
 now complete: GET /hello.txt with bytes=2-5 answers 206, "llo ",
 content-range bytes 2-5/16, content-length "4" and accept-ranges
 bytes, matching the host-pinned reference (P030). With { etag: true }
 the unchanged handler emits the weak validator from the declared file
 stats, and a matching if-none-match request answers 304 with an empty
 body while a stale validator answers the full 200 - both matching the
 host-pinned reference (P031). Other
 header-carrying requests (accept-encoding negotiation, conditional
 timestamps), the remaining
 transport-sensitive exclusions, constructor-prototype descriptors
 (for-in inherited keys),
 DeleteExpression (for-in deletion visits), remaining deferred String
 APIs, rest parameters, the implicit arguments object, full Unicode
 casing/normalization, other bitwise operations, other Stats/Date
 metadata, bound-function name metadata and array-literal spread remain
 work.
 The retained state contains the regex
 identities. Import success is not server startup or
request coverage. Runtime models preserve querystring identity
and provide shared bounded directory enumeration, without pretending the factory
has reached those later operations. A nonempty custom ignores list would next
reach the `RegExp` constructor inside the forEach callback, which remains
separate work alongside loops.

## Incremental acceptance

1. Import the complete unchanged dependency graph through normal CommonJS
   resolution. Preserve package source identity and initialization effects;
   keep reached unsupported builtins explicit.
2. Interpret the public factory and a Node HTTP setup from a spec-defined caller.
   Keep default cache initialization and development options distinct. Reach
   waiting startup with conditional binding outcomes and current listener state.
3. Reproduce the native readable-file, HEAD and missing-file cases with declared
   environment facts, then generalize request/file choices. Preserve failures,
   unknown URLs, asynchronous reads/streaming and unfinished responses.
4. Expand event histories and filesystem/resource alternatives, asking generic
   questions about escaping exceptions and state/effects. Keep conclusions
   relative to the exact input domain and bound. Larger dependency graphs and
   consumer security policies follow the same VM architecture.

Continue pico regression coverage in parallel. Do not switch a rejection to a
successful assertion until its actual generic semantics are supported; do not
trim package code, suppress a dependency, replace stream output with invented
bytes, or equate these concrete references with all-path proofs. Track residuals
in LANG-001, CJS-001, FS-001, HTTP-008, TARGET-001 and TARGET-002 in the
[implementation backlog](implementation-gaps.md); add precise IDs if those groups
cannot describe a newly reached gap.
