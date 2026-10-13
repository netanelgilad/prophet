# Number-domain complement and late primitive admission

P011 worker validation; independent Astra/high exact-source review pending.
Source/run/hash binding will be in [evidence](../agent-tasks/P011-number-bitwise-not/evidence.json).

Unary coercion can branch/throw; put only the new operation in an effectful unary
map analogous to effectful binary dispatch. Preserve existing pure unary rules.
Factor ordinary number-hint lookup/call ordering with a caller-supplied primitive
finish, retaining ToNumber's original behavior. ToNumeric admits BigInt; do not
feed late unsupported primitives from valueOf/toString into legacy ToNumber,
invent guest TypeError, or guess an integer. An initial object tag cannot predict
its final primitive kind. Cherow's empty-string bigint marker is still present:
check property presence at reached literal evaluation before its numeric field.

NaN/infinities/signed zero become int32 zero; finite fractions truncate toward
zero, negative remainders require mathematical modulo, then signed interpretation
and -signed-1 complement. Native controls include wrap edges and large floats.
Numeric strings have a separate before-scan cap after prior user effects; mapping
constant work says nothing about coercion, prototypes, branch/store or parser costs.

CallExpressionResolver reads a member callee directly rather than evaluating a
separate MemberExpression frame. The actual substring lookup frame is therefore
CallExpression; ++idx has not run. Verify real CLI frames and retained state rather
than predicting the next source token. Keep every filesystem outcome, including
EMFILE, and every prior effect history. Earlier guest throws and unsupported
operands must bypass conversion, while supported ~ now reaches guest finally.

Initial native matrix log exposed a quoting bug in a generated failure message;
corrected native controls passed before production edits. BigInt whole-file trials
then exposed the pre-existing numeric literal-field bug: five new red controls
failed before the reached-marker guard was added. A first sirv checkpoint
rerun exposed the frame-shape assumption; corrected to actual evaluator structure.
Retain all failed logs and classify prefreeze runs from metadata, including
untracked specs and any edits overlapping development runs. A single source
freeze precedes full regression/typecheck/audit; evidence is committed separately.

See [boundary](../number-bitwise-not.md), [implementation](../../src/number/bitwise-not.ts),
[specs](../../test/bitwise-not.spec.ts) and [upstream candidates](../agent-tasks/P011-number-bitwise-not/upstream-candidates.md).
