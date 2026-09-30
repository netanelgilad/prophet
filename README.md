# Prophet

Prophet is a JavaScript interpreter whose values can be concrete or symbolic.
Concrete execution is the fully known case of the same evaluation model. The
long-term goal is a JavaScript VM with Test262 conformance and symbolic execution;
the current implementation supports a limited subset of JavaScript.

## Run the specs

Behavior examples live in `test/*.spec.ts`, alongside their interpreted source,
input setup, and assertions. Run a specific spec directly through the existing
test command; do not add standalone demo files, runners, or per-example scripts.

```sh
node .yarn/releases/yarn-3.1.1.cjs install --immutable
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/min.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/symbolic-routing.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/unknown-length.spec.ts
```

- [Recursive minimum](test/min.spec.ts) proves `d[0] < min(d)` false for ten
  unknown random values, checks every element bound, and preserves uncertain
  results. No host random numbers are sampled.
- [Symbolic routing](test/symbolic-routing.spec.ts) proves that returned strings
  agree with writes observed through an object alias, while the chosen route
  stays unknown.
- [Unknown-length recursion](test/unknown-length.spec.ts) checks inferred bounds
  for minimum and maximum, an unknown length, proof work counts, summary reuse,
  and cases that must not gain unsupported facts.

Specs execute JavaScript through `evaluateCode(source, initialContext)` from
`src/index.ts`. The returned context stores bindings in `context.value.scope`.
Each interpreted `Math.random()` produces a fresh unknown number in [0, 1).

## Spec-first development

The goal is full Test262 coverage and advanced symbolic evaluation in the same
VM. Every feature should expand executable specifications and the implementation
together:

1. Start with a small spec that expresses the desired JavaScript behavior or
   symbolic conclusion. Keep the source and explicit input assumptions beside
   assertions for both proven results and results that must remain unknown.
2. For language semantics, add relevant complete, unmodified Test262 cases to
   the active corpus and extend runner support when needed. For symbolic
   features, add proof and counterexample specs; use independent concrete
   JavaScript checks where they help catch unsound conclusions.
3. Implement reusable VM semantics and reasoning rules. Do not recognize a
   sample function by its name or body, or quietly narrow its inputs just to
   make the spec pass. Record temporary strategy/input limits explicitly and
   expand them with cases such as empty/sparse arrays, NaN/infinities, aliases,
   side effects, and alternative control flow.
4. Run the affected spec files while developing. Before publishing the next
   stacked PR, run the full specs and typecheck. Existing passing behavior must
   remain covered; unsupported or skipped cases do not count as conformance.

Boundary specs that currently expect an unsupported-analysis error protect
against false proofs. They record missing capability, not the desired final VM
behavior. When implementing that capability, replace those rejection assertions
with the appropriate JavaScript behavior and symbolic results. Keep remaining
limits visible; do not make the tests permanently enforce a shortcut.

## Values, expressions, and knowledge

These are separate concepts in the representation:

- **Values** have an identity and an internal kind such as `number`, `string`, or
  `array`. Primitive values may carry a known `value`. Internal kinds are not
  JavaScript `typeof` strings: `typeof []` and `typeof null` both produce
  `"object"`.
- **Expressions** describe computations, such as a comparison, arithmetic, or
  `select(condition, consequent, alternate)`. A comparison expression represents
  a question; it does not claim that the comparison is true. The same conditional
  representation works for numeric, string, boolean, object, and mixed results.
- **Knowledge** is a collection of facts that all hold together. Its current
  TypeScript type is `ReadonlyArray<Fact>`, where facts express numeric order,
  finiteness, exclusion of NaN, integrality, collection membership, universal
  element bounds, or the truth of a condition. There is no separate
  variant for every combination of facts. The vocabulary can grow independently
  of the value kinds and expression forms.

See [the expression and fact types](src/symbolic/model.ts) and
[the shared reasoning implementation](src/symbolic/index.ts). Values can retain
established facts, while the execution context carries assumptions valid on the
current path. The numeric module provides compatibility entry points to this
shared model.

An unknown `if`, ternary, or short-circuit condition forks evaluation with
opposite assumptions. Each branch starts from the same state. Results and
bindings merge as conditional values, preserving their guards instead of
independently forgetting which alternatives belong together. Numeric selections
also retain facts established in both alternatives. For example, `a < b ? a : b`
can carry the fact that its result is no greater than either input.

Object and array writes use a [persistent heap](src/execution-context/Heap.ts)
in the execution context. Branches keep separate property versions, so a write
on one branch cannot leak into the other. Aliases retain object identity and
observe the same merged properties. [Branch merging](src/execution-context/branches.ts)
and [statement evaluation](src/evaluate.ts) preserve early returns so the
remaining statements execute only on paths that continue.

Arrays describe their structure explicitly (`elements`, `segments`, `symbolic`,
or `unknown`), without a `concrete` flag. A known list can contain unknown numbers;
its length and positions remain available. Knowing an array's shape is separate
from knowing every element's value.

Different unknown identities may have equal values. NaN, infinities, and signed
zero require JavaScript-specific reasoning: in particular, a false `<` comparison
only supplies the reverse order fact when both operands are known not to be NaN.
Arithmetic expressions are retained even when the current reasoner cannot
extract useful numeric facts from them.

## Validation and current limits

```sh
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/test262.spec.ts test/test262/runner.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand
node .yarn/releases/yarn-3.1.1.cjs typecheck
```

