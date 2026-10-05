# Prophet: symbolic environment to symbolic environment

## The core contract

Prophet is a use-case-agnostic **symbolic execution runtime / VM**. For a chosen
program and runtime semantics, its conceptual contract is:

```text
execute(program, runtime): SymbolicEnvironment -> SymbolicEnvironment
```

"Environment" here means the whole modeled machine/world state, not just
`process.env` or lexical scopes. The program, runtime and launch arguments
parameterize the transformation.

The input describes the environment at the start of execution. The output
describes that environment after executing the program, including conditional
outcomes and observable activity. Both use the same symbolic representation.
A concrete environment is an environment whose relevant values are known; it
does not require a separate concrete interpreter or a second state format.

This is the product direction agreed on **2026-10-02**. It supersedes the earlier
library-first `analyze(request) -> policy report` proposal. The existing
TypeScript VM implements scoped pieces of execution, not this complete public
CLI/state contract. Full JavaScript/Test262 coverage and advanced symbolic
reasoning remain engine goals. Security scanning, debugging, correctness and
performance analysis are consumers of execution results, not the VM's identity.

## CLI is the primary public surface

The durable interface is a command-line runtime that agents can launch, pipe and
redirect. A caller conceptually replaces `node` with Prophet and chooses the
runtime being modeled, preserving the target program's arguments.

The [first CLI slice](cli.md) now supports the second command below for a bounded
CommonJS domain with automatic acquisition of reached source dependencies,
console output and bounded HTTP startup with symbolic bind outcomes.
Explicit environment input in the first
command remains proposed:

```sh
prophet --runtime node@24.21.0 --environment initial.json -- app.js arg1 > final.json
prophet --runtime node@24.21.0 -- app.js arg1 > final.json
```

The first form supplies the initial symbolic state. The second may construct a
concrete starting environment, represented in exactly the same value/state model.
The selected runtime/version defines program semantics; it is distinct from the
implementation language or the runtime that happens to run Prophet itself.
Naming a version is not evidence of complete support. Current compatibility
specs and the CLI's only accepted profile use Node v24.21.0; arbitrary Node
versions are not yet implemented profiles.

Write the machine-readable symbolic graph directly to stdout. The current shape
is `{ roots, nodes }`; there is no separate report envelope or hand-written
model-domain/limitation narrative in the payload. Actual environment constraints
belong in modeled state; development limitations belong in docs/backlog. Runtime
diagnostics use stderr. A portable graph versioning contract remains future work.
The analyzed
program's own stdout/stderr belongs inside the modeled environment/observations,
so it cannot corrupt the result stream. Prophet diagnostics and progress use its
own stderr. Distinguish the CLI process's failure/status from modeled program
exit codes, throws and conditional completion. A policy rejection is a consumer
decision, not a VM exit classification.

A JavaScript library export can be a convenient optional embedding interface.
It is not the product priority, a prerequisite for the CLI, or a promise that
Prophet will remain implemented in JavaScript/TypeScript. The serialized contract
must remain useful across implementation languages. Keep internal object layouts
and language-specific APIs out of that public compatibility boundary.

## Initial environment

The input is **the symbolic starting environment**, not a security-scanning
request with policy fields attached. It can include concrete or unknown values,
constraints and correlated choices for:

- Process arguments, environment variables, cwd and other runtime state.
- Program/module artifacts and their resolution environment.
- Memory, object/reference identity, filesystem contents and host resources.
- Available events, external input, runtime/OS facts and scheduling state.

Named values/references let multiple locations refer to the same unknown. A
missing environment variable and an unknown present string are different states.
Known, partially known and wholly unknown values remain the same kind of VM
values. Never choose convenient independent results for operations that consult
the same resource state.

The environment may be supplied in a JSON file or constructed through a supported
builder such as a JS file. The precise authoring formats remain to be designed;
do not make hand-authored JavaScript configuration mandatory or bind the runtime
contract to it. A builder prepares initial state; it is distinct from the target
program and must not become an implicit native-execution fallback for that program.

When no environment is supplied, constructing a concrete environment is a
possible default. Its capture scope and provenance must be visible: captured
files/variables/runtime facts are concrete facts about that starting snapshot,
not about every machine or future interaction. Inputs that cannot be captured,
future network responses and concurrent changes must be represented explicitly
or left as unsupported boundaries, never guessed to be empty or successful.
Snapshot acquisition is distinct from executing the target. Even a fully
concrete run updates modeled state; it does not authorize real network sends,
filesystem writes or native subprocess execution during exploration.

Budgets are execution controls, not facts that shrink the input domain. A time
or step limit does not turn an unfinished execution into a final concrete state.

## Resulting environment and execution history

The result is the symbolic environment resulting from execution, not one chosen
path, a list of sampled runs, or a use-case-specific verdict. It must preserve:

