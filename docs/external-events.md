# Bounded external event exploration

The shared [external-event registry](../src/external-events.ts) records runtime
providers in an ordinary persistent `sources` array. Each provider retains its
eligibility function, delivery function and receiver identity. Runtime providers
register resources; the VM never scans or invokes arbitrary retained closures.
A global host slot `externalEvents` links this registry into the CLI graph.
Conditional resource creation changes only that branch's registry.

`step(context)` explores no arrival yet or one eligible provider. Its normal
VM Boolean result is false for waiting and true after a completed arrival.
`explore(context, maxEvents, afterEvent?)` composes steps for bounds 0, 1 or 2. Every eligible source can be selected; array order does not assert an
arrival priority. Eligibility reads current state. A delivery invokes the
provider through the shared VM, preserving conditions, ordered effects, thrown
values, and current lexical/heap state. Its source is retained as `active` during
invocation, cleared on normal or throwing language completion, and retained at
a classified unsupported-delivery frontier while supported siblings continue.
Active reentry/resumption stops with a classified boundary. Non-Boolean
eligibility and unsupported bounds reject as configuration errors. Source lists must be finite and
dense; stack/allocation/capacity limits remain unmodeled.

`--max-events 0` is the CLI default and preserves startup-only behavior.
`--max-events 1` explores histories through one arrival; `--max-events 2` also
explores second arrivals. Values above two reject explicitly. Waiting ends the
current history instead of consuming a fake event and trying again. Thus bound
two retains zero-, one- and two-arrival histories. Each new step rereads current
sources and eligibility; sources/listeners created or changed by an earlier
callback can affect later delivery. This is a bound on completed arrivals along
each modeled timeline, not an assertion that no later event is possible. A
throwing or unsupported arrival remains in history and stops that branch.

The optional `afterEvent` hook runs on each normally delivered leaf, including
the final allowed arrival. It can fork, register sources, throw or stop; further
steps compose only onto its normal leaves. The CLI supplies shared nextTick FIFO
draining here. Pending listening/error notifications therefore run before another
incoming request is considered. A stopped job retains its active/pending state;
a job throw retains its pending tail. Neither permits another arrival. Waiting
itself invokes no hook. Startup still drains before the first checkpoint.

Exploration runs this continuation inside each selected provider branch, before
joining that branch with other providers or waiting. Joining arrival statuses
into a composite Boolean and then splitting it again previously allowed the
incomplete reasoner to retain contradictory paths: a hook could observe the
initial no-arrival state and return an impossible guest throw. The regression
specs check both VM completions and exact leaf-knowledge histories for two
providers at horizons one and two. Public `step` still returns its Boolean;
embeddings that split composite joined results can encounter the general
reasoner's disjunction limits (SYM-001). This change preserves event-continuation
correlations, not general satisfiability or automatic witness extraction.

Selected deliveries consume the shared evaluation budget before becoming active.
Exhaustion is a classified budget frontier, preserving waiting/other completed
siblings rather than an application throw. Budget charges remain shared across
exploration work; no budget fact constrains the environment. Active unsupported
callbacks cannot resume from this graph. Native implementation defects and
unclassified legacy failures still escape; this is not arbitrary scheduling,
process teardown, resumption, fairness or an all-timeline proof. Future sources
remain registered after the declared horizon.

