# P003 — Shared bounded ForStatement

State: assigned 2026-10-08; provider-limited before implementation after one
cooldown retry. Same Muse Spark 1.3 build/high thread is idle/unarchived for
resumption, full review required. See [review checkpoint](review.md).
Base: `bb7dce2f1db39cead4d198f11c61f232a416bce3`.
Worktree: `/Users/netanelgilad/development/prophet-worktrees/muse-p003-for`.
Branch: `agent/p003-for-statement`. Atlas thread: `ses_ee4c57620ffeA7vzQE3Q5b1dyH`.

## Outcome and ownership

Advance unchanged sirv's factory through totalist's ordinary ForStatement using
shared VM semantics. This is a higher-risk completion/scope task, not a package
shortcut. Implement ordinary for(init; test; update), absent clauses, unlabeled
break/continue and per-iteration lexical environments. Do not implement while,
do-while, for-in/of, labels, switch, new operators/coercions, regex or host APIs.
The factory may reach another honest boundary; retain it and sibling failures.

Own new src/loops/for.ts (or one equivalent focused loop module), minimal changes
in src/ASTResolvers.ts, src/evaluate.ts, src/types.ts,
src/execution-context/Completion.ts, src/execution-context/branches.ts and
src/execution-context/ExecutionContext.ts needed to compose loop completion and
clone lexical records. Existing function/instantiate and binding helpers should
be reused. Own test/for-statement.spec.ts, test/loop-min.spec.ts after P004 review, sirv's progress assertion in
test/sirv-target.spec.ts, complete-case selection in test/test262.spec.ts,
docs/for-statement.md, docs/sirv-target.md, docs/implementation-gaps.md,
test/test262/README.md, docs/wiki/for-statement.md and task evidence.json.
Propose any extra shared-file ownership before editing it. Root owns task/ledger,
roadmap, playbook and wiki index. No parser/runner/solver/CLI-schema, fixtures,
dependency, CI or external package changes; no push/merge or other workers.

## Required behavior

Read AGENTS, playbook, VM wiki and P002 review/correction. Consult actual ECMA
ForStatement/ForBodyEvaluation/CreatePerIterationEnvironment/LoopContinues and
TryStatement algorithms, not intuition. Existing statement completion values
are limited (many statements return Undefined); explicitly retain that residual
rather than claiming full eval-value semantics or expanding every statement.

- Evaluate initialization once; test before each body; update after normal body
  or applicable continue, never after break/return/throw. Omitted test is true.
  Nested loops consume their own unlabeled jumps; sequential code must not run
  after abrupt completions. Audit every shared normal/abrupt check affected by
  new completion kinds, including merging, statement sequences, generator bridge
  and try/finally. A finally jump replaces the prior completion; normal finally
  preserves it. Catches handle guest throws only, never break/continue/budgets.
- Ordinary var uses its existing function scope/hoisting. let/const initialize in
  the loop scope with TDZ, remain invisible outside, and restore the outer scope
  after guest completion. let creates fresh iteration binding identities at the
  correct points before the first test and before each update. Escaped closures
  from initialization/body/update must observe exactly their own environment;
  assignments by an update callback must not mutate the prior iteration's cells.
  const is not copied as let; illegal writes throw through existing bindings.
  Reuse existing supported object binding patterns or stop explicitly if a
  necessary shared dependency is out of scope; no new destructuring algorithms.
- Propagate return/throw and symbolically conditional break/continue accurately.
  Keep branch-local heap/bindings/effects and current path knowledge. Include
  correlated conditions, a valid proof and a must-remain-unknown result; do not
  infer termination/universal invariants from a finite unroll.
- Preserve current state and siblings if initialization/test/body/update later
  reaches an unsupported operation or budget. Capture each reached step, not just
  the outer loop entry. Analysis boundaries skip guest finally/scope cleanup and
  retain the actual unfinished context/source frame; completed siblings continue.
- Bound host work with an imperative ordinary-iteration path and explicit typed
  budgets for no-progress/infinite loops even when no global budget was supplied.
  Distinguish per-path iteration limits from shared evaluation/path/recursion work.
  Avoid recursive call per ordinary iteration. A practical analysis cap must not
  falsely imply program termination. Test at/over limit, omitted-test empty body,
  already performed effects, nested loops, and branching near a limit. Expose
  remaining path-volume/host-stack/allocation limits honestly if not solved here.
- Typed boundaries for excluded labels/loop kinds remain honest; do not add fake
  guest exceptions or silently ignore unsupported syntax to satisfy selected tests.

## Loop-based minimum acceptance (user update, 2026-10-08)

Add the same original proof through `let best = a[0]` and an ordinary for-loop
that updates best when `a[i] < best`. For ten independent symbolic random values,
`d[0] < minimum(d)` must be false, every `minimum(d) <= d[j]` true, while strict
reverse/unrelated comparisons remain unknown and the returned number remains
symbolic. [P004](../P004-loop-min-specs/task.md) prepares the spec file in a separate
free-model pilot; take only its reviewed exact commit after ownership transfer.
No host random sampling or special min/source recognizer. Include renamed code,
maximum/wrong-reducer controls and native non-finite/empty/tie behavior.

This bounded execution acceptance does **not** establish unknown-length loops.
A subsequent reusable loop-invariant task must derive and validate facts about
all visited elements, loop-carried state and progress. The recursive summary
implementation remains unchanged in P003. If existing shared numeric reasoning
cannot prove the bounded case, return the precise blocker instead of broadening
solver ownership or hard-coding the theorem.

## Specs and evidence

Write specs first, validate native expectations with pinned Node24.21.0, retain
red logs and classify wrong harness/expectation failures separately. Cover order,
zero iterations, init/test/update exceptions, var hoisting, let TDZ/shadowing and
escaping closures, const writes, nested break/continue, try/finally overriding
jumps/return, conditional jumps/throws/stops, heaps/effects and budgets. Use actual
shared symbolic inputs; maintain an unknown control. Complete unmodified pinned
Test262 cases must exercise supported for-loop/completion/lexical semantics;
inspect metadata/native behavior. No test fragments or runner shortcuts.

Update sirv using its unchanged sources and actual reached state/effect leaves;
retain filesystem-failure alternatives. No claim factory or HTTP handling is
complete unless observed. Run for-statement plus affected lexical-scope, completion,
execution-boundary, eval, sirv, Test262 and runner specs. Commit source, then full
suite/typecheck before handoff. Use pinned Node for Yarn and PROPHET_NODE_BINARY:
/tmp/prophet-node-24.21.0/node-v24.21.0-darwin-arm64/bin/node.
Use external timeouts for stress probes, preserve complete logs and real statuses.

Reconcile every new guard/domain and complete historical skip inventory against
stable backlog IDs. Update boundary docs, upstream candidate list and wiki facts.
Evidence: exact tested commit, commands/status/counts, local log paths and hashes,
source hashes, residual gaps and concrete target boundary. Generate and re-read
JSON to verify all hashes programmatically. Logs/oracle scripts remain ignored
local artifacts; never force-add them. Separate docs-only evidence descendants.
Recheck cumulative diff at final handoff. Stop editing while root reviews.
