# Three adversarial symbolic proofs

P047 returns to the original minimum example's goal: unknown inputs can produce
a known Boolean result through execution and inference. The executable source,
input assumptions and assertions live together in the linked specs. No function
name or source-string recognition supplies a proof, and native samples are only
semantic controls or countermodels, never evidence of all symbolic paths.

| Example | Declared inputs | Required violation flag | Deliberately broken control |
| --- | --- | --- | --- |
| [Conditional sorting](../test/adversarial-sorting.spec.ts) | Three arbitrary finite Numbers, including ties and signed zero | false after three compare-and-swap steps | Omit final swap: both true and false witnessed; symbolic result stays nonconstant |
| [Transfer conservation](../test/adversarial-transfer.spec.ts) | Ordinary mutable numeric properties; integer values[-1000000,1000000], integer amount[0,1000]; same, distinct or symbolic choice of target identity | false; sequential heap reads preserve the total even with aliases | Cache target before subtraction: aliases can change total, distinct objects conserve it |
| [Two-counter classification](../test/adversarial-counters.spec.ts) | Dense immutable array of arbitrary finite Numbers, symbolic length[0,1000000]; no getters/proxies/mutation | false because negative+nonnegative equals length | Skip zeros: native/small concrete cases exhibit both answers; full symbolic attempt declines and preserves unfinished ordinary execution |

Sorting already uses the existing branch/order relations; the new spec establishes
a regression without adding a sorting-specific rule. The stronger sorted predicate
with possible NaN remains unknown. Input values are not sampled or concretized.

## Exact integer comparison reasoning

The shared [affine helper](../src/symbolic/affine.ts) normalizes bounded +, - and
unary minus expressions only when every operand and intermediate is independently
within the safe-integer range. Matching coefficients can establish a constant
difference for equality and order queries. It does not replace Number values,
so proving +0===-0 cannot erase their observable reciprocal distinction.
Fractional/NaN/unbounded or unsafe-intermediate arithmetic remains unknown.

The normalizer uses direct integer/bound facts, not a recursive call into the
comparison solver. Caps are128 visited expression nodes, depth24 and256 combined
facts per atom, checked before accumulating facts. Cycles and exhausted budgets
decline the new inference. General linear constraints, multiplication, floating
point cancellation and transitive bound discovery remain outside this rule.

## Verified two-counter loop invariant

The [counter verifier](../src/loops/counter-summary.ts) runs only at a reached
function-local loop entry. Candidate discovery requires index0, two mutable
zero-valued locals, guard index<array.length and a dense immutable finite-number
snapshot with nonconstant length. It shares P006's private snapshot/read-cache,
write/effect checks and actual VM evaluation machinery.

The base is the actual zero/zero/index0 state. An arbitrary step introduces exact
integers k and a with0<=a<=k, represents b=k-a, and evaluates the real guard,
body, lexical iteration copy and update. Every feasible transition must leave
each counter unchanged or increase it by exactly1, preserve sum=index+1, and
advance the index by exactly1. Unrelated persistent binding/heap/effect changes
reject the candidate. The exit guard is independently evaluated at length.
These obligations establish nonnegative counters and their sum for every admitted
length, including zero, without iterating to one million. Published counters
remain unknown with a shared relation to the original length.

Resource caps: at most4 candidate locals/6 pairs,256 scanned bindings,96 AST
nodes each for body/update, choice depth8, and the shared P006 private proof
budget2400 with32 environments/128 heap entries. Calls, nested loops, abrupt
statements and unsupported layouts decline this verifier; ordinary execution
continues from the original reached state. Incompatible initializers, other
updates/invariants, offsets/views and general mutable arrays remain work.

A conservative heap-identity check can also decline after an unrelated local
object allocation. Existing ordinary fallback/merge work can grow rapidly; small
outer evaluation budgets in negative specs keep those tests bounded. The positive
million-length proof succeeds with the same small caller budget. A stopped path
is not a false Boolean result or a proof of the broken algorithm. General
resumption and broader loop summaries remain explicit backlog items.

## Validation boundaries

[Independent review specs](../test/adversarial-proof-review.spec.ts) probe IEEE
rounding, unsafe intermediates, alias mutations, stale values, late index-dependent
deviations, skipped zeros, unrelated writes and proof-cache isolation. Pinned
Node24.21.0 supplies concrete witnesses. No new JS syntax or host API is introduced;
the complete selected Test262 corpus and its historical skip inventory remain
regression coverage, not justification for a universal proof engine.
