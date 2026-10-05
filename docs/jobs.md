# Persistent jobs and the startup checkpoint

The shared [job queue](../src/jobs.ts) is a FIFO of calls waiting to run. It is
independent of HTTP and does not decide which external events arrive or when a
runtime should drain it. A runtime supplies that policy; the CLI currently uses
one queue for supported Node HTTP startup notifications.

This is the first symbolic event-loop component. A path describes a permitted
event timeline together with the conditions under which it can happen; it can
represent many concrete executions. Shared prefixes and conditional state remain
shared in the graph. The current checkpoint explores its modeled bounded queue,
not every possible external arrival or Node event-loop timeline.

Its state is an ordinary VM object with `pending` and `active` fields. A job
retains its callback, receiver and a copied argument list. It retains identities,
not an old execution-context snapshot: a closure reads current lexical bindings
and heap state when invoked. Enqueueing on one symbolic branch cannot change
another branch or an earlier snapshot.

Draining removes the head before calling it through the shared VM. Work appended
by that callback joins the tail. Normal completion continues draining. A language
throw stops that branch and leaves its later jobs pending; other feasible
branches can continue. The queue's active field clears after either normal or
throwing language completion. Unsupported analysis inside a callback retains the
active job and its available checkpoint. This is still one partial checkpoint,
not a serialization of every explored or unvisited branch.
Reentrant draining and attempting to resume a retained active job reject; a
callback cannot bypass its own unfinished invocation to run the queue's tail.

A thrown result is the propagation boundary in the default domain without
process exception handlers, not the environment after fatal process teardown.
Other modeled servers can still be listening at that point. Native monitor
fixtures observe pre-exit state; process exit/beforeExit handlers, socket cleanup,
stdio flushing and overall process liveness remain unmodeled.

The drain uses iterative continuation frames so a long chain of short jobs does
not itself build an unbounded native call stack. A nonnegative safe-integer job
budget limits deliveries across the explored work. Each delivery also consumes
the shared evaluation budget when present. Exhaustion is an analysis stop before
dequeue, preserving the pending head; it is not a catchable program exception or
a fact that constrains the program's inputs. Pending lists must be finite and
dense. Queue capacity, fairness, unbounded work and all host/parser resource
limits remain unmodeled.

The [CLI](cli.md) drains after normal CommonJS entry completion and preserves the
entry's exports if jobs complete normally. A throwing entry does not drain. A
job throw becomes that branch's completion. The global object's VM metadata
`hostSlots["node.nextTick"]` retains the queue in the ordinary output graph;
it is separate from guest properties and does not make the snapshot resumable.

The [HTTP model](node-http.md) uses the queue for listening/error delivery.
Hostless bind runs inline and queues a notification. Explicit `"127.0.0.1"`
queues lookup/bind, which later appends its notification. No general DNS,
microtask, timer, immediate, I/O, cancellation or process exception-recovery
semantics follow from this FIFO. Public `process.nextTick`, warning-queue
integration remain unsupported. The separate [external-event registry](external-events.md)
now supplies an optional first parsed request after this startup checkpoint;
it does not add general event-loop ordering or automatic response finish.

[Queue specs](../test/jobs.spec.ts), [HTTP startup specs](../test/node-http-startup.spec.ts)
and [independent pinned Node observations](../test/node-startup-reference.spec.ts)
cover this bounded behavior. They do not establish full Node event-loop coverage
or activate complete upstream scheduler cases.

## Complete upstream cases reviewed

These pinned Node cases remain complete and inactive; local ordering fixtures
are independent evidence, not shortened replacements:

- [`test-next-tick-ordering.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-next-tick-ordering.js)
  combines public nextTick with thirty timers and exit-time assertions. It needs
  timer ordering, process exit events, Array push, loop support and common/assert.
- [`test-next-tick-ordering2.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-next-tick-ordering2.js)
  schedules a timer and nested nextTick from a callback; public process APIs,
  timer/checkpoint ordering, exit events, Array push and common/assert remain.
- [`test-next-tick-errors.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-next-tick-errors.js)
  validates invalid callbacks and uses `uncaughtException` to resume later work.
  Default fatal-stop fixtures do not implement process recovery, public nextTick
  validation, error-origin arguments, exit events or its common/assert harness.
