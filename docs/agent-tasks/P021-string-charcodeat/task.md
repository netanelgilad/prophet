# P021 — bounded String.prototype.charCodeAt

Worker: Instinct (sandbox), 2026-10-15. Base: P020 head b12356a. Branch
agent/p021-string-charcodeat.

Outcome: bounded String.prototype.charCodeAt, plus a disclosed correction
to P019's indexOf nullish TypeError message (it read "lastIndexOf"; now
matches the pinned native "String.prototype.indexOf called on null or
undefined", with the spec now asserting the message text rather than only
the type). A delivered GET /hello.txt request through the unchanged sirv
handler now completes toAssume's trailing-slash probe, builds the candidate
list, and viaCache's cache[arr[i]] finds the completed FILES record — the
handler reaches send(), where the object spread of the file headers
completes and the measured stop is send's for-in enumeration
(build.js:66), the unmodeled ForInStatement. No response or success claim.

Supported domain:
- Concrete UTF-16 receivers after ordinary RequireObjectCoercible/ToString
  conversion; astral halves and lone surrogates are ordinary code units.
- Positions convert through ToNumber then truncate toward zero
  (ToIntegerOrInfinity): NaN is +0, infinities stay infinite and answer
  NaN out of range, fractions truncate, negatives answer NaN.
- One code unit is read, so no scan budget applies; large receivers
  complete (a 100000-unit receiver test pins this).
- Symbolic receiver or position stops as a typed boundary after later
  conversions still run (conversion order is never suppressed); array,
  function and symbol-operand conversions stop as typed boundaries rather
  than guessing native coercion (native controls: [1] coerces to 1;
  a Symbol position throws a native TypeError).
- Nullish receivers throw the native TypeError with the pinned message.

Modeling charCodeAt made it an own property of the string prototype,
which tripped the legacy url model's "modified String.prototype.charCodeAt"
presence guard and regressed 57 url-model tests (the guard predated any
modeled charCodeAt). The guard now mirrors the slice guard: it reads the
member and requires strict identity with the intrinsic, so only an actual
interpreted replacement is refused. Replaced-method specs still pin the
"modified String.prototype.charCodeAt" diagnostic.

Specs first: test/string-charcodeat.spec.ts (69 tests: pinned Node 24.21.0
native UTF-16/position matrix including astral halves and lone surrogates,
VM matrix parity with NaN-safe assertions, conversion ordering and
identity programs, correlation and mandatory unknown, open-operand
conversion order, exact typed-boundary messages, large-receiver
completion, residual metadata/deferred probes). Migrated from measured
output: string-trim.spec.ts deferredStringNames (the pinned 52-name
inventory is fourteen modeled/38 deferred), p008's supported list with a
positive charCodeAt observation, and sirv-request.spec.ts asserting the
ForInStatement stop. Retrofitted assertion: string-indexof.spec.ts now
pins the nullish TypeError message text (the P019 correction).

Validation (sandbox, Node 24.21.0, PROPHET_NODE_BINARY pinned): typecheck
clean; all 41 suites touching the url model, cli node environment, chunk-ad
consumers and the new charCodeAt spec green (2112 passes, 46 unchanged
skips, 0 failures) after the guard fix; remaining chunks re-confirmed
green on the same tree.

Remaining gaps: ForInStatement enumeration (the measured next stop, used
by sirv's send), the response getHeader/setHeader/writeHead surface, fs
createReadStream/pipe, header-carrying requests, the remaining deferred
String APIs (charAt next alphabetically), rest parameters and the implicit
arguments object.
