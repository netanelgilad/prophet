# Loop minimum proof specs

Question: how do you reconnect the recursive minimum proof to an ordinary `for`
loop with mutable local state, and prove the requested false result through
actual comparisons rather than name recognition or a blanket min fact?

Rule (proposed acceptance, not implemented facts): bounded unrolling of the
`for` loop over a known-length symbolic array. The engine derives
`best <= d[i]` for every member from the comparisons actually executed and the
current bindings, so `d[0] < minimum(d)` is false because `best <= d[0]`. The
proof must not depend on the function name or source: a renamed function, an
analogous maximum, and a deliberately wrong reducer all exercise the same
machinery. See [the specs](../../test/loop-min.spec.ts). The specs are red at
the base commit because `ForStatement` is unsupported; they are staged as
acceptance criteria for the shared loop implementation (P003), not a claim that
a proof currently passes.

Semantic traps, each with pinned Node 24.21.0 evidence behind it:

- The VM's `Math.random` is a model that returns a symbolic number; it never
  calls the host RNG. A `jest.spyOn(Math, "random")` proves the ten-element
  proof needs no host sampling.
- The proof must come from actual comparisons and current bindings. A renamed
  function (`lowest`) proves the same bounds; an analogous maximum (`highest`)
  proves the dual; a deliberately wrong reducer (`lastPick`, same loop but
  returns the last element) cannot borrow the minimum proof — its
  `d[0] < lastPick(d)` and `lastPick(d) <= d[0]` must remain unknown.
- Unknown controls must remain unknown: the strict reverse `minimum < d[0]`, an
  unrelated `Math.random() < minimum`, and the ordering `d[0] < d[1]`.
  Deterministic native witnesses `[0.25, 0.75]` (strict reverse false) and
  `[0.75, 0.25]` (strict reverse true) show both outcomes occur, so no native
  witness can prove the symbolic strict reverse universally false.
- NaN, empty, infinity and signed-zero boundaries: the requested strict
  comparison `d[0] < value` is false in every case, but the non-strict lower
  bound `value <= d[0]` is NOT a theorem — it is false for NaN-first,
  first-hole and empty arrays. The returned value is asserted distinctly (NaN,
  undefined, +/-Infinity, +/-0) so NaN and undefined cannot be interchanged.
  This is the loop's actual selection behavior, not `Math.min`.
- Bounded unrolling proves known-length cases only. Unknown length needs
  separate reusable loop-invariant inference and is a documented follow-up,
  not something bounded unrolling proves.

Limits: known-length arrays of finite symbolic numbers; unknown length,
loop-invariant inference, and path-volume limits are follow-ups. The specs are
red at the base commit (`ForStatement` unsupported) and are proposed acceptance
criteria for the loop feature, not implemented facts.

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

Verified: spec commit, base `c89c0b7`, 2026-10-08. Red at baseline with clear
`ForStatement` boundary evidence; all native controls pass before VM
assertions.