The active Test262 baseline runs **36 strict/sloppy variants of 18 complete,
unmodified files** from the revision pinned in `yarn.lock`. It covers selected
primitive comparisons, conditional/logical expressions, `typeof`, and parse
errors. Historical unsupported selections remain explicitly skipped. This is
limited coverage, not a claim of Test262 conformance. The
[runner documentation](test/test262/README.md) explains the supported assertion
harness and metadata. Test262 source always runs through Prophet; separate local
differential tests use host JavaScript as an independent concrete oracle.

The parser accepts JavaScript, so omit TypeScript annotations in interpreted
source. The known-length minimum specs execute recursive calls. The
unknown-length specs infer and verify reusable summaries as described below.

Function environments still use the original flat scope representation, without
full lexical closures or block scoping. Array indexing uses concrete keys.
Symbolic dense arrays retain stable element identities and guarded reads; writes
to these snapshots are currently rejected. Object-to-primitive coercions and
symbolic calls that throw on only some paths are rejected when unsupported.
The interpreter does not yet implement all syntax, built-ins,
property semantics, or language errors.

The reasoner is deliberately incomplete: a result can remain unknown even when
a stronger analysis could prove it. General nested choices may require
exponential exploration. Stored order facts avoid expanding every alternative
for the recursive minimum proof, but they do not solve general recursion or
arbitrary symbolic arithmetic. Verified summaries avoid unrolling the supported
unknown-length recursion described below.

## Unknown-length recursion

[The unknown-length specs](test/unknown-length.spec.ts) run recursive minimum
and an independently written maximum on a nonempty dense array whose
length is unknown. Its input contract is supplied through the VM API:

```ts
const d = symbolicNumberArray({ minimumLength: 1, element: randomNumber() });
const initial = setVariablesInScope(nodeInitialExecutionContext, { d });
const [, context] = evaluateCode(source, initial);
```

`symbolicNumberArray` comes from `src/array/symbolic.ts`, `randomNumber` from
`src/symbolic`, and `setVariablesInScope` from the execution-context module.
This supplies facts about the input, not a promise about the function. Every
valid JavaScript array length from 1 through 2^32 - 1 is initially possible;
every element is a finite number in [0, 1). No finite sample array is generated.

The [summary engine](src/Function/summaries.ts) works as follows:

1. Execute the actual function body on one arbitrary element. Ask which generic
   candidates hold: finite result, non-NaN result, a lower bound for every input
   element, and an upper bound for every input element.
2. Execute the body on an array whose length is any integer at least two.
   Temporarily use the candidates for recursive calls, after checking that each
   call receives a nonempty, strictly smaller suffix of the same snapshot.
3. Check the returned value against the first element and a fresh arbitrary
   element of the remaining suffix. Together these cover every input element.
   Discard candidates that fail, then repeat the step using only the survivors.
4. Cache and apply the summary only after the candidates stabilize. Base case,
   recursive step, and length descent jointly justify the result for all lengths.

The minimum retains the lower-bound fact; maximum retains the upper-bound fact.
Their names do not matter. A head-only or tail-only implementation does not gain
universal bounds. Tests also check changed base cases, skipped elements, and
special branches at lengths 3 and 2^32 - 1.

The specs assert `x = false` for `d[0] < min(d)` and `aboveMaximum = false` for
`d[0] > max(d)`. `min(d) < d[0]` and `d.length` remain unknown. For each function,
the proof executes one singleton body and two general-step bodies. The second
minimum call reuses its verified summary without evaluating the body again.
`getInferredSummaries(fn)` exposes these counts and the retained facts, which
the specs assert directly.

These restrictions are enforced by the implementation, not just chosen in the
spec input. The strategy is specialized to induction over array length, with a
singleton base case and the four candidate fact kinds listed above. The facts
that survive are derived from the body; the engine does not recognize `min` or
`max`. It is not yet a general recursion solver.

The sample minimum has no empty-array stopping case, so its nonempty assumption
is necessary for termination. Supporting functions with an empty base case also
requires extending the current proof strategy to check length zero. Dense
numeric arrays avoid modeling unknown holes and coercions in this first strategy.
The finite-only guard is stronger than necessary for infinities; NaN requires
careful comparison reasoning because an element-wide `<=` fact may fail even
when the original strict comparison can still be proved false. These are
implementation limits to expand through specs, not permanent VM requirements.

This first inference domain supports a pure, directly self-recursive function
with one dense numeric-array argument. Elements must have a finite numeric
contract. Supported reads are array length and literal indices; recursive
slicing uses the trusted nonnegative-start, omitted-end `slice`. Empty inputs,
possible NaN/infinity inputs, mutation, captured mutable dependencies, arbitrary
calls, loops, and unmodeled property behavior are rejected. Top-level lexical
locals are allowed, but block-scoped declarations, use before initialization,
and writes to constants are rejected. Proof work has a budget and never turns
an unfinished proof into a fact.

A cached summary belongs to its function identity and input element-template
identity. Its universal facts refer to an immutable sequence snapshot, so they
cannot transfer to a different array's elements. This does not yet automatically
accelerate known-length arrays; those keep their existing concrete/symbolic
execution and exact results. Broader summary domains and reuse across equivalent
input contracts can be added separately.

## Development stack

Development proceeds on a stack of GitHub PRs. Treat the latest branch as the
working base for the next feature, and target each PR at its immediate predecessor.
The current stack is recorded in [docs/stack.md](docs/stack.md).
