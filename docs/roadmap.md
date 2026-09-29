# Proof milestones and host runtime coverage

The North Star is useful analysis of real, unmodified JavaScript applications
and their dependencies: explain which inputs and environmental outcomes can
produce an unhandled exception or unwanted state/effect, and prove useful
properties across a declared domain. This includes programs that interact with
their environment, not just functions that return values. Unknown results and
unsupported behavior must remain explicit. Automatic counterexample generation
is a later consumer of execution results, not a prerequisite for extending the
symbolic VM.

The first external application target is
[`udivankin/pico-static-server` 3.0.3](https://github.com/udivankin/pico-static-server/tree/6b553fb34e3b5b5bccf3c082bb2cae5f93b9e3be),
a published MIT-licensed static HTTP server with a 150-line implementation and no
runtime package dependencies. Its entire server factory includes imports,
request registration, filesystem access, and listening. The first useful question
is whether a request for an existing directory whose default file is absent can
escape as an unhandled exception, and under which request/filesystem conditions.
Pinned Node reference specs now reproduce that failure; symbolic classification
is still unimplemented, so it is **not a Prophet finding**. Selection,
immutable provenance, input/environment domains, result criteria, and the growth
plan are in [the real-world target contract](real-world-target.md).

After shared event listeners, prioritize the language and Node operations needed
to execute this complete target, then classify symbolic request/filesystem paths
and replay a supported violating path. Request streams, JSON, and the discount
endpoint remain valuable milestones, but are not prerequisites for a static
server that does not consume request bodies. Grow to larger real applications
after demonstrating useful analysis on this small one. Each session should
choose an increment that closes a named target gap or improves shared semantic
correctness, and update the target's status without weakening its success criteria.

Current target progress: the complete nine-file published package is vendored
and hash checked, with real HTTP/filesystem reference specs on pinned Node.
Synchronous arrow support lets Prophet load its unchanged module and return the
actual factory. Calling the factory reaches unsupported default parameters;
that shared parameter-initialization feature is next. HTTPS/URL/fs/path imports
currently supply opaque identities for loading only, not API implementations.
Object spread, later expressions, and the required Node operations still need
their own semantics and specs before any symbolic server claim.

The shared VM already handles selected symbolic branches, mutable objects,
closures, return/throw paths, recursive summaries, numeric bounds, and CommonJS
supplied-source execution, cached local module resolution, and JSON modules. Broader
host compatibility and server analysis remain future work. Each increment
belongs in the PR stack and starts with specs.

## CommonJS and require are a compatibility milestone

`require` is a Node host API, not an ECMAScript language feature. Test262 remains
the language conformance suite; it cannot establish compatibility with Node's
module loader. Model CommonJS explicitly and build a dedicated compatibility
suite before relying on it for package proofs. Do not treat loading
`tiny-invariant` once as evidence of general `require` correctness.

Use the [Node CommonJS documentation](https://nodejs.org/api/modules.html) and
[Node's tests](https://github.com/nodejs/node/tree/main/test) as the reference.
Pin an exact Node release and matching upstream test revision when adding the
suite, record them alongside its coverage, and compare behavior against that
release rather than whichever Node happens to run Jest. Use suitable complete,
unmodified upstream cases when feasible; label locally written compatibility
and differential specs separately. Never silently trim an upstream case to pass.

The compatibility backlog includes:

- **Module execution:** file-local scope, wrapper arguments and receiver,
  caller-relative `require`, `__filename`, `__dirname`, the initial `exports`
  alias, replacing `module.exports`, and reassigning `exports` independently.
- **Resolution:** relative and absolute requests, extension/directory handling,
  JSON, package lookup and entry points, package `exports`, built-ins, and
  missing or invalid requests. ESM interoperability, native addons, symlinks,
  platform differences, and further loader APIs remain explicit coverage gaps
  until implemented and tested.
- **Identity and state:** cache keys, repeated loads returning the same export,
  initialization effects occurring once per module instance, cycles exposing
  partial exports, failed initialization and retry, and isolated executions.
- **Failures:** missing modules, parse failures, and exceptions during module
  initialization must propagate with the appropriate observable error behavior.

Specs should run the same module fixture graph in Prophet and the pinned Node
runtime, comparing returned observations, reference identity relationships,
mutations, ordered effects, and error kinds/codes. Temporary fixture files belong
to spec setup; do not add standalone demo runners. The host runtime is an
independent concrete oracle, never a fallback for interpreted execution.

Symbolic specs add obligations that Node's concrete tests cannot cover: loading
a module on only one path must not mark it loaded on another; initializer effects
must not replay when evaluation forks; and exports, cache state, errors, and
effects must remain associated with the paths on which they occurred. A symbolic
module request needs an explicitly supported analysis strategy or an explicit
unsupported result; never pick a convenient concrete module name.

Implement this in reviewable layers: source-file execution and export semantics,
cache/cycles/failures, then the resolution and host support needed by the pinned
package. Track the supported subset at each step. CommonJS compatibility is a
continuing goal; broader Node support is not a prerequisite for the first scoped
package proof.

Current progress: `evaluateCommonJS` executes supplied source with private scope,
named wrapper parameters, receiver/export semantics, and normal/throwing paths.
`createCommonJSLoader` loads an immutable supplied graph through local relative
and absolute requests, with extension probes, directory main/index selection,
package type scopes, JSON modules, ancestor package lookup, self-reference, and
exact conditional exports. Its cache is part of each execution context,
so cycles, retries, retained effects, and conditional loads use ordinary VM
branch state. It supports finite choices of request names and rejects open
symbolic names. The [local compatibility suite](../test/commonjs/README.md) runs
against pinned Node v24.21.0. Export patterns, package imports, host disk
access, further module metadata, implicit arguments, and global eval declarations
remain explicit gaps; no complete upstream Node test is claimed as passing yet.
Shared Error construction and string conversion now support the package's
rejection paths; broader resolution remains a parallel backlog.
The loader also accepts explicit builtin VM modules, with canonical alias
identity and builtin precedence over package lookup. Missing models remain
analysis errors; native `require` is never an execution fallback.

## First published dependency proof

The [published invariant spec](../test/published-invariant.spec.ts) now interprets
the unmodified CommonJS build of `tiny-invariant` 1.3.3. Its complete published
tarball is vendored with verified integrity, per-file hashes, and its original
license; see [provenance](../test/fixtures/tiny-invariant-1.3.3/PROVENANCE.md). Its
[published metadata](https://registry.npmjs.org/tiny-invariant/1.3.3) uses nested
conditional exports: a require selects the default branches leading to
`dist/tiny-invariant.cjs.js`. Honoring only `main` would bypass the actual package
resolution path. Its Error, `String.prototype.concat`, module, and `process.env` behavior
must use shared VM implementations. Supply the modeled environment explicitly,
including development and production settings.

The percentage-normalizer milestone now passes. Its input is an unrestricted
JavaScript number: no finite or non-NaN assumption is supplied. Evaluating both
application and library proves rejection exactly when the range check fails,
or a result in [0, 1]. The lazy message runs once on development rejection,
never on success or in production. Rejection's Error name and message are
concrete. The accepted `Math.random() * 100` proof remains covered too.
Pinned Node comparisons check numeric edge inputs, callback/conversion failures,
and their effect order. The VM uses shared Error, ToString, concat, invocation,
and property operations; no rule recognizes the library's name or source.

One later proof milestone is a replayable counterexample: deliberately weaken
the application's guard, obtain a concrete violating number from the surviving
path constraints, and replay it against the same published package and application
in pinned Node. Start with supported numeric constraints and report unsupported
witness generation explicitly. A failed proof or unknown result alone is not
a counterexample. This is deferred while we build the effectful-server target.

## Side-effecting functions and a Node HTTP server

Model external interactions as part of execution: HTTP responses, logging,
file/database writes, and eventually network calls, timers, and asynchronous
callbacks. Ordinary JavaScript heap writes already have path-aware state;
external effects and their environment need an explicit model too.

A modeled operation must describe its observable arguments, ordered effects,
environment-state changes, possible return values and failures, and callback
behavior where relevant. Keep effects conditional on their execution paths,
preserve resource/reference identity, and let later reads observe earlier writes.
Failed operations may themselves have effects; throwing must not automatically
erase prior writes. External results cannot silently become fixed successful
values. Unmodeled interactions must be reported as analysis gaps, not treated as
pure calls or evidence that the program is safe. Model asynchronous ordering
explicitly as support grows; do not assume one convenient callback schedule.
Distinguish a proof over bounded schedules from a proof over every schedule.

The host boundary is Node's public APIs, starting with `node:http`. Express and
its dependencies are later ordinary interpreted JavaScript above that boundary.
There must be no special VM model for `express()`, `app.post()`, its routing, or
its body parser. Likewise, the model must not infer what an application handler
does from its name or source.

The first complete server proof lives in [the Node HTTP server spec](../test/node-http-server.spec.ts):
it imports `node:http`, creates a server, registers a request callback, listens,
and exports the server. GET `/health` responds with 200 and `ok`; other requests
take the application's 404 branch. The [README](../README.md#first-complete-server-proof-node-http)
shows the complete application source. Pinned Node v24.21.0 reference tests run
that source as a real CommonJS module and send real HTTP requests. They observe
listening, dispatch, completion, and closing, including HEAD's body suppression.
They do not invoke an extracted callback directly. Prophet now evaluates the
same entire module using a supplied `node:http` model. The old builtin-gap
assertion has been replaced with proof assertions over unknown method and URL
strings, alongside direct comparisons of modeled and real Node responses.

The first symbolic HTTP program meets these criteria for its scoped environment:

- The VM evaluates the complete module, including imports, `createServer`,
  callback registration, and `listen`. The server retains the interpreted
  listener in persistent state; creating or listening does not run it inline.
- The modeled environment later delivers a request event to that server. The
  shared VM invokes its registered listener with the appropriate receiver and
  request/response identities. It uses the current state and the closure's
  captured bindings, not a replay of the context at registration time.
- For a declared domain of valid request methods and targets, GET `/health`
  yields 200 and `ok`; other combinations take the 404 branch. Each delivered
  request makes exactly one call to `end`, with response state and effects
  belonging to that request. The route remains unknown when the inputs do.
- Application arguments to `end` and observable HTTP output are separate:
  HEAD suppresses the wire body even when the application supplies text.
  Completion state and event timing must follow the supported Node behavior.
- A thrown listener error is not silently translated into 500. Express's error
  middleware will eventually establish that behavior by executing its own code.

The initial proof domain is successful startup followed by one delivered request
and a successful connection/response. This is an explicit schedule and host
subset, not all Node server behavior. Listening failures, socket failures or
aborts, malformed requests, full EventEmitter behavior, repeated/concurrent
requests, and body-stream timing remain separate acceptance work. Every supported
host operation needs compatibility specs against the pinned Node version; use
suitable complete upstream Node cases where feasible and report missing runner
support. The symbolic method/URL strings are unrestricted: this overapproximates
parsed request fields and does not establish HTTP parsing correctness. These
reference specs are local cases, not upstream conformance.
See [Node's HTTP API](https://nodejs.org/api/http.html), while treating the
pinned runtime and corresponding source/tests as the behavioral reference.

The model supports optional/multiple request listeners, `listen(0, "127.0.0.1"[, callback])`,
explicit successful listening/request/finish delivery, selected response fields,
and `end` with a string/null/undefined payload. Resource state uses the persistent
heap, and callbacks use the current context and their captured environment.
Unknown or invalid lifecycle transitions stop analysis instead of picking a
convenient path. A thrown callback remains a thrown or forked completion with
prior effects. The embedding may constrain a path and continue from that state.
Details, independent response observations, and complete upstream blockers are
recorded in [the HTTP coverage document](node-http.md).

Shared listener/event behavior now covers order, removal, one-time listeners,
callback failures, snapshots during dispatch, and conditional registration,
tested independently against pinned Node. HTTP uses that same mechanism for
request, listening, and finish events. Broader events, streams, metadata, and
warning behavior remain gaps; see [event coverage](node-events.md).
Next follow the real target's concrete language/host gaps before adding body
decoding and JSON solely for the saved-discount milestone. An incoming Node
request must not magically contain Express's parsed `req.body`.

## Existing discount proof and later Express integration

The [discount server spec](../test/discount-server.spec.ts) remains an existing
regression example and later integration target: an actual Express application
parses JSON, validates a percentage, writes its normalized value to a fixed UTF-8
file, and completes the response. Its handler source is shared by real Node
reference execution and Prophet's current direct handler proof. That supplied
request/response setup is not an implementation of `node:http`.

Acceptance criteria for the eventual full discount application proof:

- Invalid or missing percentage: exactly one 400 response and no attempted write.
- Valid percentage and successful write: exactly one write of `String(percentage / 100)`
  precedes exactly one 204 response. The converted number lies in [0, 1].
- Modeled write failure: no success response; Express dispatches to error
  middleware, which produces 500. File state follows the declared failure contract.
- Malformed JSON: Express rejects before calling the handler, sends 400, and
  performs no file write.

The reference pins [Express 4.22.1](https://github.com/expressjs/express/releases/tag/v4.22.1)
as an exact devDependency and pins its entire dependency graph through the lockfile
and Yarn cache. It uses actual HTTP and filesystem APIs on Node v24.21.0 inside
isolated spec setup. Concrete observations cover accepted numeric boundaries,
rejected values, absent input, malformed JSON, and a real ENOENT write failure.
These are local compatibility/differential specs, not upstream Node or Express
conformance cases. Use [Express's API reference](https://expressjs.com/en/4x/api/)
and matching source alongside independent concrete checks as coverage grows.

The first iteration now provides a generic synchronous host-function boundary.
Calls, returns, throws, receiver/argument identities, object snapshots, and
resource-state changes remain ordered under their path conditions. Missing
models raise analysis errors. Model implementation errors do not masquerade as
program exceptions. Pure recursive summaries must not discard external effects.
The [host-effect specs](../test/host-effects.spec.ts) cover conditional calls,
shared trace prefixes, failures after mutation, correlated outcomes, and snapshot
inspection. No real external operation runs during symbolic exploration.

The direct handler proof considers an unrestricted JavaScript number, including
NaN and infinities, plus separate nonnumeric domains. HTTP JSON cannot encode
NaN or infinities; the direct function's input domain is deliberately broader.
Its request body is an ordinary object. File state is explicitly either an
existing file with a successful write or an absent file/parent with a pre-write
ENOENT failure; absence is retained on that failure. Only a fixed path and UTF-8
string writes are modeled. Response `end` succeeds. Concrete observations of
this contract are compared with the real Node operation. Other failure modes,
partial writes, complete filesystem Error fields, socket failures, and arbitrary
host API arguments remain gaps, not guarantees established by this proof.

Continue in these layers, each with specs and its own stacked PR:

1. **Complete Node HTTP reference:** established; the exact source now also has
   symbolic proof assertions and concrete model/Node response comparisons.
2. **Builtin imports and server lifecycle:** the scoped canonical registry,
   `createServer`, `listen`, and deferred registered request delivery now pass.
   Broader overloads, listen outcomes, further EventEmitter APIs, and addressing remain.
3. **HTTP response behavior:** the scoped health-server proof passes, including
   completion flags, committed wire status, and HEAD body suppression. Numeric
   status conversion, null/empty payloads, 204/304, and UTF-8 edge cases have
   independent Node checks. Headers, stream writes, socket failures, and richer
   completion schedules remain. No real sockets run in symbolic analysis.
4. **Shared event listeners:** the scoped registration, invocation order,
   removal, one-time listeners, mutation during delivery, failures, and
   path-dependent state now pass. HTTP listening/request/finish callbacks reuse
   that implementation, preserving current captured bindings and explicit event
   delivery. Metadata events, warnings, streams, and broader APIs remain gaps.
5. **First real application:** follow [the pinned target contract](real-world-target.md).
   Whole-source provenance and Node reference specs are established. Arrow
   functions now allow the actual module to load; default parameters are the
   next reached invocation gap. Continue filling the shared
   language, response, URL/path, and filesystem gaps needed for concrete module
   execution. Add symbolic request and filesystem choices, classify exception
   paths, and replay supported violating cases. No body parser or Express model
   is needed to analyze the static server. Document remaining domains rather than
   claiming full application safety from the first bounded proof.
6. **Request streams and effectful application:** deliver body chunks/end/errors
   with explicit ordering, then decode and parse through supported semantics.
   Revisit the discount endpoint on raw Node HTTP with modeled filesystem writes
   and explicit application error handling. Expand failures and request sequences.
7. **Express as ordinary JavaScript:** load its unmodified package/dependency
   sources and evaluate its actual setup, routing, body parsing, and middleware.
   Missing language or other Node APIs become shared VM features with their own
   specs. No replacement Express implementation or source rewriting. Earlier
   source inspection identified `path.relative`, `process.cwd()`, and V8 stack
   APIs in its dependency tree; those remain later compatibility work.
8. **Richer environments and larger real applications:** additional filesystem failures, authentication,
   asynchronous storage, and scheduling alternatives. Authentication guarantees
   are relative to its modeled boundary; exploration bounds remain explicit.

A direct handler call alone does not establish Node HTTP setup/dispatch or
Express behavior. Samples and successful reference executions validate models
and regression cases; they never replace an all-input symbolic proof. Effect
snapshots currently inspect heap state and facts; they must not be used to
recreate stale environments for deferred callbacks. Event delivery needs the
current execution context and the listener's normal captured environment.