- Final/retained memory and resource state, including aliases and closures where
  observable, with the conditions selecting alternative values/states.
- Normal completion, return/exit, thrown exceptions and pending continuations.
- Ordered observable interactions: file accesses/mutations, stdout/stderr,
  attempted network operations, process launches and other modeled effects.
- Value expressions, dependencies, path conditions and source/artifact origins
  needed to relate observations to starting state.
- Unresolved work, unsupported operations, exploration limits, assumptions and
  the execution scope actually represented.

History is part of the environment representation. A request or failed file read
may leave no lasting heap/filesystem change but still occurred. Its arguments,
ordering and condition must survive. API invocation, attempted external operation
and successful delivery are distinct facts. Unknown effects cannot disappear
because the VM performs no real external I/O.

For example, if a symbolic Boolean selects whether to make a request, the result
retains the conditional request and its symbolic destination. It does not label
that destination approved or malicious. If execution then reaches an unsupported
operation, earlier state/effects remain available along with that unfinished
boundary; downstream tools cannot infer that later activity is absent.

The same-representation goal requires stable graph references, not a raw dump of
current JavaScript objects. Preserve cycles, shared objects, functions' lexical
environments, host resource identities and expression/fact sharing. Include the
program/artifact identities, runtime/model versions and capture assumptions needed
to interpret a result. Versioning and round-trip tests must make any difference
between an initial state, a terminal state and a suspended state explicit.
Complete serialization/resumption is future work; today's private WeakMaps and
internal execution contexts are not already a portable snapshot format.
The initial CLI transport preserves graph references, maps, special primitives,
conditional histories and available function definitions, but labels its output
as an inspection projection in its documentation. Server/emitter `hostSlots`
metadata now links ordinary graph references to persistent lifecycle/listener
state, including pending bind attempts. The global `node.nextTick` link retains
pending/active jobs in the shared persistent queue. These links are not guest properties
or initialization proofs; the selected heap and private receiver registries still
matter. Native closures and remaining private resource associations are opaque,
so the links do not establish resumability. Classified unsupported operations and
exhausted budgets now retain [execution boundary leaves](execution-boundaries.md)
alongside completed siblings. Exact leaf contexts retain source frames and
remaining statement sequences, not resumable native continuations. A completion
tree with `state: "partial"` pairs with its common base checkpoint; consumers must
inspect leaf states rather than treat that aggregate as final. Untagged legacy
failures still retain one checkpoint and omit the completion root. Both kinds of
analysis stop report diagnostics on stderr with exit status 2. Internal
capture metadata is not yet modeled as graph state. See [the current schema](cli.md).

After normal entry completion the CLI drains its supported startup jobs, invoking
listening/error callbacks with current state. A throwing branch retains later
jobs without executing them; an analysis stop can retain active work. A drained
queue does not imply the whole process finished or that future request handlers
were explored. The [queue boundary](jobs.md) remains distinct from a general
scheduler, process recovery and automatic future-event exploration.
A symbolic event path is a permitted timeline plus its conditions, and can stand
for many concrete executions. Preserve shared prefixes and conditional states;
the first startup-queue component does not enumerate all possible timelines or
establish coverage beyond its modeled events and budgets.

General programs may not terminate, and some executions exceed supported
semantics or budgets. The conceptual environment transformation therefore needs
an explicit partial/suspended result in those cases. Such a result is not a
claim that execution completed or that every possible continuation was covered.

## Conditional history and callback knowledge

The **Node public built-in API boundary** remains the current runtime target.
Its models may describe HTTP operations/resources; the shared VM preserves their
symbolic arguments, identities, state and conditional effects. Interpreting Node's
own JavaScript internals is not a prerequisite for this boundary. A flat top-level
HTTP-request list is not the execution representation: consumers may derive such
views from the graph while preserving conditions and ordering.

The current [effect trace](../src/effects/model.ts) already represents an empty
history, an event referring to its predecessor, or a choice between histories.
This is a foundation for portable output, not a full event-loop graph or a
resumable snapshot yet. Retain state/reference graphs, conditional history and
pending work together. Console `inspectOutput().chunks` is a test inspection
view of separate writes, not a symbolic-string field or a committed public schema.
Backlog IDs are development bookkeeping, not semantic fields in the runtime API.
Actual environment constraints and branch facts remain part of symbolic state;
unimplemented behavior needs an explicit execution boundary, not an invented
successful outcome decorated with a gap ID.

A function value retains its code and lexical environment identity. Its existence
does not establish that it was called or that all of its behavior has been derived.
A future callback summary can describe the conditional transformation:

```text
(arguments, receiver, captured state, host state)
    -> (completion, effects, resulting state)
```

