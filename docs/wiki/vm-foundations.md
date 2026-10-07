# VM foundations and recurring review traps

Baseline verified at `c47246d`, 2026-10-07: 119 suites / 2,851 passing tests /
46 historical skips; full typecheck and CI passed. These are selected tests, not
full ECMAScript/Node or all-path coverage.

- Concrete values are a subset of symbolic values. A function retains code and
  lexical scope; it does not imply its callback has run. See [runtime contract](../symbolic-runtime.md).
- Read current properties/elements through the persistent heap helpers in
  [Heap.ts](../../src/execution-context/Heap.ts). Mutating an object's initial
  property table during execution can corrupt earlier states or sibling branches.
- A hole and an own undefined array element differ. Prototype numeric properties
  may fill a hole. New shared Array.prototype exposed incorrect legacy
  slice/join/reverse assumptions; [the guard and evidence](../array-push.md)
  preserve explicit stops rather than fabricated answers.
- Array methods can observe constructor/species/spreading/lookup state. A bounded
  ordinary-array implementation must reject unknown observable behavior, not
  ignore it. Public Symbols, descriptors and many constructors remain incomplete.
- Use shared branching/completion operations. Running continuations after joining
  provider choices once lost event correlations; [event specs](../../test/external-event-sequences.spec.ts)
  now retain each selected timeline before the join.
- A classified execution boundary preserves unfinished work and skips guest
  catch/finally. A JavaScript throw is a different completion. See
  [boundary contract](../execution-boundaries.md). Unexpected engine failures
  must not be relabeled as proven guest behavior.
- A native oracle independently checks concrete semantics under pinned Node
  24.21.0. It must not execute the symbolic target as an implementation shortcut.
  Complete Test262 cases run through Prophet, including their actual harness.
- Current real-package progress: pico has bounded automatic OPTIONS/405 and
  unfinished open-URL GET/HEAD; sirv imports, then its factory stops at concat.
  The next task must replace the rejection with actual reusable behavior and
  retain the next reached boundary. Package sources stay byte-identical.
