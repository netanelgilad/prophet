# Bounded Node Stats.mtime as a bounded Date

Implemented by Instinct in-sandbox on the P013 head; full suite 143/4538/46skip
and typecheck green. See
[boundary](../node-filesystem.md#bounded-statssize-and-statsmtime-and-the-p012-r1-boundary),
[specs](../../test/node-stats-mtime.spec.ts), and
[task](../agent-tasks/P014-stats-mtime/task.md).

An mtime is one observation with exactly one honest source: an explicitly
declared millisecond count (the CLI capture passes the memoized lstat mtimeMs;
contents never imply one). Declarations validate as finite milliseconds inside
the ECMAScript Date range and clip like new Date(milliseconds), including
negative-zero normalization; the pinned host is the control. The read returns
a bounded Date instance carrying that clipped integral value.

getTime returns the clipped count. toUTCString is deterministic UTC
arithmetic: Howard Hinnant's proleptic Gregorian conversion for the civil
date, weekday from the integral day count, and the pinned host's actual year
formatting (four-digit padded inside 0000-9999, signed "-0001" for small
negatives, plain natural years outside - not the spec's six-digit signed
form). Never trust the spec text or memory over a pinned control; Node 24
prints "Sat, 13 Sep 275760 00:00:00 GMT". Borrowed receivers and every other
Date method, the constructor and Date.now stay guarded; the instance is
boundary-marked so reached gaps stop as retained typed boundaries.

The P012-R1 precedence contract is unchanged: a supplied current own mtime,
even a number, wins over the declared fact; inherited properties never
substitute; the first read persists the fact after the own-property check.
Directory mtimes and undeclared files keep the typed 'mtime' boundary.

Measured unchanged sirv now completes header preparation (Content-Length 16,
Content-Type text/plain, Last-Modified) and stops at
String.prototype.normalize in the FILES key expression. The completed
toHeaders activation (ctype, headers) persists outside the current totalist
callback chain; the innermost callback block holds the completed headers
binding, so graph assertions must look there, not for ctype. The factory has
not returned; no server/request success or package rewrite is claimed.

Next measured stop: String.prototype.normalize, then replace for the FILES
key. Remaining gaps: directory mtimes, other Date methods and the constructor,
Stats mode/BigInt/atime/ctime, writes.
