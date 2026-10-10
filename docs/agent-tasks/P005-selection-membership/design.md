# P005 design note — order-independent finite selection membership

## Reduced theorem (no loop)

With finite symbolic `a/b/c` (`Math.random`, hence `finite` + `notNaN`) and
independent unknown booleans `first/second`:

- `first ? a : second ? b : c` proves
  `selected === a || selected === b || selected === c` (control: passes).
- `first ? c : second ? b : a` leaves the same disjunction unknown (red).
- Unrolled `let selected = a; if (b < selected) selected = b;
  if (c < selected) selected = c;` leaves the same disjunction unknown (red).
- Candidate (disjunct) order also matters: for the reverse selection only
  four of six disjunct orders prove; `a||c||b` and `b||c||a` stay unknown
  (independent review). All complete normally: reasoning precision, not
  missing execution.

## Lost relationships

Two related gaps, both instances of one missing theorem: **refutation of
infeasible selection-path combinations where a rejected equality coexists
with the selections that would force it** (SYM-001).

1. `assume()` refinement for `strict-equal` over a choice enumerates only
   the outer guard and checks only the **current** equality per branch.
   Prior equality assumptions about the **same selection** are never
   re-checked under the refined path, so reverse-order branches survive
   although every sub-leaf contradicts either the current or a prior
   rejection.
2. `resolveEquality()` for `selected === candidate` expands one guard at a
   time with no memory of prior rejections. The final disjunct of a
   disjunction therefore stays unknown whenever its proof needs a prior
   rejection (e.g. order `a||c||b`: proving `selected === b` needs
   `selected === a` is false to discard the `a` leaf). Disjunct order
   decides which rejection is available last, hence the 4-of-6 pattern.

## Proposed minimal rule (owned surface only)

Stay inside `src/symbolic/index.ts`; no new fact kind, no operator/merge/
heap/loop/schema change. Both halves use one bounded leaf helper:

1. Flatten a selection into syntactic leaves with sub-path guard lists.
2. For each leaf `L` with sub-path `P`, build
   `subFacts = assumeChain(knowledge-or-branchFacts, P)`.
3. Collect prior `truth` facts in the incoming `knowledge` whose
   strict-equal condition mentions the same outer selection on either side
   (by value identity), plus the current `(candidate, truth)` for the
   `assume()` half.
4. Resolve each `L === candidate_j` with the existing `strictEquality`
   under `subFacts` (before assuming the current answer, as today).
   A leaf is feasible unless some resolution is known and disagrees with
   its assumed answer.
5. In `assume()`: keep an outer branch when at least one sub-leaf is
   feasible; discard only when **every** sub-leaf contradicts a
   current-or-prior assumption through a known answer.
6. In `resolveEquality()`: discard prior-contradicted leaves the same way,
   then return `true`/`false` only when every remaining leaf agrees through
   a known answer; otherwise unknown (including the no-remaining-leaf
   case, which claims nothing from contradictory knowledge).

This never assumes exhaustiveness: a leaf with no known-true match stays
feasible (unknown cross-equality, incomplete lists, fresh values). It only
adds elimination when all surviving leaves are known-decided.

## Why it is sound for NaN / identity / signed zero

- Leaf equality reuses `strictEquality`/`resolveBoolean`, hence exact
  JavaScript `===`: concrete `NaN` never equals (even itself); an unknown
  number without `finite`/`notNaN`/order standing stays unknown for
  `x === x`, so a maybe-NaN leaf can never contradict a `false`
  assumption and can never manufacture a `true` match.
- Finite `Math.random` leaves carry `finite` (hence `notNaN`), so
  `a === a` is known true and legitimately contradicts `selected === a`
  is false on the `a` path. Unknown `ESNumber()` leaves stay unknown.
- `+0`/`-0` use `===` (`-0 === 0` is true) while the chosen zero value
  keeps its sign; no `Object.is`/`SameValue` confusion is introduced.
- Objects use reference identity (`sameIdentity`); distinct literals are
  known false, aliases are known true. Mixed-type leaves resolve false
  through the existing type check.
- Infinities are `notNaN` concrete values and behave like finite leaves
  for equality while retaining their bounds elsewhere.

## Resource bounds (explicit)

- One flattening is capped at 4 leaves / depth 16 / 8 priors; over-limit
  inputs keep current behavior (unknown). The 4-leaf cap is deliberately
  small (P005 needs three); at-cap (4) proves and over-cap (5) stays
  unknown in owned specs.
- Prior collection in `assume()` stops growing at the cap and
  conservatively skips the refinement for that assumption; the cap check in
  the leaf helper alone would not bound the allocation.
- Reentrant new exploration is refused via `selectionMembershipDepth`:
  `assume`/`strictEquality` reached while flattening keep pre-existing
  behavior. The helper applies solely to non-choice leaves/candidates.
- These constants bound the new leaf exploration only. Whole-solver
  fallback, join/merge, frontier and store costs remain SYM-004. A
  stopped/unknown result remains preferable to an unsound proof.
