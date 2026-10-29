# Adversarial relational proofs

P047 Codex review extends the original min proof with three distinct mechanisms:
order correlations across swaps, exact arithmetic across mutable aliases, and
joint counter invariants over unknown length. See [domains](../adversarial-proofs.md),
[review](../agent-tasks/P047-adversarial-proofs/review.md) and executable specs there.

- Algebraic cancellation is only justified when every IEEE Number operation is
  exact. Bound every intermediate, not only the final expression. Comparisons
  may identify signed zeros while Number values must retain that distinction.
- A transfer's second heap read must see the debit when references alias. The
  cached-target mutant is a useful negative control even if distinct objects pass.
- Candidate invariants are hypotheses until actual arbitrary body/update steps
  preserve them. A late index-dependent exception defeats a sampled proof.
- Two counts can remain individually unknown while their sum is exact. Publish
  their relation to the same length identity, retaining readonly aliases.
- Check array element facts: randomNumber accidentally narrows a sign-classifier
  to nonnegative inputs. The final specs use arbitrary finite Number templates.
- Pure-heap identity checks may reject harmless allocation. Retain that boundary
  separately; do not broaden equivalence without its own semantic review.
- Small negative-test execution budgets bound ordinary fallback, not the input
  domain. Run a matching-budget positive induction test so budget exhaustion cannot
  masquerade as rejection of only the intentionally wrong algorithms.

P048 extends the shared normalizer to bounded integer polynomials and adds a
three-way scaled partition invariant. [Specs/domains](../adversarial-proofs.md#p048-nonlinear-exceptional-and-weighted-reasoning)
record all boundaries. Determinant cancellation needs exact intermediates, not
just a bounded final determinant. A proposed literal scale is not a theorem;
actual transition proof is required. Snapshot rollback restores object aliases,
but a pending primitive return captures its earlier value. An exhaustive small
integer domain can close return-identity branches; finite numeric bounds alone
cannot eliminate fractional possibilities. First native rounding witness and
compound-assignment fixture were corrected before being used as evidence.


P049 lessons: preserve evaluated references while splitting symbolic keys;
re-evaluating a receiver after RHS mutation writes to the wrong object. A merged
ordinary array can retain exact per-property presence without a common elements
vector; valid absent reads do not imply later writes are modeled. Exhaustive sign
regions over arbitrary symbolic values differ from sampled concrete examples,
but fixed-length proofs do not become unknown-length induction. Binary-search
sortedness belongs in the proof premise, and a no-match sentinel must retain its
relationship to the selected index. Callback guards must be set before calling
user code because synchronous reentry and throws can otherwise defeat cleanup
and single-settlement assertions. The explicit event driver has a finite horizon;
its local cleanup counter proves no external cleanup success. Independent semantic review passed; final validation evidence is in the P049 task.
Retain aggregate order operands when adding equivalent conditional refinements:
replacing the comparison outright can regress older minimum proofs. Bound guard
expression traversal as well as choice leaves before optional inference.
