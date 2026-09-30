# Prophet

Prophet is a JavaScript interpreter whose values can be concrete or symbolic.
Concrete execution is the fully known case of the same evaluation model. The
long-term goal is a JavaScript VM with Test262 conformance and symbolic execution;
the current implementation supports a limited subset of JavaScript.

## Run the examples

Install with the repository's pinned Yarn release:

```sh
node .yarn/releases/yarn-3.1.1.cjs install --immutable
node .yarn/releases/yarn-3.1.1.cjs example:min
node .yarn/releases/yarn-3.1.1.cjs example:routing
node .yarn/releases/yarn-3.1.1.cjs example:unknown-length
```

The examples run JavaScript through Prophet. They do not sample the host random
generator: every `Math.random()` call produces a fresh unknown number with
`0 <= value < 1`.

[Recursive minimum](examples/recursive-min.js) evaluates:

```js
function min(arr) {
  if (arr.length === 1) return arr[0];
  const tailMin = min(arr.slice(1));
  return arr[0] < tailMin ? arr[0] : tailMin;
}

const d = [
  Math.random(), Math.random(), Math.random(), Math.random(), Math.random(),
  Math.random(), Math.random(), Math.random(), Math.random(), Math.random()
];
const x = d[0] < min(d);
```

`x` becomes a boolean with `value: false`. The input numbers and minimum remain
unknown. The comparison and conditional selection establish that the returned
number is no greater than either alternative; those facts compose through the
recursive calls. No rule recognizes the name or implementation of `min`.

[Symbolic routing](examples/symbolic-routing.js) demonstrates the same machinery
with strings, booleans, early returns, object writes, and aliases:

```js
function route(score, record) {
  if (score < 0.5) {
    record.lane = "left";
    record.accepted = true;
    return "left";
  }
  record.lane = "right";
  record.accepted = false;
  return "right";
}

const score = Math.random();
const record = { lane: "pending", accepted: false };
const alias = record;
const lane = route(score, record);

const consistent = lane === alias.lane;
const valid = score < 0.5
  ? lane === "left" && alias.accepted
  : lane === "right" && !alias.accepted;
const impossible = score < 0.5 && lane === "right";
const uncertain = lane === "left";
```

Prophet proves `consistent` and `valid` true, and `impossible` false.
`uncertain` stays unknown: either lane is possible. The function's return value
and the object's fields retain their connection to the same branch condition.

Programmatic evaluation uses `evaluateCode(source, nodeInitialExecutionContext)`
from `src/index.ts`. The returned pair contains the completion and execution
context; variables are available at `context.value.scope`. The example runner
prints the requested variables' types and concrete values, or `"unknown"`.

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
node .yarn/releases/yarn-3.1.1.cjs test:min
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
source. The original recursive minimum example uses a nonempty array of known length
and executes its recursive calls. The separate unknown-length example infers
and verifies a reusable summary as described below.

Function environments still use the original flat scope representation, without
full lexical closures or block scoping. Array indexing uses concrete keys. Symbolic dense arrays retain stable element
identities and guarded reads; writes to these snapshots are currently rejected. Object-to-primitive
coercions and symbolic calls that throw on only some paths are rejected when
unsupported. The interpreter does not yet implement all syntax, built-ins,
property semantics, or language errors.

The reasoner is deliberately incomplete: a result can remain unknown even when
a stronger analysis could prove it. General nested choices may require
exponential exploration. Stored order facts avoid expanding every alternative
for the recursive minimum proof, but they do not solve general recursion or
arbitrary symbolic arithmetic. Verified summaries avoid unrolling the supported
unknown-length recursion described below.

## Unknown-length recursion

[The unknown-length example](examples/unknown-length.js) runs the same recursive
minimum and an independently written maximum on a nonempty dense array whose
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

The demo produces `x = false` for `d[0] < min(d)` and `aboveMaximum = false` for
`d[0] > max(d)`. `min(d) < d[0]` and `d.length` remain unknown. For each function,
the proof executes one singleton body and two general-step bodies. The second
minimum call reuses its verified summary without evaluating the body again.
`getInferredSummaries(fn)` exposes these counts and the retained facts; the
example runner includes them in its JSON output.

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
