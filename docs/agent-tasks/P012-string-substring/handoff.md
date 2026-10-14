# P012 handoff — frozen for independent review

Source/spec/docs commit **3ef28e197fbfae2b5081346e901d85b780c965e0**, based on
owner-authorized **22c109dd0bf67336f023f113055c3a63871684a6** via task-only seed
c845141. Branch `agent/p012-string-substring`; all direct shell/tool commands used explicit
cwd `/Users/netanelgilad/development/prophet-worktrees/sol-p012-string-substring`.
Source is frozen. This evidence-only child adds this handoff, [evidence.json](evidence.json)
and [validation.json](validation.json); no source/spec/earlier report/log is changed.
Independent **Astra/high** review remains required. Root owns the stacked draft
against `agent/p011-number-bitwise-not` and exact-head CI. No push, merge,
release, further feature, agents, model/account/reset change, install, access
expansion or Notion write occurred. Requested writer profile is sole Sol6.1/high,
account mine; backend weights and a fresh per-feature quota estimate are unknown.

## Behavior and actual target frontier

`src/string/substring.ts` implements ordered generic ordinary coercion with local
late primitive admission. Shared `ordinaryStringHint` exposes the existing
string-hint traversal's finishing continuation, like `ordinaryNumberHint`; prior
ToString callers retain their behavior. RequireObjectCoercible, receiver ToString,
start ToNumber, and nonundefined end ToNumber occur in order. Only directly
undefined/missing end means captured string length; returned undefined converts
to NaN/zero. Complete all observable conversions before open/concrete/copy
admission. NaN/zeros, truncation, infinities, independent clamping, endpoint swap
and end-exclusive UTF-16 copying are native-checked, including split/lone
surrogates and NUL. No native substring backend, sample recognition or generic
CallExpression change is introduced.

Registration removes only substring from the deferred registry, with name
substring/length2, nonconstruction, function/call identity and aliases; the pinned
52-name inventory is ten modeled/42 deferred. Remaining metadata and reflection
boundaries stay truthful. Predecessor literal and parameterized migrations retain
all branch, trace, heap/prototype, console, native, order and sibling assertions:
generic earlier-stop witnesses now use genuinely deferred indexOf/includes;
supported-name inventory adds native/VM substring observations.

Unchanged mrmime independently returns `text/plain` for `hello.txt`, with its
completed activation `tmp="hello.txt"`, `idx=6`. Focused controls verify callee
lookup before argument evaluation and exactly one increment; unchanged mrmime
native/VM controls additionally check ` TXT ` and `thing.JSON`. Root's separate
native mrmime matrix is retained as a reference, not mislabeled as VM coverage.
At the later unchanged sirv frontier, current `ctype="text/plain"` and
`name="hello.txt"` are in `toHeaders`; mrmime locals are completed persistent
records **outside the current lexical chain**. The actual stop is **Stats.size
in sirv/build.js:110**. Factory return, subsequent headers/Date/Stats values,
startup/network/server/request behavior and future retained callbacks are not
claimed analyzed.

A narrow size-only property-read classifier turns that existing absent Stats
read into a typed unsupported leaf. Other read/write paths fall through unchanged;
no Stats semantics/value is invented. Method shadows and every older filesystem
guard are preserved. Real CLI stdout remains direct `roots`/`nodes`, stderr
`prophet: Unmodeled host property 'size': Node Stats fields`, exit2. Every success
history retains matching readdir/stat/isDirectory call/return identities beside
the EMFILE readdir call/throw history. Focused Stats classification also checks
prefix state, a completed sibling and no guest catch/finally at analysis stops.
The shared native oracle adds explicit subprocess cwd only.

## Validation

All commands below ran in the assigned cwd with
`PROPHET_NODE_BINARY=/tmp/prophet-node-24.21.0/node-v24.21.0-darwin-arm64/bin/node`.
Host Jest Node was v26.9.0; independent native controls verified **v24.21.0**.
Exact per-run argv/cwd/environment/status, UTC start/end, exits, caps, source
manifests, full raw stdout/stderr and hashes are in evidence, not inferred from
filenames. New predecessor outputs use isolated PROPHET_REVIEW_RUN,
PROPHET_P009_LOG_ROOT and PROPHET_P011_LOG_ROOT paths.

| Check | Actual result |
| --- | --- |
| Native before implementation | 18 selected checks pass, including 43 whole files/86 variants; selector exclusions are not historical skips |
| VM before implementation | 88 failures/36 passes, inspected at deferred substring lookup; no repaired native expectation counted as red |
| Main affected selection | 24 executed suites, 1,945 passes/46 historical skips; one nonexistent argv filename selected no suite, actual enumeration checked separately |
| Adjacent conversion/operator/state/filesystem | 16 suites, 228 passes |
| Final prefreeze focused/consumer | 6 suites, 305 passes; prefreeze, even though behavior matches committed source |
| Final prefreeze typecheck/audit | exit0; explicitly working-tree checks |
| **Clean committed full** | **139 suites, 4,411 passes/46 skips/4,457 total, exit0**; 477.077 Jest seconds, 479.971 elapsed, external900s cap, no timeout |
| **Clean committed typecheck** | **exit0**, elapsed9.135s, external120s cap |
| **Clean committed audit** | **exit0**, elapsed15.688s, external150s cap |

