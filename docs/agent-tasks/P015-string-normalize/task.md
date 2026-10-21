# P015 — bounded ASCII String.prototype.normalize (omitted form)

Worker: Instinct (sandbox), 2026-10-15. Base: P014 head 11a0d0c. Branch
agent/p015-string-normalize.

Outcome: reusable bounded String.prototype.normalize for the omitted/undefined
form (NFC) on concrete ASCII receivers, where normalization is the identity
(ASCII is closed under every Unicode normalization form). Advances unchanged
sirv past name.normalize() in the FILES key expression to the next measured
stop: String.prototype.replace. No Unicode normalization tables, explicit
forms, non-ASCII text, or factory/server/request success claim.

Supported domain:
- Nullish receivers are guest TypeErrors (native control); receiver conversion
  follows trim's discipline (Symbol.toPrimitive absence before ordinary
  conversion, array/function receivers guarded).
- Only the omitted/undefined argument is modeled; any explicit form stops as a
  typed boundary before conversion effects.
- Concrete ASCII receivers return the identical text; non-ASCII and symbolic
  or legacy chunk inputs stop as typed boundaries; 65,536-unit analysis cap
  preserved (not a native restriction).
- Registration mirrors the other modeled prototype methods: name/length
  metadata, boundary-marked, removed from the deferred inventory (eleven
  modeled/41 deferred of the pinned 52-name surface).

Specs first: test/string-normalize.spec.ts (pinned Node 24.21.0 native
controls for ASCII identity incl. empty/control-unit edge and String(65),
nullish TypeError name; typed boundaries for explicit "NFC", composed and
decomposed non-ASCII, symbolic receiver; symbolic-branch correlations).
Migrated from measured output: sirv-target.spec.ts (frontier now replace),
p009/p010/p011-independent-review.spec.ts (CLI frontier message),
p012-correction-review.spec.ts (in-process + CLI graph, frames now the
replace CallExpression), string-trim.spec.ts (deferred/native inventories),
p008-independent-correction.spec.ts (supported-name list + positive
native/VM normalize observation).

Validation (sandbox, Node 24.21.0, PROPHET_NODE_BINARY pinned): full suite
144 suites / 4496 passes / 46 unchanged skips, chunked --runInBand;
typecheck clean.

Remaining gaps: String.prototype.replace (next measured stop; needs a RegExp
subset for /\\+/g), full Unicode normalization, other deferred String APIs.
