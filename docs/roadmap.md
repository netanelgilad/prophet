# Symbolic runtime roadmap

Prophet is a use-case-agnostic symbolic execution runtime / VM. For a chosen
program, runtime/version and launch arguments, it transforms the **symbolic
starting environment into the resulting symbolic environment**. Concrete values
and environments use that same representation. Output preserves state,
conditional completions, observable history and unfinished execution boundaries.
The authoritative [runtime/state contract](symbolic-runtime.md) records this
architecture and supersedes the earlier library-first policy-report proposal.

The **CLI is the primary public interface**. Agents should be able to substitute
Prophet for a runtime command, supply a symbolic environment file or use a
supported concrete default, and redirect one serialized result from stdout.
A JS library export is an optional convenience; neither the public protocol nor
the roadmap assumes that Prophet will remain implemented in JS/TypeScript.
JSON and possible JS environment builders are input-authoring choices, not a
requirement to use a particular programming language. The [first CLI schema](cli.md)
is an experimental graph projection; full environment input/output is future work.

Security, bug-finding/debugging, correctness and performance analysis are
higher-level consumers. They own sensitivity classifications, policies, verdicts
and approvals. The core provides values, relationships, state transitions and
effects. Generic origin/dependency information or operation observations can
support many consumers; application-specific meaning stays outside the VM.
Automatic witness generation is another consumer of execution results.

## Next milestone: pico startup through the CLI, with no environment file

Agreed on **2026-10-02**: run the pinned package's **unchanged Node HTTP startup
script** through Prophet, without supplying a symbolic environment file or
building VM/model objects in caller code. The existing upstream example is the
acceptance target; its package source and options remain unchanged.

Acceptance command (the bounded startup proof now runs through this path):

```sh
prophet --runtime node@24.21.0 -- test/fixtures/pico-static-server-3.0.3/package/examples/pico-http-server.js > result.json
```

Success criteria:

1. The CLI loads the entry script and its relative CommonJS imports from disk,
   preserving `__filename`, `__dirname`, source identities and the pinned package
   bytes. The shared VM executes the original factory, server creation, listener
   registration and listen call; no caller-supplied source graph is required.
2. Prophet builds a documented, read-only starting snapshot automatically, using
   the same symbolic state representation as future explicit input. Capture
   cwd, arguments and required source/runtime facts with provenance; expose
   uncaptured state and resource outcomes. No environment file is required.
3. One serialized symbolic graph appears directly on stdout. It retains modeled state,
   server/callback identities and lexical scope links, ordered effects, program
   output, pending work and modeled environment conditions. Implementation notes
   stay in docs rather than a prose report around the graph. Diagnostics use stderr; target completion
   and Prophet's own status stay distinct. Incomplete serialization is explicit.
4. A supported startup path reaches a modeled server ready and **waiting for
   requests**, after its listening callback and startup message. Top-level
   script completion does not imply server termination. Preserve unresolved
   startup alternatives and future input; do not invent a request to finish the
   run. A partial result stopped at bind is an intermediate step, not this goal's
   successful-startup evidence.
5. A missing environment file is not evidence that port 8080 is available or
   stdout healthy. Preserve modeled unknown bind outcomes as symbolic state;
   document remaining output/scheduling assumptions in the backlog without
   substituting prose for environment facts. Unsupported outcomes remain boundaries.
   No real socket, target filesystem write or native package execution occurs
   during symbolic execution. Separate pinned Node checks validate modeled
   behavior without establishing availability for the target's fixed port.
6. CLI subprocess specs exercise the real command and parse its output, alongside
   entry/import failures and partial execution. Retain package integrity checks,
   existing symbolic request regressions and independent Node startup evidence.

**Delivered so far:** [CLI subprocess specs](../test/cli.spec.ts)
now run the random left/right example with a shared `done` write and preserve
independent draws. The command now captures reached CommonJS/JSON/package sources
and package-format metadata through the shared loader, uses the shared VM and
emits a reference graph with initial and current state, conditional effects and
program completions. [Classified execution boundaries](execution-boundaries.md)
retain unfinished leaf state alongside completed siblings; legacy analysis
failures retain one checkpoint without a completion root. Both report reached
diagnostics on stderr with exit status 2. Stdout is exactly `{ roots, nodes }`, without the old
report envelope or its implementation prose. Output is a nonresumable projection,
not the full state contract. Console, HTTP and its shared EventEmitter builtin
are connected today.