The runtime can derive this knowledge by symbolically evaluating possible calls.
Users should not have to invent a concrete HTTP request by hand: the Node model
can eventually introduce valid symbolic request events and schedule the registered
callbacks automatically. It still needs a model of event eligibility, arguments,
receiver, resource identities and ordering. A function on an unreachable branch,
or a removed listener, must not acquire reachable effects merely because its body
contains them. A generic function summary can describe hypothetical behavior
without claiming it happened during startup.

Invocation-time state matters. A handler may set a captured `armed` flag on an
`/arm` request and throw on `/fire` only when that flag is true. The same function
cannot throw this way on its first request from `armed = false`, but can after a
prior `/arm`. Summaries must retain that dependency, and exploration must connect
each invocation to the state produced by earlier events. Registration-time values
are not a frozen substitute for current captured bindings.

One CLI invocation should eventually discover and analyze such reachable event
behavior automatically. This does not promise exhaustive enumeration of arbitrary
programs or indefinitely many events. Reusable summaries/invariants may cover
unbounded cases; explored domains, unsupported transitions and unfinished work
must remain visible. Today HTTP delivery is embedding-driven, and the existing
recursive summaries cover a restricted pure subset, not eventful callbacks.

## Consumer tools own interpretation

The VM does not assign values a security `sensitivity`, decide whether behavior
is malicious, select a policy, or produce approval/violation verdicts. Its domain
is execution semantics: values, relationships, state transitions and effects.

Higher-level tools consume the same result for different purposes:

| Consumer | Interpretation outside Prophet's runtime semantics |
| --- | --- |
| Security scanner / npm admission wrapper | Map input identities to external classifications, examine possible effects/data relationships, evaluate allowed destinations or protected resources, and request approvals or block execution. |
| Bug finder / debugger | Examine exceptions, unfinished responses and conditions producing unwanted states; present or derive a feasible witness. |
| Performance analyzer | Examine operation counts, symbolic work or costs under an explicit cost model. Prophet's own wall-clock analysis time is not the modeled application's runtime. |
| Other agent tooling | Compare resulting states, inspect outputs, ask new questions or prepare another starting environment. |

Generic provenance/dependency tracking may support many consumers. Security
labels, redaction/classification rules, noninterference questions, budgets-as-
business-policy and admission verdicts remain external interpretations. Current
symbolic expressions are not a complete information-flow or performance model;
consumers must account for those limits instead of inventing missing evidence.
See the [security use-case roadmap](agent-security-analysis.md) for that consumer.

## Beyond Node

The same abstraction can later model **Bash and GNU tools**, including a shell
launching Node and preserving shared files, pipes, process state and observations.
Each runtime/tool needs its own execution semantics and compatibility evidence.
This is a longer-term extension, not current support and not a reason to execute
unknown shell/native commands on the host. Node is the first runtime target;
the public CLI/state format should not assume the implementation language is JS.

## Next increment and acceptance

The bounded startup slice now [runs the unchanged pico HTTP startup script
through the CLI without an environment file](roadmap.md#next-milestone-pico-startup-through-the-cli-with-no-environment-file).
It constructs its supported starting state and returns conditional server state:
successful binding reaches startup output and waiting for future requests;
failure retains an unhandled Error without that output.
This is an execution snapshot, not evidence that a long-running server terminated
or that every future request was explored. Keep unknown bind/host outcomes
explicit; a partial bind boundary alone is not successful-startup evidence.

The CLI uses the shared loader/VM and a generic persistent queue. Its opaque
unused imports provide identity only; filesystem capture, broader host assembly
and future request domains remain work. Preserve existing symbolic input
correlations, completion/effect paths and native reference comparisons when
connecting them. Caller-supplied environment files and full resumption remain
subsequent increments.

Then cover explicit symbolic and concrete inputs using the same representation,
captured/default-state boundaries, program stdout inside the result, deterministic
state identities, conditional completion, and partial/unsupported output. Test
round trips for the supported state subset and reject serialization gaps rather
than silently omitting state. Do not introduce sensitivity/policy/verdict fields
to satisfy a particular consumer. An optional library export can follow without
changing the CLI contract.

Then extend generic execution and observable-effect support as actual consumer
examples require. Keep debugging/performance uses visible alongside security;
the Shai-Hulud objective remains a downstream benchmark. Deeper filesystem or
transport work follows demonstrated semantic blockers, with every remaining
gap retained in the [implementation backlog](implementation-gaps.md).


The filesystem acquisition adapter now represents unobserved directory children
and file contents explicitly, and records reached facts in persistent VM state.
Its first observations are stable across branches, but their acquisition is
on demand and non-atomic. See [the precise capture boundary](node-filesystem.md#read-only-environment-acquisition).
The adapter's native observation cache is not a resumable environment, and its
existence alone does not establish CLI filesystem/request integration.
