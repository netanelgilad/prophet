# Test262 baseline

`npm test -- --runInBand test/test262.spec.ts test/test262/runner.spec.ts`

The active corpus in `test/test262.spec.ts` reads complete, unmodified source
files from the installed Test262 package. `yarn.lock` pins that package to commit
`47bf9d1db9f6e7632120ac1b1946ad092e6c214e`. It is a small conformance baseline;
the remaining historical selections are explicitly skipped.

The active corpus contains **195 complete files / 381 strictness variants**,
including 13 parse-negative files / 25 variants. The 46 historical skipped files
remain unchanged. The installed pinned `test/` tree contains 36,091 `.js` files,
or **35,960 after excluding names ending `_FIXTURE.js`**: 19,328 under language,
14,850 built-ins, 1,062 annexB, 640 intl402 and 80 harness tests. These are file
counts for this old pinned revision, not semantic coverage percentages or a
count for the current upstream Test262. Most files remain unselected; neither
the selected successes nor parser-only cases establish a complete JavaScript VM.

The runner uses Prophet's parser and evaluator in process through Jest's Babel
transform. It never executes Test262 source in the host JavaScript VM. Normal
tests run in both sloppy and strict mode; `onlyStrict`, `noStrict`, and `raw`
metadata select their appropriate variants. Parse-negative tests must fail in
the parser with the declared `SyntaxError`; runtime failures cannot satisfy them.
The `generated` marker is accepted as provenance metadata without changing the
source or its normal strictness variants; it cannot hide assertion failures.

The supported harness surface is native `assert`, `assert.sameValue`,
`assert.notSameValue`, `assert._isSameValue`, `assert.throws`, `$ERROR`, and `$DONOTEVALUATE`.
`assert.throws` invokes the callback inside Prophet, requires an interpreted
exception with the exact constructor, and rejects unresolved completions.
Host analysis errors cannot satisfy it.
Primitive SameValue checks distinguish signed zero and handle NaN. An unknown
primitive or conditional reference passed to these equality checks fails
explicitly: it cannot accidentally count as a concrete pass. Concrete object,
array, and function references are checked by identity independently of
Prophet's equality operator. Assertion errors, VM failures, unhandled throws,
unresolved symbolic completions (including a throw on only some paths), and
stderr fail the test.

The active selections include lexical block environments, closure capture,
parameter and declaration shadowing, variable/function hoisting, and named
function-expression scope, plus direct eval's lexical lookup and strict variable
isolation. Each source file is run whole, including both
strictness variants where its metadata calls for them.

Nine complete strict equality/inequality files add 18 variants: signed-zero
equality, Boolean/string/null inequality, assignment order, and throwing operands.
The existing Boolean/string/null equality cases remain active. These concrete
language cases accompany local symbolic specs for refining the guards of finite
choices after `===` or `!==`; symbolic proofs do not substitute for whole
upstream files.

Reviewed whole NaN candidates `strict-equals/S11.9.4_A4.1_T1/T2` and
`strict-does-not-equals/S11.9.5_A4.1_T1/T2` remain inactive because their complete
sources need runtime `Number` constants. The object-identity `A7` files in both
directories also require primitive boxing through `Object`, `Boolean`, `Number`
and `String`. Local NaN and reference-identity specs cover supported values;
they do not count as passing these complete upstream cases. Their sources are
not reduced to the currently supported assertions.

Fourteen complete `built-ins/String/prototype/slice` files add 28 variants:
`S15.5.4.13_A1_T4/T7/T8/T10/T11/T13/T14`, `A3_T1/T2/T3`, `A6`, `A7`,
`A11`, and `this-value-not-obj-coercible`. The numeric-hint conversions, their
ordered effects/throws, generic receivers and constructor/nullish failures run
through shared VM semantics. The [symbolic string specs](../symbolic-strings.spec.ts)
add unrestricted-string length/boundary proofs and mandatory unknowns.

All 35 files in the pinned slice directory were inspected. The other 21 remain
inactive: `A1_T1/T2/T6/T9/T12` and `A2_T1` through `A2_T9` need Boolean/String/Object
primitive wrappers; `A1_T5` additionally needs omitted-argument Function
construction and function source conversion; `A1_T15` needs modeled Number
prototype lookup for primitive receivers; `A3_T4` needs sequence expressions;
`A8` needs propertyIsEnumerable and for-in; `A9` needs delete/descriptors;
`A10` and `name.js` need propertyHelper and descriptor semantics. No complete
file was reduced to only its currently supported assertions. Slice metadata
writes remain explicit descriptor gaps, despite the readable name/length values.

