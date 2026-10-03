# Runtime CLI: first slice

Run from a dependency-installed checkout:

```sh
./bin/prophet.js --runtime node@24.21.0 -- app.cjs arg1 > result.json
./bin/prophet.js --max-steps 10000 -- app.js > result.json
./bin/prophet.js --help
```

The runtime defaults to `node@24.21.0`, the only accepted profile. This names the
semantics targeted by compatibility specs, not full Node conformance. A mandatory
`--` separates Prophet options from the script/arguments. The default evaluation
budget is 100000 AST steps. This is a work limit, not a constraint on program
inputs or a guarantee against all parser/native-model resource exhaustion.
The repository bootstrap uses the existing Babel toolchain only for Prophet's
own source. It never requires the target script into the analyst's Node process.
Packaging a standalone installation remains future work.

## Capture and execution

The first slice reads one CommonJS entry and the relevant package-format metadata
for `.js`. Source text and SHA-256 provenance are captured internally. `.cjs` selects
CommonJS directly; ESM and other formats stop explicitly. The captured source is
immutable during evaluation. Capture is read-only and is not an atomic snapshot
of the filesystem or a symbolic model of source-acquisition failures.

The VM receives a partial standard global object and one shared global/imported
console model. `require("console")` and `require("node:console")` are connected.
Other imports stop analysis, including existing local files; an uncaptured file
is not reported as absent. Source graphs/package dependencies, general process
state and HTTP/filesystem host assembly are the next CLI work. Launch args/cwd
are retained internally as provenance; that alone does not implement `process.argv`/`cwd`.
Unknown global names and missing Math members stop conservatively. Wider partial
intrinsics still have the limitations in the implementation backlog.

Default console output assumes healthy writable UTF-8 stdout with the model's
existing formatting/configuration boundaries. This remains a modeling gap
documented here and in the backlog, not a prose field in the runtime output.
An omitted environment file does not establish stdout health.
`Math.random()` introduces a fresh unknown in `[0, 1)`, not a sampled host value
or a captured PRNG seed. No target external writes or native module execution
occur. The runtime does not yet accept explicit input environments.

## Output graph

Prophet emits the graph directly to stdout, with exactly two fields: `roots`
and `nodes`. Results include every referenced node. There is no surrounding report envelope,
`modelDomain`, `limitations` prose, or metadata moved into special graph nodes.
Program output is represented by effects in this same graph. Runtime diagnostics
go to stderr; implementation boundaries belong in documentation and the backlog.

`roots.completion` exists when synchronous entry evaluation produced a
completion, including an undefined export, a throw, or conditional normal/throw
alternatives. Its presence does not establish process exit, callback coverage
or full JavaScript correctness. An analysis stop omits that root, returns exit
status 2 and writes its reached diagnostic to stderr. `roots.current` then holds
one deepest known checkpoint: already visited sibling histories and unvisited
continuations may be absent. Some internal failures retain only an earlier
checkpoint. Missing effects cannot be interpreted as impossible effects.

This is still an experimental, nonresumable projection. The former envelope's
schema version, captured source bytes/hashes, launch metadata and budget are not
published. Source locations already in VM state remain in the graph. Saving JSON
alone preserves completion versus partial state, but not stderr's stop reason or
all run provenance. Proper environment/source representation and a portable
versioning contract remain future work; explanatory prose is not a substitute.

| CLI exit status | Meaning |
| --- | --- |
| `0` | A result containing the entry's modeled completion, even if that completion throws. Also used for `--help`. |
| `2` | A result containing a partial analysis stop. |
| `1` | Invocation, capture or serialization failed; stderr explains it, no graph is emitted. |

These statuses are not modeled program exit codes or consumer policy verdicts.

## Graph containers

`roots` maps names to encoded values. `nodes` is an array of nodes
with deterministic traversal-local IDs (`n0`, `n1`, ...). A reference is
`{ "ref": "n0" }`; it always refers to a node in this result. IDs preserve
sharing/cycles within a result, not identities across separate runs.

JSON strings, booleans, null and ordinary numbers represent themselves. Values
JSON cannot preserve use `{ "primitive": TAG }`, where TAG is `undefined`,
`NaN`, `Infinity`, `-Infinity` or `-0`. These are transport primitives: a VM
symbolic number is still a referenced record with its type, expressions and
knowledge, including an unknown `.value` when applicable.

| Node kind | Contents |
| --- | --- |
| `record` | `entries`: ordered `[name, encodedValue]` pairs. |
| `array` | `length` and `entries`, including occupied indices and named enumerable properties; holes stay holes. |
| `map` | `entries`: ordered `[encodedKey, encodedValue]` pairs, preserving reference keys. |
| `execution-context` | Selected state entries: global/this, lexical environment/store, heap, knowledge, effects, strict/source location and uncaught value when present. |
| `opaque-function` | Diagnostic native function name and enumerable data entries; no executable source or captured native closure. |

Where available, node `definition` references the interpreted function's AST
parameters/body and lexical environment identity. It is metadata, separate from
the value's own properties. It is not a derived behavior summary. Full strictness,
arrow captures, native/private host metadata and resumable continuations are not
portable yet. Execution contexts exclude debug hooks, the mutable analysis
budget and legacy flattened scope/stderr inspection fields. This is why the
schema represents a projection rather than a full machine snapshot.

The graph preserves the current VM value/fact and effect schemas inside these
containers; these remain experimental. It keeps event predecessors, choices,
call identities, event-time heap snapshots and path knowledge. A consumer can
derive possible console output from successful stdout write events. Separate
writes do not add a `chunks` field to symbolic strings. Accessors, unsupported
native containers and symbol-keyed data reject serialization rather than
silently disappearing or running getters.

## Evidence and remaining work

[Subprocess specs](../test/cli.spec.ts) exercise the actual executable, concrete
output against pinned Node, conditional output and sharing, independent random
choices, program throws, unsupported stops and absence of native target writes.
[Runtime specs](../test/cli-runtime.spec.ts), [transport specs](../test/cli-graph.spec.ts)
and [checkpoint specs](../test/analysis-failure-context.spec.ts) cover narrower
capture, state and failure boundaries. No complete upstream Node CLI test is
claimed passing; startup flags, main-module APIs, source resolution/formatting,
environment capture and process scheduling remain broader compatibility work.

The [pico startup milestone](roadmap.md#next-milestone-pico-startup-through-the-cli-with-no-environment-file)
is still open. First connect captured CommonJS imports and existing host models;
then retain resource/pending-state boundaries in the result. Full environment
input, portable round trips/resumption and automatic reachable callback analysis
follow. Track residual scope under REPORT-001, CJS-001, HOST-002, CONSOLE-002,
LANG/LIB/LEGACY and SECURITY-002 in the [backlog](implementation-gaps.md).
