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
factory now evaluates its default ignores concat and retains its state at the
`forEach` boundary. `forEach`, loops and RegExp matching remain separate work.
