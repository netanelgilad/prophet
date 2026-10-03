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
for `.js`. Source text and SHA-256 provenance are included. `.cjs` selects
CommonJS directly; ESM and other formats stop explicitly. The captured source is
immutable during evaluation. Capture is read-only and is not an atomic snapshot
of the filesystem or a symbolic model of source-acquisition failures.

The VM receives a partial standard global object and one shared global/imported
console model. `require("console")` and `require("node:console")` are connected.
Other imports stop analysis, including existing local files; an uncaptured file
is not reported as absent. Source graphs/package dependencies, general process
state and HTTP/filesystem host assembly are the next CLI work. Launch args/cwd
are retained as provenance; that alone does not implement `process.argv`/`cwd`.
Unknown global names and missing Math members stop conservatively. Wider partial
intrinsics still have the limitations in the implementation backlog.

Default console output assumes healthy writable UTF-8 stdout with the model's
existing formatting/configuration boundaries. This assumption appears in
`execution.modelDomain`; it is not inferred from an omitted environment file.
`Math.random()` introduces a fresh unknown in `[0, 1)`, not a sampled host value
or a captured PRNG seed. No target external writes or native module execution
occur. The runtime does not yet accept explicit input environments.

## Result envelope

Prophet emits one JSON object to stdout, with program output inside its graph.
Diagnostics for invocation/acquisition/serialization failure go to stderr.

| Field | Meaning |
| --- | --- |
| `format`, `version` | `"prophet.execution"`, `1`; experimental transport version. This is not a stable cross-version VM semantics identifier. |
| `input` | Runtime selection, canonical entry path, launch args/cwd and captured source/package-format provenance. |
| `state` | Currently `{ "representation": "projection", "resumable": false }`. |
| `execution` | `evaluated` or `analysis-stop`, synchronous-entry scope, retained-state scope, optional diagnostic, step budget, model domain and limitations. |
| `graph` | Reference graph with `initial`, `current` and, when available, `completion` roots. |

`evaluated` means the supported synchronous entry evaluation produced a
completion; that completion can include a throw or conditional normal/throw
alternatives. It does not establish process exit, callback coverage or full
JavaScript correctness. On `analysis-stop`, `current` is one deepest retained
checkpoint. Already visited sibling histories and unvisited continuations may
be absent; no completion root is fabricated. Some arbitrary internal failures
can retain only an earlier checkpoint. Consumers must not infer that missing
effects are impossible.

| CLI exit status | Meaning |
| --- | --- |
| `0` | A result containing the entry's modeled completion, even if that completion throws. Also used for `--help`. |
| `2` | A result containing a partial analysis stop. |
| `1` | Invocation, capture or serialization failed; stderr explains it, no result is emitted. |

These statuses are not modeled program exit codes or consumer policy verdicts.

## Graph containers

`graph.roots` maps names to encoded values. `graph.nodes` is an array of nodes
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
output is explicitly a projection rather than a full machine snapshot.

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
