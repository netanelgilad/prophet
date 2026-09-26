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
  finiteness, exclusion of NaN, or the truth of a condition. There is no separate
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

Arrays describe their structure explicitly (`elements`, `segments`, or
`unknown`), without a `concrete` flag. A known list can contain unknown numbers;
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

The focused tests cover symbolic bounds, generic conditional values, object and
array state, control flow, recursion, and both examples. Historical Test262
selections remain skipped; activating a trustworthy conformance baseline is the
next layer of the PR stack. This is not a claim of JavaScript conformance.

The parser accepts JavaScript, so omit TypeScript annotations in interpreted
source. The recursive minimum example requires a nonempty array with known
length and executes its recursive calls. Discovering and verifying reusable
summaries for unknown-length recursion is **not implemented**.

Function environments still use the original flat scope representation, without
full lexical closures or block scoping. Array indexing and writes currently
require concrete keys and supported known structures. Object-to-primitive
coercions and symbolic calls that throw on only some paths are rejected when
unsupported. The interpreter does not yet implement all syntax, built-ins,
property semantics, or language errors.

The reasoner is deliberately incomplete: a result can remain unknown even when
a stronger analysis could prove it. General nested choices may require
exponential exploration. Stored order facts avoid expanding every alternative
for the recursive minimum proof, but they do not solve general recursion or
arbitrary symbolic arithmetic.
