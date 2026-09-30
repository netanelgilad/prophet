# Node console compatibility and proof boundary

The reference is Node **v24.21.0**, commit
`955266bfdd854cd280dffd47548673914484e4c0`. The
[local compatibility specs](../test/node-console.spec.ts) compare independent
child-process stdout with the VM model. They are not complete upstream Node
conformance cases. Console is a Node host API, separate from Test262 language
coverage.

`createConsoleModel()` supplies `.module`. Use the same identity for the global
`console` and the CommonJS builtin named `console` when both are available.
Creating the model does not install anything in the host process or mutate the
shared initial VM context. The analyzed program's logging never writes to the
real stdout.

## Supported behavior and state

The declared environment is a default, ungrouped console with healthy UTF-8
stdout and no diagnostic subscribers, stream replacement, or custom inspection
configuration. The model supports `console.log()` and `console.log(string)`.
The single string is literal, including `%` sequences, and each call appends a
newline. The result is `undefined`. Detached calls and `.call(otherReceiver, ...)`
retain their original console binding.

These rules follow the pinned
[console implementation](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/internal/console/constructor.js):
the single-string path avoids formatting and user conversion methods, then
writes a newline-terminated string. The model exposes `log.name === "log"`,
`log.length === 0`, and non-construction. Full descriptors and restricted function
metadata remain unsupported; guards must not be mistaken for implemented errors.
Borrowed `Object.prototype.toString` also stops at the partial host boundary:
the console's own or inherited `Symbol.toStringTag` is not yet modeled, so returning an ordinary
object label would be incorrect. Symbol properties remain shared VM work.

Output uses the existing persistent effect trace. A `console.log` call contains
an internal `console.stdout.write` call/return carrying the decoded UTF-8 output
chunk. This name describes an internal modeling boundary; it does not expose or
implement `process.stdout.write` and makes no claim about that method's
backpressure return value. No mutable host-side output array stores execution
state.

`inspectOutput(context)` returns paths with their `knowledge` and ordered
`chunks`. It filters by the internal output function's identity, so distinct
console environments do not mix their output even though their effect labels
match. Conditional calls and values retain their conditions. Earlier execution
contexts retain their earlier output; argument-expression throws prevent the
outer call and output just as other VM calls do.

Chunks describe decoded UTF-8 output, not necessarily the original UTF-16 code
units. Concrete unpaired surrogates become replacement characters. Arbitrary
symbolic strings currently produce an unknown encoded chunk; their identity,
prefixes, length, and newline suffix are not precisely tracked through encoding.
This loses information rather than claiming arbitrary strings survive unchanged.

## Deferred work

The [implementation gap backlog](implementation-gaps.md) tracks the assumptions
and remaining work. In particular, healthy stdout is an assumption, not proof
that output reaches a terminal or file. Synchronous write errors, asynchronous
error events, Node's error swallowing rules, flushing/exit loss, and stream
backpressure need independent models and reference cases.

Multiple arguments, non-string formatting, inspection/custom-inspection hooks,
format substitutions, other console methods, grouping, timers, diagnostic
subscribers, the `Console` constructor, stream configuration, and full function
or console descriptors remain gaps. Unsupported member access, configuration
writes, or argument shapes stop analysis explicitly. Do not substitute a no-op
for output while extending those cases.

The real static-server spec now uses this boundary to execute its original
startup callback and inspect its actual message. This covers that source path
under the stated environment, not all console or server behavior.

The complete pinned
[`test-console.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-console.js)
was reviewed but is not activated or trimmed. It requires the common and stdio
interception harness, writable-stream replacement, process/worker fields,
warning and timer scheduling, regular-expression assertions, `util.inspect`
with custom Symbol hooks, multi-argument formatting, and the other console
methods it exercises. Local specs establish the current subset independently;
the complete upstream case remains coverage debt.
