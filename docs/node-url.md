# Legacy Node URL parsing and warning boundary

The reference is **Node v24.21.0**, commit
`955266bfdd854cd280dffd47548673914484e4c0`. The model follows the legacy
[`lib/url.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/url.js)
and default
[warning implementation](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/internal/process/warning.js),
not the WHATWG URL API. Local [URL](../test/node-url.spec.ts) and
[warning](../test/node-warnings.spec.ts) specs compare interpreted fixtures with
independent pinned Node children. Those checks are separate from Test262 and
from complete upstream Node cases.

## Supported parsing

`createLegacyURLModel(warnings?)` supplies `.module`, `.process`, `.warnings` and
its persistent once-warning `.state`.
Register `.module` as `url`; the CommonJS loader handles its `node:` alias. The
optional argument shares a `createWarningModel()` environment. If the program
also imports or uses process, supply that same process identity rather than a
second warning environment. The [process environment factory](node-process.md)
can add declared cwd state to this same identity before execution.

`parse` accepts path-only concrete strings and symbolic choices with concrete
string leaves. It preserves the pinned parser's leading/trailing whitespace
handling, backslash handling before the query/hash, fast-path versus slow-path
escaping, empty input, percent sequences, query and hash text, NUL and UTF-16
code units. It does not decode percent escapes. A falsy `parseQueryString`
preserves string queries; truthy query-object parsing is unsupported. The
`slashesDenoteHost` flag follows JavaScript truthiness, but a form that requires
authority parsing remains unsupported.

Results have the twelve mutable own data fields `protocol`, `slashes`, `auth`,
`host`, `port`, `hostname`, `hash`, `search`, `query`, `pathname`, `path` and `href`,
in Node's order. Fields absent from the parsed form are null. Parsing a returned
Url again preserves its identity, before consulting either flag. Its inherited
Url API remains guarded; ordinary own-field support is not constructor,
prototype or full URL compatibility.

The model preserves parse's `name` (`urlParse`), length (3), detached calls and
ignored receiver. Construction is explicitly unsupported: Node permits
`new url.parse(...)`, so the model does not turn that case into a false TypeError.
Full metadata, descriptors, prototype methods, `Url`, `URL`, `URLSearchParams`,
format/resolve, protocol/authority/auth/host/port/IDNA/IPv6 parsing and their errors
remain open.

Known invalid primitive inputs produce the pinned coded TypeError. An unknown
number still definitely throws with `ERR_INVALID_ARG_TYPE`, while its diagnostic
text stays unknown; unknown Booleans retain their two diagnostics. Invalid
object/function diagnostics can execute user property access and are unsupported.
Coded-error constructor, stack, source formatting and descriptor behavior remain
guarded. Open URL strings, including unknown strings narrowed only by equality
facts, are not converted into arbitrary concrete examples.

Node's legacy parser observes some mutable String operations. Replacements of
`String.prototype.charCodeAt` or `slice` stop analysis until those effects can be
modeled. The [shared slice intrinsic](symbolic-strings.md) is now implemented;
the URL guard compares its current identity with that intrinsic instead of
assuming the property is absent. It also uses live operations on internal RegExp and Set objects. Their
constructors/prototypes are currently outside the VM's supported library, so
this model assumes those intrinsics unchanged; future support must preserve
their observable mutations. These are implementation gaps, not URL validity
rules. See URL-001/URL-002 and LIB-001 in the [gap backlog](implementation-gaps.md).

## Warning eligibility and source provenance

DEP0169 is an application deprecation. Pinned Node checks the first external
script filename within its bounded stack inspection and suppresses this warning
for a `node_modules` path. Suppressed calls do not consume the URL module's once
flag. An eligible call consumes the flag **before** calling the current
`process.emitWarning`, returning an existing Url, or validating the URL input.
Argument-expression failures occur before entering parse and schedule nothing.

The VM now retains a CommonJS module's normalized source filename. Interpreted
functions capture their defining filename and restore the caller's filename on
normal and throwing paths, including later host callbacks and symbolic forks.
The [source-location specs](../test/source-locations.spec.ts) cover those rules.
This supplies the nearest interpreted caller for the supported URL calls; it is
not a complete V8 stack reconstruction. Eval/Function-generated code has unknown
provenance, and a needed eligibility decision stops if its source is unknown.
Deeper native-frame layouts and broader generated-source semantics remain gaps.

URL parse reads the mutable process.emitWarning member through the shared VM.
Replacing it can change state or throw; those effects are preserved. A throwing
replacement still consumes the URL once flag. Warning scheduling remains
observable even when later supported input validation throws.

## Scheduling and presenting warnings

`createWarningModel({ pid?, nextTick? })` exposes a scoped process with
`emitWarning` and persistent `.state`. The optional shared [job queue](jobs.md)
is snapshotted at creation and must provide an enqueue operation.
String messages, including unknown strings, and optional concrete/finite-choice
string type and code are supported. Empty type means `Warning`. The model
validates optional type/code before the message, following Node's order. Error
objects, options objects, constructor overloads, non-string messages and open
type/code strings remain unsupported.

Calls add warnings to persistent per-path state; they do not print synchronously.
`inspectPending(context)` exposes name/message/code with each path's knowledge.
`deliverNext(context)` takes at most one pending item on each path through the
declared default warning presentation when no shared queue is supplied. `inspectOutput(context)` exposes ordered
decoded UTF-8 stderr chunks. Earlier contexts retain their original queues and
output. No real stderr write takes place during symbolic execution.

With `nextTick`, each warning schedules one job into that same FIFO. The job
retains its warning object and removes the matching warning from pending state
before formatting. It uses current fields, inherited formatting and captures;
a nested `emitWarning` appends behind all jobs already pending, including HTTP
startup notifications. There is no separate warning drain or special tail flush.
Manual `deliverNext` rejects in this mode, even when currently empty, so a caller
cannot duplicate or reorder delivery. Queue controls are embedding APIs, not
public `process.nextTick` support.

A language throw during formatting consumes that warning and clears the completed
active job, preserving the unexecuted tail and thrown completion. A classified
unsupported operation retains its unfinished active job and pending tail; the
active job's arguments preserve the already-dequeued warning identity. Normal
symbolic siblings continue. Default-configuration guards remain explicit analysis
failures and never count as successful warning delivery.

The process value's immutable `hostSlots["node.process.warnings"]` links its
warning queue/helper-line state; queued mode also links `hostSlots["node.nextTick"]`.
The URL module links its once flag through `hostSlots["node.url.deprecation"]`.
These are ordinary graph references separate from guest properties, not full
process state or resumable native callbacks. The once flag still consumes before
the current `process.emitWarning` call; source-based dependency suppression and
replacement/throw semantics are unchanged.

Supplying a positive concrete pid permits exact default text comparison. Without
it the diagnostic output stays unknown rather than inventing a process number.
The helper line is shown once per warning environment and retains branch state.
Presentation uses interpreted Error formatting, inherited code/detail and
supported formatter effects; a noncallable formatter uses the primordial
fallback. A throwing formatter consumes that queued item without producing its
output, and a formatter can enqueue another warning. Object conversion in
presentation and wider Error metadata remain gaps.

The declared environment has default warning handlers and console.error,
default Node release/argv0, no warning flags, custom listeners, redirection or
subscribers, and healthy stderr. Flag writes and inherited enabled flags reject
analysis. This is not full process EventEmitter or process.nextTick support.
Warning suppression/throw/trace flags, listener ordering and failures, broader
event-loop interleavings, console/stdio replacement, redirects, output failures,
backpressure, flushes and exit loss remain open. In particular, Node's
`--no-warnings` suppresses stderr but still emits the warning event; it cannot be
modeled as simply dropping the warning. WARN-001 and HOST-002 preserve that work.

[Shared warning-job specs](../test/node-warning-jobs.spec.ts) compare hostless and
explicit-loopback HTTP startup ordering, nested warning enqueue and uncaught
formatter/listening-callback failures with pinned Node children. Native warning observers only
record delivery time; a fatal monitor does not recover exceptions. Symbolic
specs retain unsupported/throwing siblings, late formatting state, once/source
eligibility, queue-option snapshots and graph links. Existing explicit-delivery
specs remain active. The CLI must choose this shared queue during runtime
assembly; this model option alone does not enable more CLI builtins.


## Composing the models

The [URL-to-path specs](../test/node-url-path.spec.ts) evaluate a plain function
that returns `path.join("/site", path.normalize(url.parse(target).pathname))`.
With a symbolic choice between `/public/../file?token=secret#section` and
`/other?download=1`, Prophet proves the corresponding result is `/site/file` or
`/site/other`. Whether the result equals `/site/file` stays unknown. Both concrete
choices are independently checked in Node.

A second choice between empty input and `/file` preserves the error condition:
the empty URL has a null pathname, which produces the path API's coded TypeError;
the other input returns `/site/file`. The relation is proved while the failure
Boolean stays unknown. This exercises normal and throwing composition through
shared operations. Neither spec accesses a filesystem or proves containment.

## Progress in the unchanged application

The [pico-static-server analysis](../test/pico-static-server-analysis.spec.ts)
now executes the original GET/HEAD expression:

```js
path.join(options.staticPath, path.normalize(url.parse(request.url).pathname))
```

For `/folder/../missing?download=1` and staticPath `/site`, the result is
`/site/missing`. Both the explicit normalize call and join's current normalize
call execute. The [filesystem model](node-filesystem.md) now resolves that path
against the declared empty `/site`, and the original handler completes 404.
A read-only lookup observer records the preceding scope and effects without
supplying filesystem results. A second shared-tree proof for `/docs` retains
both absent-directory 404 and empty-directory ENOENT from the original index
read, with matching native GET/HEAD witnesses. This does not prove containment
or successful readable-file serving.

Source placement is explicit: the virtual installed package under
`/app/node_modules/pico-static-server` suppresses DEP0169, while the identical
source at `/app/fixture/package` schedules it, matching the native checkout
fixture's eligibility. Neither case delivers a warning while its synchronous
handler is still executing. Default reads now return Buffer values; the
`instanceof` expression now resolves false through shared prototype reasoning.
The target now parses the filename for MIME selection, commits headers, and
completes write/end/finish under the declared successful transport schedule. The original writeHead argument reversal still
discards the intended MIME/length fields.
Broader filesystem failures, HTTPS and wider URL forms remain gaps; existing bind,
stdout, delivered-request-event and transport assumptions remain in force.

## Complete upstream cases reviewed

The following complete files were reviewed at the pinned revision. None is
activated or counted passing from the local specs, and none is reduced to an
easier fragment:

- [`test-url-parse-deprecation.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-url-parse-deprecation.js)
  needs common/assert, fixture loading, child processes and promises. Its
  node_modules fixture also calls format and resolve.
- [`test-url-parse-invalid-input.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-url-parse-invalid-input.js)
  includes Symbol/object diagnostics, URIError auth decoding, IPv6/IDNA, Intl
  string normalization, loops and child-process DEP0170 checks.
- [`test-url-parse-query.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-url-parse-query.js)
  requires query objects, Url construction, prototype reflection and broader
  object/array iteration and assertion helpers.
- [`test-url-parse-format.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-url-parse-format.js)
  spans protocols, hosts, IDNA/IPv6/auth, formatting and resolveObject; it also
  needs node:test, assert, util.inspect, common.hasIntl and Url prototype APIs.
- [`test-url-relative.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-url-relative.js)
  spans resolve/resolveObject/format across schemes, with common/assert,
  util.inspect, loops, array operations and prototype identity.
- [`test-process-warning.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-process-warning.js),
  [`test-process-emitwarning.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-process-emitwarning.js)
  and [`test-process-no-deprecation.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-process-no-deprecation.js)
  require process events, nextTick/setImmediate, flags, stderr replacement,
  warning overloads/classes and the common/assert harness. The shared FIFO now
  covers local default-warning/startup interleavings, but these complete files
  still require their public process APIs and full flag/listener semantics.
- [`test-deprecation-flags.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/sequential/test-deprecation-flags.js)
  needs its complete deprecated-function/class fixtures, child processes,
  flag variants and output/stack assertions.
