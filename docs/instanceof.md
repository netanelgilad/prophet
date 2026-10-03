# Instance checks and prototype proof boundary

The shared VM implements the supported parts of ECMAScript's
[InstanceofOperator](https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-instanceofoperator)
and [OrdinaryHasInstance](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-ordinaryhasinstance).
The [local specs](../test/instanceof.spec.ts) compare concrete programs with
pinned Node v24.21.0 and separately check symbolic proofs and unknown results.
The [Test262 selection](../test/test262.spec.ts) adds 26 complete, unmodified
files / 52 strictness variants. This is a language feature, independent of the
Buffer and filesystem host models that motivated it.

## What the operation knows

Both operands execute once, left to right, before the instance check. A throwing
operand keeps its preceding effects and prevents later evaluation. The shared
operator now returns a completion and execution context, so lookup, handler
calls, throws and symbolic branches can preserve their state. Pure arithmetic
operators continue using their existing value-level inference.

For an ordinary target function, a primitive left operand produces false.
For an object, the VM reads the target's current `prototype` property and walks
the object's internal prototype links, comparing identity at each step. Replacing
a user function's `prototype` changes future checks but does not rewrite an
existing instance's original link. An ordinary property named `constructor`
does not determine the result. Callable arrows participate too: their absent
prototype causes a TypeError for object operands, while an explicitly assigned
object prototype can be used for the check.

Non-object right operands, noncallable targets without a usable handler, and
non-object target prototypes produce interpreted TypeErrors at the relevant
stage. A primitive left operand skips ordinary target-prototype validation.
The exception kind is known, while its engine-specific message remains an
unknown string. Analysis failures for unsupported behavior remain distinct
from catchable JavaScript exceptions.

Symbolic object/constructor choices and prototype reassignment use the same
branch knowledge and persistent heap as other VM operations. A result can stay
unknown while its relationship to an input condition is proven. Conditional
failures retain their own state, whether caught by interpreted code or exposed
as separate normal/throwing completions.

## Internal symbols and known prototype links

Before ordinary behavior, the operator consults the target's well-known
`Symbol.hasInstance` property. Intrinsics and embedding inputs can declare an
immutable symbol-value map with identity keys, separate from string properties.
Function.prototype supplies its default method through that map. Lookup walks
declared prototype links; it does not treat an arbitrary string spelling as
the symbol. A callable handler receives the original target as `this` and the
left operand as its argument. Its result uses ordinary truthiness, without
object-to-primitive conversion, and its effects or throws propagate.

The [internal-symbol specs](../test/instanceof-internal.spec.ts) exercise those
declarations against equivalent native Symbol properties: receiver/argument
identity, inherited handlers, nullish fallback, invalid methods, result
truthiness, conditional slots and path-specific effects. This embedding surface
does not implement public Symbol syntax, descriptor creation or getters.
The Symbol global's availability is known (`typeof Symbol` is `"function"`), but
using its unmodeled creation/property APIs stops analysis instead of inventing
a missing-global ReferenceError.

Prototype proofs require known internal links. A partial host object cannot
implicitly inherit Object.prototype merely because its VM tag is `object`.
Its model must explicitly declare the link as known; unknown ancestors stop
the walk when they are needed. Likewise, a partial right operand cannot
silently omit an unknown hasInstance property. An explicitly supplied own
symbol value can establish that specific lookup without declaring its unrelated
fields known.

The intrinsic links currently used include ordinary objects/functions, the
Error family and the Buffer chain. NativeError constructors such as TypeError
inherit from Error itself; their instance prototypes inherit from
Error.prototype. These are separate relationships. Buffer instances retain
the declared chain through Buffer.prototype, Uint8Array.prototype and
TypedArray.prototype to Object.prototype. Its opaque intermediate objects allow
this traversal without claiming their other APIs or descriptors are modeled.

## Remaining boundaries

Public Symbols and symbol-key mutation, hasInstance getters, descriptors,
bound-function delegation, Proxy traps, full prototype reflection and dynamic
prototype mutation remain unsupported. Array prototype relationships also remain
an explicit gap. Unknown or invalid embedding links and cyclic prototype graphs
stop analysis; they are not evidence for a false instance result.

Unmodeled writes to non-writable intrinsic `prototype` properties are guarded.
Inherited `__proto__` getter/setter access is also guarded so it cannot become a
false undefined read or ordinary own-property write. A genuine own data property
created with the computed name `"__proto__"` remains ordinary data. Full strict
versus sloppy descriptor/setter behavior still needs implementation.

The Function constructor now handles concrete string parameter lists and the
final body through shared parsing/invocation, with an additional complete
constructor invocation Test262 case. Zero arguments, nonstring coercion, unknown
source, interpreted SyntaxErrors and metadata remain incomplete. The original
primitive-left upstream files never invoke their generated functions and alone
do not establish constructor semantics. Complete
Symbol/descriptor/Proxy/bind cases stay inactive, as detailed in the
[Test262 README](../test/test262/README.md). Language and host residuals remain
listed in the [implementation backlog](implementation-gaps.md).

## Progress in the unchanged server

The original pico-static-server GET/HEAD handler now reads a regular file or an
existing directory index into a Buffer, evaluates `data instanceof Error` as
false through the shared operator, and enters its normal serving branch.
POSIX `path.parse` now determines the MIME type and the original handler
commits status 200. Its reversed writeHead arguments still discard the intended
MIME/length fields. Execution now completes write/end/finish and serves the Buffer
under the declared successful transport schedule. No replacement handler or
function-name recognition supplies this result. The missing-directory 404 and
missing-index ENOENT proof is retained; symbolic index presence also classifies
success versus an escaping exception.
