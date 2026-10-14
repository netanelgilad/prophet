# Bounded generic String.prototype.substring (P012)

This worker implementation adds substring through the shared VM. Independent
Astra/high accepts corrected source b582e2c in review66ee9b0; original source3ef remains rejected. Root integration and exact-head CI gates remain,
full String coverage, or sirv factory/server/request completion.

The operation follows [substring](https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.substring),
[ToIntegerOrInfinity](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-tointegerorinfinity),
and ordinary ToString/ToNumber. Normal callee lookup and all arguments (including
ignored extras) execute before intrinsic coercion. RequireObjectCoercible precedes
receiver string-hint conversion, then start number-hint conversion, then end
number-hint conversion if the supplied end is not undefined. Missing/undefined
start converts to zero. Only a missing or directly undefined end means captured
string length: an object's conversion returning undefined means NaN and zero.
NaN and signed zeros become zero; finite fractions truncate toward zero;
infinities clamp. Clamp each endpoint to [0,length], swap by min/max, and copy the
end-exclusive UTF-16 interval. NUL, combining units, astral and lone/split
surrogates remain exact. No native substring or target execution implements it.

Concrete primitive receivers and ordinary objects with interpreted methods are
supported, including current fallback/prototype mutations, nullish hook absence,
finite conditional values, aliases and persistent snapshots. Nullish receivers
and exhausted ordinary primitive conversion throw real guest TypeErrors. Shared
`ordinaryStringHint` exposes a primitive-finishing continuation, like
`ordinaryNumberHint`; all prior ToString callers keep their original finish.
Operation-local admission catches late exotic/BigInt/Symbol values without
passing them into legacy shared converter errors. Genuine earlier throw or
unsupported conversion prevents later stages. An open converted value is not an
earlier stop: all completing receiver/start/end conversions occur before final
open/concrete/copy admission, even for empty, reversed or out-of-range results.

Converted concrete receivers must be at most **65,536 UTF-16 units**, checked
before output preparation or copying, even for an empty result. Below/at/above
cap tests retain effects and normal/guest-throw/unsupported/budget siblings.
There is no separate numeric-string parser cap: shared Number parsing and
ToString formatting are inherited concrete converters. This bounds the copy and
output, not arbitrary coercion, input/parser allocation, prototype recursion,
branch volume or the whole VM/CLI. Allocation success and Node/V8 resource
failures remain STRING-001/SYM-004/SECURITY-002 assumptions.

Open receiver/index values and legacy string chunks remain typed boundaries.
Arrays/functions (even customized), wrappers other than the intrinsic empty
String.prototype identity, public Symbols, BigInt values and nonnull custom
Symbol.toPrimitive hooks remain unsupported. Own/inherited hook lookup uses the
current internal prototype chain; nullish own absence shadows inherited hooks.
Descriptors/accessors, partial-host/cyclic prototype errors, sloppy primitive
boxing, public symbol-slot mutation and broader conversion/resource support
remain shared gaps (OBJ-001/003, LANG-002/003/004, LEGACY-002, LIB-002, SYM-001/004).
No BigInt representation or rounded static-key fallback is added.

Registration removes only substring from the deferred intrinsic names: ten
modeled String own names and 42 deferred names match the pinned 52-name surface.
Name `substring`, length 2, nonconstruction, function identity, detached `.call`,
own-presence observations and captured aliases are modeled. Incomplete metadata,
reflection/enumeration and metadata writes remain guarded; full descriptors and
all String methods are not supported.

The unchanged mrmime lookup returns `text/plain` for `hello.txt`. Its completed
activation retains `tmp="hello.txt"`, `idx=6`; focused controls establish callee
lookup before arguments and exactly one `++idx`. At the **later** sirv boundary,
these are completed persistent records, not locals in the current lexical chain.
Current header preparation has `ctype="text/plain"`, `name="hello.txt"` and stops
on `stats.size` in `sirv/build.js:110`. Factory return is not reached.
The size-only existing Stats read guard is classified through a narrow
property-read callback, with unchanged read/write fallthrough for other names;
no size/Stats/Date semantics or values are invented. Every reached filesystem
call/outcome identity and the EMFILE readdir sibling survive in direct CLI
`roots`/`nodes` stdout; diagnostic stderr and exit 2 remain. Other legacy Stats
boundaries are unchanged and this is not broader Stats compatibility.

[Focused specs](../test/string-substring.spec.ts),
[consumer specs](../test/sirv-target.spec.ts),
[candidates](agent-tasks/P012-string-substring/upstream-candidates.md), and
[evidence/handoff](agent-tasks/P012-string-substring/handoff.md) record the domain.
Fourteen complete unmodified Test262 files are activated (28 variants); all 43
candidates/86 native variants pass pinned Node 24.21.0. The 29 incompatible whole
files remain inactive with retained errors, not new skips or edited fragments.
The full corpus becomes 384 active files/759 variants; all 46 historical skipped
files retain names, metadata and bytes. Coverage counts do not establish complete
JavaScript or Node conformance.

## P012-R1 correction — supplied current own Stats.size

Independent Astra/high rejects original source3ef28e1 in frozen review5273aa2
for one P2 Stats admission regression; substring semantic checks passed that
review, but the complete source was not accepted. Correction1 branches the size
hook on current persistent own presence. A supplied data property's current
value is read normally, including undefined/zero, open assigned values, finite
choices and alias replacements; absent/unprovided size still stops typed.
Conditional presence retains its supported and stopped alternatives with no
replayed read or guest effect. Legacy method values retain ordinary stable
read/call identity. Inherited size cannot substitute for unknown native own
metadata. Fresh unknown-size writes and all other Stats guards remain unchanged;
no native file-size value, descriptor, Date or header semantics is introduced.

[Regression specs](../test/node-filesystem-size-presence.spec.ts) reproduce the
disclosed17/23 counterexamples through existing writeProperty starting-state
preparation, with equivalent pinned native assignments. They preserve snapshots,
two instances, presence/finite correlations, read count, caller/console/prototype/
heap prefix state and exact FS call/outcome/failure identities. The unchanged CLI
continues to stop on Stats.size in sirv header preparation with ctype=text/plain;
factory return is not reached. Renewed same-reviewer exact-source acceptance is recorded in66ee9b0. Root publication and exact-head CI are tracked in [publication review](agent-tasks/P012-string-substring/publication-review.md). [Correction contract](agent-tasks/P012-string-substring/correction-1.md)
and new correction handoff/evidence retain the original rejected artifacts.
