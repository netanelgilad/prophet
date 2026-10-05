# Unfinished execution branches

The VM preserves explicitly classified unsupported operations and exhausted
execution budgets as `ExecutionBoundary` leaves in its existing completion tree.
A leaf retains its exact context, including branch facts, heap, lexical bindings,
ordered effects and active/pending jobs. Normal siblings continue through their
remaining statements and jobs; thrown siblings keep normal JavaScript exception
semantics. No boundary is a JavaScript value or catchable exception. Guest catch,
finally, function-return cleanup and host-call return effects do not run on a
stopped leaf.

`ExecutionBoundary` contains `kind` (`unsupported` or `budget`), the reached
operation's diagnostic, entered AST `frames` with available `sourceFile` identity,
and `pendingStatements` from unfinished statement sequences. AST locations retain
source positions. Frames describe operations entered during evaluation, in
innermost-to-outermost order; pending statements describe work following a stopped
statement in each enclosing sequence. Native calls can have no AST frame. These
are inspection records, not cloned JavaScript generators, program counters or
executable continuations. Argument values, native continuations and every other
intermediate expression state are not serialized. Function definitions and active
jobs remain graph references; none of them establish resumability.

A `ForkedCompletion` containing any unfinished leaf has `state: "partial"`.
Its paired context is the common `base` checkpoint, **not a joined final state**.
Consumers must follow the consequent/alternate pairs to observe the resulting
state of each branch. This avoids pretending that stopped inner scopes and
completed outer scopes have one valid execution cursor, and avoids losing leaf
outcomes to an unsupported state join. Fully completed trees keep the existing
joined-context behavior. The same rule applies to nested trees and startup jobs.

Classification is explicit through `UnsupportedAnalysisError` and
`ExecutionBudgetError`; there is no message matching or blanket conversion of
native errors. The initial classified domain includes missing AST resolvers,
AST/job budget exhaustion and guarded member reads/writes/coercions of the four
opaque CLI builtin objects. Other guards, including opaque reflection/enumeration,
invalid queue controls, unsupported joins and legacy language/host rejections,
still throw analysis errors with one retained checkpoint. Unexpected native
Error, TypeError and assertion/invariant failures also escape. Their failure is
not a completed symbolic result and may discard siblings. Native models must retain
their latest persistent context with `withAnalysisFailureContext` before throwing
a classified boundary; opaque native work since the last shared checkpoint is
not reconstructed. Converting these
remaining known guards requires individual review; REPORT-001 stays open.

Budgets constrain analysis work, never the program's input domain. The AST budget
and queue delivery count are shared across exploration. Later siblings may
therefore retain a budget boundary before executing any further operation;
finished siblings remain represented. Job exhaustion happens before dequeue and
retains the head. An unsupported callback retains its active job and pending tail,
while a supported sibling can finish that callback and drain its tail.

The CLI keeps the completion root for classified partial trees and returns status
2 with the reached diagnostics on stderr. The generic `{roots,nodes}` graph keeps
every leaf context and source record; its top-level `current` is the common
checkpoint when completion has `state: "partial"`. Legacy failures still omit the
completion root. This is an inspection projection, not a new environment input
format, complete frontier reconstruction for legacy failures or a resumption API.

[VM specs](../test/execution-boundaries.spec.ts), [queue specs](../test/jobs.spec.ts)
and [CLI graph subprocess specs](../test/cli.spec.ts) cover both branch orders,
nested normal/throw/stopped leaves, catch/finally exclusion, argument/conversion
short-circuiting, retained effects/scopes/source, active jobs and budgets.
[Test262 harness specs](../test/test262/runner.spec.ts) ensure an unfinished test
cannot pass or satisfy a language throw assertion. This engine boundary changes
no ECMAScript semantics and adds no new Test262 selections or Node API claims.
