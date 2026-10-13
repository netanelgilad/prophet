# P008 correction 1 — truthful partial String surface and superseded checkpoint

Root authorizes this bounded correction under the existing trim/graph-honesty goal.
The earlier prohibition on P007 spec edits has one exception: update only the
superseded trim rejection test in test/regexp-test.spec.ts. Keep its native trim
replacement assertion; assert the newly supported branch's actual result/effects.
Add a distinct next unsupported toLowerCase lookup case if useful. Do not merely
remove assertions or move every trim check to another name. P007 production and
independent probes remain read-only. The proposed patch is a starting diagnosis,
not approval to weaken expectations.

Root independently reproduced parent-disclosed Grok concerns at source0d3b278:
- typeof String.prototype.trimEnd === "function" is incorrectly false (Node true).
- typeof "x".padStart === "function" is incorrectly false (Node true).
- Object.prototype.hasOwnProperty.call(String.prototype,"trimEnd") incorrectly
  returns false (Node true).
- Object.keys(String.prototype.trim) and Object.keys(String.prototype) raise
  legacy host errors, rather than retaining typed boundaries/siblings.
The root native-backed probe/log is in the separate review tree
 test/p008-root-boundary-probes.spec.ts and /tmp/prophet-p008-root-boundary-probes.log.
The sixth `in` probe establishes a pre-existing unimplemented BinaryOperator
host assertion; defer that language feature under LANG-001. Grok's claimed false
`in` result is not confirmed. Do not implement or broaden that operator here.

Implement a reusable truthful partial String prototype model, following existing
partial-intrinsic patterns, rather than another one-name AST patch. Supported
names/current own replacements remain usable; unmodeled member presence/reads
cannot masquerade as concrete absence or take a fake fallback. Own inspection,
descriptor/enumeration operations unsupported by this representation need typed
boundaries preserving earlier state and normal siblings. Mark the newly exposed
trim function metadata consistently as needed. Do not implement trimStart,
trimEnd,padStart,toLowerCase,descriptors or the complete String library.

Owned scope additionally permits minimal shared presence/own-inspection guard
integration in src/execution-context/Heap.ts, src/Object/ObjectConstructor.ts or
src/Object/prototype.ts if the actual call graph requires it. Every changed
shared line receives full semantic review. Prefer existing generic partial-host
helpers. Closed ordinary objects and other supported builtin keys must retain
correct true/false behavior; known modeled String fields and method replacements
must remain precise. New conservative exclusions and existing legacy residuals
must be explicit in stable gap docs; no public report/schema additions.

Add red/native controls for truthful reads/presence, no fake fallback, conversion
and prefix effects, symbolic completed/boundary siblings, own metadata inspection,
known names/replacements and ordinary-object negative controls. Preserve source
and expectations of existing unrelated P007 tests. Review may return further
material findings; batch them after its source-bound report, not speculative
changes. Reuse current task worktree/model gpt-6-astra/high. Commit a new source,
freeze, run full suite/typecheck/audit with900s cap and exact hash-bound evidence;
keep prior failed handoff/history. Stop at complete correction handoff. Root will
align stack only once writer is frozen; no pushes/merges or new workers.
