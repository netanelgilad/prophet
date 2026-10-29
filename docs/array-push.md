# Shared arrays and bounded push

Array literals, modeled array results and zero-argument `Array()` / `new Array()`
share one actual empty array intrinsic, `Array.prototype`. Its parent is
`Object.prototype`; its `constructor` is the shared partial Array constructor.
Arrays inherit `push`, `reverse`, `join` and `slice` instead of carrying fake own
method fields. The legacy three algorithms retain their existing limits. Recursive array summaries
now verify the exact guarded inherited slice identity, including current own
shadowing, before reuse; custom lookup and replacement functions remain untrusted.
Unimplemented standard Array method names stop explicitly. This is not complete
Array conformance or an implementation of all constructor overloads.

The legacy `reverse`, `join` and concrete `slice` algorithms reject sparse arrays
when a hole may resolve to an inherited indexed property in the current persistent
heap. This includes conditional `Object.prototype` writes and nested arrays read
by `join`; own `undefined` elements and inherited indices outside the array length
remain distinct and supported. Sparse custom prototype chains or lookup hooks
also stop. The guard conservatively checks the whole array even for a restricted
slice range. It does not implement inherited HasProperty/Get effects or conditional
element materialization. Dense symbolic-snapshot slice and recursive summaries
retain their existing behavior.

`push` operates on ordinary modeled arrays with a known current element layout
and length. Appended values retain identity, including symbolic values and
self-references. It preserves holes versus own undefined, updates the persistent
heap, returns the new length, and leaves earlier snapshots unchanged. Saved or
borrowed methods use the supplied receiver; `.call`, argument effects/throws,
aliases, finite receiver choices and equal-length branch joins use shared VM
semantics. Different-length joins can lose the element layout and then stop;
there is no guessed suffix or implicit input restriction. Nullish receivers throw
an interpreted TypeError with unknown message. The builtin has name `push`, length
1, and no construct capability.

Generic non-array receivers and their length coercions, accessor/exotic array
receivers, unknown/segmented/symbolic-snapshot layouts, overflow and maximum-length
partial writes remain unsupported. Ordinary arrays cannot acquire custom
accessors/non-writable descriptors through the currently unsupported descriptor
APIs. An embedding-supplied array must satisfy the ordinary-array representation
contract; visible custom access hooks, prototype links, unknown properties and
write guards are rejected before push mutates it. No-argument push on the known
maximum-length ordinary array returns its length without copying a huge sparse
layout. Existing descriptor/enumeration failures remain legacy diagnostics.

All Array.prototype mutations stop explicitly, including its indexed elements,
length and method replacements. This preserves the current Node path.join model's
unchanged intrinsic push assumption: native Node invokes the mutable intrinsic
while this host model does not yet expose that dependency. Own properties on an
ordinary array may still shadow methods. Broader intrinsic mutation, descriptors,
public Symbols/species/iterators, generic methods and array construction overloads
remain open under ARRAY-001, LIB-001, LANG-009, LEGACY-002 and PATH-001.

## Compatibility evidence and next complete cases

[Local specs](../test/array-push.spec.ts) compare concrete behavior independently
with pinned Node v24.21.0 and assert symbolic correlations, unknowns, stopped
siblings, effects and representation boundaries. The selected Test262 corpus at
`47bf9d1db9f6e7632120ac1b1946ad092e6c214e` adds complete, unmodified files
`built-ins/Array/prototype/push/S15.4.4.7_A1_T1.js` (empty/ordinary pushes),
`S15.4.4.7_A6.7.js` (non-construction), and
`language/expressions/instanceof/S11.8.6_A7_T2.js` (array intrinsic identity).
Each runs in both language variants and independently in fresh pinned Node
contexts with the upstream harness installed separately from the test script.

The other 15 files in the pinned push directory stay inactive, not trimmed:
`A1_T2` needs actual Number constants (the existing partial Number surface rejects
reads, preventing a false pass through undefined); `A2_T1/T2/T3`, `A4_T1/T2/T3`
and `A5_T1` need generic receivers, length coercion and inherited properties;
`A3` needs maximum-length partial mutation and RangeError; the three
`*integer-limit*` files need generic ToLength/Set semantics; and `length.js`,
`name.js`, `prop-desc.js` need descriptors and the full propertyHelper harness.
No historical skip file was removed or added. This selected coverage is not
full ECMAScript or Node conformance.

