# P033: String.prototype.includes over concrete receivers; 18 Test262 files

Implemented by Instinct in-sandbox; independent review pending.

## Goal

Land bounded String.prototype.includes so sirv's accept-encoding probe
(`val.includes('gzip')`, build.js:172) can run, and activate the
corresponding Test262 directory slice.

## Decision record

Pinned Node 24.21.0 matrices framed the semantics before implementation:
the position truncates and clamps like indexOf (NaN is +0, negatives
clamp upward, past-the-length clamps downward where an empty needle still
matches); nullish receivers throw the pinned TypeError "String.prototype
includes called on null or undefined" before any conversion; receiver,
search and position convert in argument order with inherited
Symbol.toPrimitive hooks guarded; the metadata reads length 1 / name
"includes".

The implementation mirrors String.indexOf's admission guards and bounds
(65536 UTF-16 units per operand, 1048576 unit comparisons), returning a
boolean instead of the found index. RegExp search values keep their
TypeError unclaimed: regexp identity is not modeled, so an ordinary
object's conversion is the only object path (the gap is documented in
the implementation comment).

Specs first (test/string-includes.spec.ts, 49 tests): a 24-case pinned
UTF-16/position matrix checked natively and in the VM, conversion and
identity programs (conversion order traces, exact nullish TypeError,
mutation/replacement identity, metadata), an open-operand
correlation/boundary set and an oversized-operand budget boundary. The
native oracle caught three hand-adapted expectations during development;
all expected values derive from the pinned matrix.

Test262 sweep: all 26 files in built-ins/String/prototype/includes at the
pinned revision were probed complete and unmodified. 18 files (36
variants) pass and activate: corpus 381 files / 753 variants, 46
historical skips unchanged. The 8 remaining files fail honestly: three
need unsupported harness includes (propertyHelper.js), three need Symbol
creation, one needs Symbol.match identity for the RegExp check, and one
asserts the unclaimed RegExp TypeError.

Honest migrations: "includes" leaves the deferred String prototype list
(src/string/String.ts) and docs/symbolic-strings.md's future-work line
drops it. Five predecessor specs asserted the old deferred boundary and
migrated on landing, each swapping to a still-deferred probe or adding
the positive supported check: p008-independent-correction (supported
list + a pinned positive includes block), p010-independent-review
('"a".includes' probe becomes '"a".endsWith'), string-indexof and
string-lastindexof residual metadata/deferred lists ('"x".includes'
becomes '"x".endsWith'), and string-trim's deferredStringNames inventory
copy (includes joins the modeled inventory names). The first full suite
run caught all five as failures before shipping; each migration was
verified green individually before the confirmation run.

Validation (sandbox, Node 24.21.0, PROPHET_NODE_BINARY pinned): full
suite 5057 passed / 46 skipped / 0 failed across the four chunks.
Typecheck on the first suite run caught one unused import in the new
spec file (TS6133); it was removed and tsc re-verified with zero
"errors TS" matches. That removal is the only delta between the
suite-run tree and the shipped tree; the affected spec was re-run
green (49/49) after it. string-includes and test262 suites green
individually.

## Follow-ups

- Array.prototype.map and unshift over ordinary concrete arrays are the
  remaining landings before the sirv accept-encoding/gzip wire case can
  complete (extensions.map, extns.unshift at build.js:128-129, 173).
- startsWith/endsWith mirror this increment when needed.
- RegExp identity would unlock the remaining four includes files.
