# Bounded generic String.prototype.startsWith

P045 adds a shared nonconstructible method (name startsWith, length1). Ordinary
lookup, saved/borrowed calls and replacement use the shared VM. Semantics follow
RequireObjectCoercible and receiver ToString, IsRegExp(search), search ToString,
position ToIntegerOrInfinity/clamping and exact UTF-16 prefix comparison. Empty
search matches even at clamped end; astral pairs and lone surrogates are code
units, not normalized or folded text. Arguments evaluate before builtin entry.
Coercion effects, throws and finite symbolic choices retain order and correlation.

RegExp rejection is an interpreted TypeError. Explicit internal match slots
are consulted first; an undefined slot falls back to RegExp identity. A verified
intrinsic RegExp prototype supplies default truthy match before Object.prototype
can interfere. Own false match may proceed to string conversion, whose separate
limits remain visible. Scoped symbol lookup makes partial, invalid, unmodeled
and cyclic prototype graphs typed stops, preserving reached prefixes/siblings.
This does not repair the older includes helper or implement public Symbols.

Open symbolic/chunk strings and unknown positions remain unsupported after all
required conversions; later conversion throws are not suppressed. Array/function
or exotic conversion and custom toPrimitive hooks remain guarded. Operands are
limited to65536 UTF-16 units after conversions and before comparison; exact prefix
comparison is linear and needs no search-work multiplier. Above-limit inputs stop
conservatively even if empty/longer-needle cases could decide cheaply. Metadata
and descriptors retain shared partial-intrinsic boundaries.

[Core/native specs](../test/string-startswith.spec.ts),
[independent review](../test/package-apis-review.spec.ts) and
[unchanged sirv dev cases](../test/sirv-dev.spec.ts) cover the implementation.
Thirteen complete unmodified Test262 files add26 variants: coerced-values-of-position,
out-of-bounds-position, return-abrupt-from-position/searchstring/this,
return-true-if-searchstring-is-empty, searchstring-found-with/without-position,
searchstring-not-found-with/without-position, this-is-null/undefined-throws and
searchstring-is-regexp-throws. Descriptor/propertyHelper, public Symbol and
Symbol.match getter candidates remain whole and inactive.
