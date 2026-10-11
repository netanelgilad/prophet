# P006 Phase A: verified unknown-length loop inference

Status: Phase A design/red specs based on `541235e0680eb204871e3e995f0814898b8c2991`
(source `22739fa3856ad83244a643445fbac80ae16cc15d`); B1 implements the
representation prerequisite, and B2 adds a bounded verifier for the loop family
specified below. Neither a reducer name nor its source text is a proof premise.

## B1 checkpoint: exact representation types and operations

This section fixes the B1 implementation contract before source edits. B1 adds
no loop summary. The original numeric `start/end` region shape and recursive
summary behavior remain valid.

```ts
type CollectionEndpoint = number | { base: TESNumber; offset: number };
type CollectionRegion =
  | { id: object; start: CollectionEndpoint; end?: CollectionEndpoint }
  | { id: object; index: CollectionEndpoint };
type IndexedElementExpression = {
  kind: "indexed-element"; sequence: object;
  index: TESNumber; offset: number;
};
// In SymbolicSequence, alongside the concrete reads map:
// length: TESNumber (the original snapshot's actual length identity)
// indexedReads: Map<TESNumber, Map<number, TESNumber>>
```

`{base:k,offset:o}` denotes the exact integer `k+o` in the original snapshot;
it is not a floating-point expression guessed from numeric bounds. An indexed
element's expression identifies *which position* it reads, while its separate
numeric value can equal the value at another position. Distinct sequence ids
never alias. Repeating one `(index identity, offset)` read shares its value;
different index identities remain distinct unless active path facts prove their
absolute positions equal. A concrete read also receives indexed-element
provenance, so later `k=c` can relate it to an earlier symbolic read.

`readSymbolicIndex(array, number | TESNumber, context)` keeps the numeric path
and adds a guarded symbolic-integer path. The latter checks the actual **view**
length and `0 <= k < view.length`, the uint32 array-index limit, immutable heap
state and ordinary lookup guards. It returns an indexed element with its local
numeric template facts and a singleton-region `member` fact only when presence
is proved. No range-wide enumeration is used for arbitrary `k`. An optional
two-position selection uses the existing choice algebra when integer bounds
prove exactly two concrete possibilities; it has a strict size cap. If index
integrality, presence, inherited/custom lookup or the position relation is
unrepresentable, the read stops at a typed unsupported boundary. A concrete
absent index keeps ordinary prototype lookup rather than inventing `undefined`.
Existing concrete-index identity/slice behavior stays intact.

`symbolicActualArrayRegion(array,context)` supplies a region ending at the
original snapshot's *actual* length term, unlike the existing maximum-envelope
`symbolicArrayRegion`. It is available only when the view offset is provably no
greater than that length. The integer endpoint proof `proveEndpointOrder` is a
bounded, nonrecursive query over only numeric `order`/`integer`/`finite` facts
and literals already attached to the endpoint values or active path. It does
not consult `member` or `every-element-order` and cannot use the quantified
fact it is trying to instantiate. Region inclusion requires matching sequence
ids and proved half-open endpoint inequalities; a singleton member uses
`start <= index < end`. The query works on a local fact graph and never adds
facts to an observed value or context. Capped/unknown queries yield no derived
order. B1 adds same-index reasoning for numeric equality/comparison using that
same restricted endpoint proof, with a non-NaN check for equal values.

The array read fast path checks declared unmodeled indexed reads, custom lookup,
changed heap and inherited index state before returning a snapshot element.
This fixes the Phase A custom-lookup bypass for concrete indices as well as
symbolic ones. Key conversion for other receivers and non-index keys stays on
the existing ordinary path. The new fast path does not authorize symbolic
writes, arbitrary calls, or broader property coercion.

### B1 review correction: affine keys and lookup provenance

