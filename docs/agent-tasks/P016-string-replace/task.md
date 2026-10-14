# P016 — bounded no-match RegExp String.prototype.replace

Worker: Instinct (sandbox), 2026-10-15. Base: P015 head 9fd25ab. Branch
agent/p016-string-replace.

Outcome: reusable bounded String.prototype.replace for intrinsic-layout
flagless/g RegExp search values with no match, where replace is the identity
regardless of replacement kind or substitution syntax and the replacement is
never observed. Advances unchanged sirv past name.replace(/\\+/g, ...) in the
FILES key expression to the next measured stop: Function.prototype.bind via
viaCache.bind in the factory return. No match positions, string patterns,
custom exec dispatch, or factory/server/request success claim.

Supported domain:
- Nullish receivers are guest TypeErrors (native control); array/function
  receiver conversion stays guarded; conversion runs through the shared
  toString with Symbol.toPrimitive handling, matching normalize/trim.
- Only intrinsic-layout RegExp search values are admitted: intrinsic RegExp
  prototype, no property-access marks, no own or prototype exec override, no
  unmodeled exec reads. String patterns, custom Symbol.replace and non-RegExp
  objects stop as typed boundaries.
- Only flagless and g layouts reuse the Boolean matcher's no-match answer;
  other flags stop. The Boolean matcher answers whether a match exists but
  must not provide ordered match positions, so any actual match stops as a
  typed boundary rather than fabricating substitutions.
- Registration mirrors the other modeled prototype methods: boundary-marked
  with name/length metadata, removed from the deferred inventory (twelve
  modeled/40 deferred of the pinned 52-name surface).

Specs first: test/string-replace.spec.ts (pinned Node 24.21.0 native controls
for no-match identity incl. $-substitution replacements never observed,
nullish TypeError name; typed boundaries for actual matches, string patterns,
flagged layouts, custom exec). Migrated from measured output: deferred/native
inventories (string-trim.spec.ts, p008 supported list).

Validation (sandbox, Node 24.21.0, PROPHET_NODE_BINARY pinned): full suite
146 suites / 4505 passes / 46 unchanged skips, chunked
--runInBand; typecheck clean.

Remaining gaps: ordered match positions and replacement observation,
Function.prototype.bind (next measured stop), other deferred String APIs.
