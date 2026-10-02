# Symbolic strings

Strings remain immutable values with shared expression graphs, not arrays of
symbolic characters. Concrete text is the special case whose `value` is known.
`+` between strings, `String.prototype.concat`, and untagged templates share the
same concatenation operation. The [specs](../test/symbolic-strings.spec.ts) keep
interpreted source, unrestricted string inputs and assertions together.

For any string `text`, including empty text and unpaired UTF-16 surrogates:

```js
const path = "/users/" + text + ".json";
path.length >= 12;                // true
path.length >= text.length;       // true
path.slice(0, 7) === "/users/";    // true
path.slice(-5) === ".json";        // true
path.slice(7, -5) === text;        // true
path === "/users/alice.json";      // unknown
```

These conclusions are about string values after successful allocation. String
allocation failures/engine maximum lengths remain an explicit VM assumption;
they are not a proof that the whole program cannot throw. A string prefix alone
also cannot establish filesystem containment, especially with normalization,
symlinks or filesystem races. See the [real target](real-world-target.md).

## Representation and inference

Conceptually, the stored result of `"/users/" + text` looks like this, omitting
identifiers, prototypes and bookkeeping:

```js
{
  type: "string",
  expression: { kind: "binary", operator: "+", left: "/users/", right: text },
  properties: {
    length: {
      type: "number",
      expression: { kind: "binary", operator: "+", left: 7, right: text.length },
      knowledge: [/* finite integer, length >= 7, length >= text.length */]
    }
  }
}
```

The real expression operands and facts refer to VM values, not raw JavaScript
primitives. Existing numeric facts express finite/nonnegative integer lengths,
the ECMAScript maximum string length, interval bounds and the relationship that
a concatenation is at least as long as either operand. No string-specific
variant for every combination of facts is needed. The exact addition expression
is retained, but arbitrary algebraic equalities such as comparing a newly
computed `text.length + 12` to the result length are still a precision gap.

Slice follows the
[ECMAScript operation](https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.slice):
receiver validation and string conversion precede numeric conversion of start,
then end. Omitted or undefined end means the full length; an object returning
undefined is converted to NaN, hence index zero. Numeric conversion uses the
number hint (`valueOf` before `toString`), with normal VM calls, receivers,
conditional effects and throws. End conversion still happens when start already
implies an empty result. Indices count UTF-16 units, so slicing may split a
surrogate pair. Finite choices use ordinary branch state and preserve their
correlations.

For known concrete indices, the reasoner can read known prefix/suffix pieces
and remove known boundaries of a concatenation. Removing both boundaries returns
the original middle value, preserving identity. Slices that cannot be resolved
retain a `string-slice` expression with operand/start/end. Their length is between
zero and the input length, with tighter width limits when the indices establish
one. Unknown number or string indices are kept symbolic rather than selected
arbitrarily or rejected merely for being unknown. A slice can remain unknown
even when a human could prove more about it.

## Boundaries and evidence

- The local specs compare concrete receiver/index conversion, order, exceptions,
  generic receivers, UTF-16 edges and prototype replacement against pinned Node
  v24.21.0. They prove unrestricted-string properties and mandatory unknowns;
  concrete witnesses validate those models without replacing the symbolic proof.
- Fourteen complete, unmodified slice Test262 files add 28 strict/sloppy variants.
  [The Test262 record](../test/test262/README.md) lists remaining whole-file
  blockers. No test source was trimmed and no harness fallback executes code in
  Node on Prophet's behalf.
- `Symbol.toPrimitive`, descriptors/getters, wrappers, broader exotics and sloppy
  primitive receiver boxing remain gaps. Slice rejects nonnull exotic-coercion
  slots and partial-host symbol lookups rather than silently taking an ordinary
  conversion path. The internal symbol key does not implement public Symbol APIs.
  Slice's `name`/`length` values are modeled; descriptor mutation is guarded.
- `startsWith`, `endsWith`, `includes`, replacement/regex operations and general
  character indexing remain future work. Arbitrary string equations, repeated
  opaque-slice identities, constraints inferred from equality, arbitrary slice
  composition and general length algebra remain precision gaps. Mixed string /
  symbolic-number `+` keeps its older opaque expression; this increment derives
  concatenation facts for string operands, including converted concat/template
  arguments.
- Legacy chunk-valued strings and the old `split`/`substr` implementations are
  retained debt; this feature does not validate or expand them. Allocation and
  engine string limits need explicit failure semantics. See SYM-001, LIB-002,
  OBJ-003, LEGACY-002 and STRING-001 in the
  [implementation-gap backlog](implementation-gaps.md).
- Legacy URL parsing still assumes unchanged dynamic string intrinsics: its
  slice guard now checks the modeled intrinsic's identity. Replacing the method
  still stops URL analysis instead of discarding the replacement's effects.
