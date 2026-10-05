# Shared arrays and bounded push

Array literals, modeled array results and zero-argument `Array()` / `new Array()`
share one actual empty array intrinsic, `Array.prototype`. Its parent is
`Object.prototype`; its `constructor` is the shared partial Array constructor.
Arrays inherit `push`, `reverse`, `join` and `slice` instead of carrying fake own
method fields. The legacy three algorithms retain their existing limits.
Unimplemented standard Array method names stop explicitly. This is not complete
Array conformance or an implementation of all constructor overloads.

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
