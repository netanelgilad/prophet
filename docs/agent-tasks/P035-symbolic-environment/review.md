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

## Design round 2 — binding implementation contract

Reviewed the complete revised design. The zero-argument factory, explicit host
state, primitive-only schema, validation-before-target ordering, and corrected
test matrix resolve the architectural findings. **Accepted for spec-first
implementation with the precise amendments below.** These amendments supersede
conflicting wording in the draft; the worker must reconcile design.md before
adding red specs. No third design-only handoff is needed. Full implementation
review is still required and this is not a first-review acceptance streak.

1. **Expanded work, not just memoized compile count.** Memoization bounds value
   construction but `selectValue`/Boolean reasoning may traverse a shared DAG
   repeatedly. Before constructing any VM value, compute a saturating structural
   weight for every expression, memoizing the computed numeric weight per named
   definition: literal/symbolic leaf = 1; ref = 1 + weight(definition); select =
   1 + weight(condition) + weight(then) + weight(else). A reused reference adds
   its full weight at each occurrence, even though its VM value is built once.
   The expanded dependency depth is computed similarly as a memoized longest
   path (ref adds one; select adds one to the maximum child depth). Reject
   cycles, any root depth >32, and saturating total expanded work >4096 across
   all named definitions, explicit filesystem expressions and request-template
   expressions. Request method+URL together also have a 1024 expanded-work cap.
   Keep separate syntactic node/edge/count/byte limits. Validate all definitions
   and both select branches regardless of constant guards. This is a
   conservative authoring limit, not a claim of complete solver work accounting.
   Include a small repeated-DAG input whose syntactic node count is tiny but
   whose expanded weight exceeds the limit, plus a nearby accepted case. Run
   stress probes under an external timeout and do not reinterpret timeout as
   a proof result.

2. **Check the opened file before allocation.** Use O_NOFOLLOW as well as
   O_NONBLOCK on the supported POSIX platforms; confirm fstat is regular, its
   size is safe/nonnegative and <=262144, and metadata agrees with lstat before
   allocating at most 262145 bytes. Bound read calls by that capacity; reject
   short/long reads or detected metadata changes, and always close. A final
   size check cannot repair a huge allocation made from an unchecked opening
   fstat. This detects some races; do not claim atomic capture or a complete
   symlink-safe ancestor walk. A mocked lstat/open/fstat race test is suitable
   for allocation order; do not make giant files or depend on a timing race.

3. **Correct remaining stale prose.** §13 still calls missing-index ENOENT and
   waiting alternatives unsupported; classify them separately from actual
   boundaries. Named VM values are retained through graph links; they are not
   automatically heap entries. String literals are UTF-16 values decoded from
   valid UTF-8 JSON; escaped surrogates can already appear in URL/header fields.
   Two-event exploration materializes at most two arrivals per represented
   history, potentially more factory calls across alternatives. Omit the new
   node.environment slot entirely when no environment was supplied, preserving
   the existing no-environment shape. Freeze/encapsulate validated template and
   complete shared map before use; no compilation cache changes after initial
   graph state is linked.

Implementation ownership remains task.md: minimal CLI/environment/provider
seam, specs and listed boundary/gap/wiki docs. Root owns this review, task,
dispatch, roadmap and ledger. The red stage must run the intended focused specs
and inspect the failures; missing parser support is expected, incorrect fixture
or graph assertions are not. Retain logs/revision information. Then implement
and run focused specs, pinned benign Node controls, complete suite and typecheck.
Record evidence on the committed implementation snapshot; freeze for source and
independent adversarial review. No push/main edit or solver/serializer expansion.

## Initial red-stage evidence — 2026-10-21T16:59Z

The worker ran its first argument/validation specs through `2>&1 | tail -60`,
contrary to the required unmasked-exit/full-log workflow. This output is not
accepted as complete command evidence. Root immediately reran the same two spec
files with pinned Node 24.21.0, captured the raw process status and complete log,
and verified selected production/test file hashes were unchanged across the run.
`src/cli/environment.ts` was absent before and after. The argument feature test
fails because --environment is unknown; the validation suite cannot load its
not-yet-created parser. Counts: two failed suites, one failed/two passed tests;
validation assertions have **not** run yet. Exit code 1 is the expected red
status, not a passing validation claim.

