# Bounded generic UTF-16 lastIndexOf

P010 worker handoff; independent Astra/high review pending. Frozen source and
exact runs/hashes are identified in [evidence](../agent-tasks/P010-string-lastindexof/evidence.json).

The key ordering rule is RequireObjectCoercible, receiver ToString, search
ToString, position ToNumber, then admission/clamping/search. Open converted
strings are values, not an earlier unsupported conversion: they must not suppress
later user code or throws. Nest shared bindNormal conversions before splitting
converted operands for concrete admission. Ordinary conversion reads current
heap/prototypes; symbol/exotic guards belong at each reached conversion.

Use a backward candidate loop and forward literal code-unit comparison. Start at
min(clamped position, text length minus needle length); first match is greatest.
NaN means +Infinity here, fractions truncate toward zero, and an empty needle
returns the clamped UTF-16 position (positive zero). Astral and lone surrogate
units have no special normalization or ASCII restriction. Native search is only
an independent test oracle, never an implementation backend.

Bound both operand lengths before scans/copies/preprocessing, after conversions:
65,536 units each. Independently count actual comparisons, stopping before the
1,048,577th; early successful matches need not pay worst-case work. Empty needle
has no comparison work but still obeys operand admission. Candidate visits are
bounded by receiver length; no preprocessing allocation is needed. These caps do
not bound coercion, prototype traversal, parser/embedding input allocation,
branch growth or VM/CLI volume, and do not model V8 allocation failures.

The unchanged consumer now computes tmp=hello.txt and idx=5, then reaches unary
~ in mrmime/index.js:445. Classifying only that absent resolver retains current
operand effects, source frames, enumeration call/return and EMFILE call/throw
siblings in the real CLI graph. No bitwise, increment, substring, headers,
factory completion, server setup or request coverage is implemented by this slice.

Before freezing, search literal API references AND parameterized native-supported
and deferred inventories, plus container/metadata suites. P010 migrates P008's
52-name inventory (nine modeled, 43 deferred), P009's obsolete lastIndexOf guard
and actual consumer expectations, preserving native checks and remaining guards.
A11 again demonstrates that supported length does not mean complete function
metadata support: direct .hasOwnProperty stops; borrowed Object.prototype's
method works. Whole incompatible sources stay inactive with exact failed logs.

A prefreeze run overlapped a deliberately incompatible A11 trial and new local
controls: its start hash is not a stable final-source claim. It is labeled mixed
development evidence, its two A11 failures are retained, and the complete affected
set is rerun before the single source freeze. Never infer revision classification
from a log-name prefix. Final frozen validation happens only after commit.

See [algorithm](../../src/string/lastIndexOf.ts), [specs](../../test/string-lastindexof.spec.ts),
[boundary](../symbolic-strings.md#bounded-stringprototypelastindexof-p010),
[candidates](../agent-tasks/P010-string-lastindexof/upstream-candidates.md), and
[ECMAScript](https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.lastindexof).
