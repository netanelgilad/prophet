# P037 root review and validation

Accepted implementation `a7ef378391a41cba873ad05bf0b24880defb37c2` in the
[program identity domain](../../program-identities.md). Root read the complete
new publisher, acquisition/main diffs, compatibility expectation updates and
core/integration/independent specs. The [independent review](independent-review.md)
found no remaining actionable defect; its source hashes match this commit.

## Evidence and corrections

- Core spec-first red was missing the builder module: suite-load failure and
  zero executed assertions, not an observed semantic failure. The first real CLI
  integration red did execute: normal existing graph, missing roots.program.
- Core affected run: four suites/62 passes. Typecheck caught the old compiler's
  Readonly<Map> iterator typing; returning the same map after Object.freeze fixed
  typing without changing runtime behavior. Final core checks/typecheck passed.
- Independent first attempt was a reviewer Babel incompatibility with `as const`,
  zero assertions, with production already present. It is not semantic red
  evidence. Corrected independent suite: five passes, external45-second watchdog,
  stable source hashes. Boundary byte accounting includes astral Unicode,
  repeated labels, all digests/kinds and exact4MiB versus one-byte overflow.
- Eleven real CLI scenarios pass: nested package/helper/JSON/manifest identities,
  missing probes, exact BOM/multibyte byte hashes/lengths, entry aliases, P036
  origin-to-source lookup, acquisition union versus unexecuted modules,
  normal/guestthrow/typedpartial/legacy stops, failed positive-probe reads and
  no-graph invocation/publication errors. 4096 args pass and4097 reject.
- Root corrected a comment from emitted bytes to UTF-8 metadata bytes: JSON
  escaping/container syntax can expand wire output. No algorithm changed.
- Final full suite:177 suites/5262 passed/46 historical skips; typecheck exit0,
  pinned Node24.21.0. Exact commands/durations/log hashes in evidence.json.
- Four documented scans rerun. New publication validation/cap failure helper
  and ordinary immutable-map mutation guard reconciled under REPORT-001,
  CJS-001, SYM-004 and SECURITY-001/002. Test262 remains484 complete files/
  959 variants,43 parse-negative files/85 variants and46 historical skips;
  complete source hashes/skip inventory retained. No selection changed.

No source text is read by publication and no new acquisition occurs there.
The public snapshot copies mutable native inputs and preserves the entry alias.
Only this projection is bounded; existing read/parser/VM/general graph resources
remain open. Local identity is not package/lockfile integrity or import execution
on all paths. No stable gap closes and no native-language compatibility expansion
or model trust promotion is claimed.

## Publication gate

Exact-candidate CI must pass before master fast-forward/push. Preserve the19
unrelated owner files and verify the remote ref after publication. The owner
already authorized publication; root remains responsible for integration.
