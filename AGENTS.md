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

Host APIs need their own compatibility specs. CommonJS/`require` and Node APIs
are outside Test262: follow a pinned Node release's behavior, use suitable
complete upstream cases, and compare local fixture specs with that Node runtime.
Keep host coverage and language coverage distinct, and record unsupported cases.
See [the proof roadmap](docs/roadmap.md) for the module-loader acceptance criteria
and the goal of modeling side-effecting functions through a Node `http` server.
Start at Node host APIs: interpret the application's module imports, server
creation, listener registration, and listen call, then deliver modeled request
events through the registered callbacks using the shared VM. Express and its
dependencies are later ordinary interpreted JavaScript; do not introduce
Express-specific VM models or infer routing/body parsing from a handler test.
External effects must preserve path conditions, ordering, state changes, return
values, and failures. Validate models against independent concrete behavior;
do not execute real external writes during symbolic exploration or silently
treat unknown effects as pure. Direct handler tests are a stepping stone, not
evidence that Node HTTP setup/dispatch or Express itself has been analyzed.

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