## Shared bounded concat

`concat` is registered beside the other methods with name `concat`, length 1
and no construct capability through the existing shared intrinsic machinery.
The receiver and every argument are read from current heap state. Ordinary
known-layout arrays spread their own present indices and keep holes absent;
holes still advance the result length, matching pinned Node. Primitives and
ordinary plain objects append by reference; array elements may contain
arbitrary VM values and aliases, including symbolic values. Inputs are never
mutated, snapshots survive, and every result is a fresh ordinary array.
Conditional operands branch through shared `withValue` semantics, so each path
extends its own copy and supported siblings survive a typed unsupported sibling.
Nullish receivers throw an interpreted TypeError with unknown message.

Observable constructor/species/spread state stops explicitly outside the proven
ordinary subset. Each array operand must have the shared Array
prototype, no custom access hooks, unknown fields, unmodeled reads/writes/
inspection or internal symbol slots, no own `constructor` shadow, and the
current `Array.prototype.constructor` must still be the shared Array
constructor without symbol slots. Because `IsConcatSpreadable` consults its
symbol through the prototype chain, every array operand additionally proves
the permitted intrinsic chain: the Array-to-Object-prototype links must be the
shared singletons, and neither singleton may carry symbol slots, unknown
fields or an unmodeled prototype. Marking `Object.prototype` with unknown
fields or slots therefore stops analysis. `Array.prototype`'s own
propertyAccess hook is exempted by identity: symbol reads consult only slots
and links, never string hooks, and that hook defers to ordinary lookup. Any
slot anywhere stops conservatively; the guard cannot enumerate which symbol a
slot holds, so it makes no claim that a `hasInstance` slot itself affects
spreading. An own `constructor` shadow on an argument array is likewise
rejected even though `ArraySpeciesCreate` consults only the receiver: a
residual over-restriction, not a soundness gap. Non-array object operands must
have an ordinary prototype chain (Object/Array/Function prototypes to null)
with none of those slots or hooks; function operands therefore stop. Sparse
operands reuse the legacy inherited-index guard per operand: `HasProperty`
observes the prototype chain and pinned Node materializes an inherited value
as an own result property, so a hole that may resolve to an inherited index
stops rather than guessing absence or content. Unknown/segmented/symbolic-
snapshot layouts, generic/boxed receivers, `Array.prototype` operands and the
remaining constructor, prototype and descriptor cases stay explicit boundaries.

Copying and operand descent run as synchronous host work outside the VM
evaluation budget, so two documented limits apply before any descent, scan or
copy, in order: at most 32 total operands including the receiver (each operand
is one recursion level, so an unbounded argument list would overflow the host
stack even with zero-length operands), then known length/layout, then at most
1024 cumulative elements (`maximumConcatElements`), and only then inherited-
index inspection, so every scan runs on a layout already known to fit the
budget. These caps bound per-path copying and recursion depth, not total
symbolic fork growth or allocation failure, which stay open under SYM-004 and
STRING-001-style resource limits. Exceeding either cap, like exceeding the
maximum-length/overflow check, is a typed unsupported analysis boundary that
preserves all input state, never a language throw. [Local specs](../test/array-concat.spec.ts)
compare concrete behavior independently with pinned Node v24.21.0 and assert
evaluation order, aliases, holes versus own undefined, non-mutation, symbolic
correlations with a mandatory unknown, joined conditional results, surviving
siblings and every representation boundary above. Three complete Test262 files
add six variants: `S15.4.4.4_A1_T3` (ordinary copy with fresh identity),
`S15.4.4.4_A1_T4` (holes and empty arrays) and `not-a-constructor.js`.
Constructor overloads, generic receivers and length coercion, inherited-index
materialization, species/spreadable symbols, descriptors and the remaining
concat directory files stay inactive rather than trimmed. The unchanged sirv
factory then evaluated its default ignores concat and retained its state at
the `forEach` boundary. Loops and RegExp matching remain separate work.

## Shared bounded forEach

