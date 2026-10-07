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
Unmodeled members, including exec/test/source/flags/constructor, matching/string
coercion and additional property writes stop at typed execution boundaries.
Normal siblings continue; catch/finally do not recover a stopped leaf.

The global RegExp constructor, matching and match results, public prototype
getters/methods, dynamic construction, species, symbol dispatch, replacement,
iteration, descriptor definition/deletion and full prototype mutation remain
unfinished. This slice does not expose RegExp.prototype for mutation, and does
not relax the existing Node URL model's unchanged-intrinsics assumption. It
adds no native matching backend or claim about regex performance.

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
before the explicit Array.concat boundary; this is not completed factory/startup
coverage.

Seven complete unmodified cases from the pinned Test262 revision are activated:
`language/literals/regexp/S7.8.5_A4.2.js`, `early-err-pattern.js`,
`early-err-dup-flag.js`, `early-err-bad-flag.js`,
`early-err-flags-unicode-escape.js`, `u-invalid-oob-decimal-escape.js` and
`u-invalid-identity-escape.js` (the final six names are in the same directory).
These give one literal-identity case and six parse-negative cases, each in both
strictness variants. No matching conformance follows.

The complete `inequality.js` also repeats a literal in a for loop; that loop
remains unsupported. `lastIndex.js` requires propertyHelper.js, writable and
nonconfigurable/nonenumerable descriptor inspection, and deletion semantics.
`S7.8.5_A4.1.js` requires the actual RegExp constructor/prototype for instanceof.
The source/flag getter cases (`S7.8.5_A1.1_T1.js`, `S7.8.5_A3.1_T1.js`) and
`y-assertion-start.js` require public getters or actual matching. The complete
`language/expressions/typeof/built-in-exotic-objects-no-call.js` also requires
Array/Date/primitive wrapper constructors. These remain unselected whole files;
none is trimmed into a passing fragment or added to the historical skip list.