`exactIntegerEndpoint(value, knowledge)` accepts a literal safe integer, a
proved integer identity, or a bounded expression made solely of `+` or `-`
with a literal safe integer on the permitted side (`k+c`, `c+k`, `k-c`). It
returns `{base,offset}` only after primitive, nonquantified integer/order facts
bound every intermediate result within JavaScript's safe integer range. It
refuses unknown bounds, noninteger constants, possible NaN, overflow and
nonlinear/floating-point reassociation. The array read still separately
checks the uint32 key range and actual view presence. Position equality
compares normalized `(base,offset)` pairs with the existing bounded primitive
order proof, so `slice(2)[i]` can relate to `a[i+2]` without equating different
elements by value. This rule also supports the future exact successor proof;
B1 does not perform that proof.

Literal region endpoints compare directly as safe integers, before any
symbolic fact collection. The 128-fact budget applies only to new symbolic
endpoint work; it cannot erase the old concrete-region deduction. Prototype
lookup guards require both the recorded default Array.prototype hook object
and its private original read-function identity. Replacing the hook container,
mutating its read function in place, or adding an Object.prototype hook makes
inherited lookup unknown; uncertain presence stops before evaluating the hook.

## Required theorem and its scope

For a dense, immutable snapshot `A` of primitive finite numbers, with an integer
length `n` and `1 <= n <= 0xffffffff`, the example loop should establish at its
exit that its returned `best` is a member of `A[0,n)` and `best <= A[j]` for every
`0 <= j < n`. Thus `A[0] < best` is false. The maximum loop establishes the
dual. A finite element domain such as `[-20,30]` must work; `[0,1)` is incidental
to `Math.random` and cannot be the proof domain. The returned value remains
unknown, as can `best < A[0]` and a comparison with an independent element.

The proof must not be attached to the array type alone. Its obligations concern
the **evaluated loop** and the bindings and heap state actually read by it.
Normal completion is required before publishing a result. A boundary, throw or
partial fork supplies no numeric theorem for a completed result. The accepted
snapshot domain is a temporary implementation boundary; concrete empty, sparse,
NaN, infinity and signed-zero arrays continue through ordinary JavaScript
execution where modeled.

## Representation prerequisite: an arbitrary indexed read

Current `CollectionRegion` has numeric `start/end` in `src/symbolic/model.ts`;
`regionContains` in `src/symbolic/index.ts` compares those host numbers.
`src/array/symbolic.ts` memoizes reads by concrete `Map<number,TESNumber>`, and
`readSymbolicIndex` requires a concrete nonnegative index. `propertyName` in
`src/ASTResolvers.ts` rejects a computed key whose numeric value is symbolic.
Consequently a transition with arbitrary `i`, which must evaluate `a[i]`, is
not representable. Two concrete iterations check only `i=1,2`; no number of
sampled iterations proves an assertion for every `i<n` or validates length
1025. The new guarded-index and over-cap red specs isolate these two failures.

The smallest sound representation extension is:

