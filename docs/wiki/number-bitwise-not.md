# Number-domain complement and late primitive admission

First P011 source b920a64 is independently rejected by Astra/high for P011-R1;
correction 1 validation/renewed exact-source acceptance are pending.
First [source/evidence](../agent-tasks/P011-number-bitwise-not/evidence.json) is preserved.
[Correction evidence](../agent-tasks/P011-number-bitwise-not/correction-1-evidence.json) binds the corrected freeze and commands.

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


Correction 1 lesson: a Literal guard does not cover static Property consumers.
Cherow can turn an uncomputed BigInt key into a numeric-named Identifier with
no bigint marker. Inspect every actual key route and original token positions;
recover admission metadata, not a rounded property identity. ObjectExpression
and binding-patterns both need the same checked static-key helper. Do not reject
valid ordinary large Number keys, quoted n-suffixed strings or uncalled bodies.
Transient ranges allow constant endpoint inspection even after CRLF/Unicode/
comments; strip them to preserve ordinary AST shape.

Imperative object builds accumulate after-context outside evaluate's entry
checkpoint. A thrown typed guard must retain after, or prior property/coercion/
heap effects disappear. The shared static helper receives current context and
uses withAnalysisFailureContext; binding calls likewise use current state after
RHS and prior defaults. Native and mixed-branch controls verify this ordering.
The complement helper, operator dispatch and ToNumber factoring need no change.
Preserve first-run logs: optional P011/P009 artifact directories and distinct
P010 review suffixes isolate correction output without changing behavior oracles.
