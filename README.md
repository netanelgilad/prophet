# Prophet

Prophet is a JavaScript interpreter whose values can be concrete or symbolic.
Concrete execution is the fully known case of the same evaluation model. The
long-term goal is a JavaScript VM with Test262 conformance and symbolic execution;
the current implementation supports a limited subset of JavaScript.

## Run the specs

Behavior examples live in `test/*.spec.ts`, alongside their interpreted source,
input setup, and assertions. Run a specific spec directly through the existing
test command; do not add standalone demo files, runners, or per-example scripts.
Use **Node v24.21.0**, the pinned CommonJS reference and CI release. If Jest runs
on another release, set `PROPHET_NODE_BINARY` to a v24.21.0 executable for the
compatibility oracle. A mismatch fails explicitly rather than skipping coverage.

```sh
node .yarn/releases/yarn-3.1.1.cjs install --immutable
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/min.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/symbolic-routing.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/unknown-length.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/lexical-environments.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/symbolic-exceptions.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/arithmetic-bounds.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/commonjs-compat.spec.ts test/commonjs-symbolic.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/commonjs-loader-compat.spec.ts test/commonjs-loader-symbolic.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/commonjs-resolution-compat.spec.ts test/commonjs-package-config.spec.ts test/commonjs-resolution-symbolic.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/commonjs-package-resolution.spec.ts test/commonjs-package-exports.spec.ts test/commonjs-package-symbolic.spec.ts test/published-invariant.spec.ts
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
- [Captured validators](test/lexical-environments.spec.ts) creates two range
  validators with independent limits. For an arbitrary finite input, acceptance
  stays unknown, accepted values satisfy the captured bounds, and disjoint
  ranges cannot both accept. The same specs check shared mutable captures,
  escaping block/catch bindings, and closures selected on symbolic paths.
- [Throwing validators](test/symbolic-exceptions.spec.ts) carries successful and
  throwing calls through expressions, callers, catch, and finally. It proves
  accepted bounds for a captured range validator over an arbitrary finite input,
  checks effects happen exactly once on each path, and keeps the bound unknown
  when the input may be NaN.
- [Arithmetic bounds](test/arithmetic-bounds.spec.ts) carries numeric limits
  through calculations. It proves a random value scaled by 10 always passes
  `range(0, 10)`, scaling by 1000 may pass or throw, and adding 11 to that scaled
  value always throws. A separate normalization function proves a [0, 1] output
  for inputs bounded by its caller's branch.
- [CommonJS source execution](test/commonjs-compat.spec.ts) compares exports,
  module scope, wrapper parameters, returns, and throws against real `.cjs`
  execution in pinned Node. [Symbolic module specs](test/commonjs-symbolic.spec.ts)
  prove bounds through an exported closure and preserve initializer effects when
  the module can throw.
- [CommonJS loading](test/commonjs-loader-compat.spec.ts) compares an explicitly
  supplied graph of `.cjs` files against Node: relative/absolute requests, cache
  identity, cycles, and failed-load retry. [Symbolic loader specs](test/commonjs-loader-symbolic.spec.ts)
  keep cache state and effects associated with each execution path and prove
  bounds through a function that loads a validator with `require`.
- [Local module resolution](test/commonjs-resolution-compat.spec.ts) checks file
  and directory selection, package `main`/`type`, and cached JSON modules against
  Node. [Configuration proofs](test/commonjs-resolution-symbolic.spec.ts) load a
  normalizer through a directory entry and prove its bounds using JSON limits,
  while preserving conditional configuration choices and mutations.
- [Package lookup](test/commonjs-package-resolution.spec.ts) and
  [conditional exports](test/commonjs-package-exports.spec.ts) compare ancestor
  `node_modules` search, self-reference, public subpaths, condition ordering,
  and target selection with Node. [Symbolic package specs](test/commonjs-package-symbolic.spec.ts)
  preserve cache identity, initialization counts, and denied imports per path.
- [Published invariant](test/published-invariant.spec.ts) executes the unmodified
  `tiny-invariant` 1.3.3 package through its real exports map. For accepted random
  inputs it proves normalized bounds and that the lazy message is never called,
  in development and production with an explicitly supplied environment.

Specs execute JavaScript through `evaluateCode(source, initialContext)` from
`src/index.ts`. `context.value.scope` exposes the initialized, visible bindings
for inspection; unmodeled implicit bindings are omitted from that projection.
Persistent environment records hold the actual binding state and analysis gaps.
Each interpreted `Math.random()` produces a fresh unknown number in [0, 1).

## Next practical target

The North Star is to analyze an existing JavaScript function and its dependencies,
prove a stated property across the supplied input domain, or produce a concrete
counterexample that can be replayed in ordinary JavaScript. Unsupported behavior
and unfinished proofs must stay explicit.

The first path toward that target is a configurable validator, followed by an
unmodified, pinned published build of `tiny-invariant`:

1. **Captured configuration:** closures retain independent bounds, share intended
   mutations, and preserve branch correlations. Covered by the lexical specs.
2. **Return or throw:** propagate calls that return on some symbolic paths and
   throw on others through callers, catch, and finally. Covered by the symbolic
   exception specs, including constructors and calls nested inside expressions.
3. **Computed inputs:** retain numeric bounds through arithmetic so validators
   can analyze transformed inputs. Covered by the arithmetic specs, including
   rounding, overflow, signed zero, and cases that must remain unknown.
4. **CommonJS compatibility:** model `require` and module state with a dedicated
   suite checked against a pinned Node runtime. Cover module execution, exports,
   caching, cycles, resolution, and failures in separate increments. Test262
   covers ECMAScript; Node's host APIs require their own compatibility tests.
   Supplied-source execution, caching/cycles, local file/directory resolution,
   JSON, package-name lookup, and exact conditional exports are covered. Patterns,
   package imports, further host APIs, and broader Node compatibility remain.
5. **Real dependency:** add the Error, string, environment, and remaining
   semantics required by the pinned library; execute its actual source in a
   spec. The actual package's accepted-input proof now runs. Full rejection-path
   behavior is next; each package proof must state its supported Node subset.
6. **Replayable counterexamples:** generate a concrete violating input, then
   independently replay it against that same source. Sample testing alone must
   never establish a universal proof.
7. **External effects and servers:** model side-effecting functions, including
   ordered responses, logs, writes, failures, and eventually async callbacks.
   Progress from an effectful handler to a pinned Express server and its real
   dependencies. Prove that rejected requests never write, successful requests
   write once and respond once, and failure paths preserve the modeled effects.

Each step belongs in the PR stack with focused specs and relevant Test262 cases.
Full JavaScript conformance and broader symbolic domains remain parallel goals.
The [detailed roadmap](docs/roadmap.md) records CommonJS compatibility criteria,
external-effect modeling requirements, and the first Express proof targets.

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

[Lexical environments](src/execution-context/ExecutionContext.ts) similarly
separate scope identity from the current values of its bindings. A function
captures its creation environment; a call allocates a fresh activation and reads
captured values from the current path's store. Two closures can share one binding,
while calls to the same factory have independent bindings. Restoring the caller
keeps captured writes and escaping closures alive. Branch merging retains both
value choices and conditional initialization state. `let`/`const` bindings exist
before their declarations execute, with reads in that interval producing a
catchable ReferenceError; writes to initialized constants produce a TypeError.

Assuming a composed Boolean condition such as `a && b` examines its feasible
alternatives and keeps facts shared by all of them. This lets accepted validators
imply their bounds without assuming a meaning for the validator's name or body.
[Compound-guard specs](test/compound-guards.spec.ts) also protect cases that must
remain unknown, including NaN and facts belonging to only one alternative.

## Calls that can return or throw

The VM can analyze this ordinary factory and the function it returns:

```js
function range(low, high) {
  return function(value) {
    if (value < low || value > high) throw "range";
    return value;
  };
}
```

For `range(0, 10)` and an arbitrary finite numeric input, Prophet proves that a
normal result equals the input and lies in [0, 10]. Inputs outside that range
reach the catch path. A surrounding finally block runs once on either path.
Which path is taken remains unknown until the input is constrained. With NaN
allowed, that bound is correctly left unknown: JavaScript's comparisons let NaN
pass this particular validator.

Expression resolvers compose evaluations through `bindNormal`: continue the
surrounding expression on normal leaves, and propagate thrown or returned
completions. `mapCompletions` handles cleanup on every leaf. This preserves a
member call's receiver, an assignment's destination, earlier argument values,
and writes made before the throw. Earlier operations are never replayed to
reconstruct a branch. Argument and initializer state stays separate per path.

`evaluateCode` returns `[completion, context]`. Normal program completion is
`Undefined`; an unconditional throw is now a `ThrownValue`, with the existing
`context.value.uncaught` and `stderr` diagnostics retained. Mixed outcomes return
a `ForkedCompletion` containing the guard and two `[completion, context]`
branches. Each leaf keeps its path facts, final bindings/heap, and diagnostics.
The second tuple item is a merged state for inspection, not a claim that every
path succeeded. Use `isThrownValue` and `isForkedCompletion` from `src/index.ts`
to inspect the first item; an empty merged stderr does not rule out a thrown
branch. Test262's runner explicitly rejects unresolved forked completions.

Arrays describe their structure explicitly (`elements`, `segments`, `symbolic`,
or `unknown`), without a `concrete` flag. A known list can contain unknown numbers;
its length and positions remain available. Knowing an array's shape is separate
from knowing every element's value.

Different unknown identities may have equal values. NaN, infinities, and signed
zero require JavaScript-specific reasoning: in particular, a false `<` comparison
only supplies the reverse order fact when both operands are known not to be NaN.

## Numeric bounds through arithmetic

For example, the VM can analyze this ordinary JavaScript function:

```js
function normalize(value, low, high) {
  return (value - low) / (high - low);
}
```

Inside a branch establishing `input >= 20 && input <= 80`, Prophet proves
`normalize(input, 20, 80)` is between 0 and 1. Outside that branch, an otherwise
unconstrained input leaves the result's bounds unknown. The same rules power
the range-validator examples; neither function receives special treatment.

[Arithmetic inference](src/symbolic/arithmetic.ts) reads each operand's bounds
and the current path's facts, then attaches ordinary `order` and `finite` or
`notNaN` facts to the resulting expression. Addition, subtraction, multiplication,
and division use a closed enclosure of their finite operand intervals. A finite
input without explicit limits uses JavaScript's largest finite magnitudes as
its limits. Both operand bounds can also establish finiteness without a separate
finite fact. Division requires an interval excluding zero. Unary plus preserves
the numeric value; unary minus reverses bounds and preserves strictness.

Binary bounds include their endpoints because rounding can turn a strict input
bound into equality. Overflow can produce an infinite bound and never gains a
finite fact. An interval [0, 0] does not become concrete zero because it can
include both signs. [Differential specs](test/arithmetic-soundness.spec.ts) check
the emitted claims against independent concrete JavaScript boundary samples;
sampling is a regression check, not how the VM establishes its proofs.

Current inference gaps remain explicit: remainder, binary operands that may be
NaN or infinite, and division whose enclosing interval touches or crosses zero
retain expressions without derived bounds. An open zero endpoint also triggers
that conservative fallback. Facts learned after an arithmetic operation do not
yet reanalyze the stored expression. General algebraic relationships between
operands are not inferred; for example, treating two occurrences of a bounded
input independently can leave `input - input === 0` unknown. These are precision
limits rather than restrictions on concrete arithmetic execution.

## CommonJS execution and loading

`evaluateCommonJS(source, filename, context)` executes supplied source and returns
`[exportsOrCompletion, context]`. Supply an already resolved, absolute filename;
the API does not read files, resolve packages, or cache executions. Calling it
twice creates two module instances, unlike repeated `require` calls in Node.

The five named wrapper parameters are `exports`, `require`, `module`,
`__filename`, and `__dirname`. The receiver and initial `exports` refer to the
same object as `module.exports`. Reassigning `exports` or `module` changes a local
parameter; normal completion reads exports from the original module object.
Top-level return stops initialization but does not supply the export value.
Throwing and symbolic completion paths preserve their state through ordinary
VM continuations. Caller scope, receiver, and strictness are restored; exported
closures retain their private bindings. The module sees modeled global-object
properties, not the caller's lexical bindings.

For example, this module can already be analyzed:

```js
const low = 20;
const high = 80;
module.exports = function(value) {
  if (!(value >= low && value <= high)) throw "range";
  return (value - low) / (high - low);
};
```

Its spec proves that `Math.random() * 60 + 20` succeeds with a result in [0, 1],
while 100 throws. Separate specs cover conditional exports, captured state,
mixed normal/throwing initializers, and exactly-once effects per path.

`createCommonJSLoader(files).load(filename, context)` adds cached loading from an
immutable map of absolute filenames to source strings. It returns the same
`[exportsOrCompletion, context]` shape. The supplied files represent a complete
snapshot without symlinks or external search paths. No host files are read.
Relative and absolute requests try an exact file, then `.js`, `.json`, `.node`,
then a directory's `package.json` main or index files. Selecting a native addon
stops analysis; it never falls through to another candidate. `.cjs` works when
explicitly named, but Node does not infer that extension.
Bare and scoped package names search ancestor `node_modules` directories.
Self-reference and package exports take precedence over legacy file/main lookup;
exact subpaths, ordered/nested conditions, and array targets are supported.
An unexported path cannot fall through to a private file or farther package.
Resolved filenames determine cache identity across local and package aliases.
The entry is loaded as a required file, not as Node's process entry point.

The loader can analyze a consumer of the validator above:

```js
module.exports = function(value) {
  const normalize = require("./lib/normalize.cjs");
  return normalize(value);
};
```

The numeric guarantee survives the `require` call. Each loaded module enters
the cache before its body executes, so cycles see its current partial exports.
Successful loads are reused; a failed initializer is removed while its effects
and successful dependencies remain. Cache state lives in the execution context's
persistent heap. A conditional load affects only its own paths, and resuming an
earlier context resumes that earlier cache state. Finite choices of request names
are explored with their branch conditions; an unrestricted symbolic name stops
analysis explicitly.

JSON modules become ordinary VM values and share the same cache and mutable
heap as source modules. The [configuration spec](test/commonjs-resolution-symbolic.spec.ts)
loads `./normalize` through its directory main and reads `{ "low": 20, "high": 80 }`
from `limits.json`. It proves the normalized result for `Math.random() * 60 + 20`
lies in [0, 1], rejects 100, and leaves acceptance of `Math.random() * 100` unknown.
Changing a required JSON object changes later reads of that object; changing
loaded `package.json` data does not rewrite the resolver's source snapshot.

`.js` files respect the nearest package `type`. Without an explicit type,
successful CommonJS wrapper parsing permits execution; a parse failure reports
the missing ESM syntax-detection support. ESM, export patterns, `#imports`, custom
conditions, built-ins, and extra file formats remain gaps. Package metadata supports
valid JSON with unique, unescaped top-level keys; native-parser edge cases are
explicitly rejected rather than assuming Node uses ordinary `JSON.parse` there.

