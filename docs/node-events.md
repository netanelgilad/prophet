# Node EventEmitter compatibility and proof boundary

The reference is **Node v24.21.0**, commit
`955266bfdd854cd280dffd47548673914484e4c0`, matching the
[CommonJS oracle](../test/commonjs/README.md). This is a modeled Node boundary;
it does not run Node's native EventEmitter or retain mutable listeners in host
JavaScript during symbolic execution. JavaScript callbacks run through Prophet's
normal invocation machinery.

## Embedding and supported behavior

`createEventEmitterModel().module` can be supplied to the CommonJS loader under
the canonical builtin name `events`. Both `require("events")` and
`require("node:events")` then return the supplied constructor. The constructor's
`EventEmitter` property refers to itself. The supported constructor form is
`new EventEmitter()`; constructor options, calls without `new`, and custom
receiver/prototype initialization remain explicit analysis gaps.

Builtins for one modeled Node environment must share this model. For HTTP, use
`const http = createHTTPModel()` and provide
`{ http: http.module, events: http.eventsModule }` to the loader. Alternatively,
create an emitter model once and pass it to `createHTTPModel(events)`. Then the
HTTP object's `on`/`once`/`emit` methods have the same identity as
`require("node:events").prototype` methods, and borrowed prototype methods can
operate on HTTP objects. Independently created models are separate host
environments; registering both as though they described one Node process would
not preserve those identities or shared receiver state.

The shared model implements:

- `on` and its alias `addListener`: append a listener and return the emitter.
- `once`: remove the registration before invoking it, including reentrant emit.
- `removeListener` and its alias `off`: remove one matching registration, starting
  with the most recently registered match. Removing a once registration accepts
  its original callback.
- `emit`: call the listeners present at emission start in registration order,
  with the emitter as `this` and the supplied arguments. Added listeners wait
  until another emission. Removing a listener during emission does not remove
  it from the current snapshot. Ordinary return values are ignored; a throw
  stops later callbacks and escapes with earlier state changes preserved.
- `listenerCount(event)`: count current registrations for a supported event.
  The optional listener argument is not yet modeled.

An emission returns false when no listeners exist and true when listeners run.
Unhandled `error` emission with a modeled Error throws that same object. The
Node-created wrapper for a non-Error payload is not yet modeled and produces an
analysis gap. Invalid callback arguments produce a modeled TypeError with code
`ERR_INVALID_ARG_TYPE`; the exact message and stack are explicit read gaps.

These rules follow the pinned
[EventEmitter implementation](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/events.js)
and its [API contract](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/doc/api/events.md).
Local compatibility specs compare application observations with the independent
pinned Node executable. These specs are not a claim of full Node conformance.

## Symbolic registration and persistent state

Emitter identities are associated with private heap objects. Those objects hold
the listener lists, and each registration has its own once/fired state. They use
the same persistent execution-context heap as ordinary JavaScript objects.
Registering or removing on one symbolic path cannot mutate an earlier snapshot
or another path. Repeated registrations of the same callback remain distinct.

An emitter now has an immutable `hostSlots["node.events"]` metadata link to its
state object, allowing the JSON graph to retain listener associations and their
lexical definitions. This is separate from guest properties: a program property
named `hostSlots` neither reads nor replaces the metadata. Mutable initialization
and listener fields still come from the selected context's heap. The identity
link can exist when an earlier context has no initialized state; it does not
authorize a receiver or prove that a registration happened on every path.
Private model registries still validate receivers, and another emitter model
cannot overwrite the association. [Host-slot graph specs](../test/host-slots-graph.spec.ts)
cover these distinctions and conditional registrations. This is inspection
support, not host-state reconstruction or resumption.

An unknown boolean can conditionally register a listener. Emitting later must
retain that condition in callback effects and captured variable updates. Event
names may be concrete strings or finite symbolic choices of strings. Arbitrary
unknown strings, Symbols, and event-name coercion remain implementation gaps.

Callback closures retain their lexical scope identity and read bindings from
the current context at delivery. They do not replay the values present when the
listener was registered. An event trace's old heap snapshot is for inspection,
not a replacement for the current context when executing listeners.

## HTTP integration and limits

The [HTTP model](node-http.md) uses this same machinery for server `request`,
`listening` and bind-failure `error` callbacks, response `finish` callbacks, and
application custom events. Listen success/error notification and successful
response completion are still explicitly delivered host transitions. Error
listeners added or removed after `listen` affect later delivery; an unhandled
Error escapes that delivery unchanged. EventEmitter's synchronous dispatch does
not implement Node's event loop, promise rejection handling, request streams or
general network failures. The CLI shares this model with its HTTP builtin but
does not drain the pending notifications.

Public emission and listener counting of protected HTTP lifecycle events remain
gaps because the partial HTTP boundary has additional internal Node listeners
and state transitions. Registering unmodeled host lifecycle events such as
`connection` or `prefinish` also reports a gap rather than omitting their native
delivery. Known internal listeners count toward the warning threshold, so the
tenth application `listening`/`finish` listener is currently rejected. Request
objects do not acquire generic `on` methods yet:
registering a `data` listener must also model readable-stream behavior.

Other explicit gaps include `newListener`/`removeListener` meta-events, prepend
and remove-all methods, listener-array inspection, asynchronous helpers,
captureRejections, and warning delivery when registrations exceed the default
ten listeners for an event. The model rejects that eleventh registration rather
than silently omitting a warning. Internal emitter fields, method overrides,
and full prototype/descriptor inspection are guarded until their semantics are
implemented. These are implementation limits, not narrower Node guarantees.
The existing shared `Function.prototype.call` works on modeled methods through
ordinary prototype lookup. Node's single-listener `apply` dispatch remains a gap
when application code explicitly replaces that property on the callback or its
prototype; the model must not ignore the replacement. Multi-listener dispatch
and a once callback's own `apply` property follow Node's direct-call behavior.

## Complete upstream cases reviewed

The following complete files were reviewed at the pinned revision. None is
activated or counted as a passing upstream case in this milestone. Do not trim
them into easier examples; extend the runner and VM until each complete case can
run.

- [`test-event-emitter-once.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-event-emitter-once.js)
  covers repeated emit, removal, nested emission, and varying argument counts.
  Full execution additionally needs the upstream common/assert harness, loops,
  rest parameters, array `push`, and `Function.prototype.apply`; synchronous
  arrows are supported.
- [`test-event-emitter-modify-in-emit.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-event-emitter-modify-in-emit.js)
  checks additions and removals during dispatch. Its complete assertions also
  require `listeners`, `removeAllListeners`, array `push`, and the common/assert
  harness.
- [`test-event-emitter-remove-listeners.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-event-emitter-remove-listeners.js)
  additionally depends on meta-events, `listeners`, internal `_events` mutation
  and inspection, `Reflect.ownKeys`, loops, and a Writable stream scenario.
  The stream and internal-state blocks are part of the test, not optional pieces.

The HTTP-specific complete upstream candidates and their remaining blockers are
listed in [the HTTP compatibility record](node-http.md#complete-upstream-cases-reviewed).
Language conformance remains tracked separately through complete Test262 files.
