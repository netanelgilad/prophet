# Bounded ForStatement with lexical iteration scope

Question: how do you evaluate an ordinary `for` loop with `break`,
`continue`, `try`/`finally` and per-iteration `let` bindings without
unbounded host work or losing path correlations?

Rule: drive init/test/body/update as explicit frontier phases over a host
loop, converting only the driver's own break leaves to normal completion.
Copy `let` cells into fresh sibling environments before the first test and
before each update; thread each active path's remaining iteration count
through persistent context state beside a shared step cap. Compose jumps
through the shared merge/sequence/finally operations, never by joining a jump
into a value. See [the implementation](../../src/loops/for.ts),
[the boundary record](../for-statement.md) and
[the specs](../../test/for-statement.spec.ts). Verified source `1170562094fee1ddcb84f8a650b4f418ce7e9be1`.

Semantic traps, each with pinned Node 24.21.0 evidence behind it:

- A recursive call per ordinary iteration overflows the host stack before any
  limit is reached: 1024-deep phase recursion already exceeds it. Advance
  ordinary paths through an explicit host loop and recurse only into fork
  continuations.
- An omitted test is true. Deciding an absent test as an Undefined value
  exits immediately; skipping the test phase is not the same as testing
  Undefined.
- A body's `continue` is not a finished leaf. Treating it as done escapes the
  loop, skips the update, and — through the program's normal mapping —
  silently suppresses every statement after the loop.
- Merging a jump with a normal value would invent a continuation. Fork jumps
  against every other completion kind; only matching jumps share a merged
  context.
- A finalizer jump replaces the prior completion (`continue`/`break`/`return`
  in `finally` override the tried jump), while a normal finalizer preserves
  it. Catch observes guest throws only, never jumps or stops.
- Initialization, test, body and update closures capture different cells:
  the update runs in the post-body copy, so its assignments never touch the
  body's cells, and the initializer keeps the pre-copy loop scope. Old-cell
  writes through an escaped closure do not disturb the current iteration.
- Stopped leaves skip guest `finally` and scope cleanup and keep the actual
  unfinished context with its source frame; completed and thrown siblings
  continue beside them. A budget cap is a typed stop, never termination.
- Array contents live in the persistent heap: inspect post-loop effects
  through the shared heap helpers, never through an object's initial property
  table.
- Bounded unrolling proves order bounds from executed comparisons
  (`minimum(d) <= d[j]` for every member); disjunctive membership
  (`m === d[0] || ...`) is now proved by the separately scoped P005
  selection-membership refinement (infeasible-path refutation within an
  explicit leaf bound), with the tested five-leaf order remaining
  unknown.

Limits: ordinary `for` only; while/do-while/for-in/of, labels, switch,
compound assignment and completion values remain gaps. Bounded sequence
expressions are supported (P026).
Array/rest head patterns stop explicitly. Per-path budgets (1024 body
entries) and the shared visit cap (checked between walks at >= 8192 visits,
counting re-walks past finished leaves as well as phase steps; one walk may
overshoot by its size) bound driver traversal and phase evaluations;
unknown-bound loops still accumulate one exit leaf per explored iteration
until the cap fires. Merge/join cost, allocation,
host-stack depth and same-phase continuation coalescing remain residuals.
Verified against complete Test262 for/continue cases plus stray-jump parse
negatives; the unchanged sirv factory now walks totalist's loop and stops at
the ignore-filter RegExp `.test` beside its filesystem-throw sibling.

Corrections recorded during P003 development: the first driver recursed per
phase and overflowed the host stack on budget-length loops; the rewrite uses
an explicit frontier loop. Two transition bugs were caught by specs and
review before green: body `continue` classified as done (escaping the loop
and suppressing trailing statements) and omitted tests decided as false.
Three spec premises were repaired against pinned Node (comma-operator tests
rewritten without sequence expressions, out-of-scope reads assert
ReferenceError rather than undefined, loop updates must advance the induction
variable). The loop-minimum `member` assertion once exceeded forward-only
select-chain reasoning; P005 now proves it through bounded infeasible-path
refutation, with over-cap selections remaining unknown; see
[the proof record](loop-minimum.md).
