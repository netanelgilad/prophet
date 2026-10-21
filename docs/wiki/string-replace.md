# Bounded String.prototype.replace

P016/P028 introduced the operation; the [integration review](../agent-tasks/integration-2026-10-21/review.md)
corrected observable no-match behavior. See [specs](../../test/string-replace.spec.ts)
and [independent regressions](../../test/integration-independent-review.spec.ts).

Concrete string searches replace the first occurrence, supporting `$$`, `$&`,
prefix and suffix substitutions. Capture references remain literal without
captures. Function replacements and non-string conversion in this string-search
slice remain explicit boundaries. Operand, replacement and result limits bound
host scanning and allocation.

For an admitted intrinsic flagless/global RegExp with no match, the resulting
text equals the receiver. This does not mean the call is effect-free: a
noncallable replacement is converted before matching; global matching resets
`lastIndex`, and required index conversion effects must survive. Callable
replacements are not invoked when there is no match. The shared Boolean matcher
cannot provide match positions, so actual matches remain unsupported.
Custom dispatch and unsupported conversion hooks must stop honestly.

The unchanged sirv filename `hello.txt` passes the no-backslash replacement.
The subsequent factory and selected request cases now complete; those are
bounded application observations, not general RegExp or server proofs.