1. Keep a symbolic sequence identity `S` and actual symbolic length `n` for the
   immutable dense snapshot. Give an indexed member the pair `(S,k)`, where `k`
   is an integer symbolic absolute index. A read is known present only if the
   current path proves `0 <= k < n` (adjusted for a view's concrete offset).
   Otherwise ordinary property lookup must return a conditional element or
   `undefined`, or decline; it must never assume presence. Check the array's
   own lookup hooks, inherited numeric properties/prototype guards and heap
   overlay before taking the dense fast path. A custom lookup is not a snapshot
   read.
2. Generalize regions to half-open intervals with symbolic integer endpoints:
   `R(S,l,r) = { A[j] | l <= j < r }`. `r` may be the current loop index or
   actual length. A contained-region assertion must be proved from the active
   path knowledge (`l_outer <= l_inner` and `r_inner <= r_outer`), not from
   object identity or maximum possible length. Preserve the existing concrete
   region behavior for recursive summaries and slices. `symbolicArrayRegion(a)`
   can describe the full view with its actual length; a maximum bound is only
   a conservative envelope, not the dynamic visited prefix.
3. Relate `(S,k)` to existing `S.reads[number]`: repeated reads of the same
   symbolic term share identity, `k=c` yields the exact concrete member `A[c]`,
   and a bounded finite index may branch/select on equality with existing
   concrete indices. The arbitrary proof does **not** enumerate all values of
   `k`. Its member fact is `member(R(S,k,k+1), A[k])` under the proved presence
   guard. This relation is necessary for the proof's universal fact to apply
   later to a concrete guaranteed-present index and to an aliased suffix.
   A bounded two-index alias/disjunction is a useful separate representation
   acceptance test, not a substitute for arbitrary-index inference.

All region facts are about the same immutable sequence `S`. Merely assigning a
matching array type or similar numeric bounds to another array cannot transfer
membership. A prefix endpoint must be tied to the *current* loop index binding
and its actual `n`, and an array mutation invalidates that snapshot.

## Candidate and proof obligations

For the sample loop the useful candidate at the **head** of an iteration is:

```text
I(i,b,S,n):
  integer(i) and 1 <= i <= n
  finite(b), notNaN(b)
  member(R(S,0,i), b)
  forall j in [0,i): b <= A[j]
```

The dual candidate uses `A[j] <= b`. These are *hypotheses to check*, not a
trusted reducer contract. `i` and `b` here are current binding values. Every
other binding modified by the loop must be included as a distinct carried value
with its required relation or make this candidate inapplicable. Do not replace
the mutable binding `best` by a fact about its initialization value.

**Initialization.** The ordinary loop driver evaluates the real `for`
initializer and first per-iteration environment copy before offering the
reached `test` phase to the verifier. It retains all earlier guest effects and
values exactly once. The private proof context evaluates the actual test under
an arbitrary guarded index and at the proposed exit; it never replays preceding
guest code. In the example, the already evaluated `best=a[0]` establishes
member of `[0,1)`; executing `let i=1` establishes integer progress origin.
The first test must be evaluated under this state. If the array is singleton,
the false test yields the exit with `i=n=1`; no body assumption is needed. If an
initializer, earlier statement or first test has effects, failures, alternate
values, captured dependencies or a different index, those outcomes must be
accounted for; no candidate enters the caller state before validation.

**Arbitrary transition.** Replace the head index by a fresh symbolic integer
`k` constrained by `I` and the true test; replace each other carried binding
by a fresh symbolic value carrying only the candidates currently under check.
Run the existing interpreted test, body, per-iteration lexical copy and update
with those bindings. For the sample, true test proves `k<n`; then `a[k]` is an
actual present member of the *same* `S`. On the update branch, the evaluated
comparison `a[k]<b` and assignment give `b'=a[k]`, hence `b'<=b`, `b'<=a[k]`
and membership in `[0,k+1)`. On the no-update branch, the false comparison,
with finite non-NaN operands, gives `b<=a[k]`; `b'=b` retains the old prefix
relations and membership. These two branches must both prove the new candidate
after the actual update; a one-branch proof is insufficient. `continue` paths
must run the update; `break`, return and throw paths need separate exit checks
or make this first increment decline.

**Progress and coverage.** The update must establish `i'=k+1`, as integers,
without a second write to `i` in the body or an alias. Together with `k<n`
and `k>=1`, this proves `i'<=n` and strict progress. The visited region extends
from `[0,k)` to exactly `[0,k+1)`, so no element is skipped. A decreasing or
stationary update, `i=2` initialization, stride 2, body mutation of `i`, or a
guard that can exit before `i=n` fails this obligation. This exact affine
progress proof plus finite `n` proves termination in at most `n-1` steps; it is
not an inference from the loop driver's 1024-entry cap. If the solver cannot
prove the affine relation or numeric limits near uint32 extremes, decline.

**Exit and return.** Evaluate the false test with the current invariant. With
`i<=n` and the actual test `i<n`, finite integer facts give `i=n`. The prefix
becomes the full snapshot. Continue evaluating the code after the loop with
the abstract post-state, including the *actual* return expression. `return
a[a.length-1]` lacks the lower bound; `return best+1` may lose it. A return
inside the loop, exceptional exit, or other reachable completion cannot be
silently represented by the normal exit. The final summary/fact is published
only if every feasible normal result satisfies the candidate and the proof
execution has no unclassified completion.

**Refinement without circular trust.** Start with generic candidates such as
finite, not-NaN, prefix membership, lower and upper element order, plus index
range/progress obligations. Check the base without candidate assumptions.
Check one arbitrary step using only the candidate set that survived the base.
Remove every fact not proved on every feasible transition or return path, then
repeat with the smaller set until stable. The set is finite and only shrinks.
Mutual induction among retained candidates is valid because each has a real
base and a transition proof from the entire retained set. An unproved
membership fact cannot be used as a shortcut to prove order after its removal.
Proof obligations must be discharged by the shared comparison/selection rules;
an unknown answer means removal/decline, never truth. If exact selected-element
membership cannot be checked with the new indexed-value relation, omit that
candidate and its published fact until the representation rule is added. Do
not invent an unverified `member` fact merely because order was proved.

## Side effects, invalidation and completion

Proof exploration must be transactional. Clone or journal persistent
environments, heap, knowledge, effects **and the currently mutable
`SymbolicSequence.reads` and `indexedReads` maps**; scratch `a[k]` reads must not pollute caller
memoization. A proof-context hook should reject writes to the input snapshot,
captured mutable bindings, external heap objects or host effects; arbitrary
calls require an independently verified pure summary, otherwise decline.
Validate reads by binding identity and lexical scope, not variable spelling:
shadowed locals are distinct; a captured mutable guard or getter cannot be
treated as an immutable loop condition. Check dependencies on every path and
at any reuse point. A first implementation can omit caching entirely, avoiding
stale facts after caller heap/binding changes. If caching is later added, its
key must include exact function identity, array contract, captured values and
relevant heap/prototype versions; a function identity alone is insufficient.

Any failed proof attempt discards its private state and invokes the existing
ordinary loop from the original caller context, preserving bounded unrolling
and reached boundaries. Earlier **real** effects remain in that context, in
order; speculative proof calls never append them. The opaque-call spec pins a
real output before a reached stop. A safe failure may yield a boundary,
partially completed fork, or normal value if ordinary execution can handle it;
none may be promoted into a proved Boolean. For a symbolic snapshot write,
today's guard remains a legacy host error; classification and mutation-site
checkpointing remain separate residual work.

Explicitly decline for uncertain sparsity, custom own/inherited indexed lookup,
unknown array mutation, possible NaN or infinity in the symbolic element
contract, empty domain when the base proof assumes `a[0]`, captured mutable
dependencies, calls with unknown purity, and abrupt paths not discharged by a
separate obligation. Concrete values in those categories still use normal
JavaScript behavior where the VM supports them; they are not globally banned.

## Work limits and proposed ownership

Use fixed proof-local limits before AST walks, indexed-term creation or frontier
expansion: at most one candidate loop per call, a small fixed candidate set
(five numeric/membership facts), at most six monotone refinement passes, and
bounded AST nodes, paths, solver queries and allocated symbolic terms. A cap
means decline and ordinary execution; it cannot establish the invariant.
Host stack depth, join/collapse cost and memory are separate limits. The test
command itself uses external `timeout` because Jest cannot interrupt a stuck
synchronous exploration. Omit caching in the first implementation.

Smallest reviewable split, because the current representation cannot execute
the arbitrary transition:

1. **P006 representation prerequisite (B1):**
   `src/symbolic/model.ts`, `src/symbolic/index.ts`,
   `src/array/symbolic.ts`, `src/ASTResolvers.ts`, and focused cases in
   `test/symbolic-array-index.spec.ts`, retaining the Phase A
   `test/unknown-length-loop.spec.ts`. Preserve all existing concrete-index and
   recursive-summary behavior. The guarded-index red case must complete with
   verified identity/membership; custom lookup must stop honestly. This is a
   real source change, not a test helper.
2. **P006 loop verifier (B2, implemented for review):** `src/loops/for.ts`, a new
   `src/loops/unknown-length-summary.ts` for private abstract execution and
   candidate refinement, and likely `src/execution-context/ExecutionContext.ts`
   for proof-only read/write/call hooks. The chosen entry point is the reached
   loop state, after real pre-loop work; do not replay its effects. Keep the
   recursive engine's suffix proof and cache unchanged unless a shared helper
   can be introduced with explicit regression evidence. The review gate should
   choose the entry point before granting Phase B ownership.

No new JavaScript syntax or Node host API is proposed. The existing `for`,
comparison, assignment, lexical-binding and completion Test262 coverage remains
the language baseline. If Phase B expands computed-property semantics beyond
the existing numeric-index surface, activates new abrupt/label forms, or changes
ordinary `for` behavior, use complete unmodified relevant Test262 files, not
isolated copied assertions. Symbolic induction itself has no Test262 equivalent.
Native controls must use pinned Node 24.21.0 and remain separate from proof.

## B2 implementation and exact boundary

The verifier is offered once at the first reached test phase of a
**function-local loop**, after real initialization and the first lexical copy.
Top-level loops use ordinary bounded execution. Its admitted header is an identifier
index tested by `i < a.length`, with a dense immutable numeric snapshot of
unknown length, minimum at least one, a real cached `a[0]` base, and `i === 1`.
The element template must be finite. A body/update AST preflight excludes
nested loops, calls, closures and abrupt statements; shared VM evaluation then
checks the actual test, body, per-iteration copy and update. Every pre-existing
binding write is checked by environment identity and name. The sole permitted
writes are the index and one candidate mutable carry binding. Readonly aliases
are left intact; an identity transition preserves the actual initialized
binding instead of replacing it with a fresh unknown, and failure of one
candidate does not suppress a later eligible binding. This includes an index
declared before the loop: its post-loop binding is published as the actual
length. Body-local temporary bindings are distinct; any other carried write
makes this attempt decline.

The proof clones the snapshot read maps, array aliases, environments, heap and
evaluation budget. Read/write/call hooks reject captured bindings, foreign
array/property reads, unknown calls and changed heap/effects. It introduces
an arbitrary integer `k` in `[1, 0xfffffffe]` with `k < length`, fresh carry
value and only currently retained candidate facts. The generic candidates are
finite, template range, prefix membership, and lower/upper prefix order. Shared
numeric and indexed-read rules check both branch outcomes through the VM;
failed candidates are removed and the transition is rerun to a fixed point.
The actual update must normalize exactly to `k+1` within safe integer bounds.
The false test is separately evaluated at `i=length` before publishing the
proved carry facts and exit index to the real reached state. No private reads,
effects, heap changes or budget consumption are published. An unsuccessful
attempt returns to bounded ordinary execution at that same reached state.

The verifier's work is locally bounded by 96 AST nodes, five candidates, six
refinement passes, 2400 private evaluation units, 256 inspected bindings,
32 environments, 128 heap entries and the B1 symbolic solver's local
endpoint/index limits. These entry caps bound the local scan but do not turn
whole-program store cloning, general solver, joining or host allocation into
a globally budgeted operation. It does not enumerate possible lengths, including
the default uint32 range. The supported family is narrower than general
JavaScript `for`: alternate guards, progress forms, multiple carries, calls,
body effects, abrupt paths, mutation, uncertain presence and unproved
dependencies use ordinary fallback. Large unsupported loops may then finish
at a typed budget boundary. The general comparison solver, branch joins,
allocation and host stack have independent residual costs.

The B2 specs include minimum/maximum/renaming, default uint32 finite
nonconstant elements, wrong reducer and index-dependent late-deviation
controls, visible external counter, alias/shadowing, changed call state and
array rebinding between calls,
real output/effect preservation, guest throw leaves, ordinary completed
unknown-length controls and an explicitly unfinished large control. Concrete
NaN, holes, infinity and signed-zero outcomes are compared with pinned Node
24.21.0. Exact commit and audit results belong in the B2 evidence metadata.
