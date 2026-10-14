# Number-domain unary bitwise NOT (P011)

Unary `~` evaluates its operand/GetValue first, then uses Number-hint ordinary
conversion through current persistent lookup and interpreted calls. It tries
callable `valueOf`, then callable `toString` only after a nonprimitive result or
noncallable method. Lookup and calls retain mutations, aliases, conditions,
ordered effects and guest throws; exhaustion returns the real guest TypeError.
The shared `ordinaryNumberHint` factors this order with a caller-owned primitive
finish. Existing ToNumber callers retain their previous finish. This matters
because [ToNumeric](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-tonumeric)
admits BigInt, whereas ToNumber does not: P011 stops explicitly for unsupported
primitive kinds even when a user method returns them late.

Supported inputs are concrete Numbers (including NaN, infinities, signed zeros,
fractions and large finite floats), booleans, null, undefined and concrete numeric
or nonnumeric strings; finite conditional choices remain correlated. Null and
undefined are valid operands here; String methods' RequireObjectCoercible rule
is unrelated. Ordinary modeled objects convert with the Number hint. Number
mapping truncates toward zero, computes mathematical modulo 2^32, interprets the
signed range, then returns `-signed - 1`, normalizing zero positive. No native
bitwise operator or native target execution supplies VM results.

Open converted Numbers, open/legacy-chunk strings, embedding BigInt/Symbol or
other unsupported primitive kinds, arrays/functions (including customized ones)
and wrappers stop as typed unsupported leaves. Own or inherited nonnullish
Symbol.toPrimitive hooks stop before ordinary conversion; undefined/null hooks
are absent. Public Symbol creation/keys/descriptors and BigInt representation
remain gaps. The old parser exposes a `bigint` marker beside a Number-valued
literal; evaluation rejects that reached marker rather than treating it as
Number. Independent Astra/high rejected first source b920a64 for a separate
unmarked static-key bypass (P011-R1): noncomputed object/binding keys were emitted
as Identifiers with rounded Number names. Correction 1 restores only the omitted
`bigint` marker using the validated original token endpoint from transient parser
offsets; offsets are removed afterward to preserve the earlier AST shape.
Both static-key consumers use one checked helper with the current context.
Object construction stops before that property's value, after prior property
and heap effects. Binding stops after RHS and prior binding/default effects,
before bad lookup/default. Earlier throws/unsupported paths bypass the later
key; typed stops preserve siblings and do not execute guest catch/finally.
This is reached admission, not a global parse rejection: uncalled function
bodies remain unexecuted. Ordinary Number keys (including legitimate rounding
above 2^53), quoted BigInt-looking strings, names/shorthand/methods and existing
literal behavior remain supported. No BigInt representation or new grammar is implemented. Partial-host
symbol/prototype reads and cyclic embedding chains retain their existing legacy
failure checkpoints, which may omit siblings; general descriptors, proxies,
accessors, symbol mutation and broader exotic behavior remain unsupported.

A concrete numeric string is capped at 65,536 UTF-16 units **before** Number
parsing/scanning/preparation, after reached operand and ordinary coercion effects.
Below/at/above and late-returned string controls cover admission. This bound is
local to P011; other existing converters retain their own boundaries. Numeric
mapping is constant bounded arithmetic, but this does not bound user coercion,
prototype depth, branch/join work, parser/embedding allocation or serialization,
nor establish successful allocation/host writes.

Unchanged sirv/mrmime now passes `!~idx` with tmp=hello.txt and idx=5. Its next
measured stop is String.prototype.substring **callee lookup**, captured under a
CallExpression frame. The argument `++idx` has not executed. All prior successful
enumeration/stat/isDirectory histories and the enumeration EMFILE sibling remain.
Factory/header/HTTP setup/request handling are still unfinished, and preserved
callbacks are not analyzed future behavior. The consumer goal in
[sirv-target](sirv-target.md) is unchanged; no all-path claim follows.

[Specs](../test/bitwise-not.spec.ts), [whole upstream dispositions](agent-tasks/P011-number-bitwise-not/upstream-candidates.md),
[backlog reconciliation](implementation-gaps.md#p011-number-domain-unary-bitwise-not),
[operator](../src/number/bitwise-not.ts),
[ECMAScript operator](https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-bitwise-not-operator),
and [ToInt32](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-toint32)
define this bounded slice, not full numeric or Test262 conformance.
