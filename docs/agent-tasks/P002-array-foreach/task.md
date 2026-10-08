# P002 — Shared bounded Array.prototype.forEach

State: scoped candidate, not launched. Requires accepted P001 integration first.
Worker: Atlas OpenCode Muse Spark 1.3, build/high. Base/worktree/thread will be
bound in the sent prompt and ledger before execution. One worker, full review.

## Outcome and ownership

Move unchanged sirv's default factory past its reached forEach call using a
reusable VM operation. Implement real callback iteration, including nonempty
arrays; an empty-array shortcut alone does not satisfy this task. Retain the
actual next unsupported operation and state. Do not implement loops, RegExp,
filesystem metadata, descriptors, generic receivers or package-specific logic.

Own src/array/forEach.ts (new), minimal registration in src/array/prototype.ts,
test/array-foreach.spec.ts (new), the sirv progress assertion in
test/sirv-target.spec.ts, complete-case selection in test/test262.spec.ts,
docs/array-push.md, docs/sirv-target.md, docs/implementation-gaps.md,
test/test262/README.md, docs/wiki/array-foreach.md and task evidence.json.
Read the playbook, wiki foundations and P001 corrections before writing specs.
Apply the lessons, not concat's algorithm-specific guards: forEach does not
consult constructor/species/spreadability. Justify every new rejection against
the property lookup or invocation that this algorithm actually reaches.
Propose any shared helper/ownership expansion before editing outside these paths.
No runner/fixture/dependency/CI/parser/solver/CLI-schema changes or pushes.

## Required semantics and evidence

Read the ECMAScript forEach algorithm, the repository's current heap/member read,
hasProperty, invoke, bindNormal, withValue and completion machinery. Avoid native
generator continuations that cannot resume symbolic forks. Reuse VM invocation;
never execute interpreted callbacks as host JavaScript.

The initial domain is ordinary arrays with known bounded length/layout. Keep
unknown lengths/layouts and custom unmodeled lookup as explicit analysis boundaries.
Implement and test:

- Capture the iteration length once, but read each visited property's current
  presence/value after prior callbacks. Invoke in increasing index order with
  value, index and original array identity. Return undefined regardless of callback
  return values; do not accidentally stop on an ordinary callback return.
- Skip holes only when absence is established. Own undefined is visited. Handle
  ordinary inherited values through shared operations or stop honestly at the
  reached lookup, preserving earlier effects. Unknown inherited state cannot be
  assumed absent. Recheck state after callbacks rather than proving it once.
- Callback writes to later elements are visible; additions inside the captured
  range can be visited, appended elements beyond that range are not. Preserve
  aliases, branch-local heap snapshots and external/closure effects.
- Use ordinary thisArg and strict/sloppy/arrow callback rules already supported
  by shared invocation. Callability must be checked even for empty/holey arrays;
  known noncallable callbacks and nullish receivers throw actual TypeError, with
  honest unknown messages where exact diagnostics are not modeled.
- Guest throws stop later calls and preserve earlier effects. Typed unsupported
  and budget completions stay distinct from guest throws. Symbolic normal/throw
  and normal/unsupported siblings survive with their path conditions.
- Symbolic elements, receiver/callback choices and current-element mutations
  remain correlated. Include a true proof and a genuine unresolved comparison;
  check any numeric identity assumptions against NaN semantics.
- Bound synchronous host work before scans/copies/recursion. Test safe limits
  and just-over-limit rejection, huge sparse lengths, and callback-added work.
  A practical limit is an analysis boundary, not a JavaScript input restriction.
- Register shared inherited metadata: name forEach, length 1, nonconstructible.

Use pinned Node 24.21.0 to independently validate all concrete expectations first.
Add red specs and classify their failures before implementation. Choose complete
unmodified upstream Test262 cases that fit the implementation; inspect metadata
and native results, do not trim files or modify the runner to fake missing features.
For example, the pinned forEach directory contains iteration/order and callback
cases, but many require unsupported descriptors or generic receivers. Select
from actual contents, not filenames alone. Record remaining candidates accurately.

Default sirv uses an empty ignores option array, then enters totalist. Keep all
package bytes unchanged and assert the actual reached source/state/boundary;
do not claim factory or request handling completes unless the result proves it.
Do not broaden this task merely to pass a later package boundary.

## Verification and handoff

Use the pinned executable for Yarn and PROPHET_NODE_BINARY. During development run
test/array-foreach.spec.ts plus affected concat/push/sirv/Test262/runner specs.
Before handoff commit code, then run the full suite and typecheck with complete
logs and actual exit status. Use external timeouts for exploratory stress tests.
Reconcile every new guard/domain/assumption against stable gap IDs, all documented
scans, and the full historical skipped-file inventory. Update boundary docs/wiki.

Follow the playbook evidence format: exact tested commit, commands/status/counts,
log paths and SHA-256, source diff, residual gaps, concrete next target boundary,
corrections and wiki contribution. Add evidence-only commit after verification.
Generate source hashes from the tested commit and log hashes from actual files;
re-read the saved JSON and assert every hash matches before claiming validation.
Stop editing for full review; root returns corrections instead of implementing them.
