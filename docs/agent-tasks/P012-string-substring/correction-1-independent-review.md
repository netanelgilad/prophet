# P012 correction 1 independent review — accept exact corrected source

**Accept `b582e2c746863d4c02697bdd28db461098aee226` against P011
`22c109dd0bf67336f023f113055c3a63871684a6`.** P012-R1 is corrected; no new
actionable production finding remains in this review. Acceptance covers this
exact source/spec freeze and its documented bounded domains. Any subsequent
source or spec change needs renewed acceptance. Root still owns stack integration
and exact-head CI; this verdict is not merge, release or broader API authorization.

Original source `3ef28e197fbfae2b5081346e901d85b780c965e0` remains **rejected**.
Original review commit `5273aa2cae80d24c43fe278f9f49949921ef18c2`, physical tree,
report, evidence and 29-probe spec remain immutable. Their hashes match both that
commit and the copies here. The unchanged original 17/23 counterexamples now pass.
The original source-bound control still correctly observes rejection when it
loads the old source from Git; that historical outcome is not relabeled green.

Work was confined to `review/p012-correction1` at initial HEAD
`73598ce906142411f3a5d7ad521228229f08e8be`, with explicit cwd on every command and
absolute edit paths. Only the three new correction-review deliverables are
committed. Writer and original-review evidence were read-only. No agents,
production/dependency/cache changes, cleanup, push/merge/release, model/account/
access changes or next feature were performed. The requested same-reviewer
Astra/high/mine profile and reported account allowance do not imply any new
provider measurement, capacity estimate or trust promotion.