The HTTP provider registers each created server and is eligible only after
successful listening notification. A handled bind failure remains ineligible;
a startup throw never reaches this checkpoint. On arrival it allocates fresh
request and response identities, then uses the ordinary shared EventEmitter
request path. Method and URL default to independent unknown **strings**. The
[CLI environment template](cli.md#declaring-a-starting-environment) can supply
concrete/finite/shared fields and concrete lowercase-token headers instead.
Its zero-argument factory runs only on a selected arrival, never on waiting or
an ineligible source. Inline symbolic leaves are fresh per factory invocation;
named references retain identity across arrivals and filesystem facts. All
eligible servers use the same template. There is no native counter: sibling
exploration can invoke the factory more than the per-history event bound.
Listeners see the server receiver and current registrations/captured bindings.
The request argument fields and response host slot preserve input/body state in
the graph; no request/response is allocated on a no-arrival path.

This parsed-event domain deliberately overapproximates wire-valid strings. It
is not an HTTP parser, and results involving e.g. CONNECT or malformed URLs do
not establish that Node emits a request event for that wire input. Parsed concrete
headers are supported; wire header parsing, request bodies, socket allocation,
dispatch rules, transport failures, automatic finish, histories longer than two
and arbitrary event sequences remain unsupported. Existing response operations
retain their synchronous end-consumption/successful-transport assumptions.
The waiting alternative does not establish transport failure or success.

[CLI specs](../test/cli-incoming-events.spec.ts) retain `/crash` throws, normal
responses, waiting, bind failure, conditional/multiple servers, listener removal,
receiver identity and current captures. A first `/fire` cannot fabricate a prior
`/arm`; a second `/fire` now retains that prior state and can throw. Its
throwing path proves the first request was `/arm` and the second `/fire`, without
inventing armed state for the reverse order. Listener replacement and newly
created servers exercise invocation-time state and jobs between arrivals.
[Generic specs](../test/external-events.spec.ts) and [sequence specs](../test/external-event-sequences.spec.ts)
check persistent state, shorter histories, newly eligible sources, final-arrival
job draining, classified active frontiers, stopped hooks/jobs and their siblings.
[Independent pinned Node witnesses](../test/node-incoming-events-reference.spec.ts)
use valid GET `/crash`/`/ok` requests and both `/arm`–`/fire` orders, including a
nextTick between completed request handling and the next arrival. The monitor
observes uncaught failure before fatal teardown. They are local compatibility evidence, not complete upstream coverage
or a proof that every symbolic parsed event has a wire witness.


The complete upstream nextTick/error candidates in [the queue record](jobs.md#complete-upstream-cases-reviewed)
remain inactive. Re-review of the pinned ordering2 and errors files confirms
that timers, public process APIs, exit/recovery handlers and common/assert are
still necessary. Local two-request witnesses do not activate those whole files
or the complete HTTP/client/stream cases in [the HTTP record](node-http.md#complete-upstream-cases-reviewed).
The CLI graph retains histories and source/job state, not executable native
continuations or a proof about events after the invocation's chosen horizon.


## TCP completion providers

P040 adds admitted pending IPv4 sockets to this same registry and global CLI
horizon; it does not create a separate TCP event budget. Pure eligibility reads
current submitted/pending/undestroyed state. Actual selection creates stable
success/readable/writable facts and consumes the pending completion before any
callback. Failure/partial-flag cases retain their first unsupported transition.
Full-duplex success refreshes any active idle timer and invokes connect then ready
through the VM. P042 now completes the fresh read(0) prefix with input pending,
allowing normal delivery to clear active state and drain actual queued work. An
earlier callback typed stop retains its active source and queued work. Guest
throws retain existing registry abrupt-completion behavior. Other providers and
waiting remain independently explored siblings, without provider priority.

Default independent completion Booleans are an explicit callback-input
overapproximation, not a proof of physical reachability for every combination.
No expiration or native close provider is introduced. Timers may expire in
unmodeled interleavings; waiting is neither inactivity nor eventual success.
See [network semantics and boundaries](node-net.md#p040-selected-completion-prefix).


## Pending shutdown completion providers

P043 registers one provider when a first empty socket end reaches local shutdown
submission. Selection shares the global horizon with HTTP and TCP completion;
it neither guarantees eventual delivery nor successful OS shutdown. Pinned Node
ignores the asynchronous shutdown status and invokes the final callback without
an error. The model therefore projects that unused native argument out, retaining
no invented success Boolean, errno or peer-receipt fact.

Selected arrival consumes shutdown.pending and enters finalization, clearing
finalPending before later supported-domain checks. prefinished becomes true
before synchronous prefinish listeners. Only normal listener return marks
finishPending and enqueues the actual finish transition. It runs on the shared
FIFO after any jobs queued earlier by prefinish listeners, with finished and
public writableFinished true before finish emission. The finish job is not a
separate external arrival. Current open readable state excludes autodestroy;
input and timer work remain pending. Callback throws/typed stops retain exactly
the preceding state and the generic registry/queue interruption semantics.

Eligibility observes the actual pending transport association; malformed
finalization state must become an explicit selected continuation boundary rather
than disappear through eligibility. Consumed shutdown cannot arrive twice.
From fresh startup, horizon2 can cover TCP completion then shutdown completion;
other eligible resources compete under the same budget. Data, EOF, read errors,
timer expiry, connected destruction and close interleavings remain gaps.