The [published-package spec](test/published-invariant.spec.ts) supplies all files
from the verified `tiny-invariant` 1.3.3 tarball without altering source or metadata.
It loads `require("tiny-invariant")` and invokes the actual library inside a
percentage normalizer. For `Math.random() * 100`, Prophet proves the returned
percentage is in [0, 1] and the lazy message callback count is zero. The same
proof runs with supplied development and production `process.env.NODE_ENV`
values. This is an accepted-input proof; Error construction and
`String.prototype.concat` on rejection remain shared VM work, so the full
all-number validator goal is still open. See the fixture's
[provenance](test/fixtures/tiny-invariant-1.3.3/PROVENANCE.md).

The loader exposes `module.exports`, `id`, `filename`, `path`, and `loaded`.
Writes to metadata other than `exports`, other module fields, and extra require
APIs stop analysis until their behavior is modeled. Loader-generated errors
expose `name` and `code`; other fields, including
`message`, `stack`, and `requireStack`, are explicit gaps. Cycle diagnostics and
Node's temporary warning prototypes, as well as deprecated-main fallback
warnings, are not modeled. The standalone
`evaluateCommonJS` still models only `module.exports` and rejects require calls.
These guards stay with the objects across aliases, closures, and eval. Implicit
`arguments` objects similarly have a persistent unsupported binding until their
mapped/unmapped behavior is implemented. Explicit shadowing and replacement work;
a join that might retain the implicit object conservatively rejects later reads.

