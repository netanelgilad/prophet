# P040: one selected TCP completion through the next real frontier

Read-only proposal; no repository edits. Based on pinned Node24.21.0 net.js
`afterConnect`1963–2032 and `/tmp/prophet-p039/completion-review.md`.

## Contract and utility

Add a TCP completion provider to the existing shared ExternalEvents registry.
Keep waiting and horizon0 unchanged. An accepted P038 submission does not imply
success, full duplex, timer expiration, read availability or eventual arrival.
A selected full-duplex success executes actual connect/ready listeners and stops
before unmodeled read(0). Unchanged checkGrowl instead reaches its earlier real
`socket.end` lookup frontier inside connect; its availability callback still has
not executed. This is useful progress into real dependency callbacks, not a
completed availability check. No sample/function-name recognition.

## API, facts and eligibility

Extend NetModelOptions with `externalEvents?: ExternalEvents` and
`completion?: HostModel`; export `symbolicTCPCompletion`. Omitted registry keeps
existing explicit pending-only embeddings; CLI passes its existing registry.
A completion model without a registry is a configuration error (avoid silently
unused configuration). Custom models are trusted persistent VM transitions and
must never perform native I/O or invoke supplied callbacks natively.

Invoke the configured model once per selected eligible delivery, using a traced
`net.socket.completion` HostCall with the socket receiver and endpoint arguments.
Its normal result is a closed VM record `{success, readable, writable}` of VM
Booleans, including finite choices. Default creates three independent fresh
Booleans in a fresh record at actual arrival only. This conservatively exposes
unknown callback domains; it does not establish every combination is physically
reachable. `success=false` abstracts nonzero callback status, never an errno.
Reject guest-throw/nonrecord/nonboolean results as configuration errors; preserve
typed analysis stops. Read fields through the current VM heap and retain the
validated Boolean values in a model-owned record before splitting. A model that
needs correlated facts supplies them explicitly. No sampled/native counters.

Register one provider only after submissionAccepted=true. Its pure eligibility
reads current phase=submitted, completionPending=true and destroyed=false.
Registering, checking eligibility, horizon0 and waiting allocate no outcome facts.
Delivery rechecks eligibility and consumes completion once; repeated/stale direct
invocations do not deliver callbacks or regenerate facts. Use a typed boundary
for invalid embedding delivery, while the registry skips ineligible providers.

Store `completion: Undefined | outcomeRecord` in node.net.socket state. On valid
delivery retain facts, set completionPending=false and connecting=false before
status processing. Phase becomes connection-failed for false success and connected
for true success, including partial flag frontiers. Socket address-cache internals
remain guarded; no fake local endpoint. Current context supplies listener/heap
state and callback ancestry; never restore the original connect activation.

## Exact transition order

1. Nonzero/failure: stop before unmodeled Error construction. No invented
   connectionAttemptFailed/error/close, destruction or timer cancellation.
2. Success with readable=false: stop before native push(null)/read. Otherwise,
   writable=false stops before native end. Do not emit connect or refresh the
   timer on either path. Fresh sockets' ordinary readable/writable initial
   semantics are the admitted domain; monkey patches remain guarded.
3. Full duplex: refresh only an active P039 logical timeout arm, canceling its
   prior arm and creating a new abstract arm with the OLD ACTIVE DELAY and
   refed=false. Public socket.timeout stays unchanged—even if a caught invalid
   setter previously wrote a negative value. Absent/inactive arms stay inactive.
   No clock, deadline or native Timeout identity. Recheck relevant pristine
   property/prototype domain before claiming this native-default transition.
4. Emit connect with existing once/listener ordering and socket receiver. If
   normal, emit ready. Guest throw or typed callback stop prevents later steps.
   Do not invent a destroyed-state recheck between these native emits. Existing
   unsupported destroy/write/pause/end frontiers win when reached.
5. After normal ready, stop before read(0). No readStart call/result, bytes,
   resource availability or successful completion-handler return is fabricated.
   Retain actual callback effects and active external delivery checkpoint.

## Scheduling, limits and acceptance

External horizon0/1/2 now counts combined HTTP arrivals and TCP completions, so
update CLI help/boundary docs and horizon specs. HTTP and multiple sockets compete
without fixed provider priority; waiting terminates a shorter bounded history.
A TCP completion followed by a typed frontier cannot proceed to another event.
No queued work is drained between connect/ready/read(0); nested nextTicks run only
after a normally completed event, which this slice does not promise. Preserve
existing uncaught-throw behavior. No timer/close provider or full-time chronology:
retained timers may expire in omitted interleavings. Explicitly state that the
selected event histories cover only the modeled arrival domain, not all schedules.

One provider/state record per admitted socket and one fixed-size outcome per
selected arrival; reuse existing evaluation budget and registry horizon. No
special recursion limit, eager status enumeration or unbounded delivery loop.
Existing registry/graph growth limits remain implementation gaps.

Required specs: lazy default/outcome identity; wait+all four processing frontiers
(failure, partial readable, partial writable, full success); once consumption;
original/late listener ordering; connect/ready throw and typed stops; active timer
refresh and inactive/no timer with public timeout unchanged; two independent
sockets and HTTP competition; no native I/O or fake readStart/error/close; graph
source/hash/receiver/origin links; unchanged checkGrowl reaches end lookup only on
full-duplex success. Independent pinned native interception must preserve actual
_read/readStart machinery (the old overridden-_read probe is insufficient), and
record timer refresh plus event/nextTick ordering without real transport.

No architectural objection within this explicit partial-event contract. The key
risk is wording a normal waiting prefix or selected full-duplex branch as universal
connection/lifecycle coverage. No all-path networking or security claim follows.
