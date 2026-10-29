# Equality and symbolic choices

For an unknown Boolean `head`, Prophet now proves:

```js
const method = head ? "HEAD" : "GET";
method !== "GET" && method !== "HEAD"; // false
method === "HEAD" ? head : !head;      // true
method === "HEAD";                     // unknown
```

The choice remains unknown outside either branch. Inside a branch that assumes
`method !== "GET"`, only the HEAD alternative can satisfy that assumption, so
the existing shared knowledge records that `head` is true. This works for
strings, numbers, mixed primitive values and reference identity; it does not
recognize an HTTP method or an application function.

## Implementation

The value still stores one `select` expression with a guard and two alternatives.
Equality still stores one `strict-equal` expression referring to its two values.
The [shared assume operation](../src/symbolic/index.ts) refines a branch when it
learns the comparison's result:

1. Check each feasible alternative under the knowledge from before the new
   equality assumption. Remembering the desired answer first could conceal
   a contradiction during that check.
2. Substitute the selected value into the comparison. If both operands refer
   to the same choice, substitute both together.
3. Discard an alternative only when its comparison is known to disagree with
   the assumed answer. An unknown comparison remains feasible.
4. Keep only newly learned facts shared by every remaining alternative. A
   single remaining alternative can identify its guard; several alternatives
   may establish a common inner guard without establishing the outer one.

Boolean selections used by `&&`, `||` and conditional expressions follow the
same rule. Numeric equality also retains its existing order facts. There is no
new fact kind or separate HTTP reasoning engine. Heap updates, exceptions and
effects use the existing persistent branch state.

This is lazy refinement of a shared graph, not an eagerly expanded equality
expression for every combination. It does **not** guarantee polynomial work:
choices may be revisited under different path knowledge, and this inference
has no dedicated memoization or work budget yet (SYM-004).

## Proven behavior and remaining unknowns

The [choice specs](../test/symbolic-choice-equality.spec.ts) cover nested and
mixed choices, swapped comparisons, repeated leaves, common inner guards,
reference identity, independent inputs, branch writes, skipped calls, and
conditional exceptions. NaN remains unequal to itself; +0 and -0 compare equal
while the underlying chosen zero retains its sign. Partly unknown alternatives
are not discarded merely because their contents are unknown. A pinned Node
oracle checks all four assignments in a two-Boolean concrete fixture.

The [unchanged static-server spec](../test/pico-static-server-analysis.spec.ts)
now combines symbolic GET/HEAD with symbolic index-file presence. Every path
reaches the real file read; there is no invented 405 and no path filtering. An
absent index throws ENOENT before response commitment. A present index completes
200 with the file bytes for GET and no bytes for HEAD. The original missing
content headers, declared filesystem domain and healthy consume-at-end transport
assumption remain unchanged. This is a bounded application proof, not all
request, filesystem or scheduling behavior.

P049 proves the small repeated-leaf disjunction and independent-string-choice
guard-agreement examples through bounded relation/prior inference. Individual
guards and equality outcomes remain unknown when both concrete outcomes are
possible. General disjunctive propagation and a full equality solver remain open
under SYM-001; bounded work can conservatively decline further inference.

Finite selection membership is now proved within an explicit bound, in any
candidate order. A nested selection of finite symbolic values proves the
exhaustive `selected === a || selected === b || ...` disjunction (and the
corresponding conjunctive rejection is false) by refuting infeasible
selection-path combinations: a branch survives only while some syntactic
sub-leaf contradicts no assumed equality about the same selection, and an
equality resolves only when every surviving leaf agrees through known strict
equality. The [selection-membership specs](../test/symbolic-selection-membership.spec.ts)
cover forward/reverse/renamed/comparison-driven selections, all six candidate
orders, incomplete lists, fresh values, aliases, NaN/maybe-NaN,
infinities/signed zero, mixed primitives and object identity. The leaf
exploration is capped (4 leaves, depth 16, 8 usable assumptions including
the current one, 8 resolution priors, non-choice leaves/candidates only,
no reentrant new exploration); over-cap inputs keep prior behavior, which
can still prove some cases (the tested five-leaf order remains unknown).
Incomplete-list, fresh-value and NaN unknowns are tested countercontrols,
not universal categories. See the [selection-membership wiki](wiki/selection-membership.md).

Nine complete, unmodified strict equality/inequality Test262 cases add 18 variants
for signed zero, primitive comparisons and operand effects/throws. See the
[Test262 record](../test/test262/README.md) for remaining whole-file NaN and
boxing blockers. Local symbolic proofs are separate from upstream conformance.


## P049: retained finite-choice relations

Search contracts expose lost relationships between a conditional index and its
not-found sentinel. The shared reasoner retains finite relational/equality
choices as Boolean decision trees, recognizes bounded complements and explores
bounded remembered selection priors to prove queries only when all retained
leaves agree. Known nonstrict order plus disequality can strengthen transitive
order edges. A selected guard's known Boolean result does not identify its
alternative: compatible paths are retained before applying the prior. Numeric
choice leaves can be symbolic; their normal comparisons stay unknown until proven.
Final validation evidence is recorded in the P049 task review.

Finite-choice relation preflight traverses the complete expression closure, including
guards and refinements, capped at64 expanded nodes/depth8 and256 input facts;
dispatch at256 visits/512 branch facts. Boolean same/complement tree checks use
64 visits/depth8, with complement lookup limited to128 facts. Nonstrict-order
strengthening admits256 collected facts and uses only explicit strict-equality
truth facts with matching endpoints, avoiding general Boolean-tree matching. Prior inference admits128 input facts,
four priors,128 traversal visits/depth8 and512 branch facts. The128-visit budget
is shared across an entire outer Boolean-resolution call, including recursive
queries. Prior inference is disabled during assumption construction and reentrant
prior exploration; a fresh outer query resets its optional inference budget.
An unknown or disagreeing compatible leaf declines that prior immediately. Unknown leaves, empty evidence and exhausted work
cannot become proofs. This bounds added reasoning, not all inherited solver or
merge work; no input value is rewritten and general satisfiability remains open.

Comparisons retain original operands alongside an optional equivalent Boolean
`refinement`. Assuming the comparison preserves aggregate order facts and the
refined branch relationship; a false comparison reverses order only when NaN is
excluded. Joined values store the equivalent compact guard, while numeric fact
derivation uses the original comparison. This avoids duplicating both forms
through every joined value and preserves the original minimum proofs. The graph
serializer retains both forms when a comparison itself is serialized.
