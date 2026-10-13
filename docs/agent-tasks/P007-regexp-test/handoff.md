# P007 frozen worker handoff

Independent strong-model review and draft PR belong to root. No push/merge,
agent/model/account switch, dependency edit or paid API request was made.
Only `/Users/netanelgilad/development/prophet-worktrees/astra-p007-regexp-test` on `agent/p007-regexp-test` was edited.
The subsequent commit adds only this handoff and evidence; source/specs are frozen.

- Source base: `3377cfe2c8791d2113f0f6e03f331c785df2200b`.
- Assignment: `2cd5313c626e5880d5b94feaa572f7262c7da86a` (task contract only).
- Initial red specs: `d9b9bc271a534b2520e10bf8f8bcee1420251c30`.
- Additional conversion-domain red specs: `4b36d385ebcc21a9a9c7070ab0938832ca16ebf6` (four failures after native controls).
- Tested source/spec/docs: `e13d6c1448ee6a34db0d00d5536f1f99eb02f87c`.
- [Machine evidence](evidence.json), SHA256 `f78b5125759310913753dc4fc76bb886436a0f7f9e2466bf27ae1bdd9486d822`.

## Result and domain

Unchanged sirv's two filename filters execute. Its default factory advances into
mrmime.lookup and stops at `String.prototype.trim is not yet supported`. The
embedding run and actual CLI JSON graph preserve the EMFILE filesystem throw
sibling, prior directory effects and mrmime source position. The CLI exits 2 with
direct `roots`/`nodes` output. No factory/server/request completion is claimed.
A narrow shared trim lookup classification prevents a legacy noncallable assertion
from dropping that sibling; trim is not implemented.

The shared `.test` is extracted-call compatible and nonconstructible. It preserves
receiver checking, ToString then lastIndex numeric conversion, effects, throws,
aliases, signed zero and persistent snapshots. Only empty flags are admitted.
Finite receiver/string/index choices use shared branches; open input strings stop.
Array/function input or index conversion is explicitly unsupported before it
begins, including customized ones. An open numeric lastIndex can be ignored
after conversion only because flagless
matching never uses or writes it. Custom exec/symbol conversion stays guarded.

An explicit UTF-16 epsilon NFA supports literals, dot, anchors, classes/ranges,
class escapes, ordinary/noncapturing groups, alternation and greedy/lazy
quantifiers for Boolean existence. No native matching backend or dependency was
introduced. Source≤512 units, depth≤32, finite counts≤128, states≤1024,
input≤4096 units, compiler/state/range visits≤200000. Empty expansion is charged;
iterative closure deduplicates before enqueue. Exhaustion retains a budget leaf,
never false, a guest catch or a lastIndex reset. See the
[exact grammar and exclusions](../../regexp-literals.md#bounded-regexpprototypetest-p007)
and [wiki lessons](../../wiki/regexp-test.md).

## Validation at the frozen source

- Native-before-code: 29 exact controls passed. Red run: 43 intended failures,
  607 passed, 46 historical skips at the red-spec revision.
- External-timeout final focused run: 5
  suites, 741 passed, 46 skips, exit 0, no timeout.
  Includes 98 dedicated RegExp tests, the 816-pair native/VM matrix, stress,
  conversion and symbolic checks, literal regressions, unchanged sirv/CLI,
  selected Test262 and runner self-tests.
- Fifteen complete unmodified Test262 files / 30 variants pass in Prophet and
  independently in pinned Node 24.21.0. Total active selection:
  301 files / 593 variants.
- Full regression: 127 suites,
  3285 passed, 46 skips, exit 0.
  Pico, loops, unknown-length reasoning and selection/solver regressions included.
  A predecessor timed out at 300 seconds after 97 suite passes; its second run
  was stopped for the conversion-boundary correction. This final revision ran
  fresh with a 900-second allowance. The 6bae07c run passed all behavioral tests
  but exposed Jest treating src/regexp/test.ts as an empty suite; final source
  renames that module to intrinsic.ts. All predecessor logs remain separate.
- Typecheck exit 0. Documented guards/assertions/skips/docs scans and diff check
  exit 0. All 46 historical skipped filenames/metadata match the table and base.
  No stable gap ID closed. Source/spec/upstream/binary/script/log hashes were
  generated and verified programmatically after evidence was reloaded.

Exact argv/cwd/environment/exits/counts/timeouts/durations/hashes are in evidence.
Complete ignored logs and temporary validation/oracle scripts are in `logs/p007/`.
Nothing ignored was force-added. Intermediate self-corrections are preserved in
evidence and their logs; they are not independent-review findings.

## Full base-to-tested-source diff

| Path | Change |
| --- | --- |
| `docs/agent-tasks/P007-regexp-test/task.md` | +89 / -0 |
| `docs/implementation-gaps.md` | +36 / -2 |
| `docs/regexp-literals.md` | +112 / -9 |
| `docs/sirv-target.md` | +10 / -3 |
| `docs/wiki/README.md` | +1 / -0 |
| `docs/wiki/regexp-test.md` | +53 / -0 |
| `src/ASTResolvers.ts` | +7 / -1 |
| `src/regexp/RegExp.ts` | +16 / -4 |
| `src/regexp/intrinsic.ts` | +90 / -0 |
| `src/regexp/matcher.ts` | +216 / -0 |
| `test/regexp-test.spec.ts` | +272 / -0 |
| `test/sirv-target.spec.ts` | +51 / -11 |
| `test/test262.spec.ts` | +17 / -0 |
| `test/test262/README.md` | +11 / -0 |

The final evidence commit adds only this file and `evidence.json` in P007's task
folder. `test/regexp-literals.spec.ts` is unchanged: its global-flag test rejection
remains valid and is supplemented by positive flagless specs.

## Residuals and next step

REGEXP-001 remains open for all flags, public exec/results, RegExp construction,
getters/prototype/descriptors/symbols, array/function primitive conversion, custom dispatch, lookaround/backreferences,
named groups, broader escapes and open symbolic matching. Cherow still compiles
patterns natively before VM evaluation; matcher limits do not cover that step,
arbitrary coercion, allocation or total symbolic branch/store/graph work
(LIB-002/STRING-001/SYM-004/SECURITY-002/REPORT-001).
String.trim is the precise next reached shared gap; toLowerCase, lastIndexOf,
substring, file metadata/dates and later string/host operations remain future
prerequisites, not already reached behavior. FS-001/TARGET-002 retain resource
alternatives and unfinished application coverage. Root should review this frozen
revision, update the shared ledger/trust record, and open a draft PR. No further
worker edits are pending.
