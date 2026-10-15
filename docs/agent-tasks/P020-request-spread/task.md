# P020 — bounded incoming request headers and ordinary-array call spread

Worker: Instinct (sandbox), 2026-10-15. Base: P019 head 8781a61. Branch
agent/p020-request-spread.

Outcome: the delivered HTTP request declares its headers, and call/new
spread of proven ordinary arrays is modeled. A delivered GET /hello.txt
request through the unchanged sirv handler now completes @polka/url parse,
reads req.headers['accept-encoding'] as undefined through ordinary lookup
(disabled gzip/brotli negotiation skipped), and spreads the concrete
default extensions into extns.push(...extensions). The measured stop moves
into sirv's toAssume: the trailing-slash probe uri.charCodeAt(len)
(build.js:17), a deferred String API. No response, viaCache-result or
success claim.

Supported domain:
- Delivered requests carry method, url, the absent _parsedUrl cache slot
  and an ordinary Object.prototype-linked headers object with no own
  names. Pinned Node 24.21.0 answers exactly that shape for a raw HTTP/1.0
  dispatch carrying no headers; the object is deliberately NOT
  boundary-marked so absent-key reads (accept-encoding, range) yield
  undefined natively. Header-carrying deliveries and rawHeaders remain
  unmodeled.
- Spread arguments (f(...array) and new F(...array)) where the operand is
  a proven ordinary array with the unmodified intrinsic prototype chain:
  elements spread in index order, holes yield undefined after proving no
  inherited indexed elements exist within range, symbolic elements pass by
  identity, conditional (joined) operands split per branch like concat's
  operands, and forking callees spread on each path.
- Custom @@iterator hooks (own or on Array.prototype), exotic/accessor
  arrays, unknown lengths and layouts, non-array iterables (strings, Maps,
  generators) and non-iterables stop as typed boundaries; native TypeErrors
  for non-iterables are not fabricated. Spread above 1024 elements per
  operand stops as a typed boundary.

Specs first: test/call-spread.spec.ts (15 tests: pinned Node 24.21.0
native controls for ordering/interleaving/holes/constructors/builtin
receivers/native string spread and non-iterable TypeErrors; VM parity for
the supported domain; exact typed-boundary messages for every guarded
case; 1024/1025 budget edges). Migrated from measured output:
test/sirv-request.spec.ts now asserts the charCodeAt typed boundary as the
request-path stop (previously the legacy host headers read).

Validation (sandbox, Node 24.21.0, PROPHET_NODE_BINARY pinned): full suite
150 suites / 4653 passes / 46 unchanged skips, chunked --runInBand;
typecheck clean.

Remaining gaps: String.prototype.charCodeAt (the measured next stop, used
by sirv's toAssume), the viaCache lookup result path, response
getHeader/setHeader/writeHead consumption in sirv's send, fs
createReadStream/pipe, header-carrying requests, rest parameters, the
implicit arguments object, array-literal spread and non-array iterables.