The only committed-source full command was:

```sh
python3 /Users/netanelgilad/development/prophet-worktrees/sol-p012-string-substring/logs/p012/run-v2.py frozen-full 900 node .yarn/releases/yarn-3.1.1.cjs test --runInBand
```

Committed typecheck and audit used the same helper with `frozen-typecheck 120 node
.yarn/releases/yarn-3.1.1.cjs typecheck` and `frozen-audit 150 node
logs/p012/audit-v4.cjs`. All three records have the exact source HEAD and empty
before/after git status. No behavior changes followed them.

The focused spec has 142 checks, a 1,152-case exhaustive endpoint cross-product
over its explicitly declared eight short UTF-16 strings/twelve endpoints,
finite correlations and mandatory unknowns, current fallback/prototype mutations,
metadata/aliases/snapshots, ignored arguments, caps and mixed completion/effect
histories. Native witnesses establish that conservative exclusions are VM gaps.

Fourteen complete unmodified substring files/28 variants are activated; all
43/86 native candidates pass and all 29 whole VM-incompatible cases retain errors
and stacks. No active file removed or new skip. Full inventory is **384 active
files/759 variants**, **46 historical skipped files**, **36,091 installed JS files**;
all names/hashes/metadata are recomputed. Audit also verifies 48 fixture files,
870 unchanged protected source/dependency/report files and 229 preserved old
artifacts, and scans guards/assertions/skips/key routes/boundaries/checkpoints/diff.
This is not complete JavaScript/Node coverage.

**Candidate hash-label correction:** the frozen candidate table and native/VM
row `sha256` hash the standard Test262 parser body, which removes the metadata
comment. Raw installed-file hashes differ. Evidence records both identities and
verifies that removing only that comment produces every parsed body; no executable
source or assertion was trimmed. Native executes raw complete files with standard
harness/includes; VM uses the unchanged existing runner. The failed first evidence
builder assertion and corrected versioned builder remain retained and attributed.

## Retained failures, resource recovery and provenance

All **1,236 frozen tracked files**, 22 run records and artifact hashes are
programmatically recomputed. Early run.py initially captured manifests; its first
six full archives were subsequently reconstructed from original HEAD/spec bytes
and checked against those manifests. They are not falsely claimed pre-run archive
captures. Final pre-interruption helper bytes remain saved; later v2 capture is
versioned. Its compact prefreeze archives list exact included/excluded paths,
referencing unchanged committed dependency bytes by HEAD/hash. Frozen committed
source is recovered through Git, with no duplicate per-run cache payload.

No old archive/log/manifest was relabeled or overwritten. The original `affected`
capture has a retained **32,700,928-byte partial archive, no run.json and no test
execution**: ENOSPC interrupted capture before subprocess launch. Root's recovery
reports retain byte-identical hardlinked immutable archives and independent APFS
cache clones; writer did not edit those archives/dependencies. Storage was checked
before the full run and remained sufficient.

Other disclosed writer attempts are retained: two selectors matched no tests;
stale consumer expectations measured legacy and then typed Stats stops; missing
size-classifier write passthrough was a writer implementation defect fixed before
freeze; object-as-tuple and restored-local checks were harness defects; typecheck
and audit fixture-format/Git-buffer failures were tooling issues. The later
candidate hash-label assertion is an evidence issue. Failed logs/source snapshots
stay bound to their actual revisions. Read-only inspection mistakes are task
transcript evidence, not validation. None is attributed to independent Astra.

## Remaining boundaries and review scope

Concrete receivers through65,536 UTF-16 units, concrete converted Numbers and
finite correlated choices are supported. Open values/legacy chunks, custom
nonnull Symbol.toPrimitive, arrays/functions, wrappers beyond the intrinsic
String.prototype identity, BigInt/public Symbol/late exotic kinds remain gaps.
The receiver cap applies even to empty outputs. Numeric-string parsing has no
new cap: copy bounds do not bound inherited parsing/formatting, interpreted
coercion, prototype recursion, branch/store growth, parser/input allocation or
successful allocation/Node resource failures. Shared partial-host/cyclic/descriptor/
boxing limitations remain explicit. P011 static-key guards are byte-identical.

[Boundary](../../string-substring.md), [wiki](../../wiki/string-substring.md),
[backlog reconciliation](../../implementation-gaps.md#p012-reconciliation--bounded-generic-substring),
[task](task.md) and [candidate dispositions](upstream-candidates.md) retain these
limits; no gap group or trust/concurrency gate closes. Owner allowance reports
41% then40% are account-wide context, not a task budget or live writer measurement;
no provider error or rotation occurred. This thread stops with this one complete
handoff for independent exact-source Astra/high review and root publication/CI.
