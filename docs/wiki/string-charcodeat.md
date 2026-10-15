# Bounded String.prototype.charCodeAt

Implemented by Instinct in-sandbox (P021); independent review pending. Task
record: [P021](../agent-tasks/P021-string-charcodeat/task.md); specs:
[string-charcodeat.spec.ts](../../test/string-charcodeat.spec.ts) and
[sirv-request.spec.ts](../../test/sirv-request.spec.ts).

charCodeAt reads one UTF-16 code unit, so its semantics live entirely in
the conversions: RequireObjectCoercible (nullish receivers throw the pinned
native TypeError message), receiver ToString, position ToNumber, then the
truncating ToIntegerOrInfinity rule. NaN positions mean +0, fractions
truncate toward zero, infinities stay infinite and answer NaN out of range,
and negatives answer NaN. Astral halves and lone surrogates are ordinary
code units; nothing is normalized. A single unit is read, so no scan budget
applies — a 100000-unit receiver completes, pinned by test.

Converted operands are values, never an earlier unsupported conversion: an
open receiver still performs the position conversion (its effects and
throws are preserved), and only then do symbolic text or position stop as
typed boundaries. Array, function and symbol-operand conversions stop as
typed boundaries too; native controls pin what is being deferred ([1]
coerces to 1, a Symbol position throws a native TypeError).

The unchanged consumer advances: sirv's toAssume trailing-slash probe
uri.charCodeAt(len) answers 116 for "/hello.txt", the candidate list
builds, and viaCache's cache[arr[i]] finds the completed FILES record. The
handler reaches send(); the measured stop is send's for-in enumeration.

P021 also corrects P019's indexOf nullish TypeError message (it read
"lastIndexOf"); the pinned native text now applies and the indexOf spec
asserts the message, not only the type.