`forEach` is registered beside the other methods with name `forEach`, length 1
and no construct capability through the existing shared intrinsic machinery.
The receiver length is captured once from current heap state; each visited
index then re-reads current presence and value after prior callbacks, in
increasing index order, invoking the callback with value, index and the
original receiver identity plus the supplied thisArg. The result is always
undefined; callback return values never stop iteration. Holes are skipped only
when absence is established through the shared `HasProperty` operation, while
own `undefined` elements are visited. Ordinary inherited indexed values flow
through the same shared lookup instead of stopping: pinned Node visits them,
so a holey array with `Object.prototype[1] = 7` invokes once with `7`.
Callback writes to later elements inside the captured range are visible
(including filling a hole before its visit), appends beyond that range are
never visited, shrinking the length skips later indices, and non-index
expandos are ignored. Callability throws an interpreted TypeError even for
empty/holey arrays, after the receiver/length reads the specification orders
first; nullish receivers throw first with an unknown message. Ordinary object
thisArg keeps its identity; strict callbacks see `undefined`, arrows keep
lexical `this`, and sloppy callbacks without thisArg share one object
receiver. Guest throws stop later visits and preserve earlier effects; typed
unsupported and budget completions stay distinct `ExecutionBoundary` leaves
beside throwing and normal siblings. Symbolic elements, receiver/callback
choices, conditional presence/inherited writes and same-length conditional
mutations stay correlated; one independent unresolved comparison pins the
NaN semantics beside the finite-correlation proof.