[Import specs](../test/cli-imports.spec.ts) preserve module identities, main id
`"."`, cycles and branch-specific initialization while acquisition shares cached
source bytes and positive/negative probes. [Capture specs](../test/cli-source-capture.spec.ts)
keep read-only non-atomic acquisition distinct from target filesystem execution.
Unresolved bare packages, dependency symlinks/aliases, nonregular/invalid-UTF8
sources and acquisition errors remain explicit boundaries. The unchanged pico
example now enters its original `index.js` and completes its bounded startup.
HTTPS/URL/path imports retain guarded object identities; those APIs are not used
during HTTP startup. The CLI's `fs` module now uses actual separately acquired
filesystem observations, preserving open/unobserved entries and symbolic resource
availability. No warning state is fabricated.

Supported HTTP setup now retains each bind attempt in the persistent heap.
The CLI uses symbolic success/failure without probing a real port; hostless
`listen` correlates its returned `listening` flag with that outcome. The generic
graph links servers/emitters to lifecycle/listener state through immutable host
metadata, preserving pending attempts and callback lexical identities.
[Binding specs](../test/node-http-binding.spec.ts) explicitly deliver these events
and check current listeners, unhandled errors and retries against [pinned Node
observations](../test/node-http-bind-reference.spec.ts). These are supported model
transitions, not a general event loop or all-callback analysis.

**Bounded startup proof delivered:** the CLI now drains a shared persistent FIFO
after normal entry completion. The unchanged pico subprocess retains both a
ready server with the original startup message and an unhandled bind-error
alternative without that message. Request listeners remain registered without
invented requests. [Queue specs](../test/jobs.spec.ts), [HTTP startup specs](../test/node-http-startup.spec.ts)
and [independent Node observations](../test/node-startup-reference.spec.ts)
check FIFO ordering, deferred explicit-host binding, retries, current captured
state and branch-local abrupt stops. The queue and active/pending jobs survive
graph inspection. This establishes the startup behavior in criterion 4, not
closure of all capture, provenance and serialization requirements above.

