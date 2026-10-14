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


## Bounded String.prototype.trim (P008)

The shared inherited, nonconstructible `trim` intrinsic implements
[TrimString with both ends](https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.trim).
It performs RequireObjectCoercible before ordinary string-hint conversion,
using the existing interpreted ToString, current heap and branch completions.
Null/undefined throw guest TypeError; conversion can mutate state or throw.
Concrete strings, finite correlated choices, numbers, booleans, ordinary objects,
and String.prototype's empty string value are supported. Existing strings see
prototype replacements; captured intrinsic aliases and earlier heap snapshots
retain their identities. Metadata values are `name: "trim"`, `length: 0`; shared
metadata-write guards remain in force, without claiming descriptor support.

The explicit modern WhiteSpace + LineTerminator table removes only edge units.
Interior whitespace, U+0085/U+180E/U+200B, NUL, astral pairs and lone surrogates
are preserved. No native regex matching, Unicode normalization or native trim
backend is used. A 65,536 UTF-16-unit input cap is checked after coercion and
before any scan/copy/output allocation. The two scans visit at most that many
distinct units (at most input length + 1 predicate calls); the single slice's
output is bounded by input length. Exceeding the cap is an analysis-budget leaf,
not a guest RangeError, empty result or resource-availability proof.

Open symbolic strings/numbers after ToString and legacy chunk-valued strings
stop explicitly; no string or proof is guessed. Array/function receivers,
including customized ones, stop before conversion because shared converters
still have legacy failure paths. Nonnull own/inherited Symbol.toPrimitive hooks
stop rather than invoking invented symbol semantics. Shared partial-host,
cyclic-prototype, descriptor/getter and wrapper guards remain; legacy errors in
those shared operations can still retain only a partial checkpoint rather than
all siblings. This increment does not repair arbitrary coercion or bound its
runtime, prototype depth, symbolic frontier growth, parser work or embedding
input allocation. Successful allocation inside the admitted cap remains an
assumption (STRING-001), not a modeled V8 resource contract.

[Local specs](../test/string-trim.spec.ts) include independent Node 24.21.0
controls, branch correlations and mandatory unknowns, normal/throw/stopped
siblings, current prototype state, snapshots and externally timed large inputs.
Forty complete unmodified Test262 files add 80 variants; the
[whole candidate inventory](agent-tasks/P008-string-trim/upstream-candidates.md)
records all 128 pinned trim files. At P008 the unchanged sirv factory passed trim and reached deferred toLowerCase;
P009 below advances that boundary to lastIndexOf, retaining EMFILE. Neither
checkpoint establishes factory completion. See LIB-001/002, OBJ-001/003, STRING-001, SYM-001/004, LEGACY-002,
REPORT-001, TEST-001/002/003 and TARGET-002 in the backlog.


### Truthful partial String surface (P008 correction 1)

At P008 the String prototype was a closed standard surface with seven modeled own names
and 45 deferred string-keyed names, checked against all 52 native own names in
Node 24.21.0. The deferred list includes modern methods, Annex B HTML helpers and
trim aliases. Direct `String.prototype.split`/`substr` are deferred; the existing
primitive-own legacy implementations are unchanged (LEGACY-002). No additional
String method is implemented by this correction.

A private generic `markPartialIntrinsic` registry records deferred own names.
Shared member lookup and `hasOwnProperty` check `assertModeledOwnAbsence` only on
the absent-storage branch, after the current heap's conditional presence split.
An unmodeled builtin thus stops instead of becoming `undefined`/false or choosing
a fake feature-detection fallback. A current replacement, including explicit
`undefined`, remains an actual own property; conditional replacements retain
the installed side beside the stopped original side. Other absent names and
closed ordinary objects retain their true/false behavior. Key coercion and
prefix effects precede the stop; guest catch/finally cannot consume it.

The String prototype and trim function are marked for existing typed own-key
inspection guards. `Object.keys` and object spread stop instead of raising a
legacy host error or inventing enumerable keys. Trim metadata keeps precise
`name`/`length`, shared `.call`, absent own `prototype`/`call`, and its existing
nonconstruction rule. Unknown metadata reads and name/length writes are typed
boundaries. This does not implement descriptors/getters or missing Object/Function
APIs: e.g. Object.getOwnPropertyDescriptor and Function.bind remain separate.
Older concat/slice/converter metadata retains its existing boundaries.