Only the operations this algorithm actually performs are guarded. forEach
consults neither constructor/species/spreadability nor result allocation, so
its final form carries none of concat's guards there: no own-`constructor`
rejection, no symbol-slot or spreadable-flag proofs (an initially copied
whole-symbol-map proof was removed on review, since string-index lookups
never consult symbol slots). It performs no direct writes, so
callback writes are checked by the shared write operations when they execute.
Each receiver must still be an ordinary known-layout array with the shared
Array prototype (custom prototypes, access hooks, unknown fields, unmodeled
reads/inspection/prototypes and `Array.prototype` itself stop). The intrinsic
lookup chain is proven clean only when an index actually needs it: a hole or
unresolved own presence with unknown inherited fields, unmodeled prototypes
or unmodeled reads of that index stops instead of guessing absence or
content, while dense visits never touch the chain. String-index lookups never
consult well-known-symbol slots, so unrelated symbol state cannot stop
iteration here (unlike concat's spreadable lookup). Layout
is re-established per visit because callbacks can join paths with different
lengths; coherent growth passes freely. Typed stops checkpoint the current
per-visit context, so completed callbacks, heap and path knowledge survive on
the boundary, and each forked leaf retains its own stop position beside its
siblings. Unknown/segmented/symbolic-snapshot
layouts, generic/boxed receivers and their length coercion, and sloppy
primitive thisArg boxing remain explicit boundaries.

Normal visits advance imperatively, so host stack depth stays flat across the
whole captured range; only genuine forks consume host recursion. A documented
1024-element analysis limit caps captured visits per path before the loop, in
addition to the maximum-length coherence check: exceeding it, like the
inherited-state and layout stops, is a typed unsupported boundary preserving
all input state, never a language throw. Callback-added appends beyond the
captured range can never extend host iteration. The cap bounds per-path host
work, not total symbolic fork growth (callbacks that fork on every visit can
still grow the completion tree), allocation failure, or scheduling fairness.
[Local specs](../test/array-foreach.spec.ts) compare concrete behavior
independently with pinned Node v24.21.0 and assert ordering, holes versus own
undefined, inherited values, current-state mutation, thisArg rules, throws,
aliases, snapshots, symbolic correlations with one independent unknown control, surviving
siblings, every representation boundary above, and the exact limit with its
just-over rejection. Seven complete Test262 files add fourteen variants:
`15.4.4.18-1-1/1-2` (nullish receiver TypeErrors), `2-2` (ordinary length
read), `5-2` (object thisArg), `7-1` (callback-added elements within the
captured range), `8-1` (empty arrays) and `8-13` (the undefined return). The
remaining forEach directory files stay inactive rather than trimmed:
constructor overloads and `new Array(n)` receivers, generic receivers and
length coercion, subclassing, boolean computed keys (`8-12`), deletion,
freezing, descriptors and the propertyHelper harness. The unchanged sirv
factory now evaluates its default empty ignores forEach with zero visits and
retains its state inside totalist's directory loop beside a sibling
filesystem throw; loops and `RegExp` construction remain separate work.

## Shared bounded map (P044)

`map` is a shared nonconstructible intrinsic (name map, length1). It captures
ordinary receiver length once, validates callability even on empty arrays,
then verifies the default constructor/species domain before allocating output.
Each visited index checks current HasProperty/Get after earlier callbacks;
holes remain absent, own undefined is visited, and ordinary inherited indexed
values become own output values. The callback receives value/index/receiver and
thisArg through shared invocation. Input aliases, callback writes, guest throws,
symbolic results and typed-stop siblings retain the current persistent state.
A fresh output is returned. Within the default-species domain no callback can
observe the intermediate output; private sparse snapshots preserve branch shape
without exposing extra allocation identities. This implementation copies bounded
snapshots per visited index (quadratic work within the fixed limit).

Generic receivers/ToLength, Array.prototype itself, custom species/constructors,
exotic receiver/accessor layouts and unknown length remain unsupported. Own
constructor shadows conservatively stop, including otherwise benign shadows.
Constructor prototype/symbol state must establish default species; unrelated
known hasInstance is ignored. Per-index inherited lookup guards run only when
an own index is not definitely present; a custom inherited hook stops at that
reached index, preserving prior callback effects. Conditional length mutation
can lose the layout and stop after a completed prefix. The 1024-index budget
precedes allocation/copying; total symbolic branch volume remains unbounded.

[Core specs](../test/array-map.spec.ts) and
[independent review](../test/array-map-review.spec.ts) retain concrete/native,
symbolic/unknown, mutation, sparse, failure, species and resource controls.
Nine complete unmodified Test262 map files are active: 15.4.4.19-1-1,
-1-2, -2-2, -5-2, -8-1, -8-2, -8-4, -9-1 and -9-2 (18 variants).
Other cases remain whole/inactive: -8-3 requires delete, -8-5 Array(n), -8-6
prototype mutation/delete, -9-3 generic subclassing/Array.isArray; broader
species, descriptor, proxy, generic-length and callback harness cases remain
work. Existing historical skips are not used to hide these deferred candidates.

## Shared bounded unshift (P044)

`unshift` is inherited with name unshift, length1 and no construct capability.
For a known dense ordinary receiver, it prepends argument values in order,
returns the new length, preserves receiver/element identities and updates only
the current persistent heap. Earlier snapshots are unchanged. Symbolic argument
values and conditional receiver alternatives use the shared machinery.
Arguments are evaluated before the builtin observes the current receiver length.

A single persistent write represents descending indexed moves, argument writes
and length Set only after proving those reached operations cannot run hooks or
fail: ordinary writable receiver data, dense own source elements, and a known
Array/Object prototype chain without unresolved setters at newly created target
indices. Ordinary inherited data does not intercept Set. Constructor/species and
spreadability are unobserved and impose no restriction. Zero arguments retains
length after proving an ordinary writable length; the current implementation
still conservatively requires a bounded dense source.

Generic receivers, sparse or conditional-presence layouts (requiring deletion),
custom accessors/descriptors/prototypes, unknown lengths and overflow/maximum-
length partial writes remain unsupported. The 1024-total-position limit precedes
scans, copying and writes. Unknown inherited destination state stops before any
atomic mutation; this is a conservative boundary, not a simulation of partial
setter execution. Sparse support must fix shared array deletion bookkeeping
before using it. See [core](../test/array-unshift.spec.ts) and
[review](../test/array-unshift-review.spec.ts) controls.


## P049: conditional member keys and lengths

Ordinary array member reads/writes now dispatch explicit finite choices of
concrete numeric/string keys; conditional length values use the same bounded
choice dispatch before truncation. The evaluated receiver/key are retained across
RHS execution. Dispatch caps are256 expanded nodes/depth16, with cycle rejection
before continuation. Merging different ordinary lengths retains exact own-key
presence, allowing absent reads to consult the prototype even though no shared
elements vector survives. This does not reconstruct a vector for later mutation:
such writes remain unsupported. Unknown/segmented arrays retain their indexed
absence guard, and immutable symbolic-array snapshots remain nonmutable. Invalid
length assignment still uses a legacy assertion rather than guest RangeError.
See [conditional-member specs](../test/conditional-member-keys.spec.ts) and the
[bounded compaction contract](adversarial-proofs.md#p049-mutable-sequences-search-and-callback-state).
Full review and validation are pending.
