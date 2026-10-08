# P002 correction 1 — preserve state at later boundaries

Reviewer tested the first saved source (forEach.ts SHA-256
6b4895064665d922d98681895f07b8aa89df30a5ed19f4e3f02083a34adce5ba)
in a separate worktree. Seven ordinary/symbolic probes pass, but three added
boundary probes fail. Root changed no feature source. Do not finalize full
verification until these are repaired and retained in worker specs.

1. `const a = [1,2]; let seen=0, caught=false; try { a.forEach(function(v,i) {
   seen=seen+1; if(i===0 && flag) a.push(9);
   }); } catch(e) { caught=true; }` with unknown Boolean flag reaches the
   documented unequal-layout boundary at the second visit. Its state currently
   reports seen=0, losing the completed callback; it must retain seen=1, the
   current heap/path knowledge and caught=false. Do not solve unequal layouts
   or narrow this input: retain the honest boundary with its actual prefix.
2. Mark getObjectPrototype().unknownProperties before execution, restore in
   finally, then run `let seen=0, caught=false; try {
   [1,,].forEach(function(){seen=seen+1;}); } catch(e){caught=true;}`.
   Own index zero is safe; the unknown inherited lookup is reached only at
   index one. The boundary currently loses seen=1 and reports seen=0.
   Capture typed stops at the current per-visit context, not the outer call's
   original context. Also inspect continuation of forked leaves: one reached
   stop must not discard a successful/throwing sibling.
3. Set Object.prototype.wellKnownSymbols to a map containing toPrimitiveSymbol
   (restore finally), then run `[1,,].forEach(...)`. This does not affect string
   index HasProperty/Get. The operation must visit index zero and skip the hole,
   not reject due to unrelated symbol slots. Remove the copied whole-symbol-map
   restriction and replace its rejection tests/docs with the actual behavior.
   This was explicitly excluded by the task's algorithm-specific guard rule.

4. The forked continuation issue is independently reproduced too: with unknown
   Object.prototype fields, run `let seen=0; [1,,].forEach(function(){
   seen=seen+1; if(flag) throw 9; });`. It currently returns one outer boundary,
   discarding the thrown sibling. Expect a fork retaining one guest throw9 and
   one unsupported lookup stop, each with seen=1 and its path condition. Added
   this to the independent spec (11 total); single filtered run exit1 in2.769s,
   log /tmp/prophet-p002-independent-sibling.log. The ten filtered-out tests are
   just command filtering, not repository skip declarations.

Independent spec is available read-only at
/Users/netanelgilad/development/prophet-worktrees/review-p002-foreach/test/p002-independent-review.spec.ts
for exact reproductions; do not modify it. Use equivalent regressions in your
owned spec. Log /tmp/prophet-p002-independent-boundaries.log: pinned Node24.21.0,
external 60-second timeout, exit1, 3 failed/7 passed in3.008s.

A one-line wiki index link in docs/wiki/README.md is approved as a documentation
scope addition; no shared runtime ownership expansion is needed for this review.
Keep source frozen only after focused/typecheck pass, then full validation and
programmatically verified evidence. Root will rerun probes independently.
