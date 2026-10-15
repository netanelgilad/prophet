# P027: bounded array binding patterns in declarations

Implemented by Instinct in-sandbox; independent review pending.

## Goal

Unblock the sirv range-request path, whose header parse is
`let [x, y] = req.headers.range.replace('bytes=', '').split('-')`
(build.js:73): ArrayPattern binding was an explicit host gap in
src/Function/binding-patterns.ts (thrown during declaration instantiation).
This task lands the language capability only; the range wire case still
needs String.prototype.replace, parseInt, header-carrying dispatch and
createReadStream {start,end} options.

## Decision record

Pinned Node 24.21.0 checks framed the bounded slice. Native array binding
applies the iterator protocol; for the ordinary array sources modeled here
that means index reads 0..elements.length-1 in order through ordinary Get,
stopping after the last pattern element (a custom iterator probe confirmed
next() runs exactly once per pattern element). Source holes and missing
elements bind undefined; pattern holes skip their index. Defaults run only
for undefined, in element order, with earlier bindings visible. An empty
pattern over an ordinary array reads nothing, but null/undefined and
non-iterable plain-object sources throw a catchable TypeError even for an
empty pattern (the protocol lookup itself fails). Strings iterate natively
and custom iterables drive the real protocol, so both stay explicit host
gaps rather than fabricated index reads, as do rest elements and
accessor-driven sources. Declared assumption: ordinary sources carry no
Symbol.iterator override.

The implementation extends the shared binding operations, not the resolver:
boundNames walks array elements for declaration instantiation (skipping
holes, recursing through AssignmentPattern), and initializeBindingPattern
gains an ArrayPattern branch mirroring KeyedBindingInitialization - a var
target's reference resolves before its element's read or default
initializer runs. Nested array/object patterns recurse through the same
entry point. The nullish/non-iterable TypeError preserves its type with an
empty message, matching the object-pattern convention (native diagnostic
wording depends on the exact pattern spelling).

Specs first: eleven pinned-control tests in
test/array-binding-pattern.spec.ts (order/extra-elements, missing and
source holes, pattern holes, default order and side effects, empty
patterns, nesting, var and const kinds, catchable TypeErrors for
null/undefined/plain-object sources, and the string-source and rest-element
gaps). Every compare source also runs under pinned Node as its own oracle.

Test262 sweep: all pinned `language/statements/{variable,let,const}/dstr/ary-*`
files were probed complete and unmodified. 78 files (156 variants) pass and
are activated: ordered element binding over ordinary array literals, source
and pattern holes, defaults and skipped defaults, nested patterns, nullish
TypeErrors, and parse-negative rest-initializer and rest-not-final forms.
The files that stay inactive fail only on declared gaps - Symbol.iterator
access, generator functions, rest elements and function-name metadata - and
none was trimmed. Verified by inspection that the passing iter-named files
destructure plain array literals (their names reference spec sections, not
custom iterables).

Migrated stale frontier text: LANG-004, docs/object-bindings.md (new array
section plus the instantiation sentence), docs/for-statement.md limits, and
the test262 README binding paragraph (45 object files/90 variants joined by
78 array files/156 variants).

Validation (sandbox, Node 24.21.0, PROPHET_NODE_BINARY pinned): full suite
and typecheck on the shipped tree (totals in the ledger);
array-binding-pattern and test262 suites green individually.

## Frontier after P027

Sirv range requests end to end: String.prototype.replace (string pattern),
the parseInt global, header-carrying deliverRequest input, and
createReadStream {start,end} option fields. Iterator-protocol binding
(strings/custom iterables), rest elements, destructuring parameters, catch
and assignment patterns remain language gaps.