The exact production correction adds `isFunction` and changes only the Stats
size read hook in [filesystem.ts](../../../src/node/filesystem.ts#L284).
I compared it with [ordinary readMember](../../../src/ASTResolvers.ts#L187),
persistent heap presence/value lookup, branch assumptions, merge behavior and
boundary capture. The hook executes after validation and explicit read guards,
before ordinary unknown-field admission. For size it splits current persistent
own presence once. On the present branch it returns the current property value;
on absence it captures the existing typed unsupported boundary. It does not
use truthiness, prototype fallback, native file length or initial object storage
in place of the current heap. Other names and writes still delegate unchanged.

The correction closes the disclosed regression for supplied data facts. It does
not model a fresh Stats object's initial size. Known undefined, null, zero,
negative zero, NaN, infinities, Boolean/string values, objects and callable values
survive. Open Number/String/Boolean values stay open; in particular an open
Number's self-equality is not proved because NaN remains possible. Old snapshots
retain their earlier presence/value and object fields. Aliases observe current
replacement; two distinct Stats instances retain independent storage. Nested
finite value and presence choices retain their correlations and mandatory
unknowns in both branch orientations, including an absent sibling beside present
undefined. A read-validation counter verifies that the hook does not replay reads.

Legacy native methods receive the same wrapper and stable implementation-object
identity as the ordinary reader. Held-out comparison reads the same supplied
legacy method through Stats and an ordinary object, captures it before an
argument replaces both Stats properties, checks receiver/argument delivery and
exact invocation count, and calls the captured method afterward. Modeled native
Stats methods keep their existing identity and brand behavior when supplied as
size values; guest functions preserve their caller context, receiver and throws.
This is compatibility with existing callable representations, not expanded
support for arbitrary internal representations or other host APIs.

New branch probes retain caller prefix mutations, prototype changes, console
output, guest throws, earlier deferred-method stops and normal siblings.
Unknown-size admission occurs before argument evaluation and never executes
guest catch/finally. Inherited `Object.prototype.size`, even callable, cannot
supply unknown own metadata; present own undefined still shadows it. Fresh-size
writes, other unknown reads, mode/private-method guards, own-property inspection
and invalid borrowed receivers retain predecessor behavior. Native invalid
receivers produce TypeError; the older VM unsupported behavior is not represented
as newly modeled compatibility.

[The new 16-probe spec](../../../test/p012-correction-review.spec.ts) includes a
native-matched 100-pair current replacement/captured-value matrix, extra falsy
and extreme values, open identities, mutable object aliases, old snapshots,
legacy and modeled native method identities, nested correlated presence/values,
conditional guest callees, inherited non-substitution, and the actual consumer.
Writer tests are disclosed regression coverage, not independent discoveries.
The preliminary task said 30 writer cases; the frozen spec and final handoff
correctly have **31**, including the legacy-method regression. Original29 plus
writer31 is the observed 60-pass two-suite run.

I renewed the substring/conversion review against the official
[substring algorithm](https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.substring),
[ToIntegerOrInfinity](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-tointegerorinfinity),
[ToString](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-tostring),
[ToNumber](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-tonumber)
and [OrdinaryToPrimitive](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-ordinarytoprimitive).
All prior src/test bytes except filesystem.ts are identical to the first freeze;
the sole new writer spec is node-filesystem-size-presence.spec.ts. The complete
original diff and correction diff are retained in the new audit artifacts.

Receiver string conversion precedes start and end number conversion. Direct
undefined end is distinguished before conversion from an object returning
undefined. Observable conversions finish before open/budget admission; earlier
throw or typed conversion stop short-circuits appropriately. Truncation, NaN,
infinities, fractions, clamp/swap and exact UTF-16 code-unit slicing still pass
the original 1,810-case native matrix. Surrogate halves are preserved. Finite
correlations, current fallback/prototype/alias changes, snapshot isolation,
ignored-extra-argument evaluation and pre-argument callee capture remain checked.
The 65,536-unit copy cap is local and does not bound general interpreted coercion.

Shared ordinaryStringHint retains the previous ToString finish for its existing
callers. Only substring supplies its operation-local late primitive admission;
exotic/wrapper/BigInt/Symbol/custom-hook cases stay explicit gaps. Standard name,
length2, nonconstruction and partial metadata/deferred-registry assertions pass.
Predecessor witness/presence/checkpoint migrations and every P011 guard are
byte-identical to the original reviewed freeze, preserving oracle, branch,
effect, state, cleanup and ordering assertions. No unsupported group is closed.

Actual unchanged mrmime still returns text/plain for hello.txt, with its completed
`tmp="hello.txt", idx=6` activation outside the later current lexical chain.
The current sirv body has `ctype="text/plain"`; a parameter record in its lexical
chain has `name="hello.txt"`. The stop remains `stats.size` at build.js:110 during
header preparation. All path/process/FS calls are paired by the same call object,
including nested calls; success retains readdir, stat and fs.Stats.isDirectory
outcomes, and the EMFILE alternative retains readdir call/throw. There is no
normal factory-return leaf. A separate pinned CLI child retains the direct
roots/nodes graph, current source/body record, typed stop and EMFILE sibling;
complete raw stdout/stderr are retained. Native Unicode filename lookup still
returns MIME while the unchanged VM hits the predecessor ASCII-lowercase guard.
No size, Date, header, startup or request support is inferred.

| Independent check | Result |
| --- | --- |
| Original29 unchanged + writer31 | 2 suites, 60 passed |
| New correction holdouts | 1 suite, 16 passed; includes 100 replacement pairs |
| Affected strings/conversion/operators/parser/state/metadata/FS/predecessors/consumer | 45 suites, 2,217 passed, 46 historical skips |
| Additional CLI and pico consumer checks | 7 suites, 100 passed |
| Final-byte typecheck | exit0 |
| Complete substring native | 43 files, 86 variants passed |
| Complete substring VM dispositions | 14 files/28 variants passed; 29 files/58 errors retained |
| Writer exact-source full | 140 suites, 4,442 passed, 46 historical skips; exit0 in 451.244s, cap900s |
| Writer exact-source typecheck/audit | both exit0 |

The disjoint independent successful suites total **55 suites/2,393 passes and
46 historical skips**. Earlier development attempts are separate records, not
added to these totals. No redundant broad full run was needed. All independent
behavioral runs use pinned Node24.21.0, including the Jest host. The writer uses
Node26.9.0 for its Jest host and pinned24.21.0 for native controls; its handoff
explicitly records that distinction and environment overrides rather than a
complete inherited host environment. Independent outer runners and new correction controls record a minimal,
complete explicit environment. Unchanged predecessor helpers retain their
existing child-record formats and limitations.

[Correction evidence](correction-1-independent-evidence.json) binds the writer's
evidence-only child `2a6b4d2b131fe82327fbff9ffbaf0d067d1c6d45` to actual files.
Independent recomputation checks all 1,241 frozen files against Git and both
checkouts, 994 correction artifacts, 13 run metadata/snapshot records, all
prefreeze archive members and excluded Git blobs, and 1,472 preserved original
artifacts. The failed partial original ENOSPC archive remains unchanged.
All 36,091 installed upstream JS files match the pinned archive. The active
384-file/759-variant corpus and 46 historical skips retain raw bytes and metadata;
all whole-substring VM dispositions agree independently. Raw-file and parsed-body
hashes remain separately labeled; the original disclosed distinction persists.

Each independent run has unique logs, exact argv/cwd/environment/cap/time/exit,
source/spec manifests and behavioral snapshots ending in .snapshot. No copied
snapshot was discovered as a test. Dependencies are hashed and Git-bound rather
than copied into each snapshot. Before/after checks verify the exact source and
executed specs for every run. The unselected new holdout draft changed during
the affected45 run; its separate final16 and final typecheck use the final bytes. The final helper-only revision gives
default manual runs unique log directories and makes fixture directory creation
repeatable; the complete16 probes and typecheck were rerun on those bytes.
This does not relabel the affected run as a test of that unselected draft.

All failed review attempts remain raw and attributed:

- heldout-v1: 13 passed/2 failed. My open-Number equality assertion overlooked
  NaN, and my consumer assertion incorrectly paired nested calls by adjacency.
  The corrected checks retain raw value identity and mandatory unknown equality,
  and match every call/outcome by identity without dropping nested effects.
- heldout-v2: 14 passed/1 failed. My exact operation label omitted the existing
  `fs.` prefix on fs.Stats.isDirectory. Correcting that label preserves the full
  expected success/failure event sequence. heldout-v3 passed all16; the final
  run adds and passes the independently captured CLI graph check.
- Writer-artifact verifier v1 selected test262-harness via an overly broad ZIP
  glob. Its helper, empty stdout and complete KeyError traceback remain. Verifier
  v2 uses the exact pinned test262 archive and passes. The first failed audit
  helper did not persist wall start/end metadata before raising; its exit1 and
  raw records are retained, without inventing missing timestamps. Behavioral
  runs have complete timing records. Nonexistent-path inspection errors were
  read-only reviewer navigation mistakes, not semantic test failures.

Writer red/harness/typecheck failures and all original rejected runs retain their
separate classifications and source captures. No failed run was overwritten or
counted as success. There is no new actionable counterexample batch; P012-R1 is
closed only for this corrected freeze.

**Root gates:** preserve both histories; integrate only the accepted exact source,
its evidence-only child and these review deliverables into the intended stack;
run full suite and typecheck at the exact resulting integration head and review
any integration delta before publication. Changed source/spec bytes require
renewed acceptance. Root handles draft/CI decisions. This review makes no trust,
concurrency, paid capacity, merge/release or next-slice promotion.
