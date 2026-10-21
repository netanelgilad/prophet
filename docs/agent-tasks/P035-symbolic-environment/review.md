# P035 review

## Design round 1 — 2026-10-21

Worker: Atlas OpenCode `opencode/longcat-2.5-preview-free`, build/high,
`ses_ea0c20abbffetX6Z32B2DDV7Bl`. Design-only pilot; no implementation trust
promotion. Reviewed the complete first design and relevant CLI acquisition,
graph encoder, HTTP provider, external-event scheduler, symbolic selection and
original pico source. No production or test changes existed at review.

Decision: **revise design before implementation**. The expression/template
approach and bounded scope are suitable, but the following must be corrected.
These are design findings, not escaped implementation defects.

1. **Remove the native arrival counter and ordinal argument.** A counter in a
   model closure advances during exploration of sibling alternatives, not along
   one modeled timeline. One model instance also serves multiple servers. v1
   needs a zero-argument input factory, called only on a selected arrival branch;
   each invocation creates fresh inline values and reuses shared references.
   The same template applies to every eligible server and every arrival. There
   is no per-server or per-history ordinal in v1. Future ordinal-sensitive input
   needs persistent branch state. Fresh identities may differ between explored
   siblings; no semantic input may depend on traversal order. State explicitly
   that two-event exploration can invoke the factory more than twice overall.

2. **Retain the complete declared environment in actual graph state.** Merely
   constructing VM values does not put them in the heap. `FileExecution.input`
   is not serialized by `main`. An unused named value, a request template with
   `maxEvents=0`, and the file identity would currently disappear. Add an
   ordinary runtime-owned global host slot linking the shared value Map, the
   validated request-domain data and structured file identity (resolved path,
   byte SHA-256, schema version). Link injected filesystem facts to the same VM
   objects. Define that concrete record shape in the design. The existing graph
   encoder supports Maps and plain records; this needs no serializer change or
   policy/report envelope. These are actual declared state/provenance facts,
   not limitation prose. Test aliases in initial/current serialized graph,
   unused values, template retention without arrivals, and fresh arrival values.
   Do not claim a resumable snapshot or graph round trip without a decoder.

3. **Make validation and resource bounds executable.** State a bounded read
   strategy before allocation (regular-file checks, nonblocking open, capped
   reads, descriptor close, invalid UTF-8 and detected file changes), rather
   than reading an unbounded file before checking its length. Name how strict
   duplicate-key parsing and nesting limits work before recursive descent.
   Validate all nested key sets and every named definition, even unused refs
   and branches behind a concrete condition. Bound reference edges and expanded
   dependency depth as well as syntactic depth. A count of 64 selects is not a
   bound on expanded work: a small DAG can repeat subgraphs exponentially.
   Use memoized shared-value compilation and a saturating structural leaf/work
   bound across refs/selects before calling `selectValue`. Per-arrival template
   work must also be bounded. Give exact budget rules and accepted/rejected
   boundary tests, including forward refs, indirect cycles, deep ref chains,
   repeated DAG fanout, and empty expressions. Keep bounds described as rejected
   authoring domains, never silent narrowing of an accepted input.

4. **Keep the schema genuinely bounded.** Remove reserved-for-future number
   expressions; this task is Boolean/string values only. Reject unknown keys at
   every object level. Document the meaning of empty `http`/`filesystem`
   sections and missing individual request fields (both method/url required
   when `requests` exists is acceptable). Distinguish raw NUL bytes from escaped
   U+0000 string data; do not impose accidental JavaScript string restrictions.
   Clarify handling of escaped unpaired UTF-16 surrogates. Input-file bytes must
   be valid UTF-8, while JavaScript strings are UTF-16. State header-name safety
   through null-prototype records, including legal token names such as
   `constructor`. Remove speculative future path restrictions: path semantics
   are a future design, and `process.env` values need not be canonical paths.

5. **Correct the acceptance matrix against the original fixture and VM.**
   `image.jpg` is binary; current acquisition accepts UTF-8 contents only. Use
   `otherfile.html`/`defaultfile.html` for successful reads and retain a binary
   acquisition boundary separately if exercised. Descriptor availability adds
   EMFILE, not EACCES by itself. Missing default-file ENOENT is a modeled thrown
   program error, not an unsupported-analysis leaf; never expect the unreachable
   `data instanceof Error` 500 branch. Test that real distinction and absence
   of a fabricated response. For the missing-index case, copy the entire pinned
   package unchanged into a temporary fixture and add an empty data directory;
   retain/verify all original program bytes. Validate source behavior against
   existing pinned native controls before labeling red tests missing features.

6. **Cover correlation and scheduling rather than only object construction.**
   Include shared Boolean -> descriptor fact + URL/method selection with
   infeasible combinations excluded; fresh per-arrival finite `/arm` or `/fire`
   choices reaching a second-event-only throw; shared URL reference unable to
   fabricate an arm-then-fire sequence; two eligible servers with the same
   template, eligibility/listener mutation and shorter histories retained;
   unknown-string unsupported siblings alongside completed paths. These can be
   focused interpreted sources inside specs plus the required unchanged-pico
   actual CLI subprocess tests. Native controls are benign fixture only.

7. **Order validation before the actual first target observation.** `runFile`
   currently begins with target `realpathSync`, before `captureModuleSources`.
   Environment file validation/materialization must precede that too. Test
   malformed environment with a nonexistent target and no graph on stdout.

Revise `design.md` only, then stop. No production/test implementation is approved
yet. A second design review will authorize the spec-first implementation if the
above is resolved. The root review checklist is independent; disclosed cases
above are no longer hidden holdouts for subsequent implementation review.

## Provider status while reviewing

After writing the design the same active turn reported `retrying`, attempt 4,
`Upstream request failed: Endpoint is unavailable.`, next client retry timestamp
1792600369246. This is endpoint availability evidence, not a measured quota reset
or a correctness score. Keep the assigned active retry; do not duplicate prompts
or change models. Send the correction contract once the worker is idle.
