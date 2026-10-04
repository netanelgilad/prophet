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

The CLI reads the CommonJS entry and acquires dependencies as interpreted
`require` calls reach them. The same resolver and loader used by supplied-source
specs handle local/nested imports, JSON, package main and supported exports rules,
including finite symbolic choices of module names. This does not scan only
literal `require` syntax: computed names and saved require functions use the
same loading path. `.cjs` selects CommonJS directly; `.js` consults captured
package-format metadata. ESM, native addons and other unsupported formats stop.

Each first file/directory/missing probe and each file's first bytes/SHA-256 hash
are retained internally across symbolic branches. Module evaluation and exports
remain in the VM's persistent heap, so one branch's initialization does not mark
a module loaded on another. The process main has id `"."`; dependencies cycling
back to it observe the same module record and partial exports. Other main/module/
require APIs remain partial.

Acquisition is read-only, POSIX-only and non-atomic. It is separate from the
target's modeled filesystem and never executes a dependency natively. Dependencies
with symlinks at any path component, filename aliases, nonregular sources or
invalid UTF-8 stop explicitly. An acquisition error after a positive probe is
not converted to absence. Verified missing local candidates can produce a
catchable `MODULE_NOT_FOUND`; an unresolved bare package stops because
`NODE_PATH` and Node's global search paths have not been captured. Source-size,
I/O, parser and serializer limits are not supplied by the AST evaluation budget.

The VM receives a partial standard global object and one shared global/imported
console model. `console`, `http` and the HTTP model's shared `events` builtin are
registered, including their `node:` aliases. Other builtins stop analysis.
General process state and the remaining server host assembly are future work. Launch args/cwd
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

HTTP setup uses a fresh symbolic bind outcome for each supported attempt, not a
real port probe or a successful-bind default. A hostless numeric `listen` attempts
binding synchronously: `server.listening` is true only on success, while both
success and failure notification remain pending. With explicit `"127.0.0.1"`,
the attempt itself is deferred. The CLI stops after synchronous entry evaluation
and does not deliver either notification or invoke request handlers. A completion
root can therefore coexist with a pending bind, an undelivered error and
unexecuted callbacks; it does not imply process exit or a ready server.

The failure branch retains an Error with unknown code/message/errno and, for a
hostless attempt, unknown address. These fields overapproximate outcomes without
OS-specific correlations or a shared socket/resource pool. A nonzero port is
retained; port zero omits the Error's own port field. The model does not establish
real port availability or explore every future callback. See the [binding and
delivery boundary](node-http.md#callback-delivery-and-persistent-state).

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
| `2` | A result containing a partial analysis stop, including reached dependency-acquisition failures. |
| `1` | Invocation, initial entry acquisition or serialization failed; stderr explains it, no graph is emitted. |

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

Host objects can now retain immutable `hostSlots` identity links in these same
record nodes. A server's `node.http.server` link reaches its persistent lifecycle
state and pending attempt; an emitter's `node.events` link reaches listener state.
The links are VM metadata, separate from guest properties, including any guest
property also called `hostSlots`. Consult the selected context's heap for mutable
state. A link alone does not prove initialization on that path: private model
registries still validate receivers. These links preserve inspectable associations
and callback scope references, not portable host reconstruction or resumption.

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
state and failure boundaries. [Import specs](../test/cli-imports.spec.ts) compare
acquired local/package/JSON imports and main-module cycles with pinned Node,
retain symbolic import/cache alternatives and test the actual CLI subprocess.
[Capture specs](../test/cli-source-capture.spec.ts) cover retained bytes/absences,
disappearance after a positive probe, symlink components, encoding and acquisition
errors. No complete upstream Node CLI test is
claimed passing; startup flags, main-module APIs, source resolution/formatting,
environment capture and process scheduling remain broader compatibility work.

The [pico startup milestone](roadmap.md#next-milestone-pico-startup-through-the-cli-with-no-environment-file)
is still open. The unchanged example follows `../index.js` into the pinned
package, resolves `http`, then stops at its unregistered `https` builtin. The
remaining HTTPS/fs/url/path assembly and startup notification scheduling are
still pending. General HTTP setup now retains symbolic bind outcomes and pending
state; it does not drain callbacks or assume the bind succeeded. Full environment
input, portable round trips/resumption and automatic reachable callback analysis
follow. Track residual scope under REPORT-001, CJS-001, HOST-002, CONSOLE-002,
LANG/LIB/LEGACY and SECURITY-002 in the [backlog](implementation-gaps.md).
