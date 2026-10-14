# Bounded sloppy primitive receiver boxing

Implemented by Instinct in-sandbox on the P017 head; full suite 147/4512/46skip
and typecheck green. See [specs](../../test/sloppy-receiver-boxing.spec.ts) and
[task](../agent-tasks/P018-sloppy-boxing/task.md).

Sloppy-mode [[Call]] boxes a primitive this value through ToObject. Model only
what is provable without internal-slot machinery: the wrapper is a fresh
ordinary object per call whose internal prototype is the ORIGINAL intrinsic
prototype, captured in a registration map at intrinsic initialization
(sloppyBoxPrototypes in src/Function/boxing.ts) so guest reassignment of
Number.prototype cannot divert it - and so Function.ts never imports the
intrinsic modules across the evaluator initialization cycle. Own writes on
the wrapper are ordinary object writes, correct for the single activation the
wrapper survives. Reads that miss the wrapper reach the guarded intrinsic
prototype APIs: their unknownProperties marks turn slot-dependent questions
(wrapper valueOf, toString tags) into existing guarded behavior instead of
fabricated answers. typeof this is "object", this never identity-equals its
primitive, strict functions and arrows pass receivers through untouched, and
nullish receivers keep the global-object rule. Symbolic receiver choices box
per branch and complete.

Measured consequence: calling sirv's bound viaCache handler with thisArg 0 no
longer hits the "Sloppy receiver boxing is not yet supported" host assertion;
request-path analysis (parse(req), http modeling) is the remaining wall.
