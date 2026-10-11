# B1 correction 2 — trusted function identity

Root reviewed source88bc034 and reran the complete worker index spec plus18
independent root cases at review-only commit6168e08 (byte-identical src).
37pass/1fail, 3.73s, exit1; `/tmp/prophet-p006-b1-r1-review.log`.
The original three findings are fixed, including affine subtraction and unsafe
intermediate/noninteger controls. One added trust-boundary case still fails.

`hasDefaultArrayPrototypeIndexedLookup` compares the hook container object with
`defaultIndexedLookup`. Mutating that object's `read` property in place also
mutates `defaultIndexedLookup.read`, while the object identity remains equal.
An uncertain `a[1]` read then fabricates absence instead of retaining a boundary.
The exact added regression is in root's existing review spec, named
"mutating the default prototype hook in place also invalidates its trust".

Keep a private stable reference to the actual original read function and validate
it before relying on its behavior. Object identity alone is insufficient; do not
freeze the input metadata merely to make the mutation test throw. Retain the
replacement-object and in-place replacement tests, with finally restoration.
Ownership remains unchanged. Update focused tests/typecheck and exact-source
evidence, commit, and stop for final B1 review; no B2 or push yet.
