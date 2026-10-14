# Bounded no-match RegExp String.prototype.replace

Implemented by Instinct in-sandbox on the P015 head; full suite 146/
4505/46skip and typecheck green. See [specs](../../test/string-replace.spec.ts)
and [task](../agent-tasks/P016-string-replace/task.md).

Model only what is provable without ordered match positions: with no match,
replace is the identity regardless of replacement kind or substitution
syntax, and the replacement is never observed. The Boolean matcher answers
whether a match exists but must not be reused for match positions, so an
actual match stops as a typed boundary rather than fabricating substitutions.
Only intrinsic-layout flagless/g RegExp search values are admitted: intrinsic
prototype, no property-access marks, and no own or prototype exec override;
custom Symbol.replace dispatch, string patterns, other flags and non-RegExp
search values stop. Receiver discipline mirrors normalize/trim: nullish is a
guest TypeError, array/function conversion stays guarded, and symbolic or
legacy chunk text stops honestly.

Measured unchanged sirv: name.replace(/\\+/g, ...) on "hello.txt" has no
match, is the identity, and the stop moves to Function.prototype.bind via
viaCache.bind in the factory return. The pinned 52-name inventory becomes
twelve modeled/40 deferred.
