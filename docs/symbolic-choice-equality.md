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

Some relationships still remain unknown. If a comparison can succeed through
either of two alternatives and no individual fact is common to both, the solver
does not generally revisit the comparison after later learning another guard.
For example, equality between two independently chosen strings can imply that
their guards agree, without identifying either guard. Repeated matching leaves
can similarly imply a disjunction. The specs retain these as mandatory unknowns,
alongside positive unique-leaf and common-fact proofs. General disjunctive
propagation and a full equality solver remain open under SYM-001.

Nine complete, unmodified strict equality/inequality Test262 cases add 18 variants
for signed zero, primitive comparisons and operand effects/throws. See the
[Test262 record](../test/test262/README.md) for remaining whole-file NaN and
boxing blockers. Local symbolic proofs are separate from upstream conformance.
