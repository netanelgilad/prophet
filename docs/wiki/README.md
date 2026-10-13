# Prophet LLM wiki

Persistent working knowledge for the orchestrator and implementation agents.
Read the relevant article before a task; contribute a correction or useful lesson
with every completed task. Specs and source remain authoritative. This wiki does
not add fields to Prophet's runtime output.

## Start here

- [Agent workflow](../agent-workflow.md): roles, evidence, review, rate limits and archival.
- [Atlas operations](atlas-operations.md): observed thread/model/permission controls.
- [Provider quotas](provider-quotas.md): measured resets, shared limits and workload planning.
- [Model trust register](../agent-models.md): separate calibration for each model/task family.
- [VM foundations](vm-foundations.md): persistence, boundaries and common traps.
- [Bounded Array.concat](array-concat.md): current heap, holes, branches and host work limits.
- [Bounded Array.forEach](array-foreach.md): captured length, current-state visits and flat host iteration.
- [Bounded RegExp.test](regexp-test.md): UTF-16 Boolean matching, conversion order and explicit NFA budgets.
- [Bounded for loops](for-statement.md): lexical iteration cells, abrupt completions and explicit work limits.
- [Loop minimum proof](loop-minimum.md): ten-input bounds and bounded selected-value membership.
- [Selection membership](selection-membership.md): prior equalities, candidate order and NaN-safe inference limits.
- [Unknown-length loops](unknown-length-loops.md): guarded symbolic indices, verified prefix facts, private proof state and alias-safe carry selection.
- [Package candidates](package-candidates.md): pinned read-only scouting beyond sirv.
- [Task ledger](../agent-tasks/README.md): actual prompts, evidence and review outcomes.
- [Runtime contract](../symbolic-runtime.md), [roadmap](../roadmap.md),
  [gap backlog](../implementation-gaps.md), [sirv target](../sirv-target.md).

## Article format

State the question, the current rule, source/spec links, a minimal executable
spec pointer, limits, verified commit/date, and any superseded claim. Distinguish
observed fact, inference and proposal. Do not copy whole docs or transcripts.
Agents own their task article; the orchestrator curates this index and resolves
contradictions during review. Unknown facts stay labeled unknown. Never persist
credentials or private provider payloads. Claims from a worker are provisional
until review is recorded; a model-generated article is not independent evidence.
