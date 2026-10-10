# Finite selection membership

Question: how do you prove that a value drawn from a finite set of
alternatives by nested conditionals is one of those alternatives —
regardless of the order the alternatives were selected or tested —
without proving things that are false for NaN?

Rule (verified): refute infeasible selection-path combinations. When the
VM assumes `selected === candidate` about a nested selection, an outer
branch survives only while some syntactic sub-leaf contradicts no assumed
equality about the same selection (the current assumption plus prior
strict-equal rejections). When resolving `selected === candidate`, leaves
contradicting a prior rejection are discarded and a definite answer needs
every surviving leaf to agree through known strict equality. Unknown leaf
equalities stay feasible, so incomplete candidate lists, fresh values, NaN
leaves and maybe-NaN unknowns keep their branch. See the implementation in
`src/symbolic/index.ts`, the [design note](../agent-tasks/P005-selection-membership/design.md),
the [boundary record](../symbolic-choice-equality.md) and the
[specs](../../test/symbolic-selection-membership.spec.ts).

Semantic traps, each with pinned Node 24.21.0 evidence behind it:

- Candidate order must not matter. The unmodified baseline proved the
  matching order (`first ? a : second ? b : c`) but neither the reversed
  selection, nor comparison-driven `if (b < selected) selected = b`
  chains, nor most reversed-selection disjunct orders (2 of 6). Adding
  prior-aware branch pruning reached 4 of 6 (`a||c||b` and `b||c||a`
  still unknown); making resolution prior-aware as well proves all six,
  because the final disjunct is resolved after discarding
  prior-contradicted leaves.
- A selected NaN need not equal even itself: `NaN === NaN` is false. In
  the tested controls a NaN leaf poisons the exhaustive disjunction to
  unknown (and `selected === selected` stays unknown while the finite
  alternatives still discriminate); when NaN is necessarily selected the
  comparison is false rather than unknown. Unknown numbers that may be
  NaN (`ESNumber()` with no `finite`/`notNaN` standing) stay unknown for
  `x === x` in the tested control and cannot inherit the finite theorem.
- Strict equality is not SameValue: `+0`/`-0` compare equal while the
  chosen zero keeps its sign (`1 / selected` still discriminates).
  Objects compare by reference identity; distinct literals are known
  false and aliases known true. Mixed-type leaves are known false.
- Ties are possible: distinct `Math.random()` draws are not unequal by
  definition, so cross-candidate equalities stay unknown and only
  known-true self-equalities (`a === a` via `finite`/`notNaN`) discard.

Limits: one flattening is capped at 4 leaves / depth 16, non-choice
leaves/candidates only, and reentrant new exploration is refused
(conservative give-up). Pruning accepts 8 usable assumptions including the
current one; collection stops growing past the cap (it may retain one
overflow entry) and then skips the refinement. Resolution accepts 8
priors. Only the leaf at/over cases were exercised directly (4 leaves
prove, including the outer-consequent-second shape; the tested 5-leaf
order remains unknown); no dedicated depth/prior stress coverage is
claimed, and over-cap inputs keep prior behavior, which can still prove
some cases. Likewise the incomplete-list, fresh-value and NaN controls
are tested countercontrols: other inputs with those shapes can be
definite. Whole-solver fallback, join/merge and store costs remain
SYM-004. The loop-minimum `member` assertion now passes through this rule
with no loop-driver change.

Verified against source `e18d18e` (2026-10-10); full evidence in
`docs/agent-tasks/P005-selection-membership/evidence.json`.
