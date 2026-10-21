# Runtime CLI: first slice

Run from a dependency-installed checkout:

```sh
./bin/prophet.js --runtime node@24.21.0 -- app.cjs arg1 > result.json
./bin/prophet.js --max-steps 10000 -- app.js > result.json
./bin/prophet.js --max-events 2 -- app.js > two-events.json
./bin/prophet.js --environment initial.json --max-events 1 -- app.js > declared.json
./bin/prophet.js --help
```

The runtime defaults to `node@24.21.0`, the only accepted profile. This names the
semantics targeted by compatibility specs, not full Node conformance. A mandatory
`--` separates Prophet options from the script/arguments. The default evaluation
budget is 100000 shared evaluation steps. AST evaluation and each delivered job
consume this budget; job draining also has that many deliveries as an upper
bound across explored branches. This is a work limit, not a constraint on program
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
registered, including their `node:` aliases. The `fs` builtin uses a read-only
[filesystem environment adapter](node-filesystem.md#read-only-environment-acquisition):
its persistent state retains canonical cwd/platform, open directories, reached
file/missing observations and lazy contents. Supported exists/stat/read calls use
those facts. Descriptor availability remains symbolic; a successful analyst read
does not prove target descriptor availability. Uncaptured paths remain unobserved.
Acquisition has bounded entries/bytes and stops on symlinks, nonregular entries,
unsupported binary contents or unexpected host failures. It is non-atomic and
independent of source acquisition; this is not a single time-zero disk snapshot.
The graph links this state through the global object's `node.fs` host slot.

The shared [process model](node-process.md) supplies the captured canonical cwd
through mutable `process.cwd`; global process and process/node:process imports
share one identity. The [POSIX path model](node-path.md) shares path, node:path
and path/posix identities and reads the current cwd method when needed. The
[legacy URL model](node-url.md) uses this same process warning environment;
warnings schedule presentation through the same next-tick FIFO as HTTP startup.
Their persistent states remain linked through host slots. This does not supply
process.argv, process.env, chdir, full URL parsing, warning configuration or
complete host metadata. These reached gaps remain explicit.

HTTPS and querystring retain opaque object exports: imports and aliases work,
but reached APIs, inspection or coercion stop. Other builtins stop on import.
Launch arguments remain internal provenance rather than a modeled argv.
Unknown global names and missing Math members stop conservatively. Wider partial
intrinsics still have the limitations in the implementation backlog.
The opaque import checks establish known exports under the pinned default
environment, not complete builtin initialization: lazy state, instrumentation,
configuration and allocation effects remain unmodeled.

Default console output assumes healthy writable UTF-8 stdout with the model's
existing formatting/configuration boundaries. This remains a modeling gap
documented here and in the backlog, not a prose field in the runtime output.
An omitted environment file does not establish stdout health.
`Math.random()` introduces a fresh unknown in `[0, 1)`, not a sampled host value
or a captured PRNG seed. No target external writes or native module execution
occur. The optional environment file declares the bounded inputs below.

HTTP setup uses a fresh symbolic bind outcome for each supported attempt, not a
real port probe or a successful-bind default. A hostless numeric `listen` attempts
binding synchronously: `server.listening` is true only on success, while both
success and failure notification are queued. With explicit `"127.0.0.1"`, a
queued lookup step attempts binding and appends a separate notification behind
already queued work, matching the supported Node IP-literal path.

After each normal entry completion, the CLI drains the shared startup FIFO.
Jobs read current lexical/heap state, so listeners and variables changed after
`listen` affect delivery. A job is removed before invocation; jobs added by a
callback join the tail. A modeled throw stops only that branch's draining and
retains its remaining jobs. A throwing entry does not drain its queue. Normal
draining preserves the entry's exports; a job throw becomes the completion.
This checkpoint covers modeled startup work, not process exit or a general Node
event loop. By default request handlers remain registered. `--max-events 1`
adds [one optional symbolic incoming event](external-events.md) after normal
startup; `--max-events 2` retains histories through a second arrival, including
zero/one-arrival waiting alternatives. Only 0, 1 and 2 are currently accepted.
Every step selects among the current eligible servers or waiting. Normally
completed arrivals drain supported nextTick work before another arrival, even
at the final horizon. Throws and classified unsupported/budget frontiers stop
their own history while supported siblings remain. By default, independent unknown
string method/url fields form a parsed-event overapproximation. An environment
file can replace their domain; neither form is a wire parser. Timers, microtasks, promises and the public
`process.nextTick` API remain unsupported.
A throwing completion is the state at exception propagation, not after process
shutdown. Handles can remain modeled as listening there; exit handlers, resource
cleanup, output flushing and process liveness are not established.

The failure branch retains an Error with unknown code/message/errno and, for a
hostless attempt, unknown address. These fields overapproximate outcomes without
OS-specific correlations or a shared socket/resource pool. A nonzero port is
retained; port zero omits the Error's own port field. The model does not establish
real port availability or explore every future callback. See the [binding and
delivery boundary](node-http.md#callback-delivery-and-persistent-state).

## Declaring a starting environment

`--environment FILE` accepts one strict JSON file, resolved relative to the
invocation cwd. The option is accepted once before `--`; tokens after `--` stay
target arguments. Validation and value construction finish before even resolving
the target's real path. Invalid or unreadable input gives exit 1, a stderr
diagnostic and no graph. The file is data, never executable configuration.

```json
{
  "version": 1,
  "values": { "available": { "symbolic": "boolean" } },
  "filesystem": { "descriptorAvailable": { "ref": "available" } },
  "http": {
    "requests": {
      "method": "GET",
      "url": { "select": {
        "condition": { "ref": "available" },
        "then": "/otherfile.html",
        "else": "/missing.html"
      } },
      "headers": { "accept": "text/html" }
    }
  }
}
```

`version: 1` is required. `values`, `filesystem` and `http` are optional. Each
value expression is a Boolean or string literal, `{"symbolic":"boolean"}`,
`{"symbolic":"string"}`, `{"ref":"name"}`, or a `select` with exactly
`condition`, `then` and `else`. Conditions must be Boolean and both branches
must have the same kind. Numbers are not value expressions. Names match
`[A-Za-z_][A-Za-z0-9_]*`, excluding `__proto__`, `constructor` and `prototype`.
Forward references work; missing references, cycles, wrong types, duplicate JSON
keys and unknown keys at every level reject. Every definition and both selection
branches are validated, including unused values and branches behind constant guards.

`filesystem` accepts only `descriptorAvailable` and
`emptyPathBeforeOpenDescriptorCheck`, each a Boolean expression. Omission keeps
the existing symbolic descriptor fact and platform-dependent open-ordering fact.
An empty object changes neither. It does not declare a filesystem tree or
read-access permissions. `http: {}` keeps the default request domain. If
`http.requests` exists, both string expressions `method` and `url` are required;
`headers` optionally maps lowercase HTTP token names to concrete string values.
Header names use a null-prototype record, so `constructor` is a valid header
name. These are parsed fields, with no guarantee of a corresponding wire request.

All named values are materialized once; references in resource facts and request
fields share their exact VM identities. Inline symbolic expressions in a request
template are materialized afresh on each selected arrival. The same template
applies to every eligible server. Thus a named URL choice remains the same across
two arrivals; an inline choice can select `/arm` then `/fire`. No host-side arrival
counter or server ordinal affects inputs. Exploration may call the factory more
than twice across alternative histories while each history contains at most the
chosen 0/1/2 arrivals. Merely declaring a template never forces arrival, successful
binding, successful I/O or successful transport, and does not remove waiting or
unfinished alternatives. Existing response transport assumptions still apply.

When supplied, the global object's `node.environment` host slot retains:

- `values`: the complete Map of named VM values, including unused definitions.
- `requests`: the validated normalized request template, or `undefined`.
- `provenance`: `{ path, version: 1, sha256 }`, with an absolute resolved path
  and the SHA-256 of the exact bytes read.

The normalized `requests` record has `method`, `url` and `headers` (empty when
omitted). Expressions use `{kind:"literal",type,value}`,
`{kind:"symbolic",type}`, `{kind:"ref",name}` and
`{kind:"select",type,condition,then,else}`; selection `type` is inferred during
validation. This record describes the input domain, not already delivered events.
It survives even at horizon zero. Template records and provenance are frozen;
the completed Map guards its ordinary `set`, `delete` and `clear` methods before
linking into initial state. This is internal mutation protection, not a membrane
against hostile native embedding code. Graph references preserve aliases with
filesystem and delivered inputs. With no file, the new slot is absent entirely.

### Authoring bounds and file capture

| Bound | Maximum |
| --- | --- |
| File bytes | 262144 |
| JSON nesting; expanded expression depth | 32 each |
| Named definitions | 256 |
| Syntactic expression nodes; reference occurrences | 4096 each |
| Decoded JSON string bytes, including keys | 16384 each |
| Literal value and header-value bytes combined | 65536 |
| Headers | 64 |
| Header name; header value bytes | 255; 8192 each |
| Total expanded expression work | 4096 |
| Request method plus URL expanded work | 1024 |

String sizes use UTF-8 byte length after JSON decoding. Input bytes must be valid
UTF-8, with no BOM; raw control characters in JSON strings reject. Escaped NUL
and lone UTF-16 surrogates remain JavaScript string data. Expanded weight is 1
for a leaf, `1 + weight(definition)` for a reference, and 1 plus the three child
weights for a selection. Every reference contributes its full weight even when
compilation reuses one VM value. Total work sums all named roots, explicit
filesystem expressions and method/URL expressions; expanded depth counts ref
and select edges (a leaf has depth zero). These conservative limits reject an
authoring domain; they are not complete solver cost accounting or a narrowed
proof of an accepted input.

The POSIX reader rejects nonregular files and final-component symlinks, opens
with `O_NOFOLLOW | O_NONBLOCK`, and checks opened metadata and size before
allocating at most 262145 bytes. It caps reads, checks short/long reads and
metadata changes, validates UTF-8 and closes the descriptor on success or failure.
This is non-atomic capture, not a complete symlink-safe ancestor walk or protection
against every concurrent mutation. The recorded path is resolved, not necessarily
an ancestor-canonicalized real path.

This authoring slice does not accept process environment/argv/cwd overrides,
shell commands, arbitrary heap snapshots, bind profiles, file trees, request
bodies, transport outcomes or event sequences longer than the explicit horizon.
It does not load the output graph as a resumable snapshot. Unsupported future
behavior stays unfinished; no permissions or security verdicts are part of this
schema. See [environment scenarios](../test/cli-environment.spec.ts),
[parser validation](../test/cli-environment-validation.spec.ts),
[independent parser probes](../test/cli-environment-parser-review.spec.ts) and
[provider specs](../test/node-http-request-input.spec.ts).

## Output graph

Prophet emits the graph directly to stdout, with exactly two fields: `roots`
and `nodes`. Results include every referenced node. There is no surrounding report envelope,
`modelDomain`, `limitations` prose, or metadata moved into special graph nodes.
Program output is represented by effects in this same graph. Runtime diagnostics
go to stderr; implementation boundaries belong in documentation and the backlog.

`roots.completion` contains completed or explicitly unfinished execution, including
exports, throws and conditional alternatives. Classified unsupported operations
and exhausted budgets become `ExecutionBoundary` leaves with their exact branch
contexts. A tree containing any such leaf has `state: "partial"`; `roots.current`
is then its common `base` checkpoint, not the resulting state of every branch.
Consumers follow the leaf pairs for each resulting state. Supported siblings
continue, while stopped leaves preserve their entered AST frames, remaining
statements, effects and active/pending work. See [execution boundaries](execution-boundaries.md).

Classified stops return status 2 and repeat their diagnostic on stderr. Untagged
legacy analysis failures still omit the completion root and retain one deepest
known checkpoint; siblings and unvisited continuations may be absent. Missing
effects never establish that later effects are impossible. Unexpected engine
failures also remain failures rather than guest exceptions or normal completion.

This is still an experimental, nonresumable projection. The former envelope's
schema version, captured source bytes/hashes, launch metadata and budget are not
published. Source locations already in VM state remain in the graph. Classified
boundary reasons survive JSON, but legacy failure diagnostics and complete run
provenance do not. The supplied environment file has the structured identity
described above; this does not supply complete source/run provenance. A portable
versioning contract remains future work; explanatory prose is not a substitute.

| CLI exit status | Meaning |
| --- | --- |
| `0` | A result containing the modeled entry/startup completion, even if that completion throws. Also used for `--help`. |
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
The global object's `node.nextTick` link reaches the shared queue's `pending`
jobs and `active` job. Jobs retain callback/receiver/argument identities; the
argument list is copied when queued. An analysis stop during a callback retains
the active job; budget exhaustion before dequeue leaves the head pending. Normal
and throwing language completions clear active work. These fields use the same
persistent heap and conditional values as the rest of the VM.
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
now has a bounded subprocess proof: the unchanged example follows `../index.js`
into the pinned package and reaches either a waiting server with its exact
startup message or an unhandled bind Error without that message. Its request
handler remains registered; default `--max-events 0` analyzes no incoming request.
With `1` or `2`, the provider supplies parsed symbolic events. Pico's completed
OPTIONS/405, waiting and bind-failure alternatives coexist with unfinished
GET/HEAD URL parsing. Declared finite text-file URLs additionally reach successful
reads, missing-path 404 responses, descriptor EMFILE and missing-index ENOENT
branches; see the environment specs below. Filesystem, URL and path use the assembled models; HTTPS
and querystring retain opaque APIs.
[Queue specs](../test/jobs.spec.ts), [HTTP startup specs](../test/node-http-startup.spec.ts)
and [pinned ordering observations](../test/node-startup-reference.spec.ts) cover
the supported checkpoint; [opaque builtin specs](../test/node-opaque-builtins.spec.ts)
check identities and conservative boundaries. Broader environment authoring, portable
round trips/resumption, broader callback domains and unbounded scheduling follow.
Track residual scope under REPORT-001, CJS-001, HOST-002, CONSOLE-002,
LANG/LIB/LEGACY and SECURITY-002 in the [backlog](implementation-gaps.md).