Direct eval in module scope and indirect eval of modeled global properties work.
Sloppy eval that would introduce global var/function declarations is explicitly
unsupported in a module's host environment until object-backed global bindings
are modeled. Strict eval declarations remain local. These are temporary coverage
gaps, not restrictions on JavaScript or Node.

See [the compatibility suite](test/commonjs/README.md) for the pinned Node source
revision, independent oracle setup, and upstream-test blockers. Its local specs
do not establish complete Node loader compatibility or upstream Node conformance.

## Validation and current limits

```sh
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/test262.spec.ts test/test262/runner.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand
node .yarn/releases/yarn-3.1.1.cjs typecheck
```

The active Test262 baseline runs **143 strict/sloppy variants of 72 complete,
unmodified files** from the revision pinned in `yarn.lock`. It covers selected
primitive comparisons, conditional/logical expressions, `typeof`, and parse
errors, plus lexical scopes, closures, shadowing, declaration hoisting, selected
eval environments, expression evaluation order, catch/finally precedence,
arithmetic primitives, unary signs, and parameter/lexical-declaration early
errors. Parse-negative cases do not imply runtime support for their syntax.
Further arithmetic boundary cases need
the missing `Number` constants and global `isNaN`; the harness does not supply
host substitutes for those runtime gaps.
Historical unsupported selections remain explicitly skipped. This is
limited coverage, not a claim of Test262 conformance. The
[runner documentation](test/test262/README.md) explains the supported assertion
harness and metadata. Test262 source always runs through Prophet; separate local
differential tests use host JavaScript as an independent concrete oracle.

