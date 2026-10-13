# RegExp literal values

Each admitted regular-expression literal evaluates to a fresh VM object. Repeated
calls at one source position allocate distinct identities; aliases, strict
identity, typeof/object truthiness and the known Object prototype relationship
use the shared VM. The object's private `regexpData` record retains immutable
`originalSource` and `originalFlags` strings. These are the literal's pattern and
flag text, not the public escaped `source` getter or canonical `flags` result.
There is no native RegExp object, executable matcher or application callback in
that record.

The own `lastIndex` field starts at positive zero. Reads and assignments use the
persistent heap, accept any guest value without conversion, preserve aliases and
symbolic correlations, and leave earlier snapshots unchanged. The instance and
shared prototype are partial intrinsic values. `lastIndex` is nonenumerable and
nonconfigurable in ECMAScript; the current enumerable-data descriptor model
cannot represent that, so own inspection, Object.keys/spread and descriptor
operations are guarded instead of treating it as an ordinary enumerable field.
The inherited `test` method now supports the bounded domain below. Unmodeled
members, including exec/source/flags/constructor, RegExp string coercion and
additional property writes stop at typed execution boundaries. Writing `test`
still stops; exposing its read does not admit method replacement.
Normal siblings continue; catch/finally do not recover a stopped leaf.

The global RegExp constructor, matching outside the domain below, match results,
other public prototype getters/methods, dynamic construction, species, symbol dispatch, replacement,
iteration, descriptor definition/deletion and full prototype mutation remain
unfinished. This slice does not expose RegExp.prototype for mutation, and does
not relax the existing Node URL model's unchanged-intrinsics assumption. It
adds no native matching backend or claim about target-engine regex performance.

## Parser admission and source retention

Cherow 1.5.4 remains the source parser. Its scanner admits the `g`, `i`, `m`, `s`,
`u` and `y` flags and delegates pattern validation to the running host's RegExp
compiler, first without flags and then with them. That existing compilation
step is not matching or execution of a guest program. Its result can depend on
the host engine version and Unicode database. Validation in this increment uses
Node v24.21.0 (V8 13.6.233.17-node.53, Unicode 17.0); Prophet does not enforce that
host version or implement an independent portable RegExp grammar. This is an
explicit parser gap, not complete Node 24 grammar conformance.

Cherow silently returns a null literal value when flag-sensitive compilation
fails. The shared parser now rejects that result as a SyntaxError before any
guest evaluation, including literals inside uncalled functions. Successful
native compilation objects are discarded from every AST literal, retaining
`.regex`, raw spelling and locations with a null AST `.value`. The evaluator
uses `.regex` to construct the VM value. Function definitions and stopped source
frames therefore serialize without native RegExp objects. Known unsupported
modern `d`/`v` flags produce a parser analysis boundary rather than Cherow's
incorrect guest SyntaxError; this stop does not establish that the entire source
is valid. Other parser limitations remain under LANG-002 and REGEXP-001.

## Evidence and remaining whole upstream cases

[Focused specs](../test/regexp-literals.spec.ts) compare primitive/identity/state
observations against pinned Node and check symbolic writes, retained graphs,
unsupported siblings and syntax failure before prefix effects. The
[sirv subprocess](../test/sirv-target.spec.ts) imports the complete unchanged
package/dependencies and emits the actual CLI JSON graph, including nested
function literal ASTs. Its default factory creates and pushes two regex values
through shared concat/forEach/for operations. Both default filename filters
now complete; the next stop is mrmime.lookup's String.trim, retaining the
filesystem EMFILE sibling. This is not completed factory/startup coverage.

Seven complete unmodified cases from the pinned Test262 revision are activated:
`language/literals/regexp/S7.8.5_A4.2.js`, `early-err-pattern.js`,
`early-err-dup-flag.js`, `early-err-bad-flag.js`,
`early-err-flags-unicode-escape.js`, `u-invalid-oob-decimal-escape.js` and
`u-invalid-identity-escape.js` (the final six names are in the same directory).
These give one literal-identity case and six parse-negative cases, each in both
strictness variants. No matching conformance follows.

The complete `inequality.js` is not selected in this increment; its historical
for-loop prerequisite has since gained bounded shared support and awaits a
separate whole-file reassessment. `lastIndex.js` requires propertyHelper.js, writable and
nonconfigurable/nonenumerable descriptor inspection, and deletion semantics.
`S7.8.5_A4.1.js` requires the actual RegExp constructor/prototype for instanceof.
The source/flag getter cases (`S7.8.5_A1.1_T1.js`, `S7.8.5_A3.1_T1.js`) and
`y-assertion-start.js` require public getters or actual matching. The complete
`language/expressions/typeof/built-in-exotic-objects-no-call.js` also requires
Array/Date/primitive wrapper constructors. These remain unselected whole files;
none is trimmed into a passing fragment or added to the historical skip list.


## Bounded RegExp.prototype.test (P007)

