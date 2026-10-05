# Object declaration bindings

The shared [binding operations](../src/Function/binding-patterns.ts) now support
object patterns in `var`, `let` and `const` declarations. Declaration
instantiation collects every bound name before initializers run. Shorthand,
renamed properties, nested objects, defaults, repeated keys and computed concrete
string/number keys use the same operations in scripts, function bodies and eval.
Parameters, catch bindings and assignment patterns remain separate unsupported
forms; parsing those forms does not establish execution support.

The initializer runs once. Properties are processed in source order: computed
key, shared property read, optional default, then binding initialization. Defaults
run only for `undefined`, and can read earlier initialized bindings. Later/self
lexical references remain in the temporal dead zone. Var targets are resolved
before their property's read/default so those operations cannot redirect an
already resolved target. These rules follow the standard
[KeyedBindingInitialization operation](https://tc39.es/ecma262/multipage/ecmascript-language-statements-and-declarations.html#sec-runtime-semantics-keyedbindinginitialization).

Reads use the ordinary VM member operation, including inherited data properties
and supported host property-access hooks. The implementation does not snapshot
property values or replace repeated reads with one value. A throwing read,
computed key or initializer stops that path before later bindings, preserving
prior writes. Symbolic source, property-value and finite key choices preserve
their guards; unconstrained values stay unknown. Composition uses the existing
normal-completion operations, so stopped continuations remain distinct from
ordinary values as the completion model evolves.

Null and undefined throw a language TypeError, including for empty patterns.
Its message remains unknown because native diagnostic wording depends on syntax.
Empty patterns accept other primitive values without property access. Nonempty
primitive patterns explicitly stop at the missing boxing/GetV model rather than
inventing absent string indices or wrapper properties. Unknown keys, Symbols and
general key coercion remain the shared computed-property boundary. Array/rest
patterns reject during declaration instantiation; other malformed binding forms
are not silently treated as identifiers.

Ordinary JavaScript accessor construction/descriptors remain unsupported. Local
specs verify getter ordering and throwing through existing host access hooks and
compare independent native getter behavior; this is not accessor syntax coverage.
Anonymous initializer function naming remains unimplemented, and function `name`
reads explicitly reject instead of reporting a false name. Rest/destructuring parameters, assignment patterns and catch bindings retain
their preexisting restrictions.

[Behavior specs](../test/object-bindings.spec.ts) cover current bindings, TDZ,
const writes, shadowing, nullish failures, inherited/repeated reads, effects,
independent native checks, symbolic proofs and mandatory unknowns. The Test262
selection adds **45 complete unmodified files / 90 variants** under
`language/statements/{variable,let,const}/dstr`: property bindings, defaults and
skipped defaults, trailing commas, nested patterns and abrupt/nullish outcomes.
The runner now evaluates complete pinned `harness/sta.js` in a fresh VM context,
providing the real interpreted Test262Error identity before assertion adapters.

Complete `obj-ptrn-empty` and `*-get-value-err` cases remain inactive because they
construct accessors through Object.defineProperty. Function-name cases need
metadata/naming/descriptor support; array/rest families need their own binding
and iterator operations. Primitive boxing, general ToPropertyKey and further
early-error/global declaration behavior remain gaps. The exact 46 historical
skipped-file inventory is unchanged; this selected corpus is not full conformance.

The unchanged [sirv target](sirv-target.md) now passes its first object-binding
blocker and reaches the next actual boundary: reading `join` from the CLI's opaque
`path` module. No package source is rewritten, dependency omitted or application
function recognized by name. Broader import/factory/request analysis remains open.
