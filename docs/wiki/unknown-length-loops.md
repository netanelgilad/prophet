# Unknown-length loops: guarded reads and verified induction

Question: what does an arbitrary transition need to read `a[k]` when a dense
numeric snapshot has an unknown length up to the uint32 limit?

P006 B1 represents the original snapshot length as one symbolic identity,
each guarded indexed read as a `(sequence, index, view offset)` position, and
its presence as a singleton member fact. A slice shares the sequence and
changes the offset. Different indices can hold equal numbers; only proved
position equality on the active path relates their values. A quantified order
fact over a prefix ending at a symbolic index applies only after separate,
bounded numeric facts prove the member position lies in that half-open prefix.
Bounded safe integer `k+c`, `c+k` and `k-c` expressions normalize to a
position plus offset; fractional or overflow-prone algebra does not. Literal
regions compare directly even with unrelated facts above the symbolic budget.
Only the recorded default Array.prototype hook object with its original read
function is trusted for inherited indexed lookup; object replacement, in-place
read mutation and Object.prototype hooks stop uncertain reads.
The containment query never calls the general quantified solver, preventing
the fact being checked from justifying its own inclusion. It does not mutate
the observed knowledge graph.

The executable [index specs](../../test/symbolic-array-index.spec.ts) include
the full uint32 unknown-length read, aliases, slice offsets, NaN, absent and
uncertain indices, custom lookup and changed snapshots. The [source](../../src/array/symbolic.ts)
stops at explicit boundaries when presence, ordinary lookup or immutability
cannot be established. Local term/fact/lookup budgets avoid length-range
enumeration. [SYM-002 and SYM-004](../implementation-gaps.md) retain the
unmodeled array and general solver limits.

P006 B2 offers the [loop driver](../../src/loops/for.ts) a verifier at the
first reached test of a function-local loop, after the real initializer and
lexical entry copy. Top-level loops retain ordinary bounded execution. The
[proof module](../../src/loops/unknown-length-summary.ts) starts from that
state, introduces an arbitrary guarded index, then evaluates the actual test,
body, per-iteration copy and update in a private VM context. It checks every
pre-existing binding write, a safe integer successor, preservation of each
candidate prefix fact and the normal false exit. Finite, range, membership,
minimum and maximum candidates shrink until the remaining set is inductive.
The array's default uint32 unknown-length range is supported without length
enumeration. Source0785ba6 passed full root review,24 independent probes plus54
feature checks,126 suites/3156 tests/46 unchanged skips and typecheck on
2026-10-11. This remains the bounded proof family described below.

The currently admitted shape is `i < a.length`, starting at `i=1` with the
real cached `a[0]` as one changed mutable carried value. Readonly or unchanged
aliases keep their original identities, and a failed candidate can be followed
by another eligible binding. The input is a dense immutable
finite-number snapshot with a nonempty length domain. A bounded AST preflight
excludes calls, closures, nested loops and abrupt statements; unknown effects,
other carried writes, unproved lookup/presence or an unproved exact successor
make the attempt decline. Ordinary execution continues from the original
reached state and may end at its explicit budget boundary. Private proof
array-read caches and evaluation budget never alter the caller. A prior real
output appears exactly once; effectful bodies execute through ordinary
fallback. The [loop specs](../../test/unknown-length-loop.spec.ts) show the
positive proofs, wrong reducers, late index-dependent deviation, observable
counter, alias and changed-call controls, guest throw leaves, and pinned-Node
edge comparisons. The [design](../agent-tasks/P006-unknown-loop/design.md)
records the exact obligations and residual limits.