The registry changes no public value/report schema. Its identity information,
like other intrinsic registries, is not a serialized resumption model. Low-level
heap presence remains a storage fact; internal `hasProperty` still serves existing
host mutation checks (notably URL's unchanged charCodeAt assumption). This is not
a new JavaScript HasProperty/`in` implementation. The `in` operator remains the
pre-existing LANG-001 boundary; the root's claimed false `in` result was not
reproduced. Full Object/Function surface honesty and broader host assumptions
remain LIB-001/002, OBJ-001/003, LANG-006, URL-001 and REPORT-001 work.

The original P007 trim replacement assertion is retained byte-for-byte; its
superseded rejection assertion now checks actual trimmed result, prefix effects
and branch correlation. Root-disclosed reproduction cases are explicitly labeled
in the [specs](../test/string-trim.spec.ts), not presented as hidden holdouts.
[Correction contract](agent-tasks/P008-string-trim/correction-1.md) and
[correction evidence](agent-tasks/P008-string-trim/correction-1-evidence.json)
are separate from the original failed full-suite handoff.


## Bounded ASCII String.prototype.toLowerCase (P009)

The shared inherited nonconstructible intrinsic follows
[RequireObjectCoercible, ToString, then default case conversion](https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.tolowercase)
for the bounded ASCII subset: U+0041–U+005A map to U+0061–U+007A; all other
ASCII units are preserved. No native casing, package recognition, locale
operation or source rewrite is used. This adds the eighth modeled own name;
44 deferred names and all 52 pinned native String prototype names remain
accounted for. lastIndexOf/substring and other deferred reads/presence remain
typed boundaries rather than false absence.

Concrete strings, finite choices, booleans, numbers and ordinary borrowed
receivers use P008's shared interpreted conversion/branch/heap machinery.
Null/undefined produce guest TypeError. Arguments evaluate before invocation,
although the intrinsic ignores their values. Conversion order, throws, external
console effects, conversion-time prototype mutation, captured aliases and prior
heap snapshots are covered in [specs](../test/string-lowercase.spec.ts).
Conditional values retain correlations; results that depend on an open choice
remain unknown. Metadata name/length/call/prototype and inspection/mutation
follow trim's conservative typed patterns; direct inherited metadata methods
such as `.hasOwnProperty` remain excluded (borrow Object.prototype's method
instead for supported inspection).

After reached conversion, concrete length >65,536 units gives a budget leaf
before scans/copies/output allocation. At or below the cap, an admission scan
rejects every non-ASCII unit before constructing output, then a second scan
builds at most 65,536 one-unit entries and joins at most 65,536 output units.
This bounds only this algorithm (two linear scans and bounded allocation), not
coercion runtime, prototype depth, parser/embedding allocations, branch volume,
VM/CLI resources or V8 memory failures. Allocation success stays STRING-001.
Open symbolic converted strings/numbers, legacy chunk strings and all non-ASCII
text—including unchanged non-ASCII, context-sensitive sigma, expansion, astral
pairs and lone surrogates—stop explicitly after prior conversion effects.
Arrays/functions, including customized converters, and nonnull own/inherited
Symbol.toPrimitive hooks stop before unsupported conversion, as in P008.
Shared wrappers, descriptors/getters, partial-host and cyclic-prototype guards
remain residuals; not all those shared failures are typed.

Ten complete unmodified Test262 files add 20 variants; the complete 27-file
candidate inventory and independent pinned Node 54-variant run are recorded
with [P009 evidence](agent-tasks/P009-ascii-lowercase/evidence.json). No full
Unicode conformance or unrestricted-string lowercase theorem is claimed.
The unchanged mrmime lookup retains `tmp = "hello.txt"` and reaches lastIndexOf.
Actual sirv CLI stdout is still the direct roots/nodes graph, with source frames,
filesystem enumeration return/throw histories and EMFILE preserved. Headers,
factory return, server setup and request behavior remain uncompleted.


## Bounded String.prototype.lastIndexOf (P010)

The shared inherited nonconstructible intrinsic performs RequireObjectCoercible,
receiver ToString, search ToString, and position ToNumber in that order. Argument
evaluation precedes invocation, including ignored extra arguments. Each ordinary
conversion uses interpreted calls and current heap/prototype state with shared
branch/abrupt composition. Nullish receivers throw guest TypeError; null/undefined
search stringify normally. Only after all required conversions do concrete/open
operand checks, lengths, clamping and literal search run. Open or oversized
converted text/search therefore cannot suppress later position effects or throws.
An earlier unsupported conversion or guest throw still stops at that earlier step.

The domain admits concrete UTF-16 strings and finite correlated choices of
supported primitive/ordinary receiver, search and position values. Positions use
NaN/omitted/undefined as +Infinity, truncate finite fractions toward zero and
clamp to [0,length]. Empty search returns that clamped unit position, with +0.
Backward candidate positions and forward unit comparisons return the greatest
match or -1, preserving overlaps, non-ASCII, astral pairs and unpaired surrogates.
No native search, normalization, package recognition or source rewrite is used.
Captured aliases, current replacements and earlier snapshots retain their normal
shared heap semantics. Metadata name=lastIndexOf, length=1, inherited call,
absent own prototype/call and nonconstruction follow P008's conservative model.
This is the ninth modeled own name of the pinned String prototype; 43 remain
deferred, keeping the full 52-name surface truthful (supersedes P009's 8/44 count).

After conversions, both operand lengths must be <=65,536 UTF-16 units, even for
empty/longer-than-receiver needles. Checks precede scans, copies, preprocessing
or search allocation. At most length+1 candidate visits are possible. Independently,
at most 1,048,576 actual unit comparisons may execute; another comparison yields
a budget leaf before it executes. Early matches charge only reached work. Empty
needles have constant search work but obey the length cap. No result buffer or
preprocessing table is allocated. Below/at/above comparison-cap near-matches,
operand-length controls, empty searches and large early matches are tested under
external caps; VM AST limits alone cannot constrain synchronous host loops.

Open converted text/search/position and legacy chunk strings produce unsupported
analysis leaves, never guessed indices or catchable guest errors. Arrays/functions
and exotic operand kinds are conservatively rejected at their reached conversion;
custom converters on arrays/functions remain gaps. Nonnull own/inherited internal
Symbol.toPrimitive hooks are guarded for every operand; absent/null hooks permit
ordinary conversion. Public symbols, wrappers, descriptors/accessors, partial-host
and cyclic-prototype shared conversion paths remain separate work. Some shared
legacy guards still retain only one checkpoint; no general conversion repair is
claimed. Allocation success, arbitrary coercion/prototype/parser/embedding work,
branch growth and VM/CLI volume remain outside these per-search caps.

[Local native/VM specs](../test/string-lastindexof.spec.ts) cover order/throws,
late fallback/prototype mutation, unknown operands with later effects/throws,
finite correlations/mandatory unknowns, normal/guest-throw/unsupported/budget
alternatives and ordered external histories. Ten whole upstream files / 20
variants are active; the [complete 23-file inventory](agent-tasks/P010-string-lastindexof/upstream-candidates.md)
retains 13 inactive files and the A11 failed metadata probe. No baseline selections
or historical skips are removed. The actual unchanged sirv CLI computes idx=5
beside tmp=hello.txt and stops at unary ~ before substring; source frames and
both filesystem histories survive through a narrowly typed resolver boundary.
The bitwise operation itself, increment, substring and subsequent application
work remain unsupported under LANG-001, LIB-001/002, OBJ-001/003, LANG-006,
STRING-001, SYM-001/004, LEGACY-002, FS-001, TARGET-002, REPORT-001 and TEST-001/002/003.

## Bounded generic substring (P012)

[Substring](string-substring.md) now supports ordered ordinary receiver/start/end
coercion, finite correlations and a bounded UTF-16 copy. It advances the unchanged
mrmime lookup to its MIME-table result and the actual sirv Stats.size frontier.
Older P008–P011 checkpoint paragraphs above retain their historical progression;
substring lookup is no longer the current stop. Copy/open/exotic/metadata and
shared parser/prototype/allocation limits remain explicit. Independent review is
pending; factory/server/request completion is not reached.
