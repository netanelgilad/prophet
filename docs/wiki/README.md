# Prophet LLM wiki

Persistent working knowledge for the orchestrator and implementation agents.
Read the relevant article before a task; contribute a correction or useful lesson
with every completed task. Specs and source remain authoritative. This wiki does
not add fields to Prophet's runtime output.

- [Instinct integration review](../agent-tasks/integration-2026-10-21/review.md): cumulative review, independently reproduced failures, corrections and exact-source validation.

## Start here

- [Agent workflow](../agent-workflow.md): roles, evidence, review, rate limits and archival.
- [Atlas operations](atlas-operations.md): observed thread/model/permission controls.
- [Provider quotas](provider-quotas.md): measured resets, shared limits and workload planning.
- [Model trust register](../agent-models.md): separate calibration for each model/task family.
- [VM foundations](vm-foundations.md): persistence, boundaries and common traps.
- [Bounded Array.concat](array-concat.md): current heap, holes, branches and host work limits.
- [Bounded Array.forEach](array-foreach.md): captured length, current-state visits and flat host iteration.
- [Bounded generic UTF-16 substring](string-substring.md): ordered conversion, late admission and the measured Stats.size frontier.
- [Bounded UTF-16 lastIndexOf](string-lastindexof.md): mandatory conversion order, independent work caps and retained unary frontier.
- [Bounded ASCII lowercase](string-lowercase.md): conversion effects, Unicode boundaries, caps and actual lastIndexOf frontier.
- [Shared String.trim](string-trim.md): current coercion state, UTF-16 edge whitespace and pre-scan bounds.
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

- [Number-domain unary bitwise NOT](number-bitwise-not.md): late ToNumeric admission, signed32 conversion, callee-before-argument frontier; P011 review pending.
- [Bounded Node Stats.size](stats-size.md): declared-fact acquisition, P012-R1 precedence, boundary-marked Stats; frontier now stats.mtime; independent review pending.
- [Bounded Node Stats.mtime](stats-mtime.md): declared-observation bounded Date, clipped getTime and deterministic toUTCString; frontier now String.prototype.normalize; independent review pending.
- [Bounded ASCII String.prototype.normalize](string-normalize.md): NFC identity on concrete ASCII, typed boundaries elsewhere; frontier now String.prototype.replace; independent review pending.
- [Bounded no-match RegExp String.prototype.replace](string-replace.md): identity via the Boolean matcher's no-match answer; frontier now Function.prototype.bind; independent review pending.
- [Bounded Function.prototype.bind](function-bind.md): captured receiver/partials, computed length, forwarding calls; unchanged sirv factory returns its request handler; independent review pending.
- [Bounded sloppy receiver boxing](sloppy-boxing.md): fresh ToObject wrappers on original intrinsic prototypes; bound viaCache handler callable; independent review pending.
- [Bounded generic UTF-16 String.prototype.indexOf](string-indexof.md): forward scan, NaN-as-+0 positions, shared budgets; delivered sirv GET completes @polka/url parse; independent review pending.
- [Bounded ordinary-array call spread](call-spread.md): proven intrinsic iteration, holes as undefined, conditional operand splits; sirv extns.push spread completes; independent review pending.
- [Bounded String.prototype.charCodeAt](string-charcodeat.md): ToIntegerOrInfinity positions, single-unit reads, no scan budget; viaCache lookup completes on the delivered sirv GET; independent review pending.
- [Bounded for-in enumeration](for-in.md): snapshot keys, native mutation semantics, per-iteration cells; send header loop completes on the delivered sirv GET; independent review pending.
- [Response getHeader/setHeader surface](response-headers.md): lazily-created raw store, writeHead merge, pinned error codes; sirv send reaches the content-length projection decision; independent review pending.