Twenty-six complete `language/expressions/instanceof` files add 52 variants:
ordinary prototype identity/chains, Error inheritance, primitive operands,
invalid targets/prototypes, reference errors and operand sequencing. They follow
the shared
[InstanceofOperator](https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-instanceofoperator)
and [OrdinaryHasInstance](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-ordinaryhasinstance)
operations. The entire selected source runs unchanged. `S11.8.6_A2.4_T3.js`
contains a comma expression only on a right operand that must not execute after
the left reference error; its success does not establish comma-expression support.

All 43 complete language `instanceof` candidates and 11 complete
`built-ins/Function/prototype/Symbol.hasInstance` candidates were reviewed.
The remaining language cases need actual comma evaluation (`A2.4_T1/T4`),
Boolean/Number/String wrappers (`A4_T1/T2/T3`), the Array constructor/prototype
(`A7_T2`), zero-argument Function construction (`A7_T3`,
`S15.3.5.3_A2_T2/T6`, `S15.3.5.3_A3_T2`), getter/descriptor operations (the three
`prototype-getter-*` files), or the public Symbol API (four `symbol-hasinstance-*`
files). The Function hasInstance directory additionally needs descriptors and
property helpers, bind, Object.create, Proxy traps, and Symbol values. Those
whole files remain inactive rather than being trimmed or implemented in the harness.

An independent pinned Node v24.21.0 audit ran all 54 candidates with their upstream
standard harness and declared includes in fresh native contexts: all 107 variants
passed. This checks historical compatibility; it does not count as Prophet
coverage. In particular, selected `S15.3.5.3_A1_T1..T8` create generated functions
but never call them. Their primitive-left results do not validate parameter/body
handling by themselves. The first CLI increment also activates complete
`built-ins/Function/S15.3.2.1_A2_T1.js`, which invokes a generated function
with three formal parameters and asserts its sum. Concrete string parameter/body
handling now uses the shared parser and function activation. Zero arguments,
nonstring coercion, unknown source and interpreted constructor SyntaxErrors
remain gaps; this is not full Function constructor conformance.

Local [instanceof specs](../instanceof.spec.ts) separately test symbolic choices,
conditional exceptions and unknown partial-host relationships. The
[internal-symbol specs](../instanceof-internal.spec.ts) declare immutable symbol
slots as embedding inputs and compare their handler effects with native Symbol
properties. Those declarations are not interpreted `Symbol.hasInstance` syntax
or descriptor support. Custom handlers preserve receiver/argument identity,
ordering, throws, Boolean conversion and unknown answers. No runner expansion
or native implementation of missing JavaScript was needed for these selections.

Arrow-function selections add twelve complete files (nineteen strictness
variants): expression and block returns, empty bodies, object literal returns,
non-construction, strictness, an explicitly named `arguments` parameter, closure
capture through direct eval, and lexical `this` through eval. Local arrow specs additionally
compare lexical `this` under ordinary calls and `.call`, late captured binding
updates, conditional calls/throws, and absent own `prototype` with pinned Node.
They also check syntax-derived arrow `length` without invoking unsupported
parameter forms. Names, restricted caller/arguments accessors, and metadata
assignment remain explicit analysis gaps. A recursive arrow minimum reuses the
shared inferred summary for an unknown-length nonempty dense array of arbitrary
finite numbers; lexical `this` dependencies cannot enter that pure summary.

Nearby complete arrow cases remain blocked: `lexical-this.js` also requires
`Function.prototype.apply` and `bind`; `cannot-override-this-with-thisArg.js`
requires `Array.prototype.forEach`; `prototype-rules.js` requires
`Object.getPrototypeOf` and `in`. Those files are not trimmed to keep only easier
assertions. Rest and destructuring parameters can be present when an arrow is
created, but their initialization still reports an invocation gap.
Inherited implicit `arguments` objects and async arrows likewise remain explicit
VM gaps; these limits are not claims of arrow-function conformance.

