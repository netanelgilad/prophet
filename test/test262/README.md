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
`assert.notSameValue`, `assert._isSameValue`, `$ERROR`, and `$DONOTEVALUATE`.
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

The completion cases cover argument evaluation order, a throwing left operand
of arithmetic and logical expressions, function-body throws, and return/throw
precedence through nested `catch` and `finally` blocks. These concrete cases
protect JavaScript behavior while the local symbolic specs exercise calls that
return on some paths and throw on others. Constructor throws are currently
covered by local specs; the pinned Test262 candidates require additional
unsupported language or built-in behavior.

This runner deliberately rejects unsupported flags (including modules and
async), additional harness includes, and non-parse negative metadata. Adding
those tests requires implementing their runner support first. The self-tests
ensure that failing assertions and malformed negative tests stay failures.

`test/concrete-semantics.spec.ts` separately uses the host JavaScript runtime as
an independent oracle for locally written differential tests. That oracle is
never a fallback for Prophet execution or for the Test262 corpus.
