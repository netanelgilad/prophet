# Bounded Array.prototype.concat

Question: how do you add a shared `Array.prototype` method that observes
constructor/species/spread state without silently ignoring it?

Rule: implement the ordinary intrinsic case completely and stop with a typed
unsupported boundary before any unmodeled observable lookup or effect. The
call machinery already evaluates the receiver, method and arguments
left-to-right with current heap state; the method itself must re-read current
elements/length (never initial snapshots), branch conditional operands with
`withValue` so each path extends its own result copy, and never mutate inputs.
See [the implementation](../../src/array/concat.ts), [the boundary record](../array-push.md)
and [the specs](../../test/array-concat.spec.ts). Verified at P001,
2026-10-07 (pending review).

Semantic traps, each with pinned Node 24.21.0 evidence behind it:

- `HasProperty` observes the prototype chain. A hole whose index may resolve
  to an inherited indexed property must stop: Node materializes the inherited
  value as an *own* result property (`Object.prototype[0] = 7;
  [, 2].concat([3])` yields own `0 === 7`). Reuse the shared
  `assertNoInheritedArrayElements` guard per operand instead of copying holes
  blindly.
- Holes still advance the result index. `[0].concat([, ,])` with
  `Object.prototype[1] = 7` puts `7` at result index 2 (own), leaving index 1
  absent. Assert exact indices, not just values.
- Identical unknown numbers are not provably equal (`NaN !== NaN` even to
  itself). `resolveEquality` needs a `notNaN` fact, so a bare `ESNumber()`
  element cannot prove `out[0] === value`; use `randomNumber()` (finite) for
  correlation proofs and an independent unknown for the mandatory-unknown
  control.
- `Function.prototype` carries an internal `hasInstance` slot, so any function
  operand fails a whole-slot absence check. Function (and other non-plain)
  operands stay explicit boundaries; plain objects append by reference only
  after proving an ordinary slot-free prototype chain.
- A shared host accumulator must be copied per conditional branch. Threading
  one host array through `withValue` continuations leaks one sibling's
  elements into the other; copy before extending.
- Synchronous host loops need an explicit documented element cap checked
  before any copying work, cumulatively across operands. A maximum-length
  operand otherwise passes the overflow check and iterates billions of times
  outside the VM evaluation budget. P001 caps at 1024 elements as an analysis
  boundary, never a language throw, preserving all input state.

Limits: ordinary known-layout arrays, primitives and plain objects only;
unknown/segmented/symbolic layouts, generic/boxed receivers, constructor
shadows and species/spreadable slots, custom prototypes/hooks/partial hosts,
descriptors and over-limit totals all stop. `forEach`, loops and RegExp
matching remain separate work; the unchanged sirv factory now waits at
`forEach`.

Corrections recorded during P001 review: the cap above was a required
review addition (the first implementation looped to `elements.length`
unchecked); three spec premises were repaired against native runs (nested
appends see receiver plus both arguments, hole index advancement, unknown
self-equality). No scope expansion was needed and no shared helper changed.
