# Explicit CLI environment inputs

## Question

How can the CLI preserve correlations between resource facts and incoming request
fields without a JavaScript builder or an arrival counter?

## Current rule

P035 adds a bounded strict-JSON `--environment` declaration. Validate every named
expression and both selection branches, infer reference types and bound expanded
work before constructing any VM value or observing the target path. Compile each
named value once. Filesystem facts and request references reuse that identity;
inline symbolic request leaves are created only on selected arrivals. A factory
gets no ordinal and applies to every eligible server. Native closure counters
would count explored siblings, not one persistent history.

Link the complete named Map, normalized template and exact-file identity through
`node.environment` before execution. A request template at horizon zero and an
unused name are still declared state. A retained template is not evidence of a
delivered event. Omit the slot entirely when no file is supplied. Freeze template
records and guard ordinary Map mutations after compilation; do not mutate a
compilation cache during event exploration. Native embeddings remain trusted
implementation code, not hostile code isolated by this guard.

The normalized template uses `kind` records for literal, symbolic, reference and
selection expressions; selections carry their inferred `type`. It is distinct
from the authoring JSON and from the VM values delivered to handlers. Update
consumer tests against the documented projection, rather than assuming the
original authoring object appears verbatim in the graph.

## Review lessons

Memoized construction alone does not bound repeated traversal of a shared
expression DAG. A reference contributes one plus its entire definition weight;
a selection contributes one plus all three children. Count every root and ref
occurrence, including unused definitions. The seven-level repeated-DAG fixture
has weight 1243 and is accepted under 4096; twelve levels exceed the bound. A
rejection test must verify its intended reason, not pass on an earlier typing
bug. Likewise, reference type checking must follow resolution, not inspect a
syntactic ref as if it already had a type.

File bounds must gate allocation using the opened descriptor's size. Capped
reads and post-read checks cannot undo an earlier unbounded allocation. A mock
for this path must replace the actual shared fs module, not a Babel namespace
copy. Strict UTF-8 file decoding does not forbid JSON escapes representing lone
UTF-16 surrogates; those are JavaScript string data. Count header values in the
aggregate literal budget as well as their individual header limit.

## Sources and executable specs

- [Public schema and limits](../cli.md#declaring-a-starting-environment),
  [state contract](../symbolic-runtime.md), [event semantics](../external-events.md).
- [Parser](../../src/cli/environment.ts), [runtime wiring](../../src/cli/runtime.ts),
  [HTTP provider](../../src/node/http.ts).
- [Parser validation](../../test/cli-environment-validation.spec.ts) and
  [independent parser probes](../../test/cli-environment-parser-review.spec.ts).
- [Environment scenarios](../../test/cli-environment.spec.ts): shared references,
  fresh arm/fire choices, resource correlations and unchanged pico callbacks.
- [Provider specs](../../test/node-http-request-input.spec.ts): no invocation on
  waiting/ineligible sources, every eligible server and shorter histories.
- [Task review](../agent-tasks/P035-symbolic-environment/review.md) records design
  amendments, partial-draft observations and independent evidence separately.

## Limits and status

The domain is parsed events through horizon 0/1/2, with supported nextTick work
between arrivals. Resource/bind failures and waiting remain possible. No wire
parser, bodies, general stream scheduling, process-environment authoring, closed
filesystem tree, full graph import/resumption or capability policy is added.
File capture is non-atomic and does not walk every ancestor without symlinks.
This does not prove all package behavior or automatic malware detection.

Reviewed implementation `30f547f` on 2026-10-21 passes the full171-suite,
5207-test run and typecheck; exact-candidate CI/publication are tracked in the
task ledger. Supersedes claims that all
explicit environment input is merely proposed, while preserving the broader
state-contract work as open.
