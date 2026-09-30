# Repository workflow

Use the GitHub PR stack recorded in [docs/stack.md](docs/stack.md). Treat its latest
branch as the development base. For the next feature, create a new branch from
the tip, implement and validate it, then open a PR targeting that predecessor.
Update the stack record as layers are added or merged.

Develop toward full Test262 coverage and advanced symbolic evaluation by adding
specs and extending the shared VM to satisfy them. Concrete execution remains a
subset of symbolic execution; preserve JavaScript semantics in both.

Keep behavior examples in `test/*.spec.ts`, with interpreted source, explicit
input assumptions, and assertions together. Run individual spec files through
the existing Jest command (for example,
`node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/unknown-length.spec.ts`).
Do not create standalone example programs, custom example runners, or npm
scripts for individual examples. Use helpers only when specs share real setup.

Start each feature with specs for its intended behavior and meaningful boundary
cases. For language semantics, activate relevant complete, unmodified Test262
cases and implement required runner support. For symbolic reasoning, assert both
valid proofs and results that must remain unknown; use independent concrete
checks when useful. Implement reusable operations and inference rules, never
recognition of a sample function's name or source.

Treat narrowed input domains, unsupported-analysis errors, and skipped tests as
explicit implementation gaps. Do not silently narrow an input to make a proof
pass. When expanding a supported case, replace its rejection spec with assertions
for the actual language behavior and symbolic result. Full Test262 conformance
is the goal, not a claim justified by the currently selected corpus.

Run affected specs during development, then the full suite and typecheck before
publishing each PR. See the README's spec-first workflow for current examples
and proof limitations.

When sharing screenshots or other local images in chat, attach and render the
image content inline; do not provide only a local file link.
