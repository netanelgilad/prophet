# P014 — bounded Node Stats.mtime as a bounded Date (getTime/toUTCString)

Worker: Instinct (sandbox), 2026-10-15. Base: P013 head 5ff1fd8. Branch
agent/p014-stats-mtime.

Outcome: reusable Stats.mtime through the shared filesystem model as a bounded
Date instance with modeled getTime and toUTCString, advancing unchanged sirv
past header preparation (Content-Length 16, Content-Type text/plain,
Last-Modified) to the next measured stop: String.prototype.normalize in the
FILES key expression of the totalist callback. No Date constructor, Date.now,
other Date methods, timezone/locale behavior, directory mtimes, write support,
or factory/server/request success claim.

Supported domain:
- fileSystemFile/fileSystemUnobservedFile accept an explicit declared mtimeMs;
  contents never imply one. Values validate as finite milliseconds within the
  ECMAScript Date range and clip like new Date(milliseconds), including
  negative-zero normalization (pinned host control).
- The CLI capture passes the memoized lstat mtimeMs at entry observation, no
  new host call at read time.
- The bounded Date instance models only getTime (the clipped integral count)
  and toUTCString (deterministic UTC formatting: proleptic Gregorian
  conversion, weekday from integral days, the pinned host's year formatting -
  four-digit padded inside 0000-9999, signed for negatives, plain natural
  years outside). Both are boundary-marked; other Date methods and borrowed
  receivers stay guarded.
- P012-R1 precedence unchanged: a supplied current own mtime (any value, even
  a number) wins; inherited properties never substitute; first read persists
  the reached fact after the own-property check.

Specs first: test/node-stats-mtime.spec.ts (pinned Node 24.21.0 native
controls for Date clipping and UTC formatting across the range - epoch,
leap day, pre-epoch, year 1, year -1, both range ends, fractional and -0
clipping; repeated/aliased identity, supplied-own precedence, directory and
undeclared boundaries, declared-validation, symbolic-branch correlations,
retained typed boundary for unmodeled Date methods). Migrated from measured
output, preserving all other assertions: sirv-target.spec.ts (frontier now
String.prototype.normalize; completed toHeaders activation retained outside
the current callback chain), p009/p010/p011-independent-review.spec.ts (CLI
frontier message; ctype now in the completed toHeaders record, headers
binding in the current record), p012-correction-review.spec.ts (same moves,
in-process and CLI graph). Frozen git-show review artifacts untouched.

Validation (sandbox, Node 24.21.0, PROPHET_NODE_BINARY pinned): full suite
143 suites / 4538 passes / 46 unchanged skips, run chunked with --runInBand
per ~35 files; typecheck clean.

Remaining gaps: String.prototype.normalize (next measured stop) and replace
for the FILES key; directory mtimes; other Date methods/constructor/Date.now;
Stats mode/BigInt/atime/ctime; writes. Wiki article pending.
