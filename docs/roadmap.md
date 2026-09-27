# Proof milestones and host runtime coverage

The North Star is to analyze existing JavaScript and its dependencies and prove a
property across the declared input and environment domain. This includes programs
that interact with their environment, not just functions that return values.
Unknown results and unsupported behavior must remain explicit. Automatic
counterexample generation is a later consumer of execution results, not a
prerequisite for extending the symbolic VM.

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

The concrete target now lives in [the discount server spec](../test/discount-server.spec.ts):
an actual Express application parses JSON, validates a percentage, writes its
normalized value to a fixed UTF-8 file, and completes the response. The handler
source is shared by Node reference execution and Prophet's direct handler proof;
the [README](../README.md#concrete-north-star-saving-a-discount) shows the code.

Acceptance criteria for the eventual full symbolic application proof:

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

1. **Reference and direct handler:** complete for the scoped contract above.
   Prophet proves rejection without writing, or normalized write before 204,
   or a propagated write failure with no response. It does not yet execute
   Express error middleware to establish 500.
2. **Unmodified Express startup:** supply the pinned package/dependency sources
   to the CommonJS loader. Add shared language and Node semantics for each
   encountered blocker, with independent compatibility checks. No replacement
   Express implementation or dependency-source rewriting.
   Source inspection identifies an early chain through `body-parser` to `depd`,
   which imports `path.relative` and calls `process.cwd()`. Both are currently
   unsupported. The next small increment should establish builtin module
   identity and these explicit environment boundaries, then test unmodified
   dependency loading. This is an inspected blocker, not a completed Express
   execution; `depd` also needs V8 stack APIs when its exported function runs.
3. **Actual routing and middleware:** evaluate the application through Express's
   dispatch with modeled Node request/response boundaries. Cover middleware
   order, JSON parsing, `next()`, thrown errors, and response completion. Establish
   the acceptance criteria above through the real application/library code.
4. **Richer environments:** add more filesystem failures and state transitions,
   multiple requests, authentication, and then asynchronous storage/callbacks.
   Authentication guarantees are relative to its modeled boundary. Scheduling
   assumptions and bounded exploration must be explicit.

A direct handler call alone does not establish that Express routes or sends
responses correctly. Samples and successful reference executions validate models
and regression cases; they never replace an all-input symbolic proof. Snapshots
currently inspect heap state and facts, not captured callback environments for
replay. General callback replay and asynchronous ordering remain future work.
