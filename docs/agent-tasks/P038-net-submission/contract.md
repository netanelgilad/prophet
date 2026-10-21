# P038 implementation design: pending socket and deferred submission

Read-only proposal, 2026-10-21. No implementation/test edits. Read updated
`draft-contract.md`, pinned extracted net.js/internal_net.js and existing VM
EventEmitter, queue, HTTP, bind, effects and property-domain helpers. The updated
root/reviewer C++/libuv finding supersedes the earlier pre-return resource-gate
question: fresh POSIX AF_UNSPEC wrapper initialization does not acquire an OS
socket descriptor. No acquireHandle Boolean/API belongs in this slice.

## Concrete model API

Suggested signatures (names can be standardized once by root):

    export type NetModelOptions = {
      nextTick: JobQueue;       // required shared runtime FIFO
      submit?: HostModel;      // normal result must be a VM Boolean
    };
    export const symbolicTCPSubmission: HostModel = (_call, context) =>
      [ESBoolean(), context];
    export function createNetModel(
      events: ReturnType<typeof createEventEmitterModel>,
      options: NetModelOptions
    ): { module: TESObject };

Require an explicit shared queue; no implicit synchronous delivery or successful
fallback when the queue is missing. Validate options at model construction.
Omitted submit uses a fresh symbolic Boolean PER actual submission invocation.
`true` means native binding submission accepted/pending (zero return); `false`
means immediate nonzero submission failure whose cleanup/error lifecycle is
unmodeled. This is an abstraction of submission status, not success/failure of a
completed TCP connection. No errno or refusal value is invented.

A supplied submit is a trusted deterministic/persistent host transition. Its
result may be symbolic Boolean or a finite Boolean choice; it must not perform
native I/O. Reject non-Boolean normal results as model configuration errors.
Do not silently coerce numeric/string/null/error results. If a custom model
returns a guest throw, reject that contract violation rather than translate it
into a synchronous public net.connect throw. Typed unsupported boundaries from
a model may remain explicit boundaries. Such embeddings are runtime authors,
not a public JSON environment authoring feature in P038.

The module has ONE function object under connect and createConnection, shared
between net and node:net. Other exports are explicitly boundary-marked. No
Socket constructor, Socket.prototype.connect, DNS or positional overloads.
Return only the modeled module from the factory: tests can inspect persistent
host slots/effects, so no extra public inspection helper is required.

## Concrete state / operations

A fresh VM socket object has public connecting=true/destroyed=false, protected
lifecycle writes and a `node.net.socket` host slot pointing to persistent state:

    {
      phase: "queued" | "initiating" | "submitted" |
             "submission-failed" | "closing",
      address: <VM string>, port: <VM number>,
      submissionAccepted: undefined | <VM Boolean>,
      completionPending: <VM Boolean>,
      closePending: <VM Boolean>
    }

These are ordinary VM values/heap properties, not native mutable closure fields.
Use a WeakMap only for model-owned resource identity validation. Do not create
native transport objects or a second global scheduler/resource array. Existing
call/return effects, pending job receiver and socket host slots retain unused
sockets and callbacks in the graph. `node.events` records listeners separately.
No prose, limitation labels or consumer policy fields enter state.

Three/four modeled operations suffice:

- public `net.connect`: API entry/return/guest validation throw.
- internal `net.socket.initiate`: queued job, receiver is the returned socket.
- internal `net.socket.submit`: receiver socket, args [address, port, family4].
  Wrap configured submit with the Boolean-result validation above.
- optional public `net.socket.destroy`: no arguments and queued phase only.

Store a returned symbolic submission Boolean in state BEFORE splitting it. The
same fact controls phase/completionPending and remains available in stopped and
accepted contexts. Never allocate a new Boolean when a field is inspected.
Different submissions get independent unknowns by default. A model can supply
shared facts intentionally; it is responsible for their meaning.

## Ordering, return and failure checkpoints

