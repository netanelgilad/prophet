# P019 — bounded generic UTF-16 String.prototype.indexOf

Worker: Instinct (sandbox), 2026-10-15. Base: P018 head 91eebe8. Branch
agent/p019-string-indexof.

Outcome: bounded generic UTF-16 String.prototype.indexOf, and the delivered
HTTP request now declares its absent parse cache. A delivered GET /hello.txt
request through the unchanged sirv handler runs @polka/url's parse to
completion: the req._parsedUrl probe reads the declared absent slot, both
raw.indexOf('#', 1) and raw.indexOf('?', 1) answer -1 through the new model,
search stays empty so the opaque querystring builtin is never invoked, and
parse's computed object is observed by the handler's destructuring. The
measured stop moves forward to req.headers['accept-encoding'] (sirv
build.js:172), a legacy unmarked host property read on the incoming request.
No response, filesystem-stream or success claim.

Supported domain:
- Concrete UTF-16 receiver and search strings after ordinary
  RequireObjectCoercible/ToString/ToNumber conversions; astral and lone
  surrogate units compare as code units with no normalization.
- Position: undefined means +0, NaN means +0, fractions truncate toward
  zero, negatives clamp to 0, and over-length positions clamp to the text
  length; an empty needle returns the clamped start position.
- Forward candidate scan with literal code-unit comparison returns the
  lowest matching index or -1; conversion results are values, so later user
  code and throws are never suppressed.
- Operand admission is bounded at 65,536 UTF-16 units each after
  conversion, and actual comparisons stop before the 1,048,577th; early
  matches do not precharge worst-case work.
- RegExp search values and exotic operand conversions stop as typed
  boundaries (the VM does not yet model the RegExp toString coercion that
  native indexOf performs).
- Symbolic receiver/search/position values stop as typed boundaries with
  exact messages; nullish receivers throw the native TypeError.
- The http delivered-request model declares method, url and an absent
  _parsedUrl slot (pinned Node 24.21.0 reads it as undefined on raw
  dispatch); other request fields stay unmodeled host reads.

Specs first: test/string-indexof.spec.ts (125 tests: pinned Node 24.21.0
native UTF-16/position/conversion matrices recomputed against the actual
runtime, VM matrix parity, conversion ordering and identity, nullish
TypeError, typed-boundary messages, admission and comparison budgets) and
test/sirv-request.spec.ts (the CLI-mirrored in-process driver asserts the
factory/listen flow completes and the delivered GET stops exactly at the
unmodeled request headers read after parse completes). Migrated from
measured output: string-trim.spec.ts deferredStringNames (indexOf leaves
the deferred inventory; the pinned 52-name inventory is thirteen
modeled/39 deferred) and p008's supported list with a positive indexOf
observation.

Validation (sandbox, Node 24.21.0, PROPHET_NODE_BINARY pinned): full suite
149 suites / 4638 passes / 46 unchanged skips, chunked --runInBand;
typecheck clean.

Remaining gaps: the incoming request's headers and the rest of the Node
request/response surface (the measured next stop), viaCache lookup and the
sirv send path, fs streams, RegExp toString coercion for search values,
generic symbolic indexOf operands, and the remaining deferred String APIs.
