# P045: RegExp ignoreCase and String.startsWith through real package paths

Base0f5060b69aa3941e262fa92054a7537cd45682a8, branch agent/p045-package-apis.
Shared worktree /Users/netanelgilad/.codex/worktrees/p035-longcat-environment/prophet.
User asks to keep expanding APIs from real packages; security CLI remains deferred.

## Ownership

regexp_i owns matcher.ts/intrinsic.ts and regexp-ignorecase.spec.ts.
string_startswith owns startsWith.ts/String.ts and string-startswith.spec.ts.
p045_review owns independent package-apis-review.spec.ts, sirv-brotli.spec.ts,
sirv-dev.spec.ts and previous sirv-map /i boundary migration.
Root owns corpus activation, docs/backlog/wiki, semantic oversight, final
validation and publication. Agents cannot commit/push or alter others' files.

## Behavior

Shared RegExp.test admits nonstateful i within an explicitly bounded domain,
with canonicalization of character sets before complement/negation. No lowering
raw regex text or native matching fallback. ASCII-only first support may stop on
non-ASCII input/pattern after required conversions, without pretending Unicode
semantics are covered. Retain flagless matching, lastIndex coercion effects,
finite symbolic branches, unknown input stops and all matcher work limits.
Target: unchanged sirv /(br|brotli)/i and actual encoded-file selection.

Shared String.startsWith follows receiver RequireObjectCoercible/ToString,
IsRegExp(search), search ToString, position ToIntegerOrInfinity and clamped exact
UTF-16 prefix comparison. Preserve all reached coercion effects/throws before
boundaries, symbolic choices/unknowns, RegExp rejection and match overrides.
Target: unchanged sirv dev viaLocal startsWith before filesystem lookup.

Meaningful failing specs and pinned Node24.21.0 controls precede implementation.
Activate whole unmodified Test262 cases; no trimmed cases or skipped additions.
Actual package source/provenance retained. Text-safe .br fixture is file selection
and bytes evidence, not Brotli codec/binary/transport coverage. Record later gaps.

## Acceptance

Independent semantic review and adversarial cases; affected specs, full suite,
typecheck; four gap scans and complete historical skip reconciliation. Record
exact source/log hashes, commands, domains and failures. Only root fast-forwards
master to exact successful CI candidate; preserve unrelated owner files. No
security policies or package-specific VM rules. No reset or paid services.
