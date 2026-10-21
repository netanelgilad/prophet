# Bounded for-in enumeration

Implemented by Instinct (P022), corrected during the
[integration review](../agent-tasks/integration-2026-10-21/review.md). Task
record: [P022](../agent-tasks/P022-for-in/task.md); specs:
[for-in.spec.ts](../../test/for-in.spec.ts) and
[sirv-request.spec.ts](../../test/sirv-request.spec.ts).

for-in enumerates a snapshot of enumerable string keys, own before
inherited, first occurrence winning under shadowing, integer indices before
insertion order within each holder. The snapshot fixes which keys can be
visited: additions during iteration are never visited; each visit
re-resolves presence along the current chain, so deletions skip, revealed
inherited keys visit, and re-additions visit. Nullish heads run zero
iterations; strings contribute UTF-16 indices; other primitives contribute
none. let/const heads bind a fresh cell per iteration; var shares one
hoisted binding; identifier and member-expression heads assign through the
shared machinery. Iteration is bounded by the per-path body budget and a
shared step cap, each retaining the unfinished context as a typed budget
boundary.

Only the complete enumerable-data own-property domain enumerates; objects
with unmodeled descriptors or unknown keys stop (typed boundary where
boundary-marked, legacy host error otherwise). The chain walk includes enumerable guest additions to Object.prototype while
excluding its intrinsic nonenumerable members. A lexical head creates its
uninitialized binding before evaluating the RHS, so self-references throw
ReferenceError. Symbolic heads retain each selected object. Key-count and
prototype-depth limits complement the body/step budgets.

The unchanged consumer advances: the delivered sirv GET completes send's
for-in over the file headers; the measured stop is res.getHeader
(build.js:67).

Known gaps: chains through unmodeled prototype objects stop with the legacy
enumeration error (constructor-prototype descriptors unmodeled, Object.create
unmodeled); deletion-driven visits await DeleteExpression; labeled jumps,
destructuring heads, sloppy-mode head initializers and for-in completion
values remain open.
