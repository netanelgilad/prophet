# Bounded Array.prototype.forEach

Question: how do you add a shared `Array.prototype` callback-iteration method
that reads current state after every callback without unbounded host work?

Rule: capture the length once, then re-read presence/value per index from the
current heap and invoke through the shared `invoke` operation with
`bindNormal` composition — never as host JavaScript. Advance normal visits
imperatively so host stack depth stays flat; only genuine forks consume host
recursion. See [the implementation](../../src/array/forEach.ts),
[the boundary record](../array-push.md#shared-bounded-foreach) and
[the specs](../../test/array-foreach.spec.ts). Provisional pending independent
review and root acceptance; the verified source commit is recorded at handoff,
not claimed here.

Semantic traps, each with pinned Node 24.21.0 evidence behind it:

- `HasProperty` observes the prototype chain, but only for absent own indices.
  Prove the intrinsic chain clean exactly then; dense visits never touch it.
  Unknown inherited fields on the shared singletons stop holey iteration
  while dense arrays keep working. String-index lookups never consult
  well-known-symbol slots, so unrelated symbol state stops nothing here
  (unlike a spreadability lookup). Ordinary inherited values are visited, not
  stopped: Node invokes the callback with the inherited value.
- Own presence must be re-checked per visit: callbacks can shrink the array,
  fill holes, append beyond the range or join paths with different lengths.
  A lost element layout after a conditional length change stops honestly
  instead of risking an unclassified indexed read. Typed stops checkpoint the
  current per-visit context, so completed callbacks, heap and path knowledge
  survive on the boundary; each forked leaf retains its own stop position
  beside its siblings.
- forEach performs no constructor/species/spreadable observation and no direct
  writes, so concat's guards there do not apply. Justify each boundary against
  this algorithm's actual lookups/invocations; callback writes are checked by
  the shared write operations when they execute.
- Callability throws even for empty/holey arrays, after the receiver/length
  reads the specification orders first. The callback's return value never
  stops iteration; guest throws do, preserving earlier effects.
- Identical unknown numbers are not provably equal (`NaN !== NaN` even to
  itself). Use `randomNumber()` (finite) for correlation proofs and an
  independent unknown for the mandatory-unknown control.
- A shared host loop must not recurse per visit: 1024-deep continuation
  recursion overflows the host stack. Iterate normal leaves imperatively and
  recurse only into fork continuations.
- Synchronous host work needs an explicit documented cap checked before the
  loop: at most 1024 captured visits per path. Callback-added appends beyond
  the captured range can never extend iteration. The cap bounds per-path host
  work, not total symbolic fork growth.

Limits: ordinary known-layout arrays with the shared Array prototype only;
unknown/segmented/symbolic layouts, generic/boxed receivers and length
coercion, custom prototypes/hooks, sloppy primitive thisArg boxing,
boolean-key/deletion/freezing gaps and over-limit totals all stop. Per-visit
fork recursion and path volume are residual limitations without a typed stop:
only normal visits advance imperatively. Loops and `RegExp` construction
remain separate work; the unchanged sirv factory now waits inside totalist's
directory loop.

Corrections recorded during P002 development: two spec premises were repaired
against native runs (boolean computed keys need general ToPropertyKey
conversion, so `8-12` stays inactive; heap-entry reads are required for
post-mutation lengths, not base-object properties); the first implementation
recursed per visit and overflowed at 1024 depth. Independent review correction 1
then required per-visit boundary checkpoints (later layout/inherited stops
kept losing completed callbacks) and removal of the copied whole-symbol-map
guard, since string-index lookups never consult symbol slots. An empty-array
shortcut does not satisfy this task: real nonempty iteration with
current-state re-reads is required. No scope expansion was needed and no
shared helper changed.