0. createHostFunction records the public net.connect call with current P036
   origin before model admission. Unsupported input may therefore retain the API
   invocation, but not a fake network submission or normal public return.
1. Admit only supported object/callback structure. This is a model-domain check,
   not a claim that Node rejects excluded forms. Split finite VM choices without
   sampling; stop unsupported leaves while supported siblings continue.
2. Native fresh wrapper/stream construction has no public callback effects in
   the admitted ordinary-data/default-instrumentation slice. Create a modeled
   socket identity and attach EventEmitter state; register optional connect
   callback with once semantics. No pre-return descriptor-availability fork.
   Generic native/JS allocation failure stays an existing global resource gap;
   do not convert fatal wrapper allocation into a fabricated catchable errno.
3. Native order is: Socket.connect registers callback, checks missing port/path,
   initializes TCP wrapper, sets connecting, validates host then numeric port.
   Missing host/port stay an explicitly excluded overload, so their native errors
   need not be modeled yet. For supported host shape and concrete numeric port,
   invalid numeric port throws guest RangeError/ERR_SOCKET_BAD_PORT BEFORE a normal
   return and before queuing initiation. Use the existing HTTP error construction
   pattern/message only after checking pinned exact numeric cases. Port -0 is
   accepted and normalized to +0 by the native `port |= 0`. Port0 is allowed.
4. Store endpoint/phase and queue initiate with socket receiver, then return that
   same socket. Caller continuation and subsequent listener registration run
   before the CLI drains the queue. No TCP operation occurred yet.
5. At job entry, read current phase/connecting. A supported pre-tick cancellation
   returns without emitting connectionAttempt or entering submit. Otherwise set
   phase=initiating and use events.emit(socket,"connectionAttempt",[address,port,4]).
   bindNormal ensures a guest throw or typed stop prevents submission. Preserve
   the active job/checkpoint when an analysis stop occurs.
6. After a normal event return, invoke net.socket.submit. Phase=initiating makes
   destroy in this listener a typed unsupported frontier rather than inventing
   cancellation after native event emission. Protected state writes cannot turn
   it back into queued/clear a handle behind the model.
7. The submit HostCall records entry, its normal Boolean result, and the same
   frozen origin across events. Store the fact and split it. On true, phase is
   submitted, completionPending=true, connecting stays true, destroyed stays
   false; finish the queue job normally. Callbacks remain registered, unexecuted.
   On false, phase is submission-failed and stop with UnsupportedAnalysisError
   at the reached cleanup/error lifecycle, preserving effects and active job.
   Do not emit error/close/connectionAttemptFailed, clear connecting, invoke the
   connect callback, or let guest catch around net.connect catch this frontier.
   This stop is not a guest exception and does not prove no future effects.

The native C++/libuv finding places descriptor/resource failures at step6/7:
TCPWrap initializes with AF_UNSPEC, and uv__tcp_connect acquires a socket later.
The false submission outcome conservatively retains those failures together
with other immediate error statuses. It does not establish every errno or every
OS-state correlation. Completion failures after accepted submission are pending,
not ruled out by the accepted Boolean.

## Optional destroy: recommend include only the specified cancellation slice

The small queued/no-argument operation is useful to show a capability consumer
why API invocation and actual deferred submission differ. It has an independent
native witness already. Restrict it explicitly to queued (before initiation),
no non-undefined arguments and the original socket identity. Change public
connecting=false/destroyed=true, phase=closing, completionPending=false and
closePending=true, then return socket. Retain an unmodeled future native close;
do not enqueue it as a nextTick, emit close or consume --max-events.

This is a state observation at destroy's return, not completed destruction or a
proof that the process exits. Add a second-call destroy either as idempotent
closing-only behavior with a native witness, or leave repeated calls explicitly
unsupported initially. Do not support it accidentally through a broad destroyed
flag. During initiating/submitted/submission-failed phases, or with an error
argument, stop before claiming any further cancellation semantics. Explicitly
mark pending/readyState/readable/writable/closed and stream methods unsupported
unless separate compatibility tests justify adding them.