Untagged template literals add nineteen complete files (thirty-eight variants):
no-substitution text, primitive and ordinary object conversion, function/method
calls, member reads, and nested templates in first and later substitution
positions. The shared VM evaluates each expression and immediately converts it
to a string before evaluating the next expression. Local pinned-Node comparisons
cover that ordering, conversion receivers and fallback, expression/conversion
throws, UTF-16 escapes, physical CR/CRLF normalization, and line continuations.
The CR/CRLF cases compensate for a cooked-text bug in the pinned Cherow lexer;
escaped carriage returns remain intact. Local symbolic tests cover correlated
string/boolean choices, conditional throws without repeated effects, and unknown
string/number results. A 1,500-substitution case protects the iterative concrete
evaluation path.

Tagged templates, template-object identity/raw values, Symbols and
`Symbol.toPrimitive`, BigInts, default array/function string conversion, and
other exotic conversions remain explicit gaps. Complete `evaluation-order.js`
and the `tv-*.js` template files also execute tagged templates, so they are not
trimmed to their untagged assertions. Complete abrupt-template cases additionally
need the `Test262Error` harness constructor; local throw specs do not count as
passing those upstream files. This increment does not extend the runner or
claim complete template-literal conformance.

Five complete quoted-string files add ordinary/Unicode-escaped string types,
invalid Unicode escapes in both quote forms, and strict octal-escape rejection.
Local pinned-Node specs additionally expose and correct Cherow's duplication of
the low surrogate in raw astral quoted-string literals and its retention of
continued U+2028/U+2029 separators. The shared parser recooks only each affected,
already-validated literal using equivalent UTF-16 escapes and LF continuations.
Keeping the continuation preserves escape-token boundaries, including short
octal and strict NUL escapes followed by digits. Its original raw spelling,
directive metadata and source locations stay
intact. No whole-program rewriting or host JavaScript evaluation is involved.
The comparisons cover adjacent astral characters, existing escapes, odd/even
backslashes, identity escapes, lone surrogates, LF and Unicode-separator
continuations, property names,
eval and Function-generated source, while preserving unrelated AST nodes.

The complete `language/literals/string/line-continuation-single.js` and
`line-continuation-double.js` files remain inactive: Cherow rejects their valid
physical CRLF continuations before creating an AST. The local rejection boundary
also confirms that pinned Node accepts this source; it records a conformance
gap, not the correct JavaScript behavior. Failed parsing of source containing a
backslash followed by CRLF reports an explicit analysis error instead of exposing
this known lexer bug as a catchable JavaScript SyntaxError. This conservative
boundary does not claim every such source is valid. These upstream files are not trimmed.
Cherow also rejects ordinary unescaped U+2028/U+2029 quoted-string text, including
text following an escaped backslash, before creating an AST. Its specific
unterminated-string diagnostic at that separator becomes an explicit
JSON-superset analysis gap; invalid Unicode escapes retain their SyntaxError.
The complete `language/literals/string/line-separator.js` and
`paragraph-separator.js` cases are likewise reviewed and inactive for this
pre-AST parser limitation.
Other Unicode-escape candidates `S7.8.4_A7.1_T1.js` and `S7.8.4_A7.3_T1.js`
require `String.fromCharCode`; `S7.8.4_A7.1_T2.js` and `S7.8.4_A7.1_T3.js` require
for-loop evaluation. They remain complete inactive cases rather than harness
substitutions for missing language/library behavior.

Two complete directive-prologue cases cover an escaped spelling that must not
enable strict mode and an exact directive following another directive with
automatic semicolon insertion. Local pinned-Node comparisons additionally check
parenthesized strings and prologue termination across Programs, ordinary
functions, arrows, and direct eval, including whether undeclared assignment
throws a ReferenceError or creates a global property.

Thirteen complete default-parameter files add earlier-parameter references,
later/self-reference TDZ failures, and separate parameter/body variable
environments. The reference cases cover arrows, function expressions, and
function declarations without modifying their source. Local pinned-Node specs
also cover omitted/undefined arguments versus other falsy values, initializer
order and throws, closure separation, `this`, explicit `arguments` parameters,
eval declaration boundaries, and symbolic default branches/completions.

