# Independent P007 review contract (source SHA supplied at dispatch)

Review the exact frozen P007 candidate against base3377cfe. Full semantic review
of every implementation/spec line plus independently authored adversarial probes;
worker confidence/test counts are not acceptance. Use an isolated review worktree
and pinned Node24.21.0 oracle. No production fixes, no edits in the worker tree,
no push/merge, no agents, no account/model substitution or paid API usage.

Deliver accept/reject with concrete priority/location/counterexample; name exact
source SHA, commands/statuses/local full logs/hashes. Preserve reviewed domain
and explicit guard cases; do not demand all RegExp support from a bounded task.
Verify actual unchanged sirv CLI graph advance + filesystem-failure sibling,
whole unmodified upstream cases, no removed assertions or new skips. Inspect
source cumulative diff and evidence hashes. Trace host-coercion current context,
branch completions and snapshot aliases. Typecheck/selected source exact cases;
root/worker full suite evidence is sufficient unless stale or incompatible.

Particular adversarial questions (independently design actual cases):
- Admission is parsed generically, never regex source recognition. Unsupported
alternatives anywhere in the regex cannot disappear because an earlier arm matches.
- ToString effects/throws happen before lastIndex conversion; non-global test
still applies ToLength(lastIndex), then uses start0 without overwriting the field.
- Primitive invalid receivers versus ordinary objects with dispatch must be honest
TypeError or boundary as applicable; extracted intrinsic preserves this/identity.
- Object.prototype inherited exec/customization cannot silently bypass standard
RegExpExec dispatch merely because RegExp's partial prototype lacks public exec.
Any changed own/inherited hook stays interpreted or explicitly guarded.
- Anchors and dot/classes match ECMAScript code-unit semantics exactly in the
admitted flags/domain. End anchors and line terminators, empty classes, escaped
class atoms/range endpoints, negation, ASCII/non-ASCII admission are adversarial.
- Empty repeated groups and nullable nested repetitions do not create false
negatives/positives. Alternation ordering and greediness relevant to observed
Boolean outcomes; stateful flags remain explicit boundary if not admitted.
- Resource bounds before parsing/copy/allocation; regex/input length, nested tree
and expanded repetition sizes, shared work including unanchored scan positions.
Step exhaustion never returns false or guest exception; state/effects survive.
- Conditional input strings, aliases, lastIndex choices, coercion forks/throws and
unknown open strings retain real normal/throw/boundary siblings and correlations.
- No native regex matcher or native execution fallback; no function objects or
mutable matcher caches leak into public graph. Previous snapshots unchanged.

Batch findings once against completed draft; don't stream speculative objections.
When fixed, rerun exact new source and affected controls; do not repeat broad
reviews or paid-model handoffs merely to polish docs. Work economically while
retaining proof/evidence gates. Stop after a complete review report.
