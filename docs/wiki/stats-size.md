# Bounded Node Stats.size from declared file facts

Implemented by Instinct in-sandbox at 3fe7ed1 on the P012 head plus the
checkout-history CI correction; full suite 142/4487/46skip and typecheck green.
See [boundary](../node-filesystem.md#bounded-statssize-and-the-p012-r1-boundary),
[specs](../../test/node-stats-size.spec.ts), and
[task](../agent-tasks/P013-stats-size/task.md).

Size is one filesystem fact with exactly two acquisition sources: the UTF-8
byte length of declared concrete contents, or a validated observed size passed
with an unobserved file at entry observation. Byte length is not UTF-16
length; empty and multibyte contents have pinned native controls. Only
nonnegative safe integers are admitted; invalid declared sizes are rejected at
declaration time, never at read time. The first read persists the reached fact
after the current own property check, so repeated reads, aliased Stats and
joined symbolic branches share one correlation.

The P012-R1 precedence contract is unchanged: a supplied own data property,
conditional presence or alias replacement wins over the filesystem fact, and
an inherited property never substitutes for an unknown native own field.
Directories and files without a declared size keep the existing typed
"Unmodeled host property 'size': Node Stats fields" boundary; the model adds
no directory-size, write-size or metadata inference.

Stats instances are boundary-marked host objects. A reached unmodeled field
(mtime, mode, writes, inspection) now stops as a retained typed boundary beside
its symbolic siblings instead of a host failure that discards state and the
CLI graph. Guard specs that matched the old thrown shape accept the boundary
shape for exactly the affected operations; every other assertion is migrated
from measured output, never weakened.

Measured unchanged sirv header preparation completes stats.size with the
observed byte count (16 for site/hello.txt) and stops at stats.mtime in
toHeaders during Last-Modified preparation. The factory has not returned; no
Date/mtime semantics, server/request success or package rewrite is claimed.
Frozen git-show review artifacts keep their original sources and are not
rewritten as current claims; review setups that need genuinely unknown
metadata use a fixture without a declared size.

Next measured stop: stats.mtime (bounded Date). Remaining gaps: directory
sizes, Stats writes/mode/descriptors/public constructors, fresh unknown-size
writes, full Stats/Date metadata.
