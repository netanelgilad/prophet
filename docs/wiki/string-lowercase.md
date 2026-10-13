# Bounded ASCII lowercase

P009 worker verification is provisional pending independent Astra/high review.
[Evidence](../agent-tasks/P009-ascii-lowercase/evidence.json) binds exact frozen
source, commands, logs and hashes; tests do not confer model trust.

Use RequireObjectCoercible then interpreted ordinary ToString with `bindNormal`
and `withValue`. Conversion may mutate prototypes, throw or fork; a casing stop
must retain its current context and completed siblings. A captured intrinsic is
still callable after its prototype property is replaced. P008's conservative
symbol/exotic guards and metadata patterns suffice without representation changes.

ASCII subset mapping is A–Z to a–z with other ASCII preserved. Reject all
non-ASCII, even text native lowercase leaves unchanged: Unicode context and
expansion prevent extending an ASCII rule by intuition. Open strings/numbers
and legacy chunks remain typed unknown-analysis boundaries after conversion.
Cap converted input before admission scan or output preparation; 65,536 units
bounds two linear scans, output entries and join length, not arbitrary coercion
or branch/prototype/parser/CLI resources. Keep successful allocation explicit.

Whole Test262 files may hit metadata guards even if their nominal assertion is
supported: A11 calls direct function hasOwnProperty, while local borrowed
Object.prototype.hasOwnProperty controls work. Remove an incompatible selection
whole with its failed log and blocker, never trim source or broaden inherited
function metadata casually. Check Jest discovery early; helpers never test.ts.

The unchanged mrmime assignment now finishes and retains tmp before lastIndexOf.
[Sirv specs](../../test/sirv-target.spec.ts) verify actual CLI graph, frames and
both enumeration/EMFILE histories; factory/header/server/request completion is
still not reached. Update predecessor checkpoints only when demonstrably obsolete,
retaining replacement/native controls. Freeze once, run full suite under 900s,
then record evidence separately and stop for independent review.

Sources: [ECMAScript](https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.tolowercase),
[algorithm](../../src/string/toLowerCase.ts), [specs](../../test/string-lowercase.spec.ts),
[boundaries](../symbolic-strings.md#bounded-ascii-stringprototypetolowercase-p009).
