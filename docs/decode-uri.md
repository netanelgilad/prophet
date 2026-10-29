# Bounded global decodeURI

P046 adds shared JavaScript `decodeURI` for unchanged package execution. The
algorithm belongs to the VM; it does not classify URLs or apply network policy.
Its observable result is a decoded string, a guest exception, or an explicit
unfinished analysis result with the state reached before that boundary.

## Semantics and domain

The first argument undergoes ordinary string-hint conversion, including inherited
`toString`/`valueOf` calls, their effects and throws. Missing input converts to
`"undefined"`; argument expressions are evaluated normally before invocation.
Finite symbolic argument/conversion alternatives retain conditional success,
exception and stopped siblings. The decoder admission helpers still conservatively
reject a symbolic choice used directly as an internal prototype link; the shared
intrinsic tag helper branches those links. This is not general symbolic-prototype
coverage. An open converted string remains unknown rather than a successful
validation. Ordinary objects need a known symbol/prototype chain: custom
`Symbol.toPrimitive`, partial or cyclic chains and exotic array/function
conversion remain explicit boundaries. An own undefined/null symbol slot shadows
inherited hooks. Symbol lookup also has a bounded prototype-depth budget to avoid
host recursion overflow on long acyclic chains. This scoped admission does not repair legacy converters globally.

After conversion, the input cap is65,536 UTF-16 code units. It bounds scanning and
allocation before decoding starts; output cannot exceed input length. The decoder
iteratively reads percent-encoded bytes and validates UTF-8 width, continuation,
minimum scalar, surrogate exclusion and maximum U+10FFFF. Invalid hex, incomplete
escapes, invalid leads/continuations, overlong sequences, encoded surrogates and
out-of-range scalars throw a guest `URIError`, which application code may catch.

ASCII reserved characters `;/?:@&=+$,#` remain escaped, preserving the original
hex spelling/case. Other valid bytes decode once: `%252f` becomes `%2f`, while
`%2f` remains `%2f`. Valid supplementary scalars produce UTF-16 surrogate pairs;
noncharacters are valid. Unescaped input code units, including lone surrogates,
are copied unchanged. There is no native decoder/Buffer/TextDecoder fallback.

Readable name/length and ordinary call behavior are modeled. Construction throws
TypeError. Descriptors, metadata mutation, arbitrary symbol hooks, other URI
functions and open-string decoding remain separate work.

## Evidence and remaining upstream work

The [task](agent-tasks/P046-decode-uri/task.md) binds focused specs, independent
pinned Node24.21.0 controls and unchanged sirv package scenarios to this domain.
The12 selected whole Test262 files cover incomplete escapes, reserved characters,
ASCII/Cyrillic/control decoding, ordinary coercion, length, prototype absence and
nonconstruction. They add24 strictness variants without source modification.

The remaining `built-ins/decodeURI` candidates include descriptor/deletion/name
cases, `String.fromCharCode` dependencies, `decimalToHexString.js` harness
includes and large exhaustive nested loops. The current runner rejects includes;
no copied helper or reduced upstream case is used to claim coverage. Local
malformed/UTF-8 matrices are independent tests, not completion of those upstream
files. See the [implementation backlog](implementation-gaps.md) for LIB-001,
STRING-001, TEST-002, LEGACY-002 and SYM-004 residuals.

The intrinsic Object.prototype.toString also performs its own tag/prototype
traversal. P046 makes that helper's partial/cyclic/unmodeled and depth failures
explicit typed boundaries, so calling it during conversion retains siblings.
This narrow shared correction does not reclassify arbitrary guest callback
failures or claim general Symbol.toStringTag support.
