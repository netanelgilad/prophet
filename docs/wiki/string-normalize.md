# Bounded ASCII String.prototype.normalize

Implemented by Instinct in-sandbox on the P014 head; full suite 144/4496/46skip
and typecheck green. See [specs](../../test/string-normalize.spec.ts) and
[task](../agent-tasks/P015-string-normalize/task.md).

Model only what is provable without the Unicode tables: the omitted/undefined
form is NFC, and ASCII text is closed under every normalization form, so NFC
on concrete ASCII receivers is the identity. Any explicit form, even "NFC",
stops as a typed boundary before conversion effects - a supported receiver
must never hide an unsupported explicit-form call. Non-ASCII text, including
already-composed input, stops too: composition-closure cannot be shown without
the tables. Symbolic receivers finish conversion and then stop honestly.

Receiver discipline mirrors trim: nullish is a guest TypeError (native
control), Symbol.toPrimitive absence is established before the shared ordinary
converter, array/function receivers stay guarded, and the 65,536-unit analysis
cap is an analysis limit, not a native restriction. Registration mirrors the
other modeled prototype methods; the pinned 52-name inventory becomes eleven
modeled/41 deferred, and predecessor inventories (trim's deferred list, the
p008 supported-name check) migrate with actual native/VM observations.

Measured unchanged sirv: name.normalize() on the ASCII filename is the
identity and the stop moves to String.prototype.replace in the same FILES key
expression. replace needs a RegExp subset; a bounded slice over concrete
literal patterns is the natural next capability.
