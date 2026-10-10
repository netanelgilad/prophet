# Loop minimum proof specs

Question: how do you reconnect the recursive minimum proof to an ordinary `for`
loop with mutable local state, and prove the requested false result through
actual comparisons rather than name recognition or a blanket min fact?

Rule (verified): bounded unrolling of the `for` loop over a known-length
symbolic array. The engine derives `best <= d[i]` for every member from the
comparisons actually executed and the current bindings, so `d[0] < minimum(d)`
is false because `best <= d[0]`. The proof does not depend on the function
name or source: a renamed function, an analogous maximum, and a deliberately
wrong reducer all exercise the same machinery. See
[the specs](../../test/loop-min.spec.ts) and
[the loop driver](../../src/loops/for.ts). Verified source `1170562094fee1ddcb84f8a650b4f418ce7e9be1`;
the shared loop implementation (P003) executes these specs. The recursive
summary implementation is unchanged.

Exact symbolic acceptance domain: ten independent `Math.random` symbols in
`[0, 1)`, plus a smaller three-symbol membership case. Broader arbitrary finite
symbolic inputs are not covered by these specs. Native Node does not establish
symbolic VM behavior; deterministic native witnesses below are boundary
observations only.

Verified symbolic assertions, each with the reason it holds:

- The VM's `Math.random` is a model that returns a symbolic number; it never
  calls the host RNG. A `jest.spyOn(Math, "random")` checks that the
  ten-element proof needs no host sampling.
- The proof comes from actual comparisons and current bindings. A renamed
  function (`lowest`) proves the same bounds; an analogous maximum
  (`highest`) proves the dual; a deliberately wrong reducer (`lastPick`, same
  loop but returns the last element) cannot borrow the minimum proof — its
  `d[0] < lastPick(d)` and `lastPick(d) <= d[0]` remain unknown.
- Unknown controls remain unknown: the strict reverse `minimum < d[0]`, an
  unrelated `Math.random() < minimum`, and the ordering `d[0] < d[1]`.
  Deterministic native witnesses `[0.25, 0.75]` (strict reverse false) and
  `[0.75, 0.25]` (strict reverse true) show both outcomes occur, so no native
  witness can prove the symbolic strict reverse universally false.
- Bounded unrolling proves known-length cases only. Unknown length needs
  separate reusable loop-invariant inference and is a documented follow-up,
  not something bounded unrolling proves.

Verified native boundary observations (independently checked against pinned
Node 24.21.0, separate from the symbolic assertions): for concrete NaN, hole,
empty, infinity and signed-zero arrays, the requested strict comparison
`d[0] < value` is false in every case, but the non-strict lower bound
`value <= d[0]` is NOT a theorem — it is false for NaN-first, first-hole and
empty arrays. The returned value is asserted distinctly (NaN, undefined,
+/-Infinity, +/-0) so NaN and undefined cannot be interchanged. This is the
loop's actual selection behavior, not `Math.min`.

Known residual: the three-element `member` assertion
(`m === d[0] || m === d[1] || m === d[2]`) remains unknown. The loop value is
correct (a nested conditional selection of the inputs), and the same case
proves its alias bound (`alias <= d[0]` true) and strict comparison
(`d[0] < alias` false). Membership needs refutation of infeasible
selection-path combinations, which forward-only strict-equality reasoning
does not perform; that precision belongs to separately scoped selection work
(P005 candidate) under SYM-001, not to solver expansion here. A deliberately
wrong reducer still proves its own concrete membership, so the residual is
specific to symbolic selection chains.

Limits: the symbolic domain is ten independent `Math.random` symbols in
`[0, 1)` plus a three-symbol membership case; broader arbitrary finite symbolic
inputs, unknown length, loop-invariant inference, and path-volume limits are
follow-ups.

Corrections recorded during review: the first native control used a 100-trial
random-sampling existence test with the comparison written backwards (`d[0] <
best`, always false) — a harness mistake, fixed then removed; deterministic
witnesses replace it. The ten-element literal originally emitted interpreted
`Array.from` plus arrow syntax, adding unrelated unsupported dependencies; it
is now a literal array of ten `Math.random()` calls. The witness arrays were
refined to `[0.25, 0.75]` / `[0.75, 0.25]` to stay within `Math.random`'s
`[0, 1)` domain. `scope()` now requires normal completion (rejecting boundaries,
nested boundaries, forks and throws) so red evidence shows the unsupported
`ForStatement` directly. Boundary cases now assert the returned value
distinctly, not only `x`/`lowerBound`.

Base `c89c0b7`, 2026-10-08. Tested commit, exact commands, exit codes and
programmatic hashes in [evidence.json](../agent-tasks/P004-loop-min-specs/evidence.json).
Loop execution evidence is recorded under P003.