The shared intrinsic follows [test](https://tc39.es/ecma262/multipage/text-processing.html#sec-regexp.prototype.test),
[RegExpExec](https://tc39.es/ecma262/multipage/text-processing.html#sec-regexpexec)
and [RegExpBuiltinExec](https://tc39.es/ecma262/multipage/text-processing.html#sec-regexpbuiltinexec)
for fresh literal instances with the original intrinsic exec dispatch and **no flags**.
It checks an object receiver before input ToString, then reads/coerces the current
lastIndex with number-hint conversion. Ordinary interpreted conversions preserve
order, mutations, throws and branch correlations. ToLength's pure clamp is omitted
because a flagless match discards that local index and never writes lastIndex;
NaN, infinities, signed zero, object identities and open numeric lastIndex remain
unchanged except for effects performed by the conversion itself. Finite choices
of receivers, inputs and index state use shared branches. An open input string
stops after these reached conversions; no Boolean or all-string proof is guessed.

`test` has one shared identity, name `test`, length 1, supports extraction and
ordinary `.call`, and is not constructible. Primitive receivers throw TypeError
before input conversion; an ordinary receiver without callable exec throws after
conversion. Callable custom exec dispatch stops as unsupported, even though it
is valid JavaScript. Actual public exec and result objects are still absent.
Guest writes to exec/test and exposure/mutation of RegExp.prototype remain guarded;
custom embedding layouts or custom Symbol.toPrimitive hooks are rejected.
Input/lastIndex conversion admits primitives and ordinary objects; arrays and
functions (including customized ones) stop before conversion as an explicit
LIB-002 domain boundary. This prevents their shared legacy conversion failures
from discarding normal siblings. Other shared conversion gaps remain LIB-002. The private
instance registry is not a serialized resumption mechanism.

### Matching grammar

[The matcher](../src/regexp/matcher.ts) uses UTF-16 code units, with no case folding
or Unicode-property database. It admits literal code units, dot (excluding LF,
CR, U+2028, U+2029), start/end assertions, alternatives and empty alternatives,
plain/noncapturing groups, classes/ranges/negated classes (including empty ones),
`*`, `+`, `?`, `{m}`, `{m,}`, `{m,n}` and their lazy forms. Captures are unobservable
in this Boolean-only domain; backreferences are rejected. Escapes admit escaped
syntax characters, slash and hyphen; `d/D`, `w/W`, `s/S`; `f/n/r/t/v`; class `b`
(backspace); NUL `0` followed by no decimal digit; exactly two hex digits after
`x` and four after `u`. `w` is ASCII letters/digits/underscore. `s` explicitly
lists ECMAScript whitespace/line terminators, including FEFF and excluding 180E.
Astral characters are two units. Unknown escapes, decimal/octal references,
word-boundary assertions, control-letter escapes, lookaround, named groups,
Unicode properties and legacy malformed-brace/class-range forms stop explicitly.
All flags, including g/y/i/m/s/u and parser-unadmitted d/v, remain outside matching.

The pattern is fully parsed before matching; an unsupported suffix cannot be
hidden by an earlier successful alternative. A Thompson-style epsilon NFA tests
existence. At each position it adds an unanchored start and visits each reachable
state once, so nullable cycles terminate. Priority/greediness cannot change a
Boolean existence answer without captures, backreferences, custom exec or stateful
flags. This engine must not be reused as ordered exec/global/sticky matching.

### Resource boundaries

Per invocation: source at most 512 code units, group nesting at most 32, finite
repetition numbers at most 128, at most 1024 compiled states, input at most 4096
code units, and at most 200,000 charged compiler/state/range visits. Infinite
quantifiers use cycles. Length caps precede parser preparation; nesting checks
precede recursion; integer bounds precede repetition expansion; state checks
precede insertion. Every compiler visit is charged, including empty repetitions
that emit no states. Iterative closure deduplicates before adding work, bounding
its stack and sets by the state cap. Class/range storage is bounded by source
length; runtime range scans are charged. No native RegExp matching or dependency
is used. Exhaustion is an uncatchable analysis-budget leaf, never false or a
lastIndex reset, retaining the latest conversion state and completed siblings.

These caps apply to this matching operation. Cherow's existing pre-evaluation
native pattern compilation, general VM coercion, branch/heap growth, source
acquisition and graph serialization have separate unresolved resource limits
(REGEXP-001, STRING-001, SYM-004, SECURITY-002, REPORT-001). In particular, the
matcher does not make the parser an adversarial-code sandbox. Native oracle
stress tests have an external process timeout and are not a fallback for the VM.

### Whole upstream evidence

P007 adds 15 complete unmodified files (30 strict/sloppy variants) from pinned
Test262 `47bf9d1db9f6e7632120ac1b1946ad092e6c214e`: under `built-ins/RegExp`,
`regexp-class-chars.js`, `S15.10.2.3_A1_T5.js`,
`S15.10.2.7_A1_T9.js`, `S15.10.2.7_A6_T2.js`, `S15.10.2.7_A2_T4.js`,
`S15.10.2.7_A3_T3.js`, `S15.10.2.7_A4_T8.js`, `S15.10.2.7_A5_T3.js`,
`S15.10.2.6_A1_T1.js`, `S15.10.2.6_A2_T7.js`, `S15.10.2.13_A1_T1.js`,
`S15.10.2.13_A2_T6.js`, `S15.10.2.8_A3_T3.js`, and
`prototype/test/S15.10.6.3_A1_T7.js` / `S15.10.6.3_A1_T8.js`.
These include actual matching successes/failures and abrupt conversion, with
separate native whole-file checks using the pinned harness. No upstream file
was edited or trimmed and the 46-file historical skip inventory is unchanged.

Remaining test-directory A1 cases mostly compare with public exec and need result
objects; A1_T22 and y-* need global/sticky lastIndex semantics; A2 and metadata
cases need global RegExp/prototype exposure, wrappers, reflection or descriptors.
`CharacterClassEscapes` files need the code-point harness, g/u flags and larger
strings; dotall files need s/m/u and for-of; boundary/lookaround files need their
missing assertions. Source/getter, named-group and property-escape directories
remain separate work. Local specs add exact native controls, an 816-case matrix,
finite-choice proofs/unknowns, prefix/conversion state retention and size/depth/
empty-expansion/state/work stress under an external timeout. Full Test262
conformance and unbounded resource compatibility are not claimed.