Local evidence: `/tmp/prophet-p035/root-initial-red.json` (exact argv and
before/after hashes), `/tmp/prophet-p035/root-initial-red.log` (complete output).
The worker must still provide unmasked complete focused/full validation on the
implemented snapshot. No trust promotion follows this pipeline correction.

## Partial parser checkpoint during quota wait — 2026-10-21T17:09Z

This is **not a worker implementation handoff**. The worker saved a first parser
draft and two specs before an active free-tier retry scheduled for Oct22 00:00
UTC. CLI arguments/runtime/provider wiring, application specs, boundary docs and
full validation remain unfinished. Root reviewed the saved draft while waiting;
the following may overlap subsequent worker self-correction and must not be
counted as defects escaping a completed handoff.

Source and test snapshots are indexed in `partial-draft-evidence.json`. Root
ran the two worker specs and typecheck with pinned Node 24.21.0: both commands
exit 1. The argument feature remains unimplemented. The validation suite cannot
load because direct parser import enters the VM's circular initialization in
the wrong order (`sloppyBoxPrototypes.string` is undefined). Typecheck additionally
finds premature `.type` access on ref expressions, nullable/undefined handling,
and unused imports/old filesystem typings. Complete logs and stable file hashes
are in `/tmp/prophet-p035/root-parser-draft-evidence.json`.

Root's `test/cli-environment-parser-review.spec.ts` initializes the public VM
first to isolate parser behavior. Corrected probe run: **5 fail, 2 pass**;
exit 1, source hash unchanged. Detailed evidence is
`/tmp/prophet-p035/root-parser-probes-r2.json`.

- Direct/forward references are rejected in Boolean/string consumer positions
  and selects because parsing checks `.type` before reference type resolution.
  Resolve all definitions and validate inferred types before materialization;
  preserve wrong-type/mixed-kind/cycle/missing-ref rejection.
- Aggregate literal bytes omit concrete header values. Ten 7000-byte headers
  fit individual header and file limits but exceed the agreed 65536 aggregate.
- Expanded-work probes currently fail on reference typing instead of reaching
  the bound. The worker's seven-level two-child repeated-DAG rejection fixture
  is also mathematically wrong: w0=1, wn=4+2*w(n-1), sum(w0..w7)=1243. It must
  remain accepted under the 4096 cap. Twelve levels supply a rejected case.
  Do not lower the cap or retain a broad rejection assertion that passes for
  the wrong reason.
- The worker's minimal provenance test expects `environment.json` although its
  helper writes `env-<random>.json`; fix the oracle, not path semantics.
- The immutable-domain claim needs reconciliation: only the outer state and
  provenance are frozen; request expression/header records are exposed through
  state and shared with the factory. Final docs must define the normalized
  request-domain shape (the draft stores Expr records, not raw authoring JSON).
  Root's separate runtime probe draft assumed raw authoring syntax; adapt it
  to the final documented shape rather than count that assumption as a defect.

Positive independent evidence: the opened-fstat oversize check rejects before
Buffer allocation and closes the descriptor; a 16000-character decoded string
written as 96000 bytes of Unicode escapes is accepted and preserved. The initial
filesystem spy targeted Babel's namespace wrapper and therefore did not reach
the parser's fs module. Root corrected the harness to mock the actual shared
module; that initial failure is a **reviewer false alarm**, not a source defect.

The root parser probes are now visible regression specs. The broader CLI probes
remain prepared outside the worker tree at `/tmp/prophet-p035/review-cases.spec.ts`;
their initial authorship record is saved, with disclosed design-case overlap.
Do not alter root assertions to obtain a pass. No production fixes were made by
the orchestrator. Preserve the worker's active retry; do not send a duplicate
prompt while it is waiting.
