# Bounded generic UTF-16 String.prototype.indexOf

Implemented by Instinct in-sandbox (P019); independent review pending. Task
record: [P019](../agent-tasks/P019-string-indexof/task.md); specs:
[string-indexof.spec.ts](../../test/string-indexof.spec.ts) and
[sirv-request.spec.ts](../../test/sirv-request.spec.ts).

The ordering rule mirrors lastIndexOf: RequireObjectCoercible, receiver
ToString, search ToString, position ToNumber, then admission, clamping and
the scan. Converted operands are values, never an earlier unsupported
conversion, so later user code and throws are preserved. NaN positions mean
+0 (not lastIndexOf's +Infinity), fractions truncate toward zero, negatives
clamp to 0 and over-length positions clamp to the text length; an empty
needle returns the clamped start. The forward candidate scan compares
literal code units and returns the lowest match or -1; astral and lone
surrogate units have no normalization. Native search is only an independent
test oracle, never an implementation backend.

Bounds are shared with lastIndexOf: 65,536 UTF-16 units per operand after
conversion, and actual comparisons stop before the 1,048,577th; an early
match does not precharge worst-case work. RegExp search values stop as a
typed boundary: pinned Node coerces them through RegExp toString, which the
VM does not yet model, so the spec keeps the native coercion as a control
only. Symbolic operands stop with exact messages; nullish receivers throw
the native TypeError.

The unchanged consumer advances: a delivered GET /hello.txt request through
sirv now completes @polka/url's parse (both indexOf probes answer -1, the
opaque querystring builtin is never invoked) and stops at the unmodeled
req.headers read. The delivered request model declares method, url and the
absent _parsedUrl slot that pinned Node 24.21.0 reads as undefined on raw
dispatch; parse's write-back then caches on the request.
