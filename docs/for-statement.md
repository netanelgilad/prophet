# Shared bounded ForStatement

One reusable loop driver (`src/loops/for.ts`) implements ordinary
`for (init; test; update)` with absent clauses and unlabeled break/continue,
following the ECMA ForStatement evaluation, ForBodyEvaluation,
CreatePerIterationEnvironment and LoopContinues algorithms. Initialization
runs once; the test guards each body; the update runs after a normal body or
an applicable continue, never after break/return/throw. An omitted test is
true. Nested loops consume their own unlabeled jumps: the driver converts its
own break leaves to normal completion and never leaks jump completions.
Statement completion values keep the existing residual (loops complete with
`Undefined`); full eval-value semantics remain out of scope under LANG-003.

The parser rejects stray jumps before evaluation; valid labeled statements
parse, then stop at the unsupported labeled-statement resolver or the labeled
jump guard. Six complete parse-negative Test262 cases pin the malformed-head
and stray-jump parser boundaries (`A7_T1/A8_T1`, `decl-let`, `decl-const`,
`break/A1_T1`, `continue/A1_T1`). Labeled jumps inside supported syntax stop
explicitly as unsupported; while, do-while, for-in/of and switch
remain honest resolver gaps under LANG-001. Loop heads accept identifier and
supported object binding patterns; array/rest patterns stop explicitly before
any binding or effect, reusing the shared pattern helpers without adding new
destructuring algorithms.

## Iteration environments

`var` keeps its existing hoisted function-scope identity. `let`/`const`
initialize in a fresh loop scope with TDZ, stay invisible outside, and restore
the outer scope after guest completion; stopped boundaries skip that cleanup
and retain the actual unfinished context. `let` copies fresh sibling binding
cells before the first test and before each update, so initialization, body
and update closures observe exactly their own environments, and update
assignments never mutate a prior iteration's cells. `const` is not copied;
illegal writes throw through the existing bindings. Twenty complete behavioral
Test262 files cover ordering, throwing clauses, var heads, test coercion, eval
with break, unlabeled continue and per-iteration environments
(`scope-body-lex-boundary`); [specs](../test/for-statement.spec.ts) add TDZ,
shadowing, escaping closures, nested jumps, try/finally composition,
conditional jumps, heaps, effects and budgets, all with pinned Node controls.

## Completion composition

Break/continue are interpreted abrupt completions (`BreakValue`,
`ContinueValue`), not engine failures. The shared audit covers every
normal/abrupt check the new kinds reach: merging forks a jump against any
other completion kind (matching jumps merge contexts; a jump is never
select-joined into a value), statement sequences stop after jumps, the
generator bridge stops on jumps, catches handle guest throws only, and a
finally jump replaces the prior completion while a normal finally preserves
it. Function and program boundaries need no jump conversion: the parser
guarantees no jump escapes its loop, and the driver converts its own breaks
before returning.

## Budgets and boundaries

Ordinary iterations advance through an explicit host frontier loop, never
through a recursive call per iteration; only fork nesting consumes host
recursion. Each active path carries its own remaining ordinary-body-entry
count in persistent context state (1024 per path, saved and restored across
nested loops), and a shared visit counter caps frontier visits per loop
evaluation: once 8192 visits have run, no further walk starts and all
remaining actives stop together in one pass. A single walk's own visits can
overshoot the cap, bounded by the tree at firing time, so 8192 is the
between-walks checkpoint, not a strict total-visit ceiling. Ordinary
1024-iteration paths fit with margin; multiplying shapes stop early. Reaching
either cap retains the actual unfinished context as a typed budget boundary
beside completed siblings; a cap never implies program termination. Initialization, test, body and update stops each
checkpoint their own reached step with current heap/bindings/effects and path
knowledge, while completed and thrown siblings continue. Unknown-bound loops
retain one exit leaf per explored iteration, so the shared cap fires on
traversal growth; merges, joins, allocation and host-stack depth stay
separate residuals under SYM-004, as does coalescing same-phase
continuations. Disjunctive membership over a loop-carried selection chain
(`m === d[0] || ...`) is now proved by the separately scoped P005
selection-membership refinement (infeasible-path refutation within an
explicit leaf bound); the tested five-leaf order remains unknown under
SYM-001.

## P006 representation checkpoint

Symbolic dense numeric arrays now support a guarded integer index read and
regions ending at the actual snapshot length. Bounded exact integer offsets
relate `slice(c)[i]` to `a[i+c]` only when operands and intermediate results
stay within safe integer bounds; the index must still be proved present. Repeated reads retain position
identity across slices, and region facts apply only after the index is proved
inside the region. Custom or unmodeled lookup and unproved presence stop at an
analysis boundary. See the [index specs](../test/symbolic-array-index.spec.ts)
and [P006 design](agent-tasks/P006-unknown-loop/design.md).

## P006 bounded unknown-length verifier

At the first reached test of a function-local loop, after the real initializer
and per-iteration copy, the driver may verify a dense finite numeric array
loop whose header is
`i < a.length`, whose index starts at one, and whose candidate carried value
is the real cached `a[0]`. A private VM run checks the actual test, arbitrary
body, lexical copy and update, all pre-existing binding writes, exact integer
`i' = i + 1`, and the false exit at `i = length`. Candidate prefix order,
membership, finite and range facts are removed until all remaining facts are
inductive. Readonly aliases remain unchanged, and a verified identity
transition preserves the actual initialized binding. One failed candidate
does not suppress a later eligible binding. Only then does the driver publish
the final carried value and observable index binding. The full uint32 unknown-length range needs no length
enumeration. The [loop specs](../test/unknown-length-loop.spec.ts) include
finite nonconstant elements, dual reducers and countermodels.

This proof is limited to one carried value, a pure straight-line/conditional
body without calls or abrupt completion, an immutable snapshot and a provable
exact safe-integer successor. Other forms run through ordinary bounded
execution from the reached state, preserving prior effects and any unfinished
boundary. The proof attempt has private array-read maps, heap, environments and
evaluation budget; failed attempts publish none of those changes. Top-level
loops are currently in this fallback domain. Existing
recursive function summaries and their cache are separate and unchanged.