The [read-only filesystem adapter](node-filesystem.md#read-only-environment-acquisition)
now supplies the CLI's `fs` builtin and graph-linked state. [CLI specs](../test/cli-filesystem.spec.ts)
prove observed text reads versus descriptor exhaustion and observed missing-index
errors, preserve unobserved contents/children, and exercise actual subprocess JSON
output. Source capture and target filesystem capture remain separate non-atomic
observations. No target write runs natively and binary read/symlink/other capture
boundaries remain explicit.

**Next:** compose this environment with bounded future-request exploration and
preserved unfinished branches, then connect the existing URL/path host models
with correct shared warning scheduling. Opaque URL/path imports and retained
request handlers do not prove GET/HEAD request evaluation. Preserve success/error
alternatives, pending work and explicit transport/stdout boundaries.

Explicit environment authoring, arbitrary request exploration and full snapshot
resumption follow this milestone. Preserve the representation needed for them,
but do not make a complete input schema or general resumable VM a prerequisite
for this first no-environment-file run. See [the runtime contract](symbolic-runtime.md)
and gaps REPORT-001, CJS-001, HOST-002, HTTP-001 and CONSOLE-002.

The first bounded [automatic incoming-event checkpoint](external-events.md) is
available with `--max-events 1` or `2`: the Node provider supplies symbolic parsed
requests without a hand-authored concrete request, retaining waiting and failed
bind paths. Multiple/conditional servers share the generic persistent registry.
Bounds above two explicitly reject; default zero preserves startup. Parsed
method/URL strings overapproximate wire-valid inputs; parser dispatch and
histories beyond two remain work. Preserve [callback summaries and invocation-state dependencies](symbolic-runtime.md#conditional-history-and-callback-knowledge);
retaining a function is not evidence that all its paths were analyzed. The
current startup milestone does not claim coverage of arbitrary future event
sequences. Keep Node public built-ins as the modeling boundary and generic
conditional state/effect graphs as the representation; derive HTTP-focused
inspection views in consumers.

The next larger immutable application is [sirv 3.0.2](sirv-target.md), including
three pinned runtime dependencies and independent Node request references. Its
initial object-binding blocker is now supported through shared declaration
semantics. Its next reached boundary is reading `join` from the opaque CLI path
module. Follow actual reached language/host boundaries without
rewriting the package or claiming unexecuted handlers were analyzed.

## Following product milestones

1. Extend the first CLI/state contract with explicit symbolic and concrete
   starting environments. Exercise runtime selection, command arguments,
   program output captured inside the result, and distinct CLI/program status.
   Round-trip the supported state subset, preserving identities/correlations;
   expose unsupported serialization or unfinished execution explicitly.
2. Use the unchanged static-server milestone to validate that the public result
   preserves the already-proved outcomes, conditions, effects and unfinished
   responses. Keep source/runtime provenance and execution limits. No sensitivity
   or policy fields are needed to execute this program.
3. Extend generic observable-effect and value relationships through a small
   benign dependency fixture. Independent tools/specs can ask about possible
   network operations, exceptions or work/costs using the same result. Repair or
   reject reached inaccurate/unverified semantics for every consumer.
4. Develop the [downstream security use case](agent-security-analysis.md): pinned
   install/import/use executions, a controlled original Shai-Hulud first-effect
   benchmark with a clean control, and later an npm admission adapter. The
   adapter supplies initial state, invokes the runtime and applies its own policy.

These priorities precede optional JS library packaging and deeper descriptor
internals without a scenario needing them. Filesystem/transport/language gaps
remain recorded. The [first real application](real-world-target.md) remains an
active regression milestone; full JavaScript/Test262 coverage and advanced
symbolic evaluation remain engine goals.

Longer term, extend the same runtime abstraction to **Bash and GNU tools**,
including cross-process state, pipes and effects when a shell launches Node.
Each runtime/tool needs its own compatible semantics and explicit unsupported
boundaries; this is not current support or permission for native fallbacks.

## Existing proof milestones and engine work

The [implementation gap backlog](implementation-gaps.md) is the durable register
of known missing semantics, assumptions, legacy audit debt, and unverified
coverage. Reconcile it in every increment, including any newly narrowed proof domain.
Do not remove an assumption such as successful binding merely because the next
application statement can execute; closing it needs the recorded evidence.

The first external application target is
[`udivankin/pico-static-server` 3.0.3](https://github.com/udivankin/pico-static-server/tree/6b553fb34e3b5b5bccf3c082bb2cae5f93b9e3be),
a published MIT-licensed static HTTP server with a 150-line implementation and no
runtime package dependencies. Its entire server factory includes imports,
request registration, filesystem access, and listening. The first useful question
is whether a request for an existing directory whose default file is absent can
escape as an unhandled exception, and under which request/filesystem conditions.
Prophet now classifies the bounded missing-versus-empty-directory case: 404 or
escaping ENOENT, with matching pinned Node witnesses. This is a symbolic finding
within its declared domain, not complete server analysis. Selection,
immutable provenance, input/environment domains, result criteria, and the growth
plan are in [the real-world target contract](real-world-target.md).

The earlier execution layers prioritized the language and Node operations needed
to execute this complete target and classify symbolic request/filesystem paths
with supported native witnesses. The next product step preserves that evidence
in the runtime's serialized resulting environment for agents and other tools.
Request streams, JSON, and the discount
endpoint remain valuable milestones, but are not prerequisites for a static
server that does not consume request bodies. Grow to larger real applications
after demonstrating useful analysis on this small one. Each session should
choose an increment that closes a named target gap or improves shared semantic
correctness, and update the target's status without weakening its success criteria.

Current target progress: the complete nine-file published package is vendored
and hash checked, with real HTTP/filesystem reference specs on pinned Node.
Synchronous arrow support lets Prophet load its unchanged module and return the
actual factory. Shared identifier default parameters now initialize its original
`customOptions = {}` for omitted/undefined arguments and preserve supplied
options. Shared data-object spread merges those options; numeric listen overloads
now let the unchanged factory return its actual HTTP server for default port 8080
and supplied port 0. This assumes successful wildcard binding in the declared
primary-process environment. Delivering the deferred listening callback now
executes its untagged template and records the original console message, assuming
healthy stdout. Shared writeHead serialization and the pinned status catalog now
complete OPTIONS/POST/DELETE responses. For an explicitly delivered request
event with an unknown method constrained to be neither GET nor HEAD, Prophet
proves an empty body, status 200 for OPTIONS or 405
otherwise, and the missing intended Allow field caused by reversed arguments.
This symbolically reproduces the native reference's header observation, not a
novel vulnerability. The scoped [POSIX path](node-path.md) and
[legacy URL](node-url.md) models now execute the original GET/HEAD path expression.
The shared [symbolic filesystem](node-filesystem.md) then proves a bounded
exception condition: for `/docs`, a missing directory completes 404, while an
existing empty directory makes the original readFileSync throw ENOENT for its
missing index before committing or ending a response. The tree choice stays
unknown, and all filesystem calls consult that same state. Four matching native
GET/HEAD witnesses independently reproduce the 404 or process-exiting exception.
Source provenance preserves installed-versus-checkout DEP0169 eligibility;
warning delivery stays separate. HTTPS remains opaque. Default readable-file
reads now return shared [Buffer values](node-buffer.md), including fresh identity,
byte length, indexed bytes and persistent symbolic mutations. The unchanged
GET/HEAD regular-file and populated-directory-index paths reach their actual
`data instanceof Error` expression, now false through shared prototype reasoning.
Twenty-six complete Test262 files protect the ordinary operator; symbolic specs
retain conditional relationships and errors. The original success branch now
uses path.parse during MIME selection and completes status 200, response.write,
end and explicit finish delivery. GET serves bytes and HEAD suppresses them;
symbolic index presence also distinguishes success from escaping ENOENT. The
original writeHead argument reversal still discards the intended content headers.
Queued Buffer references are consumed at synchronous end under a declared
healthy schedule without earlier flushes. Shared [choice equality](symbolic-choice-equality.md)
now proves the combined GET/HEAD and index-presence domain: every path reaches
the actual read, an absent index escapes as ENOENT, and success returns 200
with the corresponding body. The false 405 path is eliminated by shared facts,
without filtering. General disjunctive relationships remain unknown under SYM-001.
Shared symbolic effective read/search access and descriptor availability now
classify inaccessible traversal as 404, denied reads as EACCES, exhausted
descriptors as EMFILE, and permitted reads as 200 with the GET/HEAD body. One
symbolic execution retains all sixteen input combinations. Independent real
Node permissions/exhaustion fixtures validate error priority and replay actual
server failures. The platform input defaults to Linux and supports Darwin's
empty-path priority. The baseline applies at filesystem calls, not to a shared
process-wide FD pool: HTTP startup/acceptance still assumes success. Post-open
fstat/read/close failures, descriptor lifetime, namespace races, transport outcomes
and schedules remain backlog work; the runtime CLI/state milestones above set
the immediate priority.
Protocol-to-event dispatch remains a gap: Node treats CONNECT separately, so the
symbolic callback-input domain is not a claim that every wire method reaches it.
Broader property descriptors, later expressions, and the required Node operations
still need their own semantics and specs before broader server claims. Destructured/rest
parameters and implicit arguments remain separate language gaps.

The shared VM already handles selected symbolic branches, mutable objects,
closures, return/throw paths, recursive summaries, numeric bounds, and CommonJS
supplied-source execution, cached local module resolution, and JSON modules. Broader
host compatibility and server analysis remain future work. Each increment
starts with specs and is validated before pushing to `master`.

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

The model supports optional/multiple request listeners, numeric
`listen(port[, callback])` and `listen(port, "127.0.0.1"[, callback])`,
explicit success/error listen notification and successful request/finish delivery, selected response fields,
direct writeHead, the pinned status catalog, string/Buffer writes and end payloads,
and falsy no-payload end. Resource state uses the persistent
heap, and callbacks use the current context and their captured environment.
Omitted-host calls attempt binding immediately while notifications stay deferred;
the explicit loopback-host form waits for modeled lookup/binding completion.
The optional bind transition supplies success or Error failure, including symbolic
choices; the default embedding still selects the older successful-bind domain.
The CLI supplies fresh unknown outcomes and drains supported startup jobs after
normal entry completion. It retains request handlers and any unexecuted tail on
throwing branches. Precise OS errors, address allocation, shared resource contention,
general scheduling and broader listen overloads remain gaps.
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

Continue in these increments, each with specs and a focused commit to `master`:

1. **Complete Node HTTP reference:** established; the exact source now also has
   symbolic proof assertions and concrete model/Node response comparisons.
2. **Builtin imports and server lifecycle:** the scoped canonical registry,
   `createServer`, `listen`, and deferred registered request delivery now pass.
   Broader overloads, listen outcomes, further EventEmitter APIs, and addressing remain.
3. **HTTP response behavior:** the scoped health-server proof passes, including
   completion flags, committed wire status, and HEAD body suppression. Numeric
   status conversion, null/empty payloads, 204/304, and UTF-8 edge cases have
   independent Node checks. Direct writeHead now commits explicit data/string
   header fields and a status/reason, with failure-order and snapshot checks.
   Ordered string/Buffer writes now assemble bytes at synchronous end, preserving
   alias mutation and symbolic paths. Normal write returns stay unknown without
   capacity facts. Progressive/framing headers, write callbacks/encodings, socket
   failures, backpressure events and richer completion schedules remain. No real sockets run in symbolic analysis.
4. **Shared event listeners:** the scoped registration, invocation order,
   removal, one-time listeners, mutation during delivery, failures, and
   path-dependent state now pass. HTTP listening/request/finish callbacks reuse
   that implementation, preserving current captured bindings and explicit event
   delivery. Metadata events, EventEmitter warning generation, streams, and
   broader APIs remain gaps. Scoped process warnings can now use the same
   next-tick FIFO as HTTP startup, with independent Node ordering checks.
5. **First real application:** follow [the pinned target contract](real-world-target.md).
   Whole-source provenance and Node reference specs are established. Arrow
   functions allow the actual module to load, and identifier defaults now run
   when invoking the factory. Shared data-object spread merges options, and the
   numeric omitted-host listen overload now returns its server under the stated
   successful-binding assumption. Shared templates and console effects now
   complete the original listening callback under healthy stdout. Scoped direct
   headers/status codes now complete OPTIONS/POST/DELETE, and explicitly delivered
   request events with symbolic non-GET/HEAD methods prove missing Allow plus
   conditional 200/405 responses. Wire-to-event dispatch remains unmodeled. The inspected
   fields exclude automatic Date/connection/framing. Scoped legacy URL parsing
   and POSIX join/normalize now compute the original GET/HEAD request path.
   A shared symbolic tree classifies missing-directory 404 versus empty-directory
   escaping ENOENT before any response commit. Matching native GET/HEAD/tree
   witnesses replay both conditions. Source-based DEP0169 eligibility and a
   default-warning state preserve the diagnostic boundary; an optional shared
   next-tick queue preserves warning/startup ordering. Successful
   default reads now return Buffer values and the shared `instanceof` check is false;
   path.parse now selects MIME and the original write/end/finish path serves files
   under the declared healthy consume-at-end schedule. Per-method symbolic index
   presence distinguishes successful bytes from escaping ENOENT. Shared equality
   refinement now proves the combined GET/HEAD domain too, preserving method/body
   correlation and excluding the impossible 405 without filtering paths. General
   disjunctive relationships remain mandatory unknowns (SYM-001).
   Byte mutations reuse the persistent heap and retain symbolic correlations.
   Effective access and baseline descriptor availability now establish EACCES,
   EMFILE, 404 and successful GET/HEAD outcomes with native witnesses. Credential
   policy, cross-host descriptor accounting, post-open failures and races remain.
   Broader filesystem classification remains open. Continue filling shared language, response,
   URL/path, and filesystem gaps needed for concrete module execution. Add
   symbolic request and filesystem choices, classify exception
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


## String reasoning alongside the host boundary

The [symbolic string increment](symbolic-strings.md) adds shared concatenation
length relationships and slice inference over unrestricted string middles.
Known prefix/suffix extraction and removal now prove useful properties without
enumerating possible input text. Concrete/coercion semantics have complete
Test262 cases and independent pinned Node comparisons; unprovable content stays
unknown. This prepares richer request/path reasoning for the real target without
claiming filesystem containment from textual prefixes. Next string work includes
startsWith/endsWith, richer length/equality constraints and slice composition;
regex/search, characters, legacy split/substr and allocation failures remain in
the backlog. It is independent of the next HTTP response increment.


The bounded event registry now composes histories through two arrivals, keeping
waiting and shorter histories, current listeners/resources and classified stopped
siblings. CLI nextTick draining occurs between normal arrivals and after the last
one. A stateful `/arm` then `/fire` spec now reaches the second-request failure;
its one-event domain cannot fabricate the prior arming request. This is a bounded
history result, not a general callback summary or proof over arbitrary timelines.
