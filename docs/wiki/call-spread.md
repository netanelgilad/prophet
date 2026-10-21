# Bounded ordinary-array call and new spread

Implemented by Instinct in-sandbox (P020); independent review pending. Task
record: [P020](../agent-tasks/P020-request-spread/task.md); specs:
[call-spread.spec.ts](../../test/call-spread.spec.ts) and
[sirv-request.spec.ts](../../test/sirv-request.spec.ts).

Spread arguments (f(...array), new F(...array)) follow the iterator
protocol, so modeling them is a proof obligation, not a loop: the VM
answers the current elements in index order only when iteration is proven
to be the intrinsic %Array.prototype.values% protocol. That proof requires
an ordinary array (no propertyAccess hooks, unknown fields, custom
prototype or symbol slots), an unmodified Array.prototype → Object.prototype
→ null chain, no symbol state on the intrinsic links, and a known current
length equal to the element structure. Holes yield undefined only after
proving no inherited indexed elements exist within range; symbolic elements
pass by identity; conditional (joined) operands split per branch, matching
concat's operand handling, and callees that fork spread on each path.

Everything else stops as a typed boundary with an exact message: custom
@@iterator hooks (own or replaced on Array.prototype), accessor/exotic
arrays, unknown or symbolic layouts, non-array iterables (strings, Maps,
generators) and non-iterables. Native TypeErrors for non-iterables are
pinned as controls but not fabricated. One operand may contribute at most
1024 elements. Integration additionally caps the whole argument list at 1024
operands/expanded values and 64 spread operands, including empty spreads;
these bounds limit host argument-list work, not guest semantics.

The unchanged consumer advances: sirv's extns.push(...extensions) now
completes on a delivered request, moving the measured stop into toAssume's
uri.charCodeAt trailing-slash probe. Rest parameters, the implicit
arguments object and array-literal spread remain open.