Registration of close/connect/error listeners can be retained (future callbacks
are visible state), but docs must say they are not delivered in this slice. Their
mere presence is not a complete event-lifecycle result. Unsupported stream events
such as data/readable/end/drain/timeout should be guarded at registration or kept
under an explicit callback-only retention contract; choose one rule consistently.
The conservative choice is reject stream event registrations and admit only
connectionAttempt plus retained connect/error/close/ready/failure listeners.
Public emit/listenerCount on all net names stop: allowed lifecycle names are
restricted, and other names may have omitted native internal listeners. In
particular end has an internal listener; absence cannot be fabricated.

## Property-domain admission without broad Node options emulation

Admit exactly two known own enumerable data keys host and port, complete ordinary
object own-property model, and ordinary intrinsic Object.prototype or null
prototype. Non-ordinary prototype, unmodeled descriptors/keys/accessors/symbol
surface, additional keys and uncertain required-key presence stop explicitly.
Finite host/port VALUES split inside that closed object; finite choices between
whole closed objects also split. A conditional presence bit can be split with
ownPropertyPresence/evaluateBranches, yielding a supported present leaf and an
unsupported missing leaf rather than silently assuming presence.

Reject prototype alterations that might affect constructor/stream defaults.
Do not check only the object's own getProperties record. A conservative first
implementation may require the intrinsic prototype's selected current properties
and presence to match its original intrinsic record; reject additions/changes
rather than maintaining an incomplete list of Node/stream option names. This
excludes even irrelevant prototype changes and needs an explicit gap entry.
Do not rely merely on the native identity of a heap record: a joined context can
carry property entries for an absent branch. Either compare selected presence /
values with shared VM helpers, or explicitly reject that broader conditional
prototype domain as unsupported. Null-prototype options avoid inherited original
reads, but Node's spread copy still has intrinsic Object.prototype, so altered
intrinsic defaults must still be guarded there.

Use current-heap own key order/presence helpers and VM reads; never evaluate native
JavaScript getters. The existing withEnumerableOwnProperties helper throws a
legacy error on some unmarked objects, so use a local typed structural admission
check before invoking it, or mark only model-owned boundary objects. Do not mutate
an arbitrary user's object just to change its future error classification.

After shape admission, canonical IPv4 is a concrete string of at most15 ASCII
characters, exactly four decimal octets0..255 without leading zeros except"0".
Use bounded splitting/regex/number checks; never pass it to native DNS/net. Values
outside that finite concrete shape (including IPv6, hostname, empty/falsy strings,
NUL and huge strings) are typed unsupported boundaries, not invented native
invalid-IP exceptions. Numeric ports can be known finite numbers, NaN/infinities,
fractional/out-of-range values: invalid numbers within this overload are genuine
RangeErrors; nonnumeric/unknown number domains remain explicit gaps unless their
native type errors are separately admitted. Native host validation precedes port
validation, so an unsupported host should stop before a claimed numeric-port
throw. Define and test this precedence.

Optional callback is either a function or omitted/undefined. Native normalizeArgs
ignores many nonfunction trailing args; rejecting those is a narrowed overload,
not a TypeError. Supporting ignored nonfunctions is easy only if root explicitly
expands the contract; otherwise retain a typed unsupported case. Limit admitted
public argument count to2 (options and callback) and avoid materializing arbitrary
arguments or property lists just to reject the overload.

## Budgets and implementation footprint

No new socket-count or activation-depth semantic cap is required for this slice:
actual interpreted API calls and queue jobs consume the existing evaluation
budget, and no event provider or new eager native loop is created. State growth
per admitted call is O(1) apart from supported listener state. Existing listener
limit behavior, generic AST recursion, host allocation and graph/source resource
gaps remain. State them; do not claim maxSteps bounds all memory.

