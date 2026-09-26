# Proof milestones and host runtime coverage

The North Star is to analyze existing JavaScript and its dependencies, prove a
property across the declared input domain, or return a concrete counterexample
that can be replayed in ordinary JavaScript. This includes programs that interact
with their environment, not just functions that return values.

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
package type scopes, and JSON modules. Its cache is part of each execution context,
so cycles, retries, retained effects, and conditional loads use ordinary VM
branch state. It supports finite choices of request names and rejects open
symbolic names. The [local compatibility suite](../test/commonjs/README.md) runs
against pinned Node v24.21.0. Package-name lookup, conditional exports, host disk
access, further module metadata, implicit arguments, and global eval declarations
remain explicit gaps; no complete upstream Node test is claimed as passing yet.
The next resolution layer is package lookup and conditional exports, followed
by the Error/string/environment behavior needed by the pinned package.

## First published dependency proof

Interpret the unmodified published CommonJS build of `tiny-invariant` 1.3.3,
recording its provenance and integrity when adding the fixture. Its
[published metadata](https://registry.npmjs.org/tiny-invariant/1.3.3) uses nested
conditional exports: a require selects the default branches leading to
`dist/tiny-invariant.cjs.js`. Honoring only `main` would bypass the actual package
resolution path. Its Error, `String.prototype.concat`, module, and `process.env` behavior
must use shared VM implementations. Supply the modeled environment explicitly,
including development and production settings.

The application-level target is a percentage normalizer that calls the library
to assert its numeric input lies in [0, 100], then returns the input divided by
100. For any JavaScript number, it must throw or return a value in [0, 1]; NaN
and infinities must be rejected. Also prove that the lazy message callback runs
once on rejection in development, never on success, and never in production.
Derive the guarantee by evaluating both the application and library code.

## Side-effecting functions and a simple Express server

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

Start with a small synchronous effectful function using an explicitly modeled
store and response sink. Prove properties of state changes and effect counts,
not only return values. Validate the host models with independent concrete
contract specs. Keep the modeled input/environment assumptions visible in each
proof and do not perform real writes or send real network responses during
symbolic exploration.

The next real-world target is a small Express server with a guarded write route:

- For a request rejected by authentication or input validation, no store write
  occurs and the expected rejection response is sent exactly once.
- For an authorized, valid request with a successful modeled store operation,
  exactly one write precedes exactly one success response; its payload agrees
  with the value written.
- For a modeled store failure, no success response is emitted; the error path
  preserves any effects allowed by the store's declared failure contract.
- Requests, callbacks, and shared state preserve their identities and ordering;
  broader sequences of requests and scheduling choices become later milestones.

Begin with direct handler proofs as a scoped stepping stone, then execute a
pinned Express release and its actual dependency/middleware/dispatch code with
modeled Node boundaries. Integration specs must cover middleware order,
`next()` and error propagation, and response completion state. A fake `res`
object or direct handler call alone does not establish that the Express server
routes or sends responses correctly.
Scope the first server proof to a declared initial state and request domain;
authentication guarantees are relative to the modeled authentication boundary,
not a claim that a real authentication service is correct.

Use pinned Node and [Express API](https://expressjs.com/en/4x/api/) references
and concrete integration replay to check the observable effect traces. Turn a
found violation into a concrete request and
environment scenario and replay it against the same application and dependency
versions. Samples and successful replays check models or counterexamples; they
never replace an all-input symbolic proof.