The parser accepts JavaScript, so omit TypeScript annotations in interpreted
source. The known-length minimum specs execute recursive calls. The
unknown-length specs infer and verify reusable summaries as described below.

Functions support identifier parameters, lexical captures, and block/catch
scopes. Eval also instantiates declarations, isolates lexical names and strict
vars, and distinguishes direct caller lookup from indirect global lookup.
Its general statement completion values remain incomplete; conditional creation
of a var in an existing scope is explicitly rejected until binding presence can
be represented on each path. Default/destructured parameters, `arguments`, arrow
functions, complete global-object binding semantics, and sloppy block function
compatibility rules (Annex B) remain incomplete. Environment records
are retained in execution snapshots; reclamation of unreachable records is not
implemented yet. Binding errors carry readable name/message properties, but
full Error constructors and prototype behavior remain future work.
Array indexing uses concrete keys.
Symbolic dense arrays retain stable element identities and guarded reads; writes
to these snapshots are currently rejected. Object-to-primitive coercions are
rejected when unsupported. Native generator implementations may return symbolic
completion trees; a native continuation that yields a fork must be expressed
with `bindNormal` rather than resumed as a single host generator.
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
calls, loops, and unmodeled property behavior are rejected. Lexical locals and
block shadowing use ordinary VM evaluation; a path that reads before
initialization or writes a constant cannot publish an all-path numeric summary.
Captured references resolve through the function's creation environment and are
revalidated before cache use. Proof work has a budget and never turns an
unfinished proof into a fact.

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
