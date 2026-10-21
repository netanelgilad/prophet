# Interpreted activations and host-effect origins

P036 adds generic execution provenance to the existing state/effect graph.
An interpreted activation records that a function invocation has begun; it does
not claim that its body completed or that every statement ran. The observation
supports debugging and later dependency attribution without assigning policy.

## State and effect identity

`ExecutionContext.value.activation`, when present, is a frozen linked record:

```text
{ target: existing function identity, sourceFile?: lexical filename,
  parent?: dynamically active interpreted activation }
```

Each actual entry through createFunction creates one record, including ordinary
functions, arrows, constructors and CommonJS wrappers. Its parent is the caller's
current activation. Escaped closures retain their lexical filename but acquire
their actual caller as parent; initialization/registration ancestry is not revived.
Repeated and recursive entries share a function target but have distinct frames.
Creation alone creates no activation. Native adapters, host functions and eval
itself do not gain invented interpreted frames.

Entry precedes receiver boxing and parameter initialization. Ordinary returns,
fallthrough and guest throws restore the caller identity. Branch joins reconcile
the restored leaves rather than reusing the callee's earlier fork base. A join
of different active identities is an internal analysis failure, not a conditional
stack chosen arbitrarily. Classified analysis stops retain the active leaf's
checkpoint. An unconverted legacy guard may still expose only one checkpoint.
Direct low-level implementation generators retain error checkpoints; their caller
must use the normal evaluator/boundary conversion to produce classified leaves.

Every modeled `HostCall` has a frozen `origin` record with the current sourceFile
and activation at invocation entry. Call/return/throw events share the exact same
HostCall and origin, even if its model invokes an interpreted callback. Nested
callback effects have that callback's own activation. Event-time heap and path
knowledge retain their existing semantics. Missing host models/member lookups do
not fabricate calls, external attempts or successful transport.

Direct source and lexical frame file are distinct. Eval effects can have unknown
direct sourceFile with a known enclosing activation; generated functions may have
unknown lexical source too. No nearest-file fallback is applied. Embedding-provided
filenames are trusted labels, not attestations of source bytes or package identity.

## Proof and event boundaries

The explicit `interceptCall` proof-session hook suppresses new public activations
while summary inference tries scratch executions. Successful summaries restore the
caller; rejected proof diagnostics must not present a trial function as an
application invocation. Existing diagnostic source/environment checkpoints are
not converted into a complete public proof-trial history. Summary eligibility,
proof assumptions and answers are unchanged by this metadata.

A synchronous callback receives its dynamic interpreted caller. A future HTTP
or startup-queue callback is attributed only when delivered, using current state.
Its lexical source remains known, but a completed registration wrapper is no
longer its parent. Waiting/preserved callbacks are not analyzed invocations.
Asynchronous causal lineage would require separate generic state; this slice
makes no claim to reconstruct it or native/V8 stacks.

## Graph and resource boundary

The CLI context projection includes activation. Origin/activation records use
ordinary graph references, retaining shared targets and parents. The payload
remains `{ roots, nodes }`; it contains no hand-written limitation or policy prose.
This adds no resumption support, stable cross-run function IDs, file hashes,
package/lockfile mapping, source coordinates or portable graph versioning.
The separate [program identity root](program-identities.md) now permits matching
known file labels to acquired byte hashes; unknown generated files remain unknown.

Each frame adds O(1) work and one shared parent link; entry does not copy/walk
ancestors. There is no new activation-specific depth cap. General VM host-stack
depth and recursive graph encoding remain unbounded resource gaps (SYM-004,
REPORT-001, SECURITY-002), even with an AST evaluation budget. A moderate 25-frame
probe under an external timeout checks frame identity and graph deduplication;
it is not an arbitrary-depth or adversarial resource guarantee. Ancestry must
never be silently truncated to make an unsupported execution appear complete.

## Evidence

Core specs: [interpreted-activation.spec.ts](../test/interpreted-activation.spec.ts).
Real loader/CLI and callbacks: [effect-origin-integration.spec.ts](../test/effect-origin-integration.spec.ts).
Independent branch/proof/resource probes:
[interpreted-activation-review.spec.ts](../test/interpreted-activation-review.spec.ts).
[Task and review](agent-tasks/P036-effect-activation/task.md) retain validation.
This metadata is Prophet-specific, so no Test262/native stack equivalence claim
follows; the full existing language and pinned host compatibility suites remain
regressions. Complete upstream candidate lists and historical skips are unchanged.
