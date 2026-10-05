# Bounded external event exploration

The shared [external-event registry](../src/external-events.ts) records runtime
providers in an ordinary persistent `sources` array. Each provider retains its
eligibility function, delivery function and receiver identity. Runtime providers
register resources; the VM never scans or invokes arbitrary retained closures.
A global host slot `externalEvents` links this registry into the CLI graph.
Conditional resource creation changes only that branch's registry.

A checkpoint with bound one explores either no arrival yet, or one eligible
provider. Every eligible source can be selected; array order does not assert an
arrival priority. Eligibility reads current state. A delivery invokes the
provider through the shared VM, preserving conditions, ordered effects, thrown
values, and current lexical/heap state. Its source is retained as `active` during
invocation, cleared on normal or throwing language completion, and retained at
an unsupported-delivery checkpoint. Active reentry/resumption, non-Boolean
eligibility and unsupported bounds reject. Source lists must be finite and
dense; stack/allocation/capacity limits remain unmodeled.

`--max-events 0` is the CLI default and preserves startup-only behavior.
`--max-events 1` adds this checkpoint after normal entry and startup completion;
values above one reject explicitly. This is a bound on events along each modeled
timeline, not an assertion that the environment can deliver no later event.
Sources remain registered afterwards. A delivery consumes the shared evaluation
budget. Supported jobs queued by a normally completing request drain afterwards;
a throw stops that path. There is no second incoming event, arbitrary scheduler,
process teardown, or claim that the waiting process has terminated.

The HTTP provider registers each created server and is eligible only after
successful listening notification. A handled bind failure remains ineligible;
a startup throw never reaches this checkpoint. On arrival it allocates fresh
request and response identities and independent unknown **string** `method`
and `url` values, then uses the ordinary shared EventEmitter request path.
Listeners see the server receiver and current registrations/captured bindings.
The request argument fields and response host slot preserve input/body state in
the graph; no request/response is allocated on a no-arrival path.

This parsed-event domain deliberately overapproximates wire-valid strings. It
is not an HTTP parser, and results involving e.g. CONNECT or malformed URLs do
not establish that Node emits a request event for that wire input. Headers,
bodies, socket allocation, dispatch rules, transport failures, automatic finish
and arbitrary event sequences remain unsupported. Existing response operations
retain their synchronous end-consumption/successful-transport assumptions.
The waiting alternative does not establish transport failure or success.

[CLI specs](../test/cli-incoming-events.spec.ts) retain `/crash` throws, normal
responses, waiting, bind failure, conditional/multiple servers, listener removal,
receiver identity and current captures. A first `/fire` cannot fabricate a prior
`/arm`. [Generic specs](../test/external-events.spec.ts) check persistent source
state and stopped delivery. [Independent pinned Node witnesses](../test/node-incoming-events-reference.spec.ts)
use valid GET `/crash` and `/ok` requests and observe the crash before fatal
teardown. They are local compatibility evidence, not complete upstream coverage
or a proof that every symbolic parsed event has a wire witness.