Options key inspection can reuse existing finite property machinery but should
stop as soon as more than the two accepted keys are observed. If existing helper
constructs a full key array first, its generic enumeration resource gap remains;
do not claim a new bounded-object scan. The IPv4 parser rejects length>15 before parsing. The preceding host NUL
validation scans the already materialized concrete string linearly and is not
charged per character; that native-work limit remains an explicit resource gap.
Numeric checks are O(1); only at most2 argument positions are read.
No arbitrary source, socket or endpoint strings are copied into a new parser.

Likely changes: new src/node/net.ts (model+symbolic submission helper), runtime
assembly with one shared EventEmitter instance passed to http and net, optional
index exports consistent with existing host models. No jobs/externalEvents/solver
or generic AST changes. Existing CLI --max-events continues to refer to HTTP
incoming exploration because no net provider is registered. No root.program or
P036 schema changes. Internal calls use socket receiver and endpoint arguments;
original net.connect normal-return effect links socket to initiating code without
reviving old interpreted activation after queue delivery.

## First red specs / independent evidence

- Aliases, accepted pending fields, once callback retention and return socket
  identity; no initiation before queue drain; caller modifications/listeners read
  at invocation time; generic net import only retains API without any submission.
- Native numeric validation0/-0/65535 and invalid boundaries; unsupported host/
  overload precedence; no queue/submission on invalid numeric port.
- Finite valid/invalid/unsupported input alternatives preserve exact outcomes;
  missing/extra/inherited/accessor/prototype/hidden domains never silently pass.
- Cancellation queued returns same socket, flags change immediately, closePending
  stays, drain has no attempt/submission. Symbolic cancellation retains both paths.
- connectionAttempt callback identity/receiver/args, ordering after caller output,
  listener removal/throw/typed frontier; unsupported destroy during it never
  fabricates a later binding submit.
- Supplied true/false submit controls and symbolic default; no assumption of
  success; stable per-socket fact reused; two sockets independent; invalid model
  normal result and throw completion reject configuration, not guest transport.
- false submit is a stopped queued job after net.connect already returned; guest
  try/catch around connect cannot swallow it; prior attempt and submission call /
  result survive. Accepted sibling finishes startup pending with no callback.
- Actual CLI on a dependency fixture: net and node:net same identity, no native
  transport, source/program/origin correlation, pending and stopped branches,
  initial state unchanged. Existing HTTP startup/event regressions unchanged.
- Native oracle covers JS stages via binding interception, but does not claim
  network/OS success. C++/libuv evidence anchors descriptor timing. Reinspect
  complete upstream candidates; no truncated upstream tests or coverage claim.

This is implementable without an invented pre-return resource branch. It is an
explicit bounded prefix of Socket lifecycle and does not yet support a real HTTP
client, successful exfiltration, complete networking policy enforcement, or an
all-timeline security proof.

## Root scope decisions (approved for implementation)

Include queued-only no-argument destroy. Use the proposed Boolean submission API and persistent fields. Host validation: concrete nonempty strings without NUL are eligible for numeric port validation BEFORE the IPv4/DNS routing boundary; thus known hostname plus invalid numeric port yields pinned RangeError. Unsupported nonstring/falsy/NUL host forms stop explicitly before any competing port error; no guest host errors promised in this increment. Numeric-string ports unsupported. Document this exact admitted validation domain. Reject stream event registrations; retain only connectionAttempt/connect/ready/error/close/connectionAttemptFailed lifecycle registrations, with incomplete native listenerCount/emit guarded. Restrict exact empty destroy arguments, repeated destroy unsupported. Prototype changes need conservative typed admission guards. Do not invent a pre-return descriptor fact.

Work ownership: environment_wiring owns src/node/net.ts, src/cli/runtime.ts, any necessary src/index.ts exports, test/node-net.spec.ts only. environment_scenarios owns test/node-net-integration.spec.ts and native evidence under /tmp only. semantic_review owns test/node-net-review.spec.ts and /tmp reports only. Root owns all docs/evidence/ledger/publication, shared helpers changes require coordination. No commits/pushes by agents.
