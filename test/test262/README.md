# Test262 baseline

`npm test -- --runInBand test/test262.spec.ts test/test262/runner.spec.ts`

The active corpus in `test/test262.spec.ts` reads complete, unmodified source
files from the installed Test262 package. `yarn.lock` pins that package to commit
`47bf9d1db9f6e7632120ac1b1946ad092e6c214e`. It is a small conformance baseline;
the remaining historical selections are explicitly skipped.

The runner uses Prophet's parser and evaluator in process through Jest's Babel
transform. It never executes Test262 source in the host JavaScript VM. Normal
tests run in both sloppy and strict mode; `onlyStrict`, `noStrict`, and `raw`
metadata select their appropriate variants. Parse-negative tests must fail in
the parser with the declared `SyntaxError`; runtime failures cannot satisfy them.

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

Arrow-function selections add twelve complete files (nineteen strictness
variants): expression and block returns, empty bodies, object literal returns,
non-construction, strictness, an explicitly named `arguments` parameter, closure
capture through direct eval, and lexical `this` through eval. The active corpus
now contains 106 complete files and 204 variants. Local arrow specs additionally
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
assertions. Default, rest, and destructuring parameters can be present when an
arrow is created, but their initialization still reports an invocation gap.
Inherited implicit `arguments` objects and async arrows likewise remain explicit
VM gaps; these limits are not claims of arrow-function conformance.

Two complete directive-prologue cases cover an escaped spelling that must not
enable strict mode and an exact directive following another directive with
automatic semicolon insertion. Local pinned-Node comparisons additionally check
parenthesized strings and prologue termination across Programs, ordinary
functions, arrows, and direct eval, including whether undeclared assignment
throws a ReferenceError or creates a global property.

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

`test/concrete-semantics.spec.ts` separately uses the host JavaScript runtime as
an independent oracle for locally written differential tests. That oracle is
never a fallback for Prophet execution or for the Test262 corpus.
