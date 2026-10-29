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

## P048: nonlinear, exceptional and weighted reasoning

The next three examples increase the reasoning burden while keeping their input
assumptions explicit. All source and expectations remain executable specs.

| Example | Domain and proof | Broken control |
| --- | --- | --- |
| [Row-operation determinant](../test/adversarial-polynomial.spec.ts) | Independent integer a,b,c,d,t in[-100,100]; `(a+t*c)*d-(b+t*d)*c === a*d-b*c` | Missing row update/wrong sign stays unknown; fractional arithmetic can break the identity |
| [Exception rollback](../test/adversarial-rollback.spec.ts) | Ordinary data fields, integer balances[-1000000,1000000], amount[0,1000], stage0..2; same/distinct/symbolic aliases; finally restores both snapshots, closure reads and returned references observe restoration | Inverse operations cannot undo a credit skipped by an exception; a returned primitive captures its pre-finally value |
| [Weighted partition](../test/adversarial-weighted-counters.spec.ts) | Dense immutable finite-number array length0..1000000; increments1/2/3 in negative/zero/positive branches; `6*low+3*mid+2*high === 6*length` | Skipped zeros, wrong weight, late deviation or unrelated mutation cannot establish the requested invariant |

The determinant rule extends the shared comparison normalizer to integer
polynomials, with safe intervals checked at **every evaluated intermediate**.
Monomials use actual symbolic identities, not equal-looking bounds. Limits are
degree4,64 terms,512 term operations,128 visits,depth24,256 direct facts peratom.
The operation budget can conservatively decline expensive formerly admitted
linear expressions. Unsupported operators remain opaque only if independently
bounded integers; no floating cancellation or numeric-value rewrite is added.

Rollback uses the existing heap and abrupt-completion machinery. A new bounded
integer-domain equality rule closes the return-identity proof: excluding0 and1
from an integer in[0,2] leaves2. It scans at most256 direct facts and enumerates
at most64 integer values, never samples a larger domain. Empty/inconsistent
domains decline; no integer fact means no exhaustive integer-domain inference.
Signed-zero equality never rewrites the input value. Unrestricted/NaN values
cannot use ordinary strict equality as a universal restored-value test.

Weighted induction proposes positive scales1..16 from `counter=counter+literal`
assignments for exactly three zero mutable locals. This syntax only proposes a
hypothesis: the actual VM body must preserve it on every admitted transition.
Normalized counts are represented as a,b,k-a-b, with nonnegative integer bounds.
Each actual counter must stay unchanged or increase by its scale, and the
weighted sum must equal the product of scales times the successor index. Base,
exact index+1, unchanged persistent state/effects and the exit guard are checked.
The result preserves symbolic counters with their joint relation to length.
Alternate2/3/5 scales are tested; no particular names/classification source are
recognized. Compound assignment, four-counter candidates, arbitrary coefficients,
nonzero initializers, general recurrences and mutable arrays remain unsupported
by this verifier. Existing AST96/choice-depth8/private-proof2400 and heap/environment
caps apply; candidate bindings are bounded before scanning. Harmless local-object
heap identity and ordinary fallback merge-work limits remain open.


## P049: mutable sequences, search and callback state

The three examples are implemented; final independent review and full validation
are pending. The contracts are bounded deliberately; none establishes arbitrary-length mutable
sequence induction or arbitrary Node event scheduling.

| Example | Declared domain and proof | Broken control |
| --- | --- | --- |
| [In-place compaction](../test/adversarial-compaction.spec.ts) | Ordinary dense arrays at each fixed length0..4; independent arbitrary finite Numbers. Returned alias has exactly the original nonnegative survivors, in order, with exact length and removed tail; original slice snapshot is unchanged. | Advancing on rejection and duplicating the first value cannot establish exact survivors. |
| [Binary search](../test/adversarial-binary-search.spec.ts) | Each fixed length0..4; sorted symbolic integers and target in[-1000000,1000000], duplicates allowed. A returned index matches; -1 implies absence. | Skipping a boundary element and omitting sortedness cannot establish the property. |
| [Competing callbacks](../test/adversarial-settlement.spec.ts) | Explicit interpreted driver delivers0..3 events of success/timeout/cancel, including repeats; optional single synchronous reentry. Settlement occurs at most once, cleanup matches settlement, and first result remains fixed. | Flag-after-notification, omitted cancellation cleanup, and cleanup-after-throwing-notification retain violations. |

Compaction checks every sign-mask implication in interpreted source, rather than
sampling concrete values or reproducing a second filter implementation. Inputs
remain symbolic. The fixed lengths are separate proofs; unknown-length immutable
array summaries do not admit writes and are not used here. Native controls include
empty arrays, duplicates, signed zeros and extreme finite values. The declared
finite domain excludes NaN, whose inclusion would require a different predicate
partition. Binary search uses ordinary `for` syntax; `while` is still unsupported.

Conditional member references now split explicit finite choices of concrete
string/number keys, preserving the evaluated receiver, key, RHS and method `this`.
Conditional array lengths split before ordinary truncation. Dispatch preflights
at most256 expanded nodes/depth16 and rejects cycles before invoking the branch
continuation. This bounds dispatch work, not arbitrary continuation/merge work.
Merged ordinary arrays retain exact own-key presence even when differing lengths
lose a shared elements vector: absent reads still perform prototype lookup.
Subsequent array mutation after that loss remains unsupported. Arbitrary opaque
symbolic keys, general ToPropertyKey and invalid array-length guest errors remain
separate gaps; an unsupported branch is never silently discarded.

[Shared Math.floor](math-floor.md) rounds concrete Numbers after VM ToNumber,
including finite alternatives and coercion effects/throws. Open symbolic rounding
remains a typed boundary. The CLI exposes the same intrinsic.

The new search-related inference is generic and under semantic review: finite
choice comparison/equality trees preserve guards; established nonstrict order
plus explicit disequality can strengthen an edge; bounded Boolean selection
priors can prove a result only when every retained leaf agrees. Unknown leaves
and exhausted budgets decline. These are neither source-pattern recognizers nor
a complete satisfiability solver. Selected Boolean guards retain their compatible
alternatives even when their result is known, so a guard's value does not erase
the disjunction needed for a later proof. Numeric leaves may themselves remain
symbolic: their ordinary comparison stays unknown unless separately established.

Current local caps: finite-choice relation preflight64 nodes/depth8, at most256
input facts,256 dispatch visits and512 branch facts. Boolean equivalence and
complement checks use64 visits/depth8; complement lookup admits at most128 facts.
Order-edge strengthening admits at most256 collected facts. Selection-prior
inference admits at most128 input facts/four prior selections,128 shared traversal
steps/depth8 and512 branch facts, with reentrant prior exploration disabled.
These caps bound the added work, not the inherited solver or merge globally;
ordinary comparison resolution runs before the bounded relation helper.
Final evidence records the accepted source and validation after freeze.

The callback fixture invokes actual interpreted closures and observes shared
state. Its cleanup is a modeled counter action, not an operating-system resource
close. A throwing notification is caught by the explicit driver so later events
can be delivered. The pending no-event state remains possible. The240 concrete
base histories independently checked in pinned Node supplement the symbolic
contract; they do not establish unbounded scheduling or async host compatibility.
