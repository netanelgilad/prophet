# Shared bounded String.trim

Worker-verified P008 source/evidence is recorded in
[the handoff](../agent-tasks/P008-string-trim/evidence.json); independent strong
review remains pending. Do not infer approval from local tests.

Use shared branch/ToString/heap machinery after RequireObjectCoercible. Wrap each
conversion continuation with `bindNormal` so a reached open-string/budget stop
retains coercion effects and completed siblings. Check inherited
Symbol.toPrimitive before ordinary conversion; the shared converter does not
implement symbol dispatch. Array/function receivers remain explicitly excluded,
including custom converters. Partial-host and cyclic shared guards remain debt.

Trim's modern ES whitespace is a small explicit UTF-16 table, not normalization.
U+0085/U+180E/U+200B remain contents. A length cap before scanning/slicing bounds
both work and output; it must follow observable conversion. Limits are analysis
leaves, not catchable JS exceptions or a native memory-availability assertion.

The unchanged mrmime expression `.trim().toLowerCase()` provides actual target
progression. The newly reached absent method needs the narrow typed lookup stop
or a legacy noncallable assertion drops filesystem siblings. Preserve the own
property branch; do not implement the next API to hide the boundary.

Test-writing lessons: JSON.stringify leaves U+2028/U+2029 literal separators in
source. Escape those two units for Cherow while preserving runtime strings; the
parser boundary itself stays separate. Primitive method replacement controls
must be strict until sloppy boxing exists. P008's initial two separator controls
were harness failures, not evidence of missing trim; evidence records correction.
Check default Jest discovery before final validation (P007 production `test.ts`
lesson). Freeze source/spec/docs, validate with a 900-second full-suite cap and
pinned Node, then commit hash-generated evidence separately.

See [semantics/limits](../symbolic-strings.md#bounded-stringprototypetrim-p008),
[executable specs](../../test/string-trim.spec.ts),
[candidates](../agent-tasks/P008-string-trim/upstream-candidates.md), and
[ECMAScript TrimString](https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.trim).
