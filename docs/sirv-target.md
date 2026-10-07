# Second real application target: sirv

After pico's initial CLI/event integration, grow the same VM against
[`sirv` 3.0.2](https://github.com/lukeed/sirv/tree/1135207e92c40354543cbd15c763c7a61d79d432).
It serves static files through Node HTTP and includes real runtime dependencies.
Its cached/default and development modes exercise different filesystem behavior;
its original code also needs binding patterns, loops, ordinary array/string
operations, dates, regular expressions and streams. These are reusable runtime
capabilities, not a reason to add a sirv-specific model.

The complete immutable [fixture and provenance](../test/fixtures/sirv-3.0.2/PROVENANCE.md)
pin sirv plus mrmime 2.0.1, totalist 3.0.1 and @polka/url 1.0.0-next.29.
[Specs](../test/sirv-target.spec.ts) verify all published bytes and obtain native
GET, HEAD and missing-file reference behavior from pinned Node. The current
Prophet run resolves conditional exports and imports all four unchanged packages
through the assembled CLI environment. The export is the actual interpreted
factory, with no filesystem or HTTP operations during import. The real CLI
subprocess now serializes this import and its nested function definitions into
the ordinary graph. [RegExp literal values](regexp-literals.md) allocate fresh
VM state without native objects leaking from retained ASTs. Calling the public
factory with a directory evaluates two regular-expression literals and appends
them through the shared persistent Array.push intrinsic. It then reaches the
explicit Array.concat boundary in default ignores setup; the retained unfinished
state contains both regex identities. Import success is not server startup or
request coverage. Runtime models preserve querystring identity
and provide shared bounded directory enumeration, without pretending the factory
has reached those later operations.

## Incremental acceptance

1. Import the complete unchanged dependency graph through normal CommonJS
   resolution. Preserve package source identity and initialization effects;
   keep reached unsupported builtins explicit.
2. Interpret the public factory and a Node HTTP setup from a spec-defined caller.
   Keep default cache initialization and development options distinct. Reach
   waiting startup with conditional binding outcomes and current listener state.
3. Reproduce the native readable-file, HEAD and missing-file cases with declared
   environment facts, then generalize request/file choices. Preserve failures,
   unknown URLs, asynchronous reads/streaming and unfinished responses.
4. Expand event histories and filesystem/resource alternatives, asking generic
   questions about escaping exceptions and state/effects. Keep conclusions
   relative to the exact input domain and bound. Larger dependency graphs and
   consumer security policies follow the same VM architecture.

Continue pico regression coverage in parallel. Do not switch a rejection to a
successful assertion until its actual generic semantics are supported; do not
trim package code, suppress a dependency, replace stream output with invented
bytes, or equate these concrete references with all-path proofs. Track residuals
in LANG-001, CJS-001, FS-001, HTTP-008, TARGET-001 and TARGET-002 in the
[implementation backlog](implementation-gaps.md); add precise IDs if those groups
cannot describe a newly reached gap.
