# Bounded Boolean RegExp matching

Worker-verified 2026-10-13; independent review pending. Exact revision, commands,
hashes and self-corrections: [P007 evidence](../agent-tasks/P007-regexp-test/evidence.json).

A literal's `.test` is one lazy shared nonconstructible intrinsic. Keep its read
admission separate from property mutation: the instance allows inherited `test`
but explicitly rejects writes. The original intrinsic exec is private, so ordinary
RegExp execution cannot observe custom dispatch; borrowed callable exec and custom
embedding layouts stop. Do not use a broad object type check as a RegExp brand.

[test](https://tc39.es/ecma262/multipage/text-processing.html#sec-regexp.prototype.test)
checks the object receiver before ToString. RegExpExec checks the brand after
conversion/exec lookup. RegExpBuiltinExec coerces lastIndex even without g/y.
Do not skip interpreted valueOf effects just because the local index is then
ignored. Use shared `bindNormal` to checkpoint every reached conversion and keep
normal siblings beside throws or analysis boundaries. String conversion must
establish absence of inherited Symbol.toPrimitive before using the shared
ordinary converter. Native generator continuation alone does not preserve forks.

For flagless Boolean existence without backreferences/lookaround, an epsilon NFA
can discard ordered backtracking priority and captures. This is not a reusable
ordered match-result engine: g/y exposes the endpoint, and backreferences expose
captures. Reject those domains until separately implemented. Parse the entire
bounded pattern before searching, including branches that might never be tried
by a concrete ordered matcher. UTF-16 code units and explicit whitespace tables
avoid a native matching backend/Unicode-database dependency; Cherow's earlier
native compilation remains a separate parser boundary.

Budget empty compiler visits as well as emitted states: nested repetitions of
empty groups can use large work with a tiny NFA. Bound source before preparation,
nesting before recursion, counts before expansion, states before insertion and
matching/range scans explicitly. Deduplicate epsilon work on enqueue. Budget
stops must not become false, guest exceptions or lastIndex resets. The per-call
bounds do not cover arbitrary coercion, symbolic frontier growth or the parser.
Native differential controls also need host timeouts: an ambiguous nonmatch can
stall the native oracle even when the VM's NFA is bounded. Use short deterministic
native cross-products plus separate long VM resource probes.

The unchanged sirv factory now reaches String.trim in mrmime.lookup. Classifying
that missing intrinsic at ordinary lookup preserves the EMFILE sibling; broad
noncallable assertions would discard it. This is application progression, not
completed headers/factory/server/request coverage. See
[the precise grammar, caps and upstream candidates](../regexp-literals.md) and
[executable specs](../../test/regexp-test.spec.ts).
