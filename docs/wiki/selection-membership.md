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

- Candidate order must not matter. The pre-existing reasoner proved
  `first ? a : second ? b : c` but not the reversed selection or
  comparison-driven `if (b < selected) selected = b` chains, and only four
  of six disjunct orders for the reversed selection. All six orders now
  prove because resolution (not just assumption) discards
  prior-contradicted leaves.
- A selected NaN need not equal even itself: `NaN === NaN` is false, so a
  NaN leaf never matches and poisons exhaustive membership to unknown.
  Unknown numbers that may be NaN (`ESNumber()` with no `finite`/`notNaN`
  standing) stay unknown for `x === x` and cannot inherit the finite
  theorem.
- Strict equality is not SameValue: `+0`/`-0` compare equal while the
  chosen zero keeps its sign (`1 / selected` still discriminates).
  Objects compare by reference identity; distinct literals are known
  false and aliases known true. Mixed-type leaves are known false.
- Ties are possible: distinct `Math.random()` draws are not unequal by
  definition, so cross-candidate equalities stay unknown and only
  known-true self-equalities (`a === a` via `finite`/`notNaN`) discard.

Limits: one flattening is capped at 4 leaves / depth 16 / 8 priors,
non-choice leaves/candidates only, prior collection stops at its cap, and
reentrant new exploration is refused (conservative give-up). Over-cap
selections keep prior behavior (unknown). Whole-solver fallback, join/merge
and store costs remain SYM-004. The loop-minimum `member` assertion now
passes through this rule with no loop-driver change.