Implicit arguments objects, rest/destructuring initialization, and inferred
initializer function names remain explicit implementation gaps. The older
`scope-param-elem-var-open/close.js` cases were reviewed but are not activated:
their expected per-initializer eval scope differs from the pinned Node runtime,
where a fresh sloppy eval variable is visible to later defaults and the body.
The current [FunctionDeclarationInstantiation algorithm](https://tc39.es/ecma262/multipage/ordinary-and-exotic-objects-behaviours.html#sec-functiondeclarationinstantiation)
also places these eval variables outside the shared parameter environment.
This difference needs resolution when updating the old Test262 revision, not
silent edits to the upstream tests. Complete abrupt-default cases additionally
need the `Test262Error` harness constructor, and other candidates need currently
unsupported operators; local tests do not substitute for those complete cases.
Conditionally creating a new binding through eval inside a symbolic default is
also an explicit gap: the current environment merge rejects conditional binding
presence. Symbolic default selection, updates to existing bindings, and
conditional initializer throws remain supported and covered separately.

Two complete object-spread exception files now cover unresolvable source
expressions in call arguments, both alone and after preceding properties. Local
pinned-Node specs cover positive data copying, primitive sources, current heap
state, reference identity, ordering, overwrites, and exceptions. Symbolic cases
check conditional sources, own-property presence, and insertion order through
the same enumeration operation used by `Object.keys`.

The complete positive `language/expressions/call/spread-obj-null.js`,
`spread-obj-undefined.js`, `spread-obj-mult-spread.js`, and
`spread-obj-overrides-prev-properties.js` still require `+=` compound assignment
in their call-count checks. That source is not rewritten to simpler assignment.
Descriptor/getter cases additionally need accessors, `Object.defineProperty`,
and the property-helper harness; symbol cases need Symbols and symbol keys.
Array-wrapper variants need `Function.prototype.apply`. None of these complete
files is counted as passing based only on local object-spread examples.

Enumerable data objects and concrete primitive strings are currently supported.
Arrays, functions, Error/intrinsic/global layouts, opaque host objects, unknown
string key sets, accessors, and full descriptors remain explicit enumeration
gaps until the VM can establish their actual own enumerable properties. A
universal filter for names such as `length`, `prototype`, or `constructor` would
be unsound: ordinary objects may have enumerable data with those names.
Nullish `Object` calls/construction create fresh ordinary objects and existing
objects retain their identity. Primitive wrapper construction, including
`new Object("text")`, remains an explicit gap rather than producing a fake empty
enumerable object. The historical VM adapter likewise marks its populated global
as an unmodeled descriptor layout; local guards are not Node `vm` conformance.
The new `Object.keys` has its standard name/length and is not constructible;
restricted `caller`/`arguments` accessors and metadata writes remain explicit gaps.

The completion cases cover argument evaluation order, a throwing left operand
of arithmetic and logical expressions, function-body throws, and return/throw
precedence through nested `catch` and `finally` blocks. These concrete cases
protect JavaScript behavior while the local symbolic specs exercise calls that
return on some paths and throw on others. Constructor throws are currently
covered by local specs. Complete Error construction/formatting and string concat
cases now cover ordinary conversion, generic receivers, and nullish receiver
TypeErrors. Other candidates still need unsupported built-ins and descriptors.

The arithmetic cases cover primitive addition, subtraction, multiplication,
division, unary signs, negative zero, finite decimals, and operand sequencing.
Further IEEE boundary files need runtime `Number` constants and global `isNaN`;
the harness does not supply substitutes for those missing built-ins. Local
arithmetic specs cover symbolic bounds and concrete boundary samples separately.

This runner deliberately rejects unsupported flags (including modules and
async), additional harness includes, and non-parse negative metadata. Adding
those tests requires implementing their runner support first. The self-tests
ensure that failing assertions and malformed negative tests stay failures.

Large language areas remain open: loops and other control-flow statements,
classes/super, generators, async/await, modules, richer arguments/parameter forms,
descriptors/accessors, public Symbols/BigInts, proxies and additional operators.
Library coverage is also partial across arrays, strings, numbers, typed arrays,
collections, dates, regular expressions, promises and Intl. The old parser has
known valid-source gaps, and supported syntax can still reach an unsupported
runtime operation. The detailed, maintained [implementation backlog](../../docs/implementation-gaps.md)
records these distinctions; adding complete specs and reusable VM operations
remains the path toward full conformance.

`test/concrete-semantics.spec.ts` separately uses the host JavaScript runtime as
an independent oracle for locally written differential tests. That oracle is
never a fallback for Prophet execution or for the Test262 corpus.
