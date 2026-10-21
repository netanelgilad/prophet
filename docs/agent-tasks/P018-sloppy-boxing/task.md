# P018 — bounded sloppy primitive receiver boxing

Worker: Instinct (sandbox), 2026-10-15. Base: P017 head 7a111fb. Branch
agent/p018-sloppy-boxing.

Outcome: reusable sloppy-mode primitive receiver boxing (ToObject) for guest
function calls. Concrete number/string/boolean receivers box into a fresh
ordinary wrapper whose internal prototype is the ORIGINAL intrinsic prototype
registered at initialization, even after guest reassignment of the
constructor's prototype property. Own writes on the wrapper behave correctly
for the single activation the wrapper survives; reads that miss the wrapper
reach the guarded intrinsic prototype APIs, whose existing unknownProperties
marks keep slot-dependent behavior ([[NumberData]]/[[StringData]]/
[[BooleanData]], valueOf/toString tags) out of fabricated reach. Removes the
host assertion that blocked calling sirv's bound viaCache handler with
thisArg 0. No request/server modeling claim.

Supported domain:
- Only sloppy non-arrow guest functions box; strict functions and arrows pass
  the receiver through untouched (native-matched).
- Nullish receivers keep the existing global-object behavior.
- Wrapper identity is fresh per call: this !== the primitive, typeof this is
  "object", own writes are visible within the activation and never alias a
  later call's receiver.
- Symbolic receiver choices box on each branch and complete; a direct choice
  receiver reaching the implementation stops as a typed boundary (defense in
  depth), as does a receiver type without a registered intrinsic prototype.
- instanceof and constructor/prototype mutation remain guarded legacy host
  assertions (LANG-003); the wrapper's prototype link is verified through the
  guarded prototype's API message, not new metadata claims.

Specs first: test/sloppy-receiver-boxing.spec.ts (pinned Node 24.21.0 native
controls for typeof/identity/own-write/strict/arrow/nullish behavior;
guarded-prototype linkage; symbolic completion). Migrated from measured
output: symbolic-strings.spec.ts (the replaced sloppy String.prototype.slice
now completes with a boxed receiver instead of asserting the gap) and
string-concat.spec.ts (receiver.call(3) boxes into a Number wrapper).

Validation (sandbox, Node 24.21.0, PROPHET_NODE_BINARY pinned): full suite
147 suites / 4512 passes / 46 unchanged skips, chunked --runInBand;
typecheck clean.

Remaining gaps: wrapper slot semantics (wrapper valueOf/toString tags),
instanceof/Symbol.hasInstance modeling, request-path analysis (the bound
viaCache handler now invokes; parse(req) and http modeling remain).
