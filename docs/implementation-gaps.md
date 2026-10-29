# Implementation gaps and proof assumptions

This is the durable backlog for work we defer. A passing proof is relative to
its declared inputs, environment, and schedule; it must not erase the work
excluded by those declarations. In particular, **successful binding does not
prove that a port is available**, and captured console output does not prove
that an operating system successfully wrote or flushed it.

Use this alongside the [roadmap](roadmap.md), [real application target](real-world-target.md),
[HTTP boundary](node-http.md), [event boundary](node-events.md),
[path boundary](node-path.md), [URL/warning boundary](node-url.md),
[filesystem boundary](node-filesystem.md), [Buffer boundary](node-buffer.md),
[instanceof boundary](instanceof.md), [array boundary](array-push.md), [string boundary](symbolic-strings.md),
[CommonJS record](../test/commonjs/README.md), and [Test262 record](../test/test262/README.md).
The roadmap chooses the next useful increment; this file preserves the residual
work even when it is not on that immediate path.

## Status and maintenance

All entries below are **open** unless explicitly marked closed. IDs are stable;
do not renumber or delete them. Their classifications are deliberately different:

- **Unsupported:** analysis stops, or the operation has no implementation. This
  is an implementation gap, not evidence that JavaScript/Node rejects the input.
- **Assumption:** the embedding selects an environment or schedule. The proof
  says nothing about excluded outcomes, even if execution succeeds.
- **Precision:** execution retains an unknown result or conservative expression.
  A stronger reasoner may prove more; unknown is not a counterexample.
- **Legacy:** source inspection found a partial implementation or fallback that
  is not protected by a complete compatibility boundary. Do not rely on it for
  a new proof without a regression and a fix or an explicit rejection.
- **Testing:** an upstream case, harness, audit, or differential check is missing.
  A skipped test is not necessarily a known runtime failure.

Every feature increment must reconcile new or changed guards, assumptions, rejected
domains, unknown results, skips, and partial host behavior against these IDs.
Add a specific entry when an existing one cannot accurately describe the work.
Record the supported part and retain the residual when a group is only partly
implemented. Update the relevant boundary docs and complete upstream candidate
lists too; historical blockers can become stale as shared features land.

To close an entry, state the exact domain now supported and link the implementing
commit or PR and meaningful specs, including boundary/failure/symbolic cases and the
applicable complete unmodified upstream cases. Record remaining exclusions under
an open ID. Remove or replace the corresponding guards and rejection assertions
with the actual language/host behavior as support lands. One passing example,
one concrete sample, or replacing a rejection
with a narrower input is not closure. Preserve closed entries and their evidence
here so later work can distinguish completed work from a forgotten limitation.

## Audit scope and reproducible inventory

Initial audit: **2026-09-29**, console/template startup layer. The audit read the
shared evaluator and its resolver/operator tables, property and environment
models, host/loader guards, local boundary specs, and the six records linked
above plus the README. It scanned all `src/**/*.ts` and `test/**/*.spec.ts`,
including generated Test262 skips. It also inspected the metadata of every
historical skipped file at Test262 commit
`47bf9d1db9f6e7632120ac1b1946ad092e6c214e`.

Reconciled in the response-header layer: direct writeHead, the complete pinned
status catalog and the non-GET/HEAD method proof add supported behavior below.
HTTP-005 and TARGET-001 remain open; HTTP-007 preserves the broader header work
excluded by that increment. The initial filesystem exception goal was still open.

Reconciled again in the POSIX path layer on **2026-09-30**: shared join/normalize
support concrete strings and finite choices; new PATH-001/PATH-002 retain their
API/platform and open-string/diagnostic limits. At that stage GET/HEAD stopped at
url.parse during argument evaluation, before either path call executed. This did not
close TARGET-001 or establish filesystem containment or the ENOENT path.

Reconciled in the legacy URL/warning layer on **2026-09-30**: path-only parsing
and both actual normalize calls computed the original GET/HEAD request path,
then stopped at fs.existsSync without a fabricated filesystem result. Source
provenance distinguishes installed-package warning suppression from checkout
eligibility; the warning queue and default presentation have separate bounded
delivery. New URL-001/URL-002/WARN-001 retain parser, provenance, process, scheduling
and output limits. Shared parser corrections preserve raw astral quoted-string
values and the empty cooked value of physical U+2028/U+2029 continuations while
respecting adjacent escapes and escaped backslashes. Valid physical CRLF
continuations and ordinary physical U+2028/U+2029 text in quoted strings still
reject before AST creation and remain explicit analysis gaps under LANG-002.
At that stage TARGET-001/TARGET-002 and the ENOENT goal remained open.

Reconciled in the filesystem-state layer: one symbolic closed tree now drives
exists/stat/read outcomes. The unchanged GET/HEAD `/docs` handler completes 404
for a missing directory or throws the missing-index ENOENT before committing a
response for an empty directory. Both conditions have matching native witnesses;
the tree choice stays unknown. This achieves the first bounded filesystem
exception result, not full server analysis. New FS-001/FS-002 preserve tree,
metadata, resource, API and Buffer-success limits. TARGET-001/TARGET-002 remain
open for the wider application domain; automatic witness generation remains open
under TARGET-003.

Reconciled in the Buffer-read layer: successful default reads now return fresh
byte values. Indexed numeric writes use the persistent heap; aliases, earlier
contexts, separate reads and filesystem contents retain the correct relationship.
Finite byte choices decode with the same path knowledge, including correlated
multibyte sequences. The unchanged GET/HEAD regular-file and directory-index
paths now reach the actual `data instanceof Error` boundary after their read
returns. New BUFFER-001/BUFFER-002 retain API, coercion, backing-store, allocator,
resource and symbolic-byte limits. No existing group is closed and no complete
upstream Node test is claimed passing. Generic property-access hooks do not
establish general typed-array, descriptor or enumeration support.

Reconciled in the shared-instanceof layer: the operator now performs modeled
symbol-method lookup/calls or ordinary prototype traversal with conditional
completions. Twenty-six complete Test262 files add 52 variants. Internal symbol
slots are declared immutable embedding inputs, not public Symbol/descriptor
support. A partial Symbol global now stops unsupported creation/property reads
instead of inventing a catchable missing-global ReferenceError. NativeError
constructors have their proper Error ancestor; Buffer's known internal chain
allows the original server's Error check to be false and reach path.parse.
Incomplete host/array prototype chains, inherited __proto__ getters/setters and
intrinsic prototype writes stop rather than produce false conclusions. New
LANG-009 retains these symbol/prototype/diagnostic boundaries; LANG-006 explicitly
retains the legacy Function constructor defects. No existing group is closed.

Reconciled in the POSIX path-parse increment on **2026-10-01**: parse now returns
fresh ordinary objects with root/dir/base/ext/name in Node order for concrete
strings and finite symbolic choices. Native comparisons cover lexical dot/slash
boundaries, the pinned /.. quirk, mutable results, primitive validation and
conditional errors. The unchanged server computes its MIME choice and commits
status 200, still with numeric O/K headers from its reversed writeHead arguments,
then stops at response.write. PATH-001/PATH-002 retain platform/API, diagnostic,
reflection and open-string limits; no existing group is closed and no complete
upstream Node case is claimed passing. PRs #23–#50 are merged; future increments
are validated and pushed directly to master.

Reconciled in the response-write increment on **2026-10-02**: ordered string and
Buffer writes now commit implicit headers and retain chunk references in
persistent state. End consumes current bytes under an explicit healthy schedule
with no intervening flush; later Buffer mutations do not rewrite captured output.
Per-string UTF-8 encoding and aggregate byte decoding preserve surrogate and
split-byte boundaries. Normal writes retain unknown Boolean capacity results;
HEAD/204/304 suppression returns true. Primitive chunk errors and falsy repeated
end are modeled; deferred errors and broader overloads remain gaps. The unchanged
server now completes file serving and explicit finish delivery, preserving its
existing incorrect headers and escaping filesystem failures. Combined symbolic
GET/HEAD at that stage retained a spurious 405 due to choice-equality precision
(SYM-001); per-method proofs were precise and the combined unknown was tested. HTTP-008 records
transport/queue/precision/resource boundaries; HTTP-003/HTTP-005/HOST-002 and the
target entries retain their residuals. No existing group is closed and no
complete upstream Node case is claimed passing.

Reconciled in the symbolic-string increment on **2026-10-02**: concatenation
shares numeric length facts, and slice recovers known UTF-16 edges or retains a
symbolic expression with conservative length bounds. Forty-nine local specs
cover unrestricted-input proofs/unknowns plus independent pinned Node coercion,
ordering and boundary checks; fourteen complete Test262 files add 28 variants.
New numeric-hint conversion preserves calls/throws and explicitly rejects exotic
Symbol.toPrimitive/partial-host symbol reads. Slice guards the same receiver
boundary; general coercion gaps remain LIB-002. The legacy URL slice guard now
checks intrinsic identity instead of assuming the method absent. SYM-001 retains
string precision work; new STRING-001 makes existing string allocation/engine
limits explicit. Metadata writes and sloppy replacement receivers remain under
OBJ-001/LANG-006. No group is closed, no historical skip is removed, and legacy
split/substr behavior is not certified by the new slice support. This branch is
an explicit user-requested PR exception to the direct-master workflow; PR #51
has since merged at c0ef248a9f91c541f767b272b66a12733adbdf57.

Reconciled in the choice-equality increment on **2026-10-02**: assuming an
existing strict equality now examines feasible alternatives under prior facts,
substitutes both references to the same choice, and retains only common facts.
Boolean choice assumptions use that same prior-knowledge discipline. The
unchanged server's combined GET/HEAD and index-presence proof now excludes the
impossible 405 and preserves successful bytes or escaping ENOENT. It does not
filter paths or narrow the original inputs. Nested, mixed, numeric and reference
choices retain NaN/signed-zero semantics, effects and unknown alternatives.
Nine whole Test262 cases add 18 variants; complete NaN/boxing candidates remain
inactive for LIB-001/OBJ-003/LEGACY-001, not trimmed. No group is closed: SYM-001
retains disjunctive relationships and delayed propagation; SYM-004 retains repeated
graph work and resource limits. This increment adds no new host success assumption.

Reconciled in the filesystem access/capacity increment on **2026-10-02**:
helper-created entries now retain stable symbolic effective read/search facts;
filesystem calls share a baseline descriptor-availability fact. Closed-tree
traversal retains EACCES before hidden-child absence, relative cwd semantics and
trailing slash versus explicit dot. EACCES/EMFILE are real thrown completions,
with original paths and ordered effects. Explicit Linux/default versus Darwin
selection preserved the then-observed empty-path priority (superseded by the
2026-10-21 kernel-ordering reconciliation below); overlong paths remain guarded even on
exhausted branches. Invalid platform/access setup rejects analysis. Independent
native chmod and bounded child-only descriptor-exhaustion cases cover the same
observable boundaries; GET/HEAD witnesses reproduce escaping failures in the
unchanged server. A sixteen-assignment symbolic proof classifies 404, EACCES,
EMFILE or 200/body without selecting inputs or filtering paths. No group closes:
FS-001 retains credential policy, changing access/capacity, shared process-wide
resource accounting with HTTP-001, post-open fstat/read/close failures, ENFILE,
allocation and atime effects. Availability describes modeled filesystem calls;
the native server exhausts after acceptance, while startup keeps its separate
success assumption. FS-002 retains API/error/Stats gaps; BUFFER-002 still assumes
successful allocation even on a directory read. No Test262 case or historical
skip changed, and no complete upstream Node file is claimed passing.

Historical agent/security planning increment on **2026-10-02**, superseded
by the runtime-contract clarification below: the initial proposal added REPORT-001 and
SECURITY-001/002 for the missing agent protocol, dependency admission semantics,
information-flow policies and adversarial-artifact/approval boundary. These are
newly recorded goals/gaps, not implemented capabilities. Existing LANG/CJS/SYM/
HOST/LEGACY groups retain their detailed semantics and precision blockers;
the initial plan required rejecting inaccurate legacy semantics for security
proofs; the clarification applies that requirement to every runtime consumer.
It prioritized a library report over the real-server proof, then a benign
outbound fixture; the CLI/state contract below replaces that priority. No source,
spec, selected Test262 or skipped inventory changed,
and no Shai-Hulud artifact was acquired or executed. There are now **62 stable
open gap groups**, with no group closed by this planning work.

Reconciled after the runtime-contract clarification on **2026-10-02**:
[the symbolic-runtime contract](symbolic-runtime.md) supersedes the earlier
library-first policy report. The primary surface is a language-independent CLI:
symbolic initial environment to resulting symbolic environment, with the same
representation for concrete values and an optional concrete default capture.
REPORT-001 retains its stable ID but now tracks state serialization/round trips,
CLI/default-state construction and explicit partial execution, not core policies.
SECURITY-001/002 remain downstream consumer/gate objectives. Classification,
sensitivity, policy and verdict fields are removed from the proposed VM input;
bugs, correctness and performance are equally valid consumer use cases. Bash/GNU
tool profiles are a future runtime extension (HOST-001/002), not native fallbacks.
No runtime or test behavior changed and none of the 62 groups closed.

Reconciled when selecting the **pico CLI startup without an environment file**
milestone on **2026-10-02**: REPORT-001 first covers CLI/default-state capture and
serialized startup/waiting state. CJS-001 retains automatic disk/source acquisition;
HOST-002 retains event scheduling; HTTP-001 and CONSOLE-002
retain binding and output failure assumptions. Existing specs manually build
the graph/models and deliver listening; those are not yet a default runtime.
The unchanged upstream example requests port 8080, whose availability is not
established by capturing files or by unrelated ephemeral-port reference runs.
Pending/unsupported binding is truthful interim progress, not ready-server
evidence. Explicit environment input and full resumption remain open subsequent
work. No source, spec, selected corpus or historical skip changed; all 62 groups
remain open. See [the acceptance criteria](roadmap.md#next-milestone-pico-startup-through-the-cli-with-no-environment-file).

Reconciled in the **conditional-console and callback-design** increment on
**2026-10-03**: two [console regressions](../test/node-console.spec.ts) establish
the agreed random-branch example's output alternatives/shared suffix and the
four outcomes from independent random choices. They use existing VM semantics;
no CLI, serializer or public inspection API was added. REPORT-001 retains that
work. HOST-002 retains automatic symbolic event construction/exploration and
invocation-time state dependencies; existing function definitions and restricted
pure recursion summaries do not establish callback behavior or unbounded event
coverage. Node built-in API models remain the accepted boundary. Console write
inspection and development gap IDs are not a public environment schema. No
production source, selected Test262 file or historical skip changed; all 62 gap
groups remain open.

Reconciled in the **first runtime CLI** increment on **2026-10-03**: the actual
executable now captures one regular UTF-8 CommonJS entry/package-format metadata
and initially emitted a versioned graph envelope for the shared VM's synchronous completion and
conditional console history. Identity, maps, cycles, special primitives, lexical
definitions and event snapshots survive JSON inspection. REPORT-001 remains
open: this is an explicitly nonresumable projection, no environment input,
semantic-model fingerprint, full host/private closure state or portable decoder.
At analysis failure only a known checkpoint survives, not every sibling or
continuation; arbitrary native-model failures may retain an earlier checkpoint.
CJS-001 retains dependency capture/resolution, symlink/platform semantics and
main-module API gaps. Entry/package capture is read-only but not atomic; invalid
UTF-8 and nonregular inputs reject. Process/host environment capture, general
source-size/parser/serializer/resource limits and secure acquisition remain open.
Only console imports are connected; uncaptured modules are never assumed absent.
HOST-002 retains all automatic external-event exploration. CONSOLE-002 retains
the declared healthy-stdout domain. Partial globals/Math guard missing surfaces,
and known incorrect Number conversion and Number/Boolean construction now reject
through shared boundaries, including aliases. Dynamic Function now uses concrete
string parameter lists and the final body correctly; unknown/nonstring/zero-argument
forms stay guarded.
LEGACY/LIB groups retain the rest of their incomplete intrinsic semantics; this
does not establish that every wrong or absent builtin path is guarded. All 62
groups remain open. One complete Function constructor Test262 file is newly
active; the complete historical skip inventory is unchanged. See [CLI evidence and schema](cli.md).

Reconciled after the **stdout graph correction** on **2026-10-03**: stdout now
contains only the actual `{ roots, nodes }` graph. Removed the hard-coded
model-domain/limitation prose and the surrounding input/state/execution/version
report; no replacement narrative is hidden in graph nodes. Model-domain notes
were implementation descriptions, not derived symbolic facts. Reached analysis
stops omit the completion root, emit their diagnostic on stderr and return exit
status 2; a program throw or undefined export retains a completion root and exit
status 0. Subprocess specs distinguish these cases and preserve application
properties with the removed envelope's names. REPORT-001 retains proper
source/environment provenance in modeled state, graph versioning and portable
snapshots: P037 now publishes source identities/launch metadata, but saving JSON alone
loses stderr's stop reason. CONSOLE-002's healthy-output domain remains a real
modeling gap, not a fact established by removing its prose. No evaluation domain,
selected Test262 file, historical skip or stable gap group changed.

Reconciled in the **automatic CLI dependency acquisition** increment on
**2026-10-03**: the CLI now uses the shared CommonJS resolver/loader with
[read-only source capture](../src/cli/source-capture.ts). Reached local/nested,
JSON, package-main/exact-exports and finite-choice imports retain cached bytes,
hashes and positive/negative path observations across branches; evaluated module
cache contents stay in each branch's persistent heap. Main id `"."` and cycle
identity now use the same loader record. [Import](../test/cli-imports.spec.ts)
and [capture specs](../test/cli-source-capture.spec.ts) preserve unsupported
formats, missing-local completions, symlink/encoding boundaries and host
acquisition failures without native dependency execution. Unresolved bare
packages stop because NODE_PATH/global fallback is uncaptured. CJS-001 remains
open for non-atomic observations, alternate symlink/launch/platform behavior,
external search paths, complete provenance and public loader/process APIs.
Initial entry-acquisition failures remain CLI exit 1; reached dependency
acquisition failures retain an analysis checkpoint and exit 2, not a catchable
target filesystem exception. REPORT-001 retains publication of source/probe
state and full serialization/resumption; source-size/I/O/parser/serialization
budgets and race-resistant acquisition remain open under REPORT-001/SECURITY-002.
Source acquisition does not implement the target's fs module or close FS-001.
The unchanged pico example now loads its package and stops at unregistered
`http`; no new binding success or request/transport assumption is introduced.
Only console is registered, so HOST-002/HTTP-001 and the complete startup
milestone remain open. All 62 groups and the active/skipped Test262 inventories
remain unchanged.

Reconciled in the **symbolic HTTP binding and host-state links** increment on
**2026-10-04**: the optional HTTP bind transition now returns null success or
Error failure, including choices; invalid configuration/results reject instead
of selecting success. Default embeddings retain their declared successful-bind
domain, while the CLI supplies a fresh symbolic TCP outcome per attempt and
registers HTTP plus its shared EventEmitter. Hostless binding occurs inline and
correlates `listening` with the retained outcome; explicit loopback binding waits
for delivery. `completeListen` delivers success/error with current listeners and
lexical state, preserves unhandled throws, and permits retry after consuming a
failure, including retries from an error listener. Overlapping pending retries
still reject. [Binding](../test/node-http-binding.spec.ts), [isolated native
observations](../test/node-http-bind-reference.spec.ts) and [default-transition
specs](../test/node-tcp-bind.spec.ts) retain these boundaries. HTTP-001 remains
open: unknown error fields lack OS-specific correlations, attempts do not share
a modeled socket/descriptor/address pool, and broader platform/resource failures
are not precisely modeled. HOST-002 retains explicit-host bind/notification
compression, missing cross-server queue ordering and automatic scheduling.
The CLI stops after synchronous entry evaluation with pending attempts; no
listening/error/request callback is drained. [Host-slot specs](../test/host-slots-graph.spec.ts)
preserve server/emitter state associations through the generic graph. Immutable
links are separate from guest properties and do not prove initialization;
private registries still authorize receivers, so REPORT-001 remains open for
full host reconstruction/resumption. Pico now resolves HTTP and stops at HTTPS;
remaining host assembly and the ready-server milestone are not completed.
Default transport/stdout assumptions, CJS gaps, the Test262/skip inventories and
all 62 open gap groups remain unchanged.

Reconciled in the **bounded CLI startup queue** increment on **2026-10-04**:
[jobs](../src/jobs.ts) retain pending/active calls in persistent state, copy the
argument list, read current captures and drain iteratively in FIFO order.
Dequeue happens before invocation; callback-enqueued work joins the tail.
Symbolic branches retain their own timelines, and a language throw leaves that
branch's remaining jobs unexecuted. Invalid job budgets, active-job resumption
or reentrant draining, and unsupported pending-list structure stop analysis.
Each delivery consumes the shared evaluation budget plus an explicit job limit;
budget exhaustion preserves the pending head. Callback and branch-join analysis
failures retain an available checkpoint, not the whole explored frontier.
[Queue specs](../test/jobs.spec.ts) cover these rules. HTTP's snapshotted optional
queue configuration is validated; queued attempts reject manual completeListen
and notification before binding. Hostless binding queues a notification;
explicit loopback lookup/binding queues its notification separately behind
existing jobs. [HTTP startup specs](../test/node-http-startup.spec.ts) and
[independent Node observations](../test/node-startup-reference.spec.ts) cover
ordering, late listeners, retries and fatal callback/error alternatives.

The CLI drains after normal entry completion, preserving exports on normal
completion and retained tails on throwing paths. Its global node.nextTick slot
publishes ordinary queue state in the graph, not a guest process API or resumable
continuation. The unchanged pico subprocess now reaches waiting-server/startup
output and unhandled-bind-failure alternatives without inventing requests.
[Opaque builtin specs](../test/node-opaque-builtins.spec.ts) validate only object
type and alias identity for unused https/fs/url/path imports; reached operations
stay guarded. Source acquisition is not filesystem state; no empty tree or URL
warning environment is fabricated. HOST-002 retains public nextTick, timers,
microtasks, I/O arrivals, general DNS, recovery hooks, warning-queue integration
and automatic future-event exploration. REPORT-001 retains full capture,
provenance, versioning and resumption; HTTP-001 retains uncorrelated OS/resource
outcomes and CONSOLE-002 retains healthy-stdout assumptions. The three reviewed
complete nextTick candidates remain inactive. All 62 gap groups remain open;
Test262 and the historical skip inventory are unchanged.

Reconciled for CLI filesystem assembly: the automatic runtime now registers the
read-only adapter's module and graph-linked state. Text reads retain success or
EMFILE; observed missing-index reads retain ENOENT or EMFILE. Existence probes
leave unobserved entries/content open. Subprocess graph and no-native-write specs
cover the actual public entry. FS-001/FS-002 and REPORT-001 retain non-atomic,
separate source/environment observations, finite paths, binary/symlink/access/
resource/serialization boundaries. Capture does not prove descriptor availability.
No active Test262 or historical skip changed; all existing groups remain open.

Reconciled in the **unfinished execution branches** increment on **2026-10-05**:
[typed boundaries](execution-boundaries.md) preserve exact stopped leaf state
alongside normal and throwing siblings in either exploration order. AST/job
budgets, absent AST resolvers and opaque builtin member access are explicitly
classified. Guest catch/finally and cleanup cannot consume these boundaries;
active jobs remain active only on stopped paths. Entered source frames and
remaining statement sequences survive the generic graph. A partial tree's
aggregate context is its explicitly identified base, not final joined state.
REPORT-001 remains open for complete continuation capture/resumption, remaining
legacy guard migration and loss of siblings on unexpected failures or unsupported
joins. HOST-002 retains scheduler coverage and shared-budget fairness limits.
TEST-001's runner now rejects unfinished tests and cannot count them as language
throws. No Test262 selections, complete Node upstream activations, historical
skips, source-capture scope or host success assumptions changed. All 62 gap groups
remain open; the complete 46-file skipped inventory was reconciled unchanged.

Reconciled in the **bounded incoming-event exploration** increment on
**2026-10-05**: [persistent providers](external-events.md) register eligibility,
delivery and receiver identities in ordinary graph-linked VM state. CLI
`--max-events 1` explores no arrival or one eligible server after normal startup;
default zero remains startup-only. Multiple and branch-created servers preserve
source existence and eligibility. HTTP allocates independent symbolic string
method/URL inputs only upon arrival and uses current shared listeners/captures.
[CLI behavior](../test/cli-incoming-events.spec.ts), [generic registry tests](../test/external-events.spec.ts)
and [independent valid Node witnesses](../test/node-incoming-events-reference.spec.ts)
cover throwing/normal/waiting/bindfailure paths and identity/order boundaries.
HOST-002 remains open for bounds above one (explicitly rejected), active-source
resumption/reentry, malformed/non-dense sources, non-Boolean eligibility,
resource/stack/capacity limits, general event ordering and callback summaries.
HTTP-001/HTTP-003/HTTP-008 retain parser/dispatch, socket/descriptor availability,
transport failures and end/finish scheduling: parsed strings are an explicit
overapproximation, not evidence of wire feasibility. REPORT-001 retains complete
frontiers and resumption; response host slots are identity links only. No complete
upstream HTTP candidate is activated, no Test262 selection changed, and all
46 historical skipped files and all 62 gap groups remain open.

Reconciled in the **two-arrival event histories** increment on **2026-10-05**:
HOST-002 now composes explicit one-step arrival/waiting results through bounds
0/1/2. The CLI drains its supported nextTick queue after each normally completed
arrival, including the last; later steps re-read source eligibility and current
listeners/captures. Callback-created servers become eligible only after their
queued listening transition. Throws/stops prevent another arrival on their
leaf; classified unsupported delivery retains active source state, and event
budget exhaustion preserves sibling outcomes. Generic hook/job boundary specs,
stateful arm/fire CLI proofs and independent valid two-request Node witnesses
supply evidence. Bounds above two, general timing/scheduling, public nextTick,
parser/transport/finish/resource families, native continuation resumption and
unclassified legacy failures remain HOST-002/HTTP-001/HTTP-003/HTTP-008/REPORT-001.
An event bound is not an environment restriction or all-timeline claim. TEST-004
retains complete upstream nextTick and HTTP/client/stream candidates; no whole
file is newly activated. Test262 selection and the exact 46 historical skips
remain unchanged, and all gap groups remain open.

Reconciled in the **shared warning jobs** increment on **2026-10-05**:
`createWarningModel({nextTick})` schedules each warning through the shared FIFO;
manual `deliverNext` rejects queued ownership and remains available for explicit
embeddings without a queue. [Warning-job specs](../test/node-warning-jobs.spec.ts)
independently compare pinned Node hostless/explicit-loopback startup ordering,
nested enqueue behind the tail and unrecovered formatter/listening-callback failures. Persistent
warning and URL-once state now have immutable host-slot graph links. Delivery
reads current fields/formatters; throws clear completed active jobs, while
classified stops retain active warning identity and unexecuted tails. URL source
eligibility and current `process.emitWarning` remain unchanged. WARN-001 and
HOST-002 retain all broader process flags/listeners, public nextTick, event-loop
phases and unhealthy stderr outcomes. No CLI assembly is changed by this model
option; no new whole upstream case or Test262 selection is claimed. All 62 gap
groups remain open, and the complete historical skip inventory is unchanged.


Reconciled for the second immutable target on **2026-10-05**: complete sirv 3.0.2
and three runtime dependency fixtures add provenance checks and pinned Node
GET/HEAD/missing-file references. CLI source acquisition selects its real package
export, then stops at object binding destructuring (LANG-001). No new production
semantics or support guard was added; later host/language gaps remain open.
The historical skipped-file and active Test262 inventories are unchanged.

Reconciled in the **object declaration bindings** increment on **2026-10-05**:
[shared bound-name collection and initialization](object-bindings.md) cover
var/let/const object patterns, renaming, defaults, nesting, inherited/repeated
reads, concrete and finite-choice computed keys, TDZ and conditional abrupt
outcomes. Nullish input throws TypeError even for empty patterns; its diagnostic
remains unknown instead of inventing syntax-dependent Node wording. Forty-five
complete Test262 files add 90 variants; the runner interprets complete sta.js to
provide Test262Error rather than aliasing an unrelated constructor. LANG-004
remains open for array/rest patterns, parameter/catch/assignment destructuring
and function-name inference (name reads still reject). OBJ-003 retains nonempty
primitive-pattern boxing and unknown/Symbol/general key coercion; OBJ-001/002
retain ordinary accessor construction and descriptor semantics. Getter-order
fixtures use existing shared property access hooks, not invented accessor support.
Unsupported patterns reject at instantiation; malformed patterns without initializers
also guard. These guards retain the existing analysis-error mechanism, not newly
invented catchable program failures. TEST-001 retains the wider harness/flags/
includes gaps, and TEST-002's complete 46-file skip inventory remains unchanged.
The unchanged sirv regression now reaches the next actual blocker, the CLI's
opaque path.join read. TARGET-001/002 retain all later host/application work.
No gap group is closed by this supported subset.

Reconciled in the **declared process cwd** increment on **2026-10-05**:
[process environment state](node-process.md) adds a shared, mutable `process.cwd`
method to the same warning process identity. Calls read declared persistent cwd
state and retain host effects; global/import aliases and warning queue slots stay
shared. Pinned Node comparisons establish `wrappedCwd`/length-zero metadata,
receiver/argument behavior, mutable method calls and native constructibility;
construction/prototype/metadata behavior remains explicitly guarded. New
PROCESS-001 preserves concrete canonical POSIX input, stable retrievable-cwd
assumptions, missing/getcwd/chdir/race/platform gaps, one-time pre-execution
composition and the remainder of process APIs. No host getcwd/chdir is executed
by the model. Runtime assembly and cross-model filesystem/path wiring remain
separate work. No new Test262 or whole Node upstream case is activated. All 63
gap groups remain open and the complete 46-file historical skip inventory is
unchanged.

Reconciled in the **opaque host function identities** increment on **2026-10-05**:
[known callable exports](node-filesystem.md#known-callable-exports-without-an-implementation)
preserve type, identity and inherited `.call` before their implementation exists.
Only `fs.readdirSync` is registered this way; calling it leaves one reached call
and a typed unsupported leaf, never a fabricated return/error or filesystem
transition. Construction, own metadata and property mutation remain guarded.
LANG-006 retains those boundaries and the shared `.call` metadata guard;
FS-002 retains directory enumeration and all existing filesystem exclusions.
The CLI's querystring export is an opaque object with guarded APIs, under the
same pinned default-export assumption as other opaque imports (HOST-002).
REPORT-001 retains legacy reflection guards, complete continuations and runtime
integration. Focused identity/call/symbolic/construction specs and pinned native
controls do not establish package import success or complete builtin behavior.
TEST-004 retains the complete upstream harness/API gaps; no Test262 files or
historical skips change, and all 62 gap groups remain open.

Reconciled in the **typed Node model boundaries** increment on **2026-10-05**:
URL/path/warning explicit model guards now preserve stopped leaves beside
normal/throwing siblings. Individually marked partial modules/functions/prototypes
use shared typed member, descriptor/enumeration, symbol/prototype and explicit
construction guards; unmarked metadata, argument diagnostics and all unexpected
native errors/invariants remain failures. URL once-state, already-enqueued
warnings, current warning fields, active jobs and pending tails survive stops.
The [boundary specs](../test/node-host-boundaries.spec.ts) cover both branch orders,
no guest catch/finally recovery and unclassified errors. A guard over unknown
joined intrinsic state still conservatively stops that joined checkpoint;
refinement/full continuation recovery is not claimed. PATH-001/PATH-002,
URL-001/URL-002, WARN-001, PROCESS-001 and REPORT-001 remain open. This adds no Node
API/input coverage, Test262 selection or whole upstream pass; existing native
compatibility observations remain the supported-behavior evidence. All 63 gap
groups and the complete 46-file historical skip inventory remain unchanged.

Reconciled in the **event delivery continuation correlations** fix on **2026-10-05**:
HOST-002 now applies each after-event hook and subsequent step inside the selected
provider branch before joining with another provider or waiting. The previous
join-and-split sequence could expose the initial no-arrival state to a hook and
retain an impossible guest throw under contradictory conditions. New generic
[sequence regressions](../test/external-event-sequences.spec.ts) fail on that VM
completion, check exact delivery/hook histories for two providers at horizons
one/two, preserve stopped-hook leaf knowledge, and retain legitimate event errors.
The public `step` Boolean API is unchanged. SYM-001 still lacks general refinement
of a composite Boolean after independent branch assumptions; this fix avoids that
loss of precision for internal exploration rather than extending the solver.
Effect-path enumeration can still overapproximate impossible combinations in
other joined graphs, so an enumerated path is not a satisfying witness. Existing
Node native witnesses and complete upstream candidate boundaries remain unchanged
(TEST-004), as do Test262 selection and all 46 historical skipped files. No gap
group is closed or runtime input narrowed.

Reconciled for **bounded directory enumeration** on **2026-10-05**:
[readdirSync](node-filesystem-enumeration.md) lists complete declared directories
and complete acquired name lists under existing symbolic conditions. A separate
persistent names fact keeps enumeration completeness distinct from child metadata
and file contents; unobserved open directories never produce partial/empty success.
FS-001 retains stable observations, non-atomic timing, permission/resource facts,
undetected races, per-call descriptor baselines and post-open success assumptions.
The bounded read-only adapter memoizes names, preserves lossless UTF-8 byte order,
checks prior child observations and rejects contradictions or unexpected host
failures. Unlisted captured spellings still require probes to exclude case-folding
and Unicode-normalization aliases; omission from a listing alone proves no native
lookup failure. Name/budget/option gaps are classified unsupported leaves; unexpected
acquisition errors remain diagnostic failures. FS-002 retains all nondefault
options (including explicit encoding strings), Dirent/withFileTypes, recursion,
non-string paths, arbitrary bytes and other APIs. SECURITY-002 retains acquisition
latency and traversal risks despite bounded name counts. TEST-004 records whole
readdir/readdir-types candidates as inactive; local Node 24 permission, ordering
and descriptor-exhaustion fixtures are not upstream activation. Existing 46-file
historical skips and Test262 selection remain unchanged. No gap group is closed.

Reconciled for **default Node environment assembly** on **2026-10-05**:
CLI process/global/import aliases, captured cwd, POSIX path and legacy URL now
share persistent state and warning/startup scheduling. Unchanged pico explores
completed OPTIONS/405, waiting and bind-error alternatives beside classified
open-URL GET/HEAD stops. Source frames, active delivery and pending work survive
JSON projection; no report prose is inserted. Readdir enumeration supersedes the
earlier opaque callable placeholder, while HTTPS/querystring stay opaque. The
unchanged sirv dependency import returned its actual factory; at that stage the
factory reached a RegExp-literal boundary rather than completed HTTP setup.
Raw Cherow RegExp objects also blocked final graph serialization; the RegExp
increment below supersedes those literal/serialization boundaries, while full
factory and HTTP setup remain unfinished (REPORT-001/LANG-001).
REPORT-001 retains nonresumable graphs, missing explicit environment inputs and
source provenance; URL/PATH/FS/HTTP gaps retain full request/file/transport work.
PROCESS-001 retains chdir/getcwd failures and broader process state. HOST-002 and
SYM-001 retain bounded schedules and general Boolean precision. Integration
regressions preserve source identity, shared aliases, job order, typed versus
legacy failures and the provider-correlation/filename-alias review corrections.
No whole upstream Node test or selected Test262 file is added by this assembly.

Reconciled in the **dense directory observations** fix on **2026-10-05**:
FS-002/HOST-001 now reject holes and inherited array slots in both supplied
complete-name observations and retained directory-name state. The previous
Array.some validation skipped holes and accepted prototype entries, allowing
invalid observation data to become guest filenames. Four
[regressions](../test/node-filesystem-readdir.spec.ts) fail before the fix; empty
and dense own-name arrays remain valid and returned arrays remain independent.
Native acquisition is unchanged. All enumeration/capture/platform/resource and
complete upstream gaps remain open; no Test262 selections or historical skips
change. This enforces the existing observation contract rather than narrowing
the native directory-name domain.

Reconciled in the **RegExp literal values** increment on **2026-10-05**:
[Literal values](regexp-literals.md) retain fresh identity, immutable original
pattern/flags and persistent arbitrary-value lastIndex writes. Partial instance
and prototype APIs/descriptors stay typed boundaries. Shared parsing rejects
Cherow's swallowed flag-sensitive failures before prefix effects or uncalled
function bodies, removes native RegExp values from all retained ASTs, and reports
unsupported modern d/v flags as parser admission boundaries. Existing host
compiler/Unicode-version dependence remains explicit under new REGEXP-001;
there is no matching backend, global constructor or complete grammar claim.
Seven complete Test262 files add 14 variants (one identity, six parse-negative).
The actual CLI sirv-import graph now serializes nested function definitions;
at that intermediate revision its default factory next hit the legacy missing
Array.push call. The combined array increment advances to Array.concat below. LIB-001, LANG-002, REPORT-001 and TARGET-002 stay open. All 64 gap groups
remain open and the complete 46-file historical skip inventory is unchanged.

Reconciled in the shared Array.prototype/push layer on **2026-10-05**:
ARRAY-001 retains the bounded receiver/layout, descriptor, constructor, metadata,
overflow and prototype-mutation gaps. LIB-001/LEGACY-002 remain open after replacing
array own-method placeholders with inherited shared intrinsics. LANG-009 now
includes actual Array intrinsic relationships; PATH-001 keeps its observable
native push dependency guarded. The added complete push and instanceof cases
have independent pinned Node evidence; no historical skip changed. Missing Number
constants still reject reads instead of enabling false upstream passes.

Reconciled in the **combined CLI/npm milestone** on **2026-10-07**: the unchanged
sirv factory now stores two distinct regex objects through shared Array.push,
then retains its state at the typed Array.concat boundary. This replaces the
legacy missing-call checkpoint without claiming completed factory execution.
Pico's bounded CLI request proof, source provenance and Node controls remain
regressions. The user's separately added authorization-history consumer goal is
preserved; policy stays outside the VM. Explicit environment authoring,
concat/forEach, loop completion/scope semantics, RegExp matching, file metadata,
streams and unbounded scheduling remain work for the next workflow. Final review
found that inherited indexed properties could make legacy sparse reverse/join/slice
produce incorrect concrete results. Shared guards now stop those reached cases,
including conditional prototype writes and nested joins, before mutation. Own
undefined and proven absent/out-of-range inherited indices remain supported.
The final inventory retains all **65 open gap groups**, 23 legacy assertion/helper
search hits in five files, and the exact **46 historical skipped files**. These
are audit counts, not a complete semantic inventory.

At reconciliation there were **94 source files**, **119 spec files**, and
**525 source lines in 70 files** matching the broad guard/placeholder search
below. These are search hits, including internal validation and comments, **not
525 independent missing features**. Concurrent implementation can change these
counts; rerun them before publishing a reconciliation. The active Test262 corpus
now has **250 complete files / 491 variants**, including the 19 untagged-template
files from the console/template layer and five quoted-string files from the
legacy URL layer and 26 files from the shared-instanceof layer, plus fourteen slice files, nine strict equality/inequality files and one Function constructor invocation file, and 45 object declaration binding files, plus seven RegExp literal identity/parse-negative files and three array push/intrinsic files.
POSIX parse and HTTP writes add
Node compatibility specs, not new Test262 selections. This is a selected baseline,
not full conformance. The one explicit
`test.skip` site expands to **46 historical skipped files**; no other
`test/it/describe.skip` or `.todo` sites were found. The full 46-file inventory is
retained below. Newly activated files belong in the active corpus, not this
skip count.

This is a source-and-document audit of the current repository, not a complete
inventory of ECMAScript or Node semantics, a proof that every unsupported path is
guarded, or a replacement for Test262/Node conformance. In particular, an absent
builtin may currently look like an absent ordinary property: the legacy audit
entries remain necessary even when a grep finds no rejection string.

Repeat these scans from the repository root (the commands inspect repository
state; behavior examples still belong in specs):

```sh
rg -n 'throw new|unsupported|unmodeled|TODO|FIXME|not supported|not implemented' src --glob '*.ts'
rg -n 'assert\(|unimplemented\(' src --glob '*.ts'
rg -n '\b(test|it|describe)\.(skip|todo)\s*\(' test --glob '*.ts'
rg -n 'gap|unsupported|assum|remain|limit|not yet|not modeled' README.md docs test/commonjs/README.md test/test262/README.md
git diff -- src test README.md docs AGENTS.md
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/test262.spec.ts test/test262/runner.spec.ts
```

To expand the actual historical glob selection without inventing a hand-maintained
count, run this read-only inventory command. If the corpus representation
changes, update this command with it.

```sh
node <<'NODE'
const fs = require('fs');
const { sync } = require('globby');
const { dirname, join, relative } = require('path');
const source = fs.readFileSync('test/test262.spec.ts', 'utf8');
const active = [...source.split('const activeCorpus = [')[1].split('\n];')[0]
  .matchAll(/"([^"]+\.js)"/g)].map(match => match[1]);
const globs = [...source.split('const historicalGlobs = [')[1].split('\n];')[0]
  .matchAll(/"([^"]+)"/g)].map(match => match[1]);
const root = join(dirname(require.resolve('test262/package.json')), 'test');
const skipped = sync(globs.map(glob => join(root, glob)))
  .map(file => relative(root, file)).filter(file => !active.includes(file)).sort();
console.log(JSON.stringify({ activeFiles: active.length,
  skippedFiles: skipped.length, skipped }, null, 2));
NODE
```

Reconciled in the **read-only filesystem environment acquisition adapter**
increment on **2026-10-05**: FS-001 now includes open directories and unknown
file contents with generic observation hooks. The separate bounded adapter
captures cwd/platform, effective access and first positive/negative/content facts;
conditional observation presence survives joins and earlier heap snapshots remain
unchanged. Descriptor availability remains symbolic by default. FS-001 retains
non-atomic observation timing, symlinks/aliases/nonregular entries, unsupported
platforms and credentials, access-policy inference, detected/undetected races,
post-open failures and resource coupling. FS-002/BUFFER-002 retain binary content
capture and broader argument/API domains. Unexpected acquisition failures remain
analysis stops; permission evidence is an observation, not a future open guarantee.
REPORT-001 retains CLI integration, provenance and resumption work; native capture
caches/hooks are not reconstructed from graph state. SECURITY-002 retains
race-resistant traversal, isolation and latency/resource concerns despite explicit
entry/content byte budgets. TARGET-002 retains automatic request exploration and
all broader file/environment domains. The capture specs add local independent
pinned Node evidence and boundary/symbolic tests, not upstream activation or gap
closure. The documented scans retain all **46 historical skipped files** and no
new skip sites; no complete Test262 or Node coverage is claimed.

Reconciled in the **POSIX resolve/cwd invocation** increment on **2026-10-05**:
PATH-001 now includes right-to-left resolve with indexed primitive diagnostics,
absolute-path short-circuiting and an explicitly supplied process identity. Cwd
reads/calls use the shared VM, including replacement effects/throws, the pinned
verbatim absolute fast path, and repeated calls after a relative fast-path
result. PATH-001 retains the missing cwd environment, non-string cwd coercions,
Windows deployment transforms, broader APIs and complete process behavior;
PATH-002 retains open symbolic argument/cwd strings. HOST-001/HOST-002 retain
trusted embedding and broader process/environment dependencies. The complete
upstream test-path-resolve.js remains inactive because its Win32/drive/child
fixture and harness requirements are not supplied by local POSIX comparisons.
No language corpus changes or new skip sites were added; the audit reconciles
all **46 historical skipped files**. No gap is closed by these local cases.

Reconciled in the **shared Array.prototype/concat** increment on **2026-10-07**
(P001): one reusable bounded concat operation replaces the sirv factory's
`concat` rejection with actual behavior and retains the real next boundary,
`forEach`, with both regex identities still in state. ARRAY-001 now covers the
ordinary intrinsic receiver/argument domain above; constructor overloads,
generic receivers, inherited-index materialization, species/spreadable symbols,
function operands, descriptors and totals above the documented 1024-element
analysis limit stay open, as do `forEach`, loops and RegExp matching. Three
complete Test262 files add six variants (A1_T3, A1_T4, not-a-constructor);
`not-a-constructor.js` runs natively with the upstream `assert.js` harness
beside `sta.js`, never a host substitute for missing built-ins. Review
correction during the increment required the 1024-element host-loop cap before
any copying work (a maximum-length operand otherwise enters billions of host
iterations outside the VM budget) and repaired three spec premises against
pinned Node: nested appends observe the mutated receiver plus both arguments,
holes advance the result index, and bare unknown numbers cannot prove
self-equality. Independent review then required a 32-total-operand cap before
any descent (empty operands still consume host recursion levels), an explicit
proof of the intrinsic chain's inherited symbol state for array operands
rather than checking own slots only, and budget checks before the inherited-
index scan; the caps bound per-path copying and recursion depth, not total
fork growth or allocation failure. There are now **95 source files**,
**120 spec files**, and an active Test262 corpus of **253 complete files /
497 variants**; the complete **46 historical skipped files** reconcile
unchanged and no skip site was added. No gap group is closed by this bounded
slice.

Reconciled in the **shared Array.prototype/forEach** increment on
**2026-10-08** (P002): one reusable bounded forEach operation replaces the sirv
factory's `forEach` rejection with actual behavior and retains the real next
boundary, totalist's directory loop beside a sibling filesystem throw, with
both regex identities still in state. ARRAY-001 now covers the ordinary
nonempty iteration domain above: captured length, current-state re-reads,
visited inherited values, thisArg rules, guest-throw stops and conditional
correlations. A whole-symbol-map guard was initially copied from concat's
spreadability proof; independent review correction 1 removed it, since
string-index lookups never consult symbol slots. Constructor/species guards
were never applicable: forEach performs none of those observable operations,
so each remaining rejection is justified against this algorithm's actual
property lookups and invocations. Red-phase review corrected two spec premises against pinned Node
(boolean computed keys need general ToPropertyKey conversion, so `8-12`
stays inactive) and required an imperative normal-visit loop (1024-deep host
recursion overflows the host stack; only genuine forks consume recursion
now). Seven complete Test262 files add fourteen variants (1-1, 1-2, 2-2, 5-2,
7-1, 8-1, 8-13, each natively verified in both strictness variants before
activation); no historical skip file was removed or added. The active Test262
corpus now has **260 complete files / 511 variants**. The same independent
review required per-visit boundary checkpoints preserving completed callbacks
and sibling histories on forked stops. No gap group is closed by this bounded slice.

Reconciled in the **shared bounded ForStatement** increment on **2026-10-10**
(P003): one reusable loop driver (`src/loops/for.ts`) replaces the sirv
factory's `ForStatement` rejection with actual ForBodyEvaluation semantics:
init once, test before each body, update after normal bodies and applicable
continues, unlabeled break/continue as interpreted abrupt completions, and
CreatePerIterationEnvironment copies for `let` (fresh sibling cells before the
first test and before each update; `const` not copied; `var` keeps hoisted
identity). The shared normal/abrupt audit covers merging (jumps fork against
other kinds, never select-joined), statement sequences, the generator bridge,
catch handling guest throws only, and finalizer replacement of jumps; the
parser's rejection of stray jumps is pinned by parse-negative cases, while
valid labeled statements parse and stop at the unsupported resolver. Ordinary iterations advance through an explicit host
frontier loop; per-path iteration budgets and a shared step cap stop
no-progress loops as typed budget boundaries with the actual unfinished
context, never as termination claims. The unchanged sirv factory now walks
totalist's directory loop and stops at sirv's ignore-filter RegExp `.test`
inside the walk callback beside the retained sibling filesystem throw; RegExp
matching stays out of scope. The bounded loop-minimum proof passes its ten-
element false/upper-bound assertions, renamed/maximum/wrong-reducer controls
and native non-finite/empty/tie/hole boundaries through generic order
reasoning with no min recognizer; disjunctive select-chain membership
(`m === d[0] || ...`) is now proved within the P005 leaf bound, with the
tested five-leaf order remaining unknown under SYM-001. Multiplying finite paths and accumulated symbolic
test exits reach the shared visit cap with completed siblings retained.
Twenty complete behavioral plus six parse-negative
Test262 files add 52 variants; the complete 46 historical skipped files
reconcile unchanged and no skip site is added. LANG-001/LANG-003 now record
the supported loop/completion domain with its residuals; no gap group is
closed by this bounded slice.

Reconciled for **P006 B2 unknown-length loop verification** on **2026-10-11**:
the first reached function-local loop test can invoke a private, bounded VM
proof of one changed finite-number carry over a dense immutable array with unknown length, including
the default uint32 range. The proof checks the real initialized base, arbitrary
indexed transition, every pre-existing binding write, exact safe-integer
successor and normal exit before publishing prefix order/membership/range facts
and the observable external counter. Readonly or unchanged aliases keep their
identities, and a failed candidate does not suppress a later eligible binding.
The ordinary reached state handles top-level and other unsupported loops;
speculative reads, effects and budget are discarded.
Minimum, maximum, renamed loops and a finite nonconstant full-domain case
have positive specs; wrong reducers, late deviations, extra writes, effects,
throws and invalid progress retain unknown or explicit boundaries. Concrete
edge cases are compared with pinned Node. This does not expand ordinary
syntax or activate Test262 cases. SYM-002/003/004 and LANG-001 retain the
boundaries below; no gap group closes from this loop family.

## JavaScript execution and properties

| ID / status / kind | Current boundary and evidence | Closure criterion |
| --- | --- | --- |
| LANG-001 — open — unsupported | The [AST resolver table](../src/ASTResolvers.ts) is a subset: while/do-while/for-in/of loops, switch, labels, classes/super, modules, await/yield, call/array spread, and other unregistered nodes have no evaluator. Bounded sequence (comma) expressions evaluate every operand left to right and complete with the last value (P026). Ordinary `for(init; test; update)` with absent clauses and unlabeled break/continue is supported with per-iteration lexical environments; see [loop boundaries](for-statement.md). P006 adds a narrowly guarded unknown-length numeric loop proof using this existing syntax; other symbolic loops retain ordinary bounded execution. Compound/destructured assignment, member updates and nonnumeric updates are also rejected. The [operator tables](../src/operators.ts) support bounded Number-domain unary `~` (P011), but omit other bitwise/shift/exponentiation, `in` and `delete`; parser acceptance alone is not execution support. | Add reusable evaluation/completion rules per syntax/operator, preserving evaluation order, errors, state and symbolic forks; activate complete relevant Test262 cases. Split this inventory as individual capabilities land. |
| LANG-002 — open — unsupported/testing | [Declaration instantiation](../src/Function/instantiate.ts) and the [parser supplement](../src/parseECMACompliant.ts) cover selected early errors, not all global declarations or Annex B sloppy block/statement functions. Cherow 1.5.4 syntax/early-error coverage is incomplete. Raw astral quoted values and escaped physical U+2028/U+2029 continuations are now corrected with source spelling/locations and adjacent escapes preserved. Valid physical backslash-CRLF continuations and ordinary physical U+2028/U+2029 text in quoted strings still reject before AST creation; [string specs](../test/string-literals.spec.ts) preserve both gaps. Failed parsing with backslash-CRLF stops analysis conservatively. For ordinary LS/PS, only the pinned unterminated-string diagnostic at that exact code unit becomes an analysis gap; invalid Unicode-escape errors retain SyntaxError. Neither guard certifies the whole source valid. Complete line-continuation-single.js/double.js and the JSON-superset line-separator.js/paragraph-separator.js remain inactive, not trimmed; see the [Test262 record](../test/test262/README.md). Historical parse negatives below remain unassessed activation debt, not evidence that executing async functions/classes is required. | Validate early errors before effects, strict/sloppy and block/global differences, valid source acceptance and Annex B behavior with complete cases. Fix CRLF continuation and ordinary LS/PS lexing, then activate the complete upstream files. Keep unsupported newer grammar and runtime support distinct. |
| LANG-003 — open — legacy/unsupported | JavaScript errors are not uniformly interpreted completions. [Member reads and calls](../src/ASTResolvers.ts), [heap writes](../src/execution-context/Heap.ts), and [construction](../src/Function/construct.ts) still use host assertions for some nullish access/noncallable/nonconstructor paths; invalid array-length assignment is likewise an analysis assertion. General statement completion values are discarded by [evaluateStatements](../src/evaluate.ts), affecting eval results. Unlabeled break/continue are now interpreted abrupt completions with audited merging, sequencing, generator-bridge, catch/finally and function/program-boundary composition; see [loop boundaries](for-statement.md). | Replace each applicable host assertion with the correct catchable language completion; test left-to-right effects and mixed normal/throw paths. Implement normal/empty statement completion values and eval propagation, without making internal analysis failures catchable. |
| LANG-004 — open — unsupported | [Parameter initialization](../src/Function/parameters.ts) supports identifier/default parameters. Object declaration patterns now support shared name collection, renaming, defaults, nesting and ordered shared reads; see [binding coverage](object-bindings.md). Bounded array declaration patterns over ordinary array literals now support ordered element reads, source/pattern holes, defaults, nested patterns and nullish TypeErrors (P027); custom iterables and the iterator protocol, rest elements, destructuring parameter invocation, catch and assignment patterns remain gaps. Primitive boxing and general/unknown computed keys reject; inferred initializer function names remain guarded by unmodeled name reads. Implicit mapped/unmapped `arguments` objects are represented by an unsupported binding, including lexical arrow capture and aliases. Explicit parameters named `arguments` are supported. See [arguments boundaries](../test/arguments-boundaries.spec.ts) and [default parameters](../test/default-parameters.spec.ts). | Model each binding pattern, mapped/unmapped argument object, aliasing and descriptors; preserve TDZ, defaults, eval, body separation, and symbolic effects in complete tests. |
| LANG-005 — open — unsupported | [Function creation](../src/Function/Function.ts) rejects async functions, generators, and async generators, even if their bodies never await/yield. Promises, microtasks, iterator/generator state, and async completion scheduling are not supplied by ordinary synchronous callbacks. | Implement their distinct creation/invocation/completion and scheduling semantics with complete tests; do not remove the guards by treating them as synchronous functions. |
| LANG-006 — open — unsupported/legacy | Interpreted function `length` and arrow nonconstruction/lexical `this` are supported. Opaque host functions retain callable identity and inherited `.call` but guard own metadata/construction. Shared `Function.prototype.call` retains known length/inherited call and now guards missing metadata and metadata writes; reflection still has legacy rejection paths. Inferred `name`, restricted `caller`/`arguments`, metadata writes/descriptors, `apply`, source `toString`, full method/home-object/new-target behavior remain gaps. Bounded `Function.prototype.bind` (concrete callable receivers, captured receiver/partial arguments, computed bound length, forwarding calls) is now modeled; bound construction, bound name metadata and symbolic receivers stay bounded (see the P016/P017 reconciliation). Sloppy primitive receiver boxing is rejected. The [dynamic Function constructor](../src/Function/Function.ts) now parses concrete string parameter lists and the final body separately and together, then uses shared function creation/invocation. Complete S15.3.2.1_A2_T1.js invokes the result with three arguments. Zero arguments, nonstring coercion and unknown source remain explicit gaps; parser errors are not yet catchable interpreted SyntaxError completions. Generated function name/source/new-target and complete grammar/early-error behavior remain incomplete. Earlier primitive-left instanceof cases alone did not establish these semantics. | Model function kinds, dynamic construction/ToString/parse errors and metadata with correct descriptors; exercise capture, receivers, construction and symbolic throws independently of one arrow example. |
| LANG-007 — open — unsupported/precision | [Eval](../src/eval/eval.ts) needs concrete source. Conditional new binding presence in an existing environment is rejected by [branch merging](../src/execution-context/branches.ts). CommonJS global var/function creation is rejected until global bindings share object storage. Eval declarations crossing implicit-arguments parameter markers are rejected. Environment records are retained indefinitely. | Model binding presence and object-backed globals, preserve eval collisions/TDZ/capture on each branch, establish accurate completion values (LANG-003), and add safe reclamation only when snapshots/closures retain their meaning. |
| OBJ-001 — open — unsupported | [Property operations](../src/ASTResolvers.ts) support ordinary data writes/lookup with persistent state, not general descriptors, getters/setters, proxies, symbol keys, exotic objects, object-literal `__proto__` setters or full prototype mutation. Ordinary inherited __proto__ reads/writes now reject explicitly while existing own computed data properties remain writable; Object/Function/Number/Boolean intrinsic prototype writes are guarded alongside existing Error/String guards. `Object.defineProperty`, `getPrototypeOf`/related reflective APIs and symbol-based coercion are missing. Borrowed `Object.prototype.toString` rejects partial host objects and objects inheriting from them because their `Symbol.toStringTag` is unknown; for example, Node console has the tag `console`, not `Object`. | Add shared internal property/descriptor/prototype operations used by literals, reads/writes, reflection and builtins; test getter order/throws, inherited setters, attributes, symbols and symbolic state. |
| OBJ-002 — open — unsupported | [Enumeration](../src/Object/enumeration.ts) only trusts complete enumerable string-keyed data objects and concrete string indices. Arrays/functions, Error/intrinsic/global layouts, partial host objects, unknown strings/key domains and unmodeled reads are rejected. Conditional known keys/order are supported. See [spread specs](../test/object-spread.spec.ts). | Establish real own keys, order, enumerability, presence, values and descriptors for each added kind; share rules across `Object.keys` and spread, including getters and branch-specific mutation. Never infer ownership by filtering familiar names. |
| OBJ-003 — open — unsupported | Computed keys admit concrete strings/numbers and bounded explicit conditional choices of those keys (P049); opaque unknown key domains and general ToPropertyKey remain absent. [Object construction](../src/Object/ObjectConstructor.ts) rejects primitive wrappers; [hasOwnProperty](../src/Object/prototype.ts) rejects primitive receiver boxing and unmodeled layouts. String wrappers and primitive writes are unsupported. | Implement wrapper/exotic indexed properties and key conversion, including conversion side effects and failures; test primitive access/ownership and symbolic keys without pretending unknown keys are absent. |
| REGEXP-001 — open — unsupported/assumption/testing | [RegExp literal values](regexp-literals.md) preserve fresh identities, original source/flags and persistent lastIndex state. P007 adds bounded flagless UTF-16 Boolean test with shared coercion/finite branches and an explicit NFA (512 source units, depth32, finite repeat128, 1024 states, 4096 input units, 200000 work visits). All flags/stateful matching, open strings, array/function primitive conversion, custom exec/Symbol.toPrimitive, lookaround/backreferences/named groups, public exec/results, global constructor, source/flag getters, other public prototype/symbol APIs, descriptor enumeration/definition/deletion and mutation remain guarded or absent. Existing Cherow compilation depends on the running host RegExp/Unicode version and admits gimsy/u flags only; d/v stop as parser boundaries. Flag-sensitive compilation failures now reject before all guest effects and native compilation objects are removed from every retained AST. Pinned Node24.21.0 controls and fifteen whole Boolean matching/conversion files supplement the one identity/six parse-negative cases; they do not establish full grammar or matching conformance. Whole descriptor/constructor/getter/stateful/Unicode/result-object cases remain unselected. Matcher caps do not bound Cherow native compilation, conversion or total symbolic branches. | Implement each intrinsic/descriptor/matcher operation with shared symbolic state, effects, current properties and lastIndex semantics. Establish a declared portable grammar/matching profile with explicit Unicode/backend dependencies; activate complete unmodified cases without treating parser or identity evidence as full RegExp support. |
| LIB-001 — open — unsupported/testing | [Initial globals](../src/execution-context/ESInitialGlobal.ts) and builtin prototypes are a small selection, not the standard library. Examples include missing Number constants/global `isNaN`, most Array constructor overloads and methods, JSON parse/stringify, the RegExp constructor/matching APIs (literal values are REGEXP-001), Date, BigInt, collections, iterators and promises. Symbol now has a partial callable global preserving typeof, but creation and property access explicitly reject; it does not implement symbol values or keys. Bounded trim, ASCII toLowerCase, lastIndexOf, substring and subsequent package-driven operations are implemented in the recorded increments below; Unicode casing and broader domains remain open. P046 also adds bounded decodeURI. Some other absent members currently return ordinary `undefined`, so missing builtin coverage needs audit as well as implementation. | Add shared concrete/symbolic semantics and complete Test262 coverage incrementally; mark partial intrinsic surfaces honestly until their absent-versus-unmodeled properties are distinguished. |
| LIB-002 — open — unsupported | [Coercion](../src/conversion/toString.ts) models supported ordinary string conversion. Shared [numeric-hint conversion](../src/conversion/toNumber.ts) now serves slice indices, preserving valueOf/toString calls, throws and finite choices. Slice receiver/index conversion rejects explicit exotic slots and partial-host symbol reads. General exotic `Symbol.toPrimitive`, default array conversion, function source conversion and unsupported value kinds remain gaps. [Operators](../src/operators.ts) reject arithmetic object coercion and unsupported symbolic numeric/relational/loose-equality coercions. Error cause/options, stacks and full Error descriptors/prototype behavior remain gaps in [Error](../src/error/Error.ts). | Share the correct hint-specific conversion and Error operations, preserve user code, coercion order and abrupt paths, and validate with complete upstream cases. |
| LANG-008 — open — unsupported/precision | Untagged templates use cooked text plus ordered ordinary ToString/concatenation; tagged templates and template-site object identity/raw strings are not implemented. Their substitutions inherit LIB-002 conversion limits and SYM-001 string precision. See [template specs](../test/template-literals.spec.ts). | Implement tagged call receiver/evaluation order, per-site template objects, raw/cooked values and invalid escapes through shared machinery; preserve symbolic effects/throws. Complete untagged support is not tagged-template conformance. |
| LANG-009 — open — unsupported/precision | Shared [instanceof](instanceof.md) preserves symbol-method lookup/invocation, receiver, Boolean conversion, effects/throws and ordinary prototype identity, including symbolic choices. The intrinsic default handler and explicitly declared immutable embedding symbol slots work; interpreted Symbol-key creation/mutation, symbol getters/descriptors, bound functions, Proxy traps/realms and broad prototype mutation remain gaps. Missing partial-host symbol information or prototype links reject analysis; modeledPrototype opts a host into a trusted ordinary link. Arrays now have the shared Array.prototype empty-array intrinsic with Object.prototype parent; broad intrinsic mutation remains guarded. NativeError constructors inherit Error, and Buffer has its actual internal chain, but these facts do not expose full descriptors/APIs. Invalid target/prototype/handler cases have interpreted TypeError with unknown message; stacks/descriptors remain incomplete. Cyclic embedding graphs stop explicitly. The readonly embedding map is a setup contract, not persistent runtime symbol state. | Implement public Symbol keys and descriptor/getter lookup, bound/Proxy/realm delegation and complete prototype transitions with ordered effects, native comparisons and whole Test262 cases. Preserve unknown relationships and mixed normal/throw paths. Expand precise diagnostics independently. Do not equate a declared internal slot or known link with full exotic-object support. |

## Legacy behavior needing explicit repair or quarantine

These entries are source-inspected mismatches or insufficiently defended old
paths. They must not be reported as proven-safe unsupported boundaries. Their
presence does not mean every recent proof uses them.

| ID / status / kind | Current boundary and evidence | Closure criterion |
| --- | --- | --- |
| LEGACY-001 — open — legacy/unsupported | [Number](../src/number/Number.ts) now guards nonnumeric/no-argument conversion, wrapper construction and missing static APIs; only numeric first-argument passthrough remains supported. Partial Number/Boolean prototype reads and Number has-instance/reflection paths can conservatively stop until internal wrapper slots and inherited symbol semantics are modeled. Boolean wrapper construction also guards through shared construction metadata; primitive calls retain shared truthiness. Dynamic Function now supports concrete string parameters plus the final body; zero/nonstring/unknown arguments stay guarded rather than silently compiling the wrong body. Alias/effect regressions are in [intrinsic boundary specs](../test/legacy-intrinsic-boundaries.spec.ts); these guards defer correct behavior, not close it. [Math.round](../src/math/round.ts) still uses old untagged result/NaN shapes and treats string arguments as NaN; the CLI does not expose it. Legacy native function metadata/construction and generated Function parsing/coercion remain incomplete. | Add concrete mismatch specs first, then correct primitive conversion, wrapper data, return shapes and function metadata, replacing each guard with semantics and complete upstream cases. Validate coercion effects/throws and symbolic arguments. |
| ARRAY-001 — open — unsupported/precision | [Shared arrays, push, concat and forEach](array-push.md) provide actual Array.prototype identity, zero-argument Array construction, ordinary-array push with current known element layout/length, persistent mutation, holes, aliases and symbolic values/receiver choices, and bounded ordinary-array concat with fresh shallow results, hole preservation, current-state reads, conditional-operand joins and surviving siblings, and bounded ordinary-array forEach with captured length, per-visit current-state re-reads, visited inherited index values, thisArg rules, guest-throw stops, conditional receiver/callback/presence correlations, surviving siblings and a 1024-visit per-path analysis limit with flat host stack depth for normal visits (forks still recurse). Unknown/segmented/symbolic-snapshot layouts and unequal-length joins stop; generic receivers/ToLength, custom hooks/prototypes/write guards, constructor shadows, internal symbol slots, inherited indexed elements (stopped on by concat when a hole would resolve to one, visited through shared lookup by forEach, still rejected by sparse legacy methods), function operands, array construction overloads, descriptors/accessors, overflow/partial maximum-length writes and totals above the documented 1024-element and 32-operand analysis limits remain unsupported. forEach additionally retains sloppy primitive thisArg boxing, boolean-key/deletion/freezing gaps and unbounded per-visit fork growth as a residual path-volume limitation. Nullish receiver TypeError messages stay unknown. All Array.prototype mutations stop while PATH-001 depends on unchanged intrinsic push. Method metadata/reflection and unimplemented standard Array API names are guarded; legacy reverse/join/slice retain limited algorithms and generic receiver stops. Sparse legacy calls also reject possibly inherited indexed elements from current prototype state, including conditional writes and nested joins; sparse custom lookup/prototypes and conservative whole-array slice checks remain boundaries under LEGACY-002. Six complete Test262 files (twelve variants: three push/intrinsic plus three concat), independent pinned Node comparisons and local symbolic/failure tests support this bounded slice. Shared bounded forEach adds seven complete files (fourteen variants) with the same evidence discipline; the remaining forEach directory files stay inactive, not trimmed. | Extend shared length/Set/descriptor/prototype operations before generic/exotic push/concat/forEach and length limits; preserve ordered effects and partial failures. Model path.join's observable intrinsic dependency before allowing Array.prototype mutations. Expand the remaining 15 whole push candidates and the unselected concat and forEach files without synthetic Number constants or partial harness substitutes. |
| LEGACY-002 — open — legacy | [String.split](../src/string/split.ts) now serves concrete string receivers with literal/omitted separators through ordinary host semantics (P030); its symbolic segmented-receiver path and [substr](../src/string/substr.ts) still assume the old representation, and RegExp separators, limit arguments and general argument/receiver semantics remain gaps. [String storage](../src/string/String.ts) still places legacy methods in property tables as if own properties; arrays now inherit their shared push/reverse/join/slice methods. Enumeration remains guarded; this does not establish full descriptor/prototype correctness. Sparse reverse/join/concrete slice now stop with typed unsupported boundaries when holes may resolve to current inherited indexed properties, including conditional Object.prototype writes and nested joins; custom sparse prototype/lookup surfaces also stop. The guard covers the whole array even for restricted slice ranges. Own undefined, absent holes, out-of-range prototype indices and dense symbolic-snapshot slice retain their behavior; array-push specs include independent pinned Node regression observations. Generic array methods, inherited HasProperty/Get effects, coercions and metadata remain open. | Replace old representation assumptions with shared string/array/property operations, add regression cases for ordinary concrete receivers first, then missing/extra/coercing arguments, holes/prototypes and symbolic choices. Guard any residual layout queries. |
| LEGACY-003 — open — legacy/assumption | The [old require adapter](../src/require/require.ts) simply reads a builtin map, separate from the modern source-graph loader; [vm.createContext/runInContext](../src/node-builtin-modules/vm.ts) is a partial context adapter, not Node VM compatibility. [prompt](../src/window/prompt.ts) supplies an unknown string without modeling cancellation/UI effects. [nodeInitialExecutionContext](../src/execution-context/nodeInitialExecutionContext.ts) retains legacy entry points. | Audit callers and public exports, replace/quarantine incompatible paths and document deprecation if chosen. New real-world proofs must use the modeled loader/host boundary, not silently substitute these adapters. |

## Symbolic reasoning and host-effect infrastructure

| ID / status / kind | Current boundary and evidence | Closure criterion |
| --- | --- | --- |
| SYM-001 — open — precision | The [fact/choice reasoner](../src/symbolic/index.ts), [numeric order](../src/number/symbolic.ts) and [arithmetic](../src/symbolic/arithmetic.ts) are incomplete. Remainder, operands possibly NaN/infinite and division intervals touching zero lack derived binary bounds. Later facts do not reanalyze stored arithmetic; relationships such as `x - x` can remain unknown. Shared [string inference](symbolic-strings.md) now derives concatenation length bounds and slices known UTF-16 edges, returning the original unknown middle when known boundaries are removed. Opaque slices retain expressions and bounds, including unknown indices. Arbitrary string equations, repeated slice identities/composition, later equality-based content refinement, full length algebra, mixed symbolic number/string + inference, encodings and unknown property keys still lack a complete solver. Shared [choice-equality refinement](symbolic-choice-equality.md) now derives discriminating/common guard facts from equality or inequality over existing nested choices, including mixed primitives and reference identity. The combined GET/HEAD/static-server index-presence proof excludes the impossible 405 and relates body suppression to the original Boolean. P049 proves the small independent-string-choice guard-agreement and repeated-leaf OR specs; general disjunctive relationships remain incomplete. Later assumptions do not generally revisit stored equalities or composite Boolean truth facts to derive these relationships. Splitting a joined Boolean result may retain contradictory path combinations, including impossible guest completions; effect-path enumeration alone does not establish satisfiability. Disjunctive membership over a loop-carried conditional selection chain is now proved within an explicit bound (P005): the bounded for-loop minimum computes a nested selection of its inputs and proves every `minimum(d) <= d[j]` bound through accumulated order facts, and `m === d[0] || ... || m === d[n]` is proved by refuting infeasible selection-path combinations (a rejected equality coexisting with the selections that would force it) in any candidate order. The leaf exploration is capped (4 leaves, depth 16, 8 usable assumptions including the current one, 8 resolution priors, non-choice leaves/candidates only, no reentrant new exploration); the tested five-leaf order remains unknown, and choice-valued candidates keep prior behavior. Incomplete lists, fresh values and NaN/maybe-NaN leaves remain unknown in the tested countercontrols (other inputs with those shapes can be definite), as do general guard-agreement disjunctions. External-event exploration now preserves its continuation inside the provider branch to avoid this loss of precision, while public step and other joined graphs retain the general limitation. The dedicated specs distinguish valid new proofs from genuinely variable unknowns and remaining precision limits. Math.random supplies fresh unknown numbers in [0, 1), not a PRNG-state or probability/distribution analysis. | Add sound reusable inference with positive proofs and mandatory unknown/counterexample boundaries, respecting IEEE rounding, NaN, infinities and signed zero. Do not turn stronger desired precision into an input restriction. |
| STRING-001 — open — assumption/unsupported | String-producing operations, including concatenation and slice, currently assume successful allocation. ECMAScript string lengths are finite nonnegative integers at most 2^53-1; actual engine string-size limits, allocation/resource failures and RangeError/OOM outcomes are not modeled. Unknown inputs are not restricted to sampled text, but normal-result proofs cannot establish absence of allocation failures. Deep expression traversal also has no guaranteed resource bound. The [string boundary](symbolic-strings.md) records this assumption; no claim of Node/V8 resource compatibility follows from ordinary string results. | Model the target runtime resource/size contract and observable failure order without performing real large allocations, preserve prior coercion effects and branch conditions, and add boundary/normal/throwing symbolic specs plus independent feasible native checks. Keep process-level OOM distinct from catchable language errors. |
| SYM-002 — open — unsupported/precision | [Symbolic arrays](../src/array/symbolic.ts) are immutable dense numeric sequence snapshots with stable identities and local numeric element facts/literal bounds. B1 supports guarded integer symbolic reads over the actual view length, snapshot/index identity, singleton membership and symbolic region endpoints, with no enumeration of the uint32 length range. Exact `k+c`, `c+k` and `k-c` positions require safe integer operand bounds and literal integer offsets; floating-point, unbounded and overflow-prone reassociation remains unsupported; see [index specs](../test/symbolic-array-index.spec.ts). An unproved present index, possibly inherited/custom lookup (including replaced Array.prototype or Object.prototype hooks), changed snapshot heap/length, or unrepresentable symbolic key stops as unsupported. The default Array.prototype read hook is trusted only when both its container and private original read-function identities match; replacement or in-place mutation stops uncertain reads, and current prototype heap entries are still checked. Concrete absent indices still use prototype lookup. Unknown holes, nonnumeric elements, mutation, symbolic writes, general symbolic index coercion/lookup, and broader shape contracts remain unmodeled. Symbolic slice requires a concrete nonnegative start and omitted end; ordinary slice/reverse need known positions and join lacks general object conversion. | Extend the shared array domain/operations while preserving aliasing, lengths, holes, coercion and out-of-bounds behavior. Verify stale snapshot facts cannot survive mutation. |
| SYM-003 — open — unsupported/precision | [Recursive summary inference](../src/Function/summaries.ts) still uses a singleton base case, strict suffix descent, four numeric candidates, one identifier array parameter and pure direct self-recursion. Inputs must be nonempty, dense and finite; NaN/infinity, empty-base strategies, captured mutable dependencies, arbitrary calls, mutation/effects, loops and general recursion are rejected. Separate [P006 loop verification](../src/loops/unknown-length-summary.ts) starts at the reached first test of a function-local loop and supports one changed mutable finite numeric carry over a dense immutable array with header `i < a.length`, initialized `i=1` and cached `a[0]`. It checks a private arbitrary body/update transition, all binding writes, exact successor and normal exit, with monotone candidate removal; external index exit identity is retained. Readonly and mutable-but-unchanged aliases retain their original values; one failed candidate can be followed by another eligible binding. Top-level loops, other guards, multiple carries, calls, abrupt bodies, changed snapshots, uncertain presence and nonfinite templates decline to ordinary bounded execution. No loop theorem is cached or imported into recursive summaries. Arrow lexical-this dependencies remain outside the recursive pure subset. | Expand verified induction strategies/candidate domains through adversarial specs, checking termination, every exit path and captured dependencies before publishing/cache reuse. Nonempty is necessary for the current loop base and recursive sample min, not a permanent limitation for other functions. |
| SYM-004 — open — precision/testing | Summary caching is by function and element-template identity; known-length arrays still unroll, and equivalent contracts do not share summaries. Nested choices may grow exponentially. Equality refinement keeps stored expressions shared instead of eagerly expanding them, but resolution/assumption can revisit that graph under different facts; this inference has no dedicated memoization/work budget or guaranteed stack bound. The P005 selection-membership leaf exploration adds its own explicit caps (4 leaves, depth 16, 8 priors, non-choice leaves/candidates only, no reentrant new exploration with conservative give-up); whole-solver fallback, join/merge, frontier and store costs are unchanged. B1 symbolic endpoint/region reasoning uses a separate bounded primitive numeric fact graph (128 facts/visits and depth 8 for exact affine normalization); concrete integer endpoints compare directly without this new cap, and symbolic read terms, lookup scans and guard facts have local caps; giving up yields unknown or a typed boundary, never a theorem. Its two-index selection is optional and the arbitrary-index path does not enumerate lengths. P006 B2 loop verification adds local caps of 96 AST nodes, five candidates, six refinement passes, 2400 private evaluation units, 256 inspected bindings, 32 environments and 128 heap entries; declining returns to the reached loop without spending caller budget. Its arbitrary-index proof avoids length enumeration even for the default uint32 range. The entry-count caps limit local scanning/cloning attempts, not bytes or nested value/map sizes in retained records; no global store-work budget exists. These caps do not bound the older general comparison solver, recursive summaries, ordinary fallback, merge/join cost, allocation or host stack. Proof-budget exhaustion and [effectPaths](../src/effects/trace.ts)' default 256-path limit are explicit failures, not proofs or domain restrictions. General execution has no complete termination strategy. Interpreted `for` loops bound work per path (1024 ordinary body entries in persistent context state) plus a shared 8192-visit frontier cap that counts re-walks past finished leaves as well as phase steps, checked between walks, and stops all remaining actives together; one walk may overshoot by its traversal size, so the cap is a between-walks checkpoint rather than a strict total-visit ceiling. Unknown-bound loops retain one exit leaf per explored iteration until that cap fires. Merge/join cost, environment-store growth, allocation, host-stack depth and same-phase continuation coalescing remain unresolved: the visit count bounds driver traversal and phase evaluations, not merge or collapse work. | Improve sharing, work limits and reporting without dropping paths or weakening assumptions; test budget exhaustion, cache invalidation and retained unknown results. Preserve bounded coverage in reports. |
| HOST-001 — open — assumption/unsupported | [Host functions](../src/effects/index.ts) trust supplied models to preserve returns/throws/state/effect order. A missing model rejects analysis; registration does not prove a supplied model sound. Native generator continuations cannot resume a fork as one host generator and must use [bindNormal](../src/evaluate.ts). Exotic host property read/write hooks can return shared value/context completions or defer to ordinary behavior; presence/descriptors/enumeration need their own models and remain guarded for Buffers. Effect traces describe modeled operations, not evidence that external I/O happened. | Validate each model against independent concrete behavior, include success/failure and branch isolation, and keep missing operations explicit. Generalize native continuation handling only with preserved per-path control/state. |
| HOST-002 — open — assumption/unsupported | Opaque querystring/HTTPS exports establish identity only, not builtin initialization effects or APIs. The [persistent job queue](jobs.md) is the first symbolic event-loop component: FIFO callbacks use current state, append behind the tail, and preserve conditional timelines and branch-local abrupt stops. CLI HTTP startup drains after normal entry completion; hostless notification and explicit-loopback lookup followed by separate notification preserve the supported ordering across shared servers. Manual embeddings without a queue retain compressed completeListen delivery. Invalid queue/budget inputs, active-job resumption/reentrant draining, notification before binding and manual delivery of queued attempts reject. Job limits and shared evaluation charges bound work across explored branches; they do not constrain program inputs. Queue capacity/allocation and unbounded schedules remain unresolved. Throw completions retain the propagation frontier in the default no-process-handler domain, not fatal process teardown: server handles can remain listening. Exit/beforeExit handlers, resource cleanup, stdio flushing and process liveness remain unmodeled. Public process.nextTick, timers/immediates/microtasks, general DNS, I/O arrivals, process recovery, cancellation and general event-loop phase ordering remain unmodeled. URL warning presentation now shares the HTTP next-tick queue; manual delivery remains available for unqueued embeddings. The CLI optionally explores up to two selected arrivals across parsed HTTP request and pending TCP completion providers (--max-events 1 or 2), retaining waiting and shorter histories; default zero remains startup-only. Supported nextTick work drains after every normal arrival, including the final one, before another source is selected. Hook/job throws and classified boundaries stop their own histories while siblings continue; active unsupported sources remain retained and event budget exhaustion is classified. Bounds above two, active-source resumption, malformed source lists and invalid eligibility reject. Request method/URL are independent symbolic strings, an explicit wire-input overapproximation; response completion still needs embedding delivery; HTTP bodies assume synchronous end consumption without intervening flush (HTTP-008). Histories beyond two arrivals, general reachable callback exploration and invocation-state summaries remain future work; a retained handler is not such a summary. | Extend bounded scheduling/environment choices with independent Node checks, preserving event order/state/failure, shared prefixes and permitted timeline conditions. Report unresolved events/schedules and preserve unfinished work; a drained startup queue is neither process exit nor all-timeline safety. |


## CommonJS and Node interfaces

| ID / status / kind | Current boundary and evidence | Closure criterion |
| --- | --- | --- |
| CJS-001 — open — assumption/unsupported | The shared [resolver](../src/require/resolution.ts) and [loader](../src/require/loader.ts) now support both a complete immutable supplied graph and the CLI's demand-driven [source provider](../src/cli/source-capture.ts). The CLI captures reached local/nested/JSON/package-main/exact-exports and finite-choice imports, with bytes/hashes and positive/negative probes cached across branches; evaluated modules/cache contents remain in each context's persistent heap. Its realpath-normalized entry has main id `"."` and one cache identity through cycles. Only POSIX normalized absolute acquisition paths are supported. Dependency symlinks at any component, filename aliases, nonregular/invalid-UTF8 sources and acquisition errors stop; captured reads/probes are non-atomic and not a coherent OS snapshot. Cached ancestor probes can race with later path replacement before a read. A resolved source that subsequently becomes unavailable stops rather than being treated as a missing-module alternative. Verified missing local requests can throw MODULE_NOT_FOUND, but unresolved bare packages stop because NODE_PATH/global fallback is uncaptured. Initial entry capture failures exit 1; reached dependency capture failures exit 2 with a checkpoint rather than a target filesystem throw. P037 publishes immutable source identities and resolver-probe observations in roots.program; this acquired union is not an import execution graph or coherent OS snapshot. Alternate main-symlink/launch modes, full platform paths, complete source/run provenance, process globals and public require/cache/main/parent/children APIs remain incomplete. Concrete strings or finite choices are required; NUL/nonstandard request/main forms reject. | Extend acquisition/resolution/platform outcomes with pinned Node and symbolic boundary tests, preserving cached observations versus branch-local evaluation. Model external search and remaining public APIs; retain original bytes/provenance without executing target modules natively or inferring absence from an uncaptured source. |
| CJS-002 — open — unsupported | [Package exports](../src/require/package-exports.ts) support exact targets/conditions/arrays, not pattern selection, custom conditions, `#imports`, malformed URL encodings or NUL targets. Default conditions are the declared Node set. | Add each selection/validation rule using pinned Node differential fixtures and complete upstream cases when possible, retaining blocked/invalid/no-match/missing distinctions. |
| CJS-003 — open — unsupported | [Package metadata](../src/require/package-config.ts) is narrower than Node's native reader: valid JSON, unique unescaped top-level keys, supported field shapes. Duplicate/escaped keys, unclassified invalid syntax, lone surrogate decoding, JSON-shaped exports strings and NUL paths reject analysis. Ordinary JSON modules are a separate supported data parser. | Match the pinned native reader's accepted/rejected cases and error kinds, not an assumed JSON.parse equivalent; test immutable resolution metadata separately from mutated exported JSON. |
| CJS-004 — open — unsupported | [Formats](../src/require/resolution.ts) exclude ESM, `.mjs`, explicit module packages, native addons and extra formats. Ambiguous `.js`/extensionless wrapper parse failures stop analysis because Node may reinterpret them as ESM. Standalone [evaluateCommonJS](../src/require/commonjs.ts) has no dependency loading/cache. | Add actual syntax detection/format loading and interoperation rather than treating unsupported formats as missing files. Keep standalone execution versus graph loading explicit. |
| CJS-005 — open — unsupported/assumption | [Module/require objects](../src/require/loader.ts) expose selected fields. `module.require`, children/parent/paths, require.resolve/cache/main/extensions and writes to protected loader metadata remain gaps; public cache overrides and `node:` bypass behavior are not established by alias identity specs. Unregistered builtin modules stop analysis. The CLI uses [guarded opaque object identities](../src/node/opaque.ts) for https/url/path: imports and canonical aliases work, but their APIs, descriptors, prototype/coercion and property operations remain unsupported. This helper requires known object exports; it is not a catalog-wide fallback for callable builtins. Native builtin initialization/lazy state, instrumentation/configuration and allocation effects are not reconstructed. Default pinned import observations establish these exports, not a complete initialization model. Registered builtins are trusted typed values: registration does not guarantee that arbitrary supplied models guard their missing members (HOST-001). | Model public operations and their cache/resolution/state effects with differential and symbolic tests; guard every partial API until then. |
| CJS-006 — open — unsupported/assumption | Loader errors expose name/code only; message/stack/requireStack and full prototypes/descriptors are guarded. Circular-require warning prototypes/diagnostics and DEP0128 main-fallback warnings are omitted while supported loading can continue; their absence is not an explicit analysis stop or proof that Node emits no warning. See [CommonJS limitations](../test/commonjs/README.md). | Model observable diagnostics, fields and timing or explicitly bound diagnostic-free proofs; preserve warning/error paths and independent Node comparison. |
| PATH-001 — open — unsupported/assumption | The [POSIX path model](node-path.md) supports lexical join/normalize/parse/resolve, fresh mutable five-field parse objects, posix self-identity, separators and selected function metadata in an explicitly POSIX environment. It assumes unchanged intrinsic Array.prototype.push/internal array behavior: pinned join dynamically calls push on a temporary array; the partial shared Array constructor/prototype is available, but Array.prototype mutation is explicitly guarded until this dependency is modeled. Resolve optionally captures a supplied process identity and reads/invokes its current cwd through shared VM semantics; right-to-left validation, skipped left arguments, verbatim absolute fast returns and repeated cwd calls after a relative fast result follow the pinned release. Undeclared cwd, non-string cwd coercions/diagnostics, Windows POSIX-cwd transforms, Win32/device/UNC semantics, other path APIs (including relative/isAbsolute/basename/dirname/extname/format), full process.cwd/chdir, descriptors/reflection and metadata writes remain gaps. Invalid object/array/function diagnostics can execute constructor/name inspection, so they reject analysis. Coded TypeError constructor/prototype/toString/stack/descriptor behavior remains guarded. Lexical normalization and parsing accept NUL/backslash/UTF-16 text; parse preserves spelling rather than normalizing it, including the pinned /.. extension behavior. Success proves neither filesystem validity nor containment. | Extend each actual Node API/platform and diagnostic boundary with independent pinned tests and complete upstream cases. Preserve join's current normalize lookup on its captured module, receiver, empty-input bypass, effects/throws and mutable state. When Array prototype mutation is supported, preserve its observable effects on join. Keep filesystem resolution/symlinks separate under CJS-001/TARGET-002. |
| PATH-002 — open — unsupported/precision | [Path specs](../test/node-path.spec.ts) and [parse specs](../test/node-path-parse.spec.ts) support concrete strings and symbolic choices with concrete string leaves, retaining their correlations. Open symbolic argument/cwd strings stop analysis; finite cwd choices retain invocation effects and throws. Equality facts constraining an unknown string to a finite set do not yet materialize supported choices. General symbolic segment/normalization/containment relationships are not inferred. An unknown numeric argument does produce a known TypeError/code but an unknown message, while unknown Booleans retain their two diagnostics. That loss of diagnostic precision is distinct from unsupported string evaluation. | Add reusable symbolic string/path operations and precise diagnostics where justified, with positive proofs, mandatory unknowns and error paths. Never substitute a convenient path, infer containment from normalization, or convert an unsupported input into a safe result. |
| URL-001 — open — unsupported/assumption | The [legacy URL model](node-url.md) supports path-only parsing, falsy query-string flags, twelve mutable own fields and identity when a returned Url is parsed again. Protocol/authority/auth/host/port/IDNA/IPv6 forms, query objects, format/resolve, Url/URL/URLSearchParams APIs, inherited Url methods, construction and full metadata/descriptors remain gaps. Native new url.parse succeeds; its explicit rejection is not a modeled TypeError. Modified String charCodeAt/slice reject analysis. Internal RegExp exec/test and Set.has are assumed unchanged while those constructors/prototypes remain unsupported (LIB-001). Invalid object/function diagnostics and coded-error constructor/stack/formatting/reflection remain guarded. | Extend actual pinned parsing/API domains with independent boundary/error/mutation tests and complete upstream cases. Preserve mutable primitive/intrinsic effects when their shared VM support lands, rather than treating them permanently pure. Keep legacy parsing separate from WHATWG URL and filesystem containment. |
| URL-002 — open — unsupported/precision | [URL specs](../test/node-url.spec.ts) support concrete strings and concrete-leaf symbolic choices with correlated fields. Open strings and strings constrained only through equality facts stop analysis; general symbolic parsing/encoding/normalization is not inferred. An unknown numeric input definitely throws a coded TypeError but retains an unknown message. Known primitives/Boolean choices have precise diagnostics. | Add reusable symbolic string/parser reasoning with valid proofs, mandatory unknowns and abrupt paths. Do not choose a convenient URL or count an unsupported form as invalid input or a safe request. |
| WARN-001 — open — assumption/unsupported/precision | The [warning model](node-url.md) supports string emitWarning messages with optional concrete/finite-choice type/code, persistent warning state and either explicit default deliverNext presentation or one presentation job per warning in an optional shared next-tick FIFO. Queue-owned delivery rejects manual calls. Warning queue/helper-line state and URL once state are linked through hostSlots; these do not establish resumability. It assumes default handlers/console.error, Node release/argv0, no flags/listeners/redirects/subscribers and healthy stderr; unknown pid/text preserves unknown output. Error/options/constructor overloads, non-string messages, open type/code, object presentation conversion, broader Error metadata and process APIs remain gaps. Flag writes and inherited enabled flags reject. DEP0169 uses captured CommonJS/interpreted source filenames; eval/Function-generated or absent provenance cannot decide fresh eligibility. This is not full V8 bounded-stack/native-frame reconstruction. Node_modules suppression preserves the URL once flag; an eligible call consumes it before mutable emitWarning and input validation. CJS-006/EVENTS-002 diagnostics remain unimplemented. | Extend warning overloads, source/stack eligibility, flags, listener/default-handler interactions and independent scheduling with pinned comparisons and complete upstream cases. Preserve effects/throws/queue state, formatter failures, once flags and output order. Add stdio replacement/redirect/failure/backpressure/flush/exit outcomes rather than assuming them successful; HOST-002 remains the general scheduler boundary. |
| PROCESS-001 — open — assumption/unsupported | The [process environment](node-process.md) composes one warning process with a declared concrete canonical absolute UTF-8 POSIX cwd. Shared calls read persistent state and retain effects; the cwd method is mutable, ignores receiver/extra arguments, and exposes pinned name/length. Native construction succeeds but remains an explicit analysis guard; prototype/descriptor/metadata behavior is incomplete. Stable successful cwd retrieval is declared, not derived from host getcwd or a filesystem proof. Missing/unlinked/inaccessible cwd, getcwd failure/cache invalidation, chdir, races, non-UTF8 names, symbolic initial cwd and Win32 state remain gaps. Composition is one-time before execution; retrofitting existing snapshots is unsupported. argv/env/execPath, process lifecycle/signals/exit and broader process/EventEmitter APIs remain absent and guarded. | Couple process/filesystem state and changing/failing cwd with independent pinned Node evidence. Add each actual process API and constructor/metadata behavior without inventing host values or treating real chdir/getcwd as symbolic execution. Preserve same process identity across globals/imports and existing warning/queue state; keep capture, resumption and scheduling gaps explicit. |
| FS-001 — open — assumption/unsupported | The [filesystem model](node-filesystem.md) keeps one private persistent root with immutable helper-created entries and existing symbolic choices at roots/entries. Omitted names/ESNull are missing in a closed case-sensitive UTF-8 byte-name namespace, with no Unicode normalization. The declared cwd exists as a directory on every setup path. Open directories explicitly retain unobserved children; unknown file contents are distinct from empty text. The [capture adapter](../src/cli/filesystem-capture.ts) supplies memoized observations through generic hooks and persistent branch heaps, records cwd/platform/access, bounds entry/name observations and content bytes, and leaves descriptor capacity symbolic. Complete directory names are a separate persistent fact from the partially acquired child table; enumeration does not acquire child metadata/contents. Captured unlisted spellings still require native probes to exclude case/normalization aliases; aliases or contradictory later observations cannot become false absence. Only an exact namespace without a hook derives unlisted absence directly. It is non-atomic, read-only, and rejects reached symlink/alias/nonregular/invalid-UTF8 boundaries and unexpected host errors (enumeration may return symlink/nonregular names without resolving their entries) and different real/effective credentials; stat/access observations do not guarantee future operations. Native acquisition caches are not resumable state. Component traversal preserves prefix failures; paths/components outside the <1024/<=255-byte domain reject analysis. The stable Linux(default)/Darwin environment now accepts symbolic effective read/search access and filesystem-call descriptor availability. These are supplied process-access facts, not derived mode/UID/ACL/capability policy. Omitted flags still assume allowed/available. Relative lookup begins at a structurally held cwd, not its possibly inaccessible ancestors. Symlinks, races, changing credentials/access/capacity, per-process descriptor identity/count/ownership, ENFILE, post-open fstat/read/close failures and memory allocation failures remain unmodeled. Availability is a baseline at filesystem calls, not a pool coupled to HTTP listen/accept; native server exhaustion is established after acceptance. Successful synchronous reads assume later work/close succeeds and restores this baseline. Open names/contents, arbitrary bytes, other platforms/filesystems, descriptor state, writes and unbounded trees remain gaps. Reads can change real access timestamps: stable contents are not a claim that all metadata is unchanged. | Expand correlated tree/content/metadata and environment transitions with positive, negative and mandatory-unknown specs. Model remaining permission policy/resource/open/read/close failures, cross-host descriptor ownership, partial I/O, atime, links and races explicitly. Do not replace one shared state with independently sampled API returns or equate successful modeled reads with OS availability. Keep CLI source-acquisition observations separate from the target filesystem model until their shared state and failures are explicitly represented under CJS-001. |
| FS-002 — open — unsupported/assumption/precision | [Compatibility specs](../test/node-filesystem.spec.ts) cover string existsSync/statSync/readFileSync paths and [default readdirSync enumeration](node-filesystem-enumeration.md), partial Stats isDirectory/isFile, UTF8-string reads and ENOENT/ENOTDIR/EISDIR plus EACCES/EMFILE failures. [Failure specs](../test/filesystem-failures.spec.ts) and independent [native failures](../test/node-filesystem-failures-reference.spec.ts) preserve priority, repeated-read correlations, unknowns and platform differences; no complete upstream file is activated. Successful default reads now return fresh [Buffer values](node-buffer.md), with persistent byte operations and UTF-8 decoding; remaining Buffer gaps are BUFFER-001/BUFFER-002. Async/promises/streams, writes, fd/Buffer/URL path inputs, non-string argument diagnostics/DEP0187, options/encodings/signals and broader APIs are unmodeled. Directory enumeration accepts only omitted/undefined/null options, byte-sorts complete names, and preserves scandir errors; encoding strings, options objects, recursive and withFileTypes/Dirent remain guarded. NUL stat/read/readdir paths have a known TypeError/code with unknown message; system-error stacks/constructors/descriptors remain guarded. A regular file's Stats.size is modeled from declared contents or validated observed acquisition sizes, and Stats.mtime from an explicitly declared observation as a bounded Date with modeled getTime/toUTCString (directories and undeclared files stay bounded); Stats mode/_checkModeProperty/prototype mutation, arbitrary borrowed receivers, other metadata/BigInt fields, the Date constructor and other Date methods, and public constructors are guarded. Mutable read helpers and inherited option fields reject rather than dropping their effects. Slow/default reads assume unchanged Node Buffer allocators/internal primitives while constructors/allocator APIs remain inaccessible (BUFFER-002); allocation can precede even EISDIR, and allocator mutation effects/throws must be preserved when those APIs land. | Implement each API/value/option/metadata boundary with pinned Node comparisons and complete upstream cases, preserving validation order, mutation, exact failures, shared state and effect order. Scoped response consumption now completes file serving under HTTP-008; preserve remaining Buffer boundaries when expanding it. Preserve all FS-001 environment exclusions until modeled. |
| BUFFER-001 — open — unsupported/precision | The [Buffer model](node-buffer.md) exposes copied concrete unsigned bytes, length/byteLength, canonical numeric index reads/writes and shared UTF-8 toString. Bytes live in the persistent heap; finite choices and mutations preserve correlation, aliases and earlier contexts. Open symbolic bytes/numeric writes/indices, unbounded lengths, nonnumeric write coercions, other encodings/diagnostics, start/end bounds, borrowed non-Buffer receivers, Buffer/module/global constructors, typed-array/ArrayBuffer APIs, backing stores/views/slicing, additional Buffer methods and ordinary named properties remain gaps. Length writes, descriptors/reflection/enumeration/prototype access and function construction/metadata changes reject analysis. Internal Buffer/Uint8Array/TypedArray/Object prototype links now support ordinary instanceof while public reflection and those APIs remain guarded. Empty buffers with omitted bounds return empty text before encoding conversion, matching Node. | Extend each API/exotic property rule with native boundary/error/effect comparisons and complete upstream cases. Model coercion even for ignored out-of-range writes; preserve shared backing-store mutations before exposing views or typed-array constructors. Extend symbolic byte domains without choosing convenient contents. |
| BUFFER-002 — open — assumption/testing | Creation assumes successful allocation and UTF-8 encoding/decoding resources; no allocator/pool/slab/offset/retention or shared/detached/resizable store state is modeled. Successful default filesystem reads copy declared UTF-8 text into fresh Buffer identities. Node dynamically calls Buffer.allocUnsafe (including for empty files/directories), and empty reads also Buffer.concat; the model assumes these unavailable APIs and internal primitives unchanged. The helper accepts arbitrary raw bytes but the filesystem setup still accepts only text. [Local compatibility specs](../test/node-buffer.spec.ts) compare pinned Node; no full upstream Buffer case is activated, and this does not claim general typed-array conformance. | Model allocator replacement effects/throws, resource failures, raw-byte filesystem contents, backing-store identity/lifetimes and memory limits as their APIs become accessible. Activate complete unmodified Buffer/typed-array cases with required harness support, keeping host and language coverage distinct. |
| HTTP-001 — open — assumption/unsupported/precision | [listen](../src/node/http.ts) now accepts a bind transition returning null success or Error failure, including choices. Invalid non-function configuration or non-null/non-Error normal results reject. Omission retains the successful-bind domain of existing embeddings; the CLI uses [fresh symbolic outcomes](../src/node/bind.ts). Hostless binding happens inline with correlated listening state; explicit loopback binding is deferred. Success/error notification uses current listeners and lexical state; unhandled Error delivery throws, and a consumed failure permits retry while preserving once-listening callbacks. [Native occupied-port checks](../test/node-http-bind-reference.spec.ts) and [symbolic cases](../test/node-http-binding.spec.ts) cover these transitions. Error code/message/errno/hostless address remain independent unknowns, not precise EADDRINUSE/EACCES/address-family/resource models; port zero omits the own error port field. There is no shared socket/address/descriptor pool or correlation between attempts. DNS/general hosts, IPv6 fallback, cluster allocation and precise platform/resource outcomes remain open. FS-001 capacity is still not shared with bind/listen/accept; existing native filesystem-exhaustion witnesses exhaust after acceptance. The CLI now delivers supported startup notifications through HOST-002, without proving real port availability or shared resource correlations. | Extend correlated operating-system/resource outcomes and field relationships, with pinned boundary/failure/symbolic tests. Preserve asynchronous error timing, callback non-delivery, retry and state; distinguish automatic scheduling from explicit delivery and successful default embeddings. Occupied-port examples alone do not close broader startup safety. |
| HTTP-002 — open — unsupported | Numeric `(port[, callback])` and `(port, "127.0.0.1"[, callback])` accept concrete ports/finite choices. Strings, absent/options ports, other hosts, backlog overloads, unbounded symbolic ports, overlapping pending host lookups or failure notifications, address inspection, closing/relistening after success and cluster workers remain gaps. Retry after consuming a bind failure is supported; retry before its notification remains guarded. Custom callback Number conversion and inherited normalized listen options reject analysis. See [listen specs](../test/node-http-listen.spec.ts). | Implement Node argument normalization/coercions in order, possible side effects, pending/bound/closed state and overload-specific failures. Retain already-covered callback-before-invalid-port behavior and bound-duplicate precedence. |
| HTTP-003 — open — assumption/unsupported | Response output/finish currently selects successful transport on a live connection. Backpressure state/drain, socket aborts, failing flushes, close/error events, end callbacks, truthy repeated end and unresolved lifecycle delivery are unsupported. Scoped writes and falsy repeated end now work under HTTP-008. `writableEnded` is not successful flush; completeResponse is explicit. | Model writable/socket transitions and failing completions with retained committed output/state and callback/event ordering. Include bounded error/close races and complete upstream failing-flush cases. |
| HTTP-004 — open — assumption/unsupported | Delivery supplies an already parsed request event; no HTTP parser or protocol/method-to-event dispatcher has been analyzed. Symbolic method/URL fixtures use unrestricted strings, a conservative superset of possible request-event inputs. Node routes CONNECT through separate connect/upgrade handling; not every symbolic method is a feasible wire request reaching this callback. Request data/end/error streams, Buffer payloads, body encodings, JSON parsing, connection upgrades/continue/expectation and HTTP client APIs are absent. createServer options and broader request/response methods are guarded. | Model parser-domain inputs, actual event dispatch/reachability and stream transitions with payloads/failures. Require feasible wire-to-event conditions for concrete witnesses; preserve independently checked OPTIONS/POST/DELETE cases. Do not add generic `req.on` and claim readable-stream support. |
| HTTP-005 — open — unsupported/precision | Response write/end support strings and modeled Buffers; end also ignores falsy primitive payloads, including repeated empty end. Encoding/callback overloads remain unsupported. Primitive invalid chunks produce TypeError/code, with unknown non-null diagnostic text; object/function chunk diagnostics remain unsupported. HTTP-008 retains queue/transport limits. Direct writeHead now commits supported explicit fields, numeric final statuses and reasons; the 63-entry pinned STATUS_CODES table is ordinary persistent mutable data. See [header specs](../test/node-http-headers.spec.ts), [catalog specs](../test/node-http-status-codes.spec.ts) and residual HTTP-007. Informational completion, nonnumeric/open-symbolic status conversion, general status-message coercion and full status behavior remain gaps. Unknown UTF-16 body output loses identity through UTF-8 encoding. | Expand status/payload/coercion/encoding domains precisely; preserve HEAD/204/304 suppression, failed-call partial mutations, later public fields versus committed output and actual original-catalog identity. Partial header support does not close the broader response boundary. |
| HTTP-006 — open — unsupported | HTTP partial objects/functions expose selected values, not complete own/inherited descriptors, construction/metadata or mutation. Protected lifecycle emit/listenerCount is rejected because Node has internal listeners/transitions; other reserved host registrations await delivery semantics. | Establish actual property layouts and internal event behavior before permitting inspection, replacement or public lifecycle emission/counting; verify borrowed methods cannot bypass model state. |
| HTTP-007 — open — unsupported/assumption/precision | [Direct serialization](../src/node/http-headers.ts) supports complete own data/string fields with concrete or finite-choice primitive text values. Progressive setHeader/appendHeader/getHeader/getHeaders/removeHeader caches, raw arrays, duplicate case-insensitive names, getters/descriptors, effectful object/array conversions and open symbolic text remain unsupported. Content-Length, Transfer-Encoding, Connection, Keep-Alive, Trailer, Expect and Content-Disposition reject analysis until framing/encoding/state coupling is modeled. Inspected headers are only explicit serialized fields with lower-case names and exact whitespace, excluding automatic Date/connection/framing; they are not complete wire headers or Node's getHeaders API. Lenient validation, unique-header options, raw duplicate order and full output serialization remain gaps. | Add each header domain with independent Node checks, including validation/coercion order, cache interactions, duplicate/raw ordering, framing/body coupling, errors and conditional state. Preserve the projection boundary until automatic fields and full wire behavior are actually modeled. Keep transport failures/schedules open under HTTP-003/HOST-002. |
| HTTP-008 — open — assumption/unsupported/precision | The [body queue](../src/node/http-body.ts) preserves ordered string values and Buffer references in persistent state. Its declared healthy schedule consumes all queued bytes at synchronous end, with no intervening flush; finish is delivered later. Normal/empty write returns remain unknown without socket-capacity facts; HEAD/204/304 suppression returns true. Earlier/later consumption, partial writes, cork/uncork/drain/high-water state, socket errors/abort/destruction, callbacks/encodings/extra-argument overloads, non-Buffer Uint8Array and deferred write-after-end errors remain unmodeled. Primitive chunk failures are catchable; object/function diagnostic inspection rejects analysis. Unknown strings lose content/length/identity through UTF-8 and expose an unknown byte array; indexed inspection explicitly rejects rather than fabricating absent/concrete bytes. Queue traversal/assembly, array projections and Buffer callbacks assume successful allocation within representable array lengths and sufficient host stack/memory; unbounded chunk/byte growth has no complete resource analysis. Inspected text/bytes are read-only embedding projections, not public Node properties or complete framing. [Write specs](../test/node-http-write.spec.ts) compare pinned Node bytes, validation order, recovery, alias mutations, suppression, return uncertainty and branch isolation. | Model consumption/return/error/callback timing against explicit bounded transport states, preserving retained Buffer references until actual consumption and callback order. Expand overloads, arbitrary views, resource failures and precise symbolic encodings with boundary/error/native/symbolic specs; run complete upstream cases with their real harness. Keep all-schedule and allocation guarantees unclaimed until verified. |
| NET-001 — open — unsupported/assumption/precision | [Pending IPv4 net startup](node-net.md) supports ordinary own host/port options and explicit numeric-port/host positional calls, canonical IPv4 and numeric ports, shared queued connectionAttempt delivery and symbolic deferred submission admission. Nonempty non-NUL host strings preserve numeric-port validation before unsupported DNS routing; other host shapes stop without inventing Node errors. Fresh AF_UNSPEC wrapper initialization does not establish a descriptor; descriptor/resource failures remain in deferred submission. False admission preserves a typed unfinished cleanup branch, without guessed errno or callback. Queued-only no-argument destroy cancels initiation and retains unexecuted native close. P039 queued one-argument setTimeout retains unrefed logical arm delay/active state, reset/zero/destroy cancellation, and public timeout writes before known numeric errors; no timer clock/provider/expiration is modeled. Accepted submission is pending, not connected. P040 optionally registers an admitted pending socket in the shared external registry; selection retains stable success/readable/writable facts and consumes completion before callbacks. Failure/partial flags stop before unknown errors or stream actions; full-duplex success refreshes an active old-delay timer then executes connect/ready until a callback stop or the fresh read(0) prefix. P042 models that prefix through locally pending read registration and normal completion return, without bytes/EOF. Current intrinsic/lifecycle state is rechecked after callbacks; public read/pause/data-listener and nonfresh domains remain unsupported. Default independent flags overapproximate callback inputs; native status/flag correlations remain open. Close and timer expiration have no providers. P041 first zero-argument end on a fresh full-duplex connected socket derives deterministic locally pending shutdown from pinned POSIX invariants, preserving public ending-before-submission/internal ended-after-return and unchanged timer. No OS shutdown result is inferred. P043 adds selected shutdown callback finalization: arrival consumes pending transport/finalization, prefinish runs synchronously and only normal return queues finish; finished/public writableFinished precede finish listeners. The open readable side prevents autodestroy. The raw asynchronous native status is ignored by Node and projected out, not set to success. Function.prototype.call dispatch and lifecycle facts are guarded; repeated end and all other end overloads/phases remain unsupported. DNS/IPv6/IPC, remaining positional/string-port/default-host overloads, extra options/accessors/prototype changes/open domains, raw Socket, stream state/I/O, retry/repeated or later destroy, native listener/metadata semantics and lifecycle completion remain unsupported. Eight lifecycle registrations including prefinish/finish are retained, other names reject even through borrowed methods; all public net emit/count names are guarded, including end with its omitted native internal listener. Native/JS allocation, complete OS status relationships, cross-resource capacity, and arbitrary schedules remain gaps. Zero complete upstream net files are activated; inspected whole-file blockers are recorded. | Extend smallest reusable public lifecycle stage with pinned Node source/compatibility, symbolic failure/unknown/cancellation and complete upstream cases when supported. Preserve future read, timer and independent native-close scheduling before claiming complete connection behavior. Never equate an API call/event with binding submission, packets or connectivity. |
| EVENTS-001 — open — unsupported | [EventEmitter](../src/node/events.ts) needs known string/finite-choice names and initialized model receivers. Symbols/open names, constructor options/custom receivers/reinitialization, prepend/removeAll/listener inspection, listenerCount's listener filter, captureRejections/asynchronous helpers, internal fields and method/metadata overrides remain gaps. | Model each public operation against pinned Node, preserving listener identities, persistent branch state, snapshots and callback receivers; enable complete upstream cases without trimming them. |
| EVENTS-002 — open — unsupported | Meta-events newListener/removeListener and EventEmitter warning generation/delivery are missing; the scoped process warning queue does not connect this surface. Registration reaching the default warning threshold is rejected; HTTP's known internal listeners count, so ten application listening/finish listeners can already hit it. Unhandled error with a non-Error payload and exact generated error diagnostics are unmodeled. | Preserve warning/meta-event/error timing and payloads, listener-list changes/reentrancy and per-path effects; validate threshold and internal-listener cases. |
| EVENTS-003 — open — unsupported | Node's single-listener dispatch can observe a callback's replaced/inherited `.apply`; the [model](../src/node/events.ts) guards that path. Multiple-listener dispatch calls directly. A once wrapper ignores the original callback's own `.apply`, but a single once wrapper still observes inherited `Function.prototype.apply`, which is guarded. Async rejection capture is separately EVENTS-001/LANG-005. | Implement the actual observable apply lookup/invocation with effects/throws and symbolic replacements; keep snapshot and once-before-call behavior correct. |
| CONSOLE-001 — open — unsupported | The [console model](../src/node/console.ts) supports default ungrouped log with zero arguments or one string, shared global/builtin identity and ordered captured stdout chunks. Multiargument/nonstring formatting, util.format/inspect/custom inspection, colors/options, groups/timers, stderr/other methods, Console construction, log/config replacement and full descriptors/metadata remain gaps. See [console specs](../test/node-console.spec.ts). | Add each formatter/API/configuration through the shared VM and independently compare formatting, conversion effects, receiver binding and exceptions with pinned Node. One-string logging is not full console support. |
| CONSOLE-002 — open — assumption/unsupported | Captured log output assumes healthy writable default UTF-8 stdout, no stream replacement, diagnostics subscribers or inspector hooks. Swallowed synchronous write failures, asynchronous error delivery, ignoreErrors, backpressure/drain, flush/exit loss and alternate encoding are unmodeled. Concrete surrogate replacement is modeled; unknown encoded text remains unknown. | Represent stream/config/environment outcomes and actual console failure handling, including when the application sees no throw despite failed output. Distinguish calling log, accepting a write and durably emitting/flushing bytes. |

## Runtime CLI/state contract and downstream supply-chain security

| ID / status / kind | Current boundary and evidence | Closure criterion |
| --- | --- | --- |
| REPORT-001 — open — unsupported/precision | The [CLI](cli.md) now emits only the nonresumable graph projection (`roots`/`nodes`) for CommonJS execution with automatic acquisition of reached dependencies, console and bounded HTTP startup with conditional ready/error outcomes, pending tails and retained request handlers. The fs builtin uses read-only environment observations retained via global node.fs: cwd/platform, open directories, reached facts and symbolic descriptor availability. Remaining opaque imports do not supply broader host state. The former version/input/state/execution envelope and hand-written model-domain/limitation prose are removed. The prose described implementation boundaries rather than derived symbolic facts. Classified unsupported/budget leaves retain a completion root and exact branch contexts, source frames and remaining statement sequences; partial trees identify their aggregate context as the common base. Exit 2 and stderr also identify partial analysis. URL/path/warning explicit guards and marked partial metadata retain stopped leaves; untagged argument diagnostics and other legacy failures still omit completion. P037 roots.program publishes source hashes/byte lengths, retained positive/negative probes and launch metadata as immutable acquisition facts; full source bytes remain internal, and the acquired union is not all-path execution history; JSON retains classified boundary reasons but omits legacy failure diagnostics. Graph versioning, structured environment/source provenance and partial-work representation remain open. [Subprocess](../test/cli.spec.ts), [graph](../test/cli-graph.spec.ts) and [checkpoint](../test/analysis-failure-context.spec.ts) specs retain aliases/cycles/maps/special values, current function-definition metadata, event-time snapshots, conditional histories and normal/throw completions. Classified stops retain completed and stopped siblings; native expression continuations or private native work since the last shared checkpoint are not reconstructed. Untagged guards and unexpected failures still retain one checkpoint, which can omit explored siblings/unvisited continuations or native work since the last checkpoint. Server/emitter hostSlots retain immutable links to persistent lifecycle/listener state and pending attempts; the global node.nextTick slot retains pending/active job state in the ordinary graph. The externalEvents slot retains sources and active delivery; optional histories through two arrivals preserve their conditional states and classified stopped siblings, with job draining between normal arrivals. Queue completion is not process exit. Active job resumption remains guarded, and branch-join failures can retain only the earlier join checkpoint. They are separate from guest properties, do not prove initialization in an earlier/other context, and cannot replace private receiver registries. Host-slot publication is inspection, not resumption. Context debug hooks/budget/legacy scope/stderr projections are excluded; native closures stay opaque. Function strictness/arrow-this/source captures, reconstruction of private host associations such as response identity registries and native closures, full continuations, whole process state and round-trip resumption remain incomplete. Bounded version-1 JSON environment authoring now retains named Boolean/string values, references, finite choices, filesystem resource facts and parsed HTTP input templates through node.environment. Full concrete default capture, arbitrary heap/filesystem/process authoring, stable cross-run IDs/semantic-model fingerprint, independent portable consumer decoder, supported arbitrary runtime versions and complete source-attributed history remain absent. P036 retains actual interpreted activation/file origins, with async causality, generated-source identity and package attribution still open. Parser/acquisition/serialization budgets are not covered by the AST step limit. Nonregular/invalid-UTF8 source, unsupported serialization containers/accessors/symbols reject explicitly. The complete [symbolic-runtime contract](symbolic-runtime.md) is still future work. | Extend CLI/state specs through required host models and the unchanged real server; same representation for symbolic/concrete input and result, explicit/default starting-state handling, model/source provenance, captured program output distinct from result stdout, conditional completions/effects and honest unfinished work. Verify supported state round trips, represent pending frontiers and reject omitted state. Keep sensitivity/policies/verdicts and backlog IDs outside core VM values. |
| SECURITY-001 — open — unsupported/assumption/testing | Dependency admission is a goal, not present behavior. npm lifecycle/resolution/acquisition orchestration is unmodeled; importing a CommonJS module does not cover install scripts, ESM, future exports, shell/native/Bun programs or asynchronous triggers. P038 supplies only pending IPv4 deferred submission and queued cancellation, with unresolved failure cleanup. Full outbound-network/DNS/socket/subprocess semantics and complete generic value/control relationships remain absent. Endpoint inventories, external sensitivity classifications, secret-flow/protected-file/publish policies and verdicts belong to downstream consumers, which are also unimplemented; no original Shai-Hulud benchmark exists. Existing LANG/CJS/HOST/SYM/FS/BUFFER gaps apply; reached LEGACY-001/002/003 and absent-unmodeled-builtin fallbacks can invalidate any consumer's conclusions, even without an explicit rejection. | Repair or reject reached inaccurate semantics for all runtime uses; establish generic execution/effect fixtures and separate consumer policies with safe/violating/unknown controls, and separately pinned install/import/use scopes. Then analyze an immutable original incident loader and clean control with conditions, feasible forbidden effects, evidence and complete blocker inventory. Model unknown destinations/continuations soundly; an allowed host does not authorize secret disclosure. No names, hashes or malware-source patterns become inference rules. |
| SECURITY-002 — open — assumption/unsupported/testing | Prophet is not a hardened adversarial-code sandbox or enforcement gate. CLI acquisition rejects static symlink/nonregular/encoding boundaries, but its probe/read sequence is not race-resistant or bounded for I/O/source size. Archive/parser/interpreter resource/escape risks, safe artifact acquisition, exact-byte/transitive-graph integrity, policy/model/scenario-bound caches and approvals, prevention of pre-scan hooks, runtime capability enforcement and separately isolated adversarial replay are not implemented. A future registry fetch by the trusted adapter is distinct from granting package network authority. | Validate inert acquisition/extraction/analysis isolation and resource limits; test traversal/unsafe archives, tamper/cache invalidation, script-before-scan and alternate-command bypasses. Bind admission/exception decisions to reviewed bytes, graph, scope and model versions and enforce actual capabilities separately. Unknown scans must not silently pass; accepted risk is not a proof. Never execute original malware natively in ordinary Jest/developer runs. |

## Real application, evidence and coverage

| ID / status / kind | Current boundary and evidence | Closure criterion |
| --- | --- | --- |
| TARGET-001 — open — unsupported | The pinned full [pico-static-server module](../test/fixtures/pico-static-server-3.0.3/package/index.js) now completes setup and supplied non-GET/HEAD events through shared operations. Its [symbolic proofs](../test/pico-static-server-analysis.spec.ts) retain missing Allow, empty body and conditional 200/405 for an unknown non-GET/HEAD method/unknown URL; HTTP-004 preserves dispatch feasibility and HTTP-007 the explicit-header projection. GET/HEAD `/docs` over one shared missing/empty-directory choice now proves 404 or an escaping missing-index ENOENT with no committed/ended response. Matching native witnesses independently replay both conditions. Readable-file and populated-directory-index reads return Buffer values; shared instanceof proves they are not Errors and path.parse determines MIME. The original success branch commits status 200, but its reversed writeHead arguments discard the intended MIME/length fields and produce numeric O/K headers. The original write/end and explicit finish delivery now serve file bytes on GET and suppress them on HEAD under HTTP-008. Both concrete methods and a combined symbolic GET/HEAD choice with symbolic index presence now prove success versus ENOENT and the matching body. Every path reaches the actual read; no impossible 405 is filtered out. Wider equality relationships remain under SYM-001. An additional sixteen-assignment method/access/capacity proof now classifies 404, EACCES, EMFILE and successful 200/body, with native permission/resource witnesses and unfinished throwing responses. Broader URL/path/fs/HTTPS APIs and environmental/scheduling outcomes remain gaps. Installed/checkout provenance preserves DEP0169 suppression/scheduling. Express remains ordinary source. | Expand unchanged-source analysis through broader environmental failure paths and transport schedules. Retain both bounded findings and mandatory unknowns while expanding URL/method/file/schedule domains; classify unsupported paths separately. No novel vulnerability or whole-server safety claim follows from the supported cases. |
| TARGET-002 — open — assumption/testing | The [target plan](real-world-target.md) now has a default CLI startup proof retaining ready/error alternatives, plus a read-only observed CLI filesystem, but no future request domain in that default startup run. Its separate request-analysis specs use trusted HTTP configuration, one parsed request/server, successful startup/transport with queued bytes consumed at synchronous end and no intervening flush, and no process exception-recovery hook. The filesystem is a closed case-sensitive UTF-8 tree with selected Linux/macOS behavior, symbolic effective read/search access and baseline filesystem-call descriptor availability, but no symlinks, credential-policy inference, post-open failures or concurrent changes. Availability is not globally coupled to successful HTTP startup/acceptance; this is an explicit schedule assumption, not a resource-safety proof. Shared root/entry choices now correlate existence/type/read; the initial missing-default-file condition is a bounded Prophet finding, with an absent-path 404 control and native witnesses. Default reads now expose the declared text as UTF-8 bytes. Broader files, arbitrary raw filesystem contents, open symbolic bytes, metadata/atime, partial I/O, races, platforms, URL/containment and repeated requests remain expansions under FS-001/FS-002/BUFFER-001/BUFFER-002. The [discount example](../test/discount-server.spec.ts) still assumes supplied handler inputs and successful modeled host outcomes, not a parsed HTTP/Express application. | Expand actual source paths and declared domains, retaining ordered effects, normal/throw conditions and resource state. Preserve every excluded failure family rather than silently choosing success. A successful case or one bounded exception proof does not close the environment contract. |
| TARGET-003 — open — precision/testing | Automatic satisfying-input generation remains future work. The [native target specs](../test/pico-static-server-reference.spec.ts) now replay manually supplied GET/HEAD `/docs` witnesses for missing versus empty-directory state, matching the symbolic 404/ENOENT conditions. This is independent concrete evidence, not automatic witness extraction or complete replay machinery. A failed proof, unknown value or unsupported operation is not a counterexample; native observations alone still do not establish an unobserved symbolic path. | Derive concrete supported-domain witnesses from feasible symbolic conditions and replay the unchanged target with matching environment/schedule. Retain the current explicit witnesses and report failed/inconclusive replay without claiming a found defect. |
| TEST-001 — open — testing/unsupported | [Test262 runner](../test/test262/runner.ts) only accepts onlyStrict/noStrict/raw/generated flags, no includes, and parse-negative SyntaxError metadata. Harness interprets complete pinned sta.js for Test262Error identity, then installs selected assert operations/$ERROR/$DONOTEVALUATE adapters; property helpers, async/module/realm/agent machinery and the full harness remain unsupported. | Extend runner without native execution of test source or ignored assertions; keep whole files, metadata and strict/sloppy variants, and ensure analysis errors cannot satisfy language exception assertions. |
| TEST-002 — open — testing | The historical selection contains 46 explicitly skipped files listed below. They have not all been run through the current evaluator to establish blockers. Thirty-four are parse-negative, two newline/ASI runtime cases, three primitive Boolean cases, and seven Boolean call/construction cases. | Reassess each complete file, activate every supported variant, and record actual failures under the relevant implementation ID. Retain filename/closure evidence here when removing its skip; do not label parse-only tests blocked by unrelated runtime features. |
| TEST-003 — open — testing | Test262 is pinned to an old revision. Reviewed old parameter-eval scope cases disagree with current pinned Node/current ECMA shared parameter scope. This is version reconciliation debt, not a reason to change semantics to satisfy outdated expectations. See [Test262 notes](../test/test262/README.md). | Update/reconcile the pinned corpus deliberately, document semantic changes and rerun active cases; do not edit upstream source to make it pass. Full coverage remains the goal, never inferred from selected corpus counts. |
| TEST-004 — open — testing | No complete upstream Node compatibility test is yet claimed passing. Local differential specs use Node v24.21.0 (`955266bfdd854cd280dffd47548673914484e4c0`). Reviewed candidates in the [CommonJS](../test/commonjs/README.md), [events](node-events.md#complete-upstream-cases-reviewed), [HTTP](node-http.md#complete-upstream-cases-reviewed), [path](node-path.md#complete-upstream-cases-reviewed), [URL/warnings](node-url.md#complete-upstream-cases-reviewed), [filesystem](node-filesystem.md#complete-upstream-cases-reviewed) and [Buffer](node-buffer.md#complete-upstream-cases-reviewed) records need actual harness/API dependencies. Buffer cases still need Buffer.from/allocators, broader encodings/bounds, iterators, subclasses, large memory and the common/assert harness. Local startup ordering/error/retry evidence now covers the bounded FIFO and HTTP bind transition. The [complete nextTick candidates](jobs.md#complete-upstream-cases-reviewed) still need public process APIs, timers, exit/uncaughtException recovery, Array operations and common/assert; none is activated. Local occupied-port checks are also independent fixtures, but complete net/server cases still need a net model, general scheduling, address/close APIs and common/assert. The response-write candidate list includes whole invalid-type, empty-string/Buffer, suppression, multiple-end and write-after-end cases; their client/socket/common/assert, callback/drain/error queue, Uint8Array and framing requirements remain open. Filesystem files include mutations, async/fd/Buffer/Stats metadata, warnings and platform branches; even the misleading readfilesync-enoent file tests Windows realpath instead. URL cases include broader protocols/query objects/Url APIs; warning cases need actual process events/flags/scheduling/stdio and child processes. The complete path resolve case additionally retains Windows drive/cwd and child-process fixtures. Path parse/format cases still need Win32, format/dirname/basename/extname, loops/destructuring, Array iteration and the actual common/assert harness; the pinned tree has no standalone parse-only case. Even the small posix alias case needs common/assert. None is trimmed to an easier fragment. The whole [test-console.js](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-console.js) additionally needs common/assert, process/worker/stdio replacement, general warning scheduling, util.inspect/Symbol, broader formatting/methods and timer/count state; none is counted passing from single-string local specs. | Run suitable complete unmodified Node cases with their fixtures/common/assert dependencies; preserve all scenarios, including failures. Reconcile historical blockers as shared features land. Keep local differential results separate from upstream conformance and platform/environment coverage. |

## Complete historical skipped-file inventory

All paths below are relative to `test/` in the installed pinned Test262 package.
The [selection code](../test/test262.spec.ts) is authoritative; the upstream base
is [Test262 at the pinned revision](https://github.com/tc39/test262/tree/47bf9d1db9f6e7632120ac1b1946ad092e6c214e/test).
Every row is currently **open / skipped** under TEST-002. The secondary mapping
is the area to investigate, not a claim that the case currently fails there.

| # | Complete file | Classification / secondary IDs |
| --- | --- | --- |
| 1 | `built-ins/Boolean/S15.6.1.1_A1_T1.js` | Runtime; primitive wrappers OBJ-003, LEGACY-001 |
| 2 | `built-ins/Boolean/S15.6.1.1_A1_T2.js` | Runtime; Boolean call activation, LEGACY-001 |
| 3 | `built-ins/Boolean/S15.6.1.1_A1_T3.js` | Runtime; Boolean call activation, LEGACY-001 |
| 4 | `built-ins/Boolean/S15.6.1.1_A1_T4.js` | Runtime; Boolean call activation, LEGACY-001 |
| 5 | `built-ins/Boolean/S15.6.1.1_A1_T5.js` | Runtime; Boolean call activation, LEGACY-001 |
| 6 | `built-ins/Boolean/S15.6.1.1_A2.js` | Runtime; Boolean call activation, LEGACY-001 |
| 7 | `built-ins/Boolean/S15.6.2.1_A1.js` | Runtime; Boolean construction, LEGACY-001 |
| 8 | `language/statements/if/if-async-fun-else-async-fun.js` | Parse negative; LANG-002 |
| 9 | `language/statements/if/if-async-fun-else-stmt.js` | Parse negative; LANG-002 |
| 10 | `language/statements/if/if-async-fun-no-else.js` | Parse negative; LANG-002 |
| 11 | `language/statements/if/if-async-gen-else-async-gen.js` | Parse negative; LANG-002 |
| 12 | `language/statements/if/if-async-gen-else-stmt.js` | Parse negative; LANG-002 |
| 13 | `language/statements/if/if-async-gen-no-else.js` | Parse negative; LANG-002 |
| 14 | `language/statements/if/if-cls-else-cls.js` | Parse negative; LANG-002 |
| 15 | `language/statements/if/if-cls-else-stmt.js` | Parse negative; LANG-002 |
| 16 | `language/statements/if/if-cls-no-else.js` | Parse negative; LANG-002 |
| 17 | `language/statements/if/if-const-else-const.js` | Parse negative; LANG-002 |
| 18 | `language/statements/if/if-decl-else-decl-strict.js` | Parse negative, strict only; LANG-002 |
| 19 | `language/statements/if/if-decl-else-stmt-strict.js` | Parse negative, strict only; LANG-002 |
| 20 | `language/statements/if/if-decl-no-else-strict.js` | Parse negative, strict only; LANG-002 |
| 21 | `language/statements/if/if-fun-else-fun-strict.js` | Parse negative, strict only; LANG-002 |
| 22 | `language/statements/if/if-fun-else-stmt-strict.js` | Parse negative, strict only; LANG-002 |
| 23 | `language/statements/if/if-fun-no-else-strict.js` | Parse negative, strict only; LANG-002 |
| 24 | `language/statements/if/if-gen-else-gen.js` | Parse negative; LANG-002 |
| 25 | `language/statements/if/if-gen-else-stmt.js` | Parse negative; LANG-002 |
| 26 | `language/statements/if/if-gen-no-else.js` | Parse negative; LANG-002 |
| 27 | `language/statements/if/if-let-else-let.js` | Parse negative; LANG-002 |
| 28 | `language/statements/if/if-let-else-stmt.js` | Parse negative; LANG-002 |
| 29 | `language/statements/if/if-let-no-else.js` | Parse negative; LANG-002 |
| 30 | `language/statements/if/if-stmt-else-async-fun.js` | Parse negative; LANG-002 |
| 31 | `language/statements/if/if-stmt-else-async-gen.js` | Parse negative; LANG-002 |
| 32 | `language/statements/if/if-stmt-else-cls.js` | Parse negative; LANG-002 |
| 33 | `language/statements/if/if-stmt-else-const.js` | Parse negative; LANG-002 |
| 34 | `language/statements/if/if-stmt-else-decl-strict.js` | Parse negative, strict only; LANG-002 |
| 35 | `language/statements/if/if-stmt-else-fun-strict.js` | Parse negative, strict only; LANG-002 |
| 36 | `language/statements/if/if-stmt-else-gen.js` | Parse negative; LANG-002 |
| 37 | `language/statements/if/if-stmt-else-let.js` | Parse negative; LANG-002 |
| 38 | `language/statements/if/labelled-fn-stmt-first.js` | Parse negative; LANG-002 |
| 39 | `language/statements/if/labelled-fn-stmt-lone.js` | Parse negative; LANG-002 |
| 40 | `language/statements/if/labelled-fn-stmt-second.js` | Parse negative; LANG-002 |
| 41 | `language/statements/if/let-array-with-newline.js` | Parse negative, sloppy only; LANG-002 |
| 42 | `language/statements/if/let-block-with-newline.js` | Runtime ASI, sloppy only; LANG-002 |
| 43 | `language/statements/if/let-identifier-with-newline.js` | Runtime ASI, sloppy only; LANG-002 |
| 44 | `language/types/boolean/S8.3_A1_T1.js` | Runtime primitive/hoisting activation; TEST-002 |
| 45 | `language/types/boolean/S8.3_A1_T2.js` | Runtime primitive activation; TEST-002 |
| 46 | `language/types/boolean/S8.3_A3.js` | Runtime primitive activation; TEST-002 |

There are currently no closed entries in this initial audit. As work closes,
retain the ID, removed limitations, residual IDs, commit or PR and validation evidence.


## P007 reconciliation — 2026-10-13

[Evidence](agent-tasks/P007-regexp-test/evidence.json) binds the source revision,
full suite/typecheck, external-timeout stress run, whole Test262/native checks and
complete audit outputs. [Matching docs](regexp-literals.md) define every admitted
construct and limit. No stable gap ID is closed or removed.

- REGEXP-001 retains all flags, custom exec, descriptors/prototype exposure,
  dynamic constructors, getters, exec/results, assertion/backreference/Unicode
  extensions and parser dependence. New unsupported guards describe these
  domains; budget leaves cover size, depth, counts, state expansion and work.
  The shared intrinsic registry is private and cannot be resumed from JSON.
- LIB-002/OBJ-001 retain exotic coercion and property/symbol/descriptors. Ordinary
  ToString then lastIndex ToNumber uses current persistent heap and interpreted
  methods. Arrays/functions, including customized ones, now stop before input
  or index conversion as a typed domain boundary instead of reaching shared
  legacy errors that could discard sibling completions. Open numeric lastIndex is safe to ignore only in the admitted
  flagless domain; open input strings stop (REGEXP-001/SYM-001).
- LIB-001/LANG-003/REPORT-001: the next reached absent String.trim intrinsic is a
  typed lookup boundary, preventing the old noncallable assertion from dropping
  completed siblings. Own method replacements still follow ordinary lookup.
  This adds no String.trim implementation or broad missing-builtin repair.
- FS-001/TARGET-002 retain directory/resource alternatives. The unchanged sirv
  factory/CLI reaches mrmime.lookup's trim after both default filters and keeps
  the EMFILE sibling and prior directory effects. Headers, factory completion,
  HTTP setup and request paths remain unfinished; no new all-path claim follows.
- STRING-001/SYM-004/SECURITY-002/REPORT-001 retain successful allocation,
  coercion/branch/frontier/store/parser/acquisition/serialization limits outside
  the bounded matcher. Its caps are execution controls, not domain assumptions.
- TEST-001/002/003 retain broader harness/corpus/version gaps. Fifteen complete
  files add thirty variants. All 46 historical skipped filenames and their
  metadata are reconciled unchanged; no new skip/todo site is introduced.


## P008 reconciliation — 2026-10-13

[Trim boundary](symbolic-strings.md#bounded-stringprototypetrim-p008) and
[P008 evidence](agent-tasks/P008-string-trim/evidence.json) define the tested
source and declared limits. No stable ID is closed or removed.

- LIB-001/002 and OBJ-001/003: generic inherited trim now uses interpreted
  ordinary ToString and current prototype/heap state. Arrays/functions (even
  customized), wrappers, public symbols, nonnull inherited/own primitive hooks,
  getters/descriptors, partial-host and cyclic-prototype cases remain excluded.
  The latter shared guards are not all typed; arbitrary coercion can still stop
  at a partial checkpoint. The missing trim guard is removed, not left as a
  rejection spec. Next reached toLowerCase lookup alone gains the typed guard;
  own replacements remain ordinary. Case conversion, lastIndexOf, substring,
  Date/Stats metadata, streams and broad missing-builtin repair stay separate.
- STRING-001/SYM-001/LEGACY-002: open symbolic converted strings/numbers and
  legacy chunk inputs stop, retaining prior conversion effects and normal
  siblings. Finite choices preserve correlations and mandatory unknowns.
  No open input is silently narrowed. Successful allocation is still assumed.
- STRING-001/SYM-004/SECURITY-002/REPORT-001: a 65,536-unit cap bounds trim scan
  and output before preparation; exceeding it is a budget leaf after conversion.
  Coercion, symbol/prototype depth, parser, branch/frontier volume, embedding
  allocation and CLI graph serialization retain their existing resource limits.
- FS-001/TARGET-002/REPORT-001: unchanged sirv and actual CLI reach mrmime's
  toLowerCase after trim, preserving source frames, directory effects and EMFILE.
  No filesystem outcome was selected away, and headers/factory/server/request
  execution remains unfinished. Provenance fixtures are unchanged.
- TEST-001/002/003: 40 complete files add 80 variants. The full 128-file trim
  candidate list records 88 inactive files and native controls for all 256
  variants. No new skip/todo site; the complete 46-file historical inventory is
  unchanged. Full documented guard/assertion/skip/docs scans are saved with
  hashes; a scan is not a complete language/host conformance audit.


## P008 correction 1 reconciliation

[Correction contract](agent-tasks/P008-string-trim/correction-1.md) authorizes the
superseded P007 test update and truthful partial String surface. The original
[evidence](agent-tasks/P008-string-trim/evidence.json), full-suite failure and
unapplied historical proposal remain preserved. New exact-source runs belong to
[correction evidence](agent-tasks/P008-string-trim/correction-1-evidence.json).
No gap ID is closed; no source/dependency fixtures or P007 production changed.

- LIB-001/002, OBJ-001/003: the declared String prototype has seven modeled and
  45 deferred own string names, native-checked against Node 24.21.0's complete
  52-name surface (including aliases and Annex B). Generic private registration
  and shared absent-own guards stop unsupported reads/hasOwnProperty instead of
  false absence. Current own replacements/explicit undefined and conditional
  installed sides remain precise; ordinary absent names stay absent. The old
  one-name AST check is removed. No additional String API is implemented.
- OBJ-001/LANG-006/REPORT-001: existing enumeration/own-key guards now produce
  typed leaves for String.prototype and trim metadata. Object.keys and spread
  retain prefix/coercion effects and completed siblings. Name/length remain
  known own fields, call is inherited, prototype absent, and unknown metadata
  reads/name-length writes stop. Full descriptors/getters, missing Object APIs,
  Function APIs and other String method metadata remain separate/legacy gaps.
- LANG-001/LEGACY-002/URL-001: `in` remains a pre-existing unsupported operator;
  the claimed false result was not confirmed by root. Raw heap presence and
  internal hasProperty are not upgraded to full JS descriptor/HasProperty
  semantics. URL's existing charCodeAt mutation assumption is unchanged; it
  must not be cited as proof that the native method is absent. Primitive-own
  legacy split/substr remain separate from deferred prototype borrowing.
- STRING-001/SYM-001/004/SECURITY-002: the trim algorithm, cap, open-input and
  coercion exclusions remain unchanged. Prototype/method replacement proof
  domains are bounded by existing shared heap/branch limits. Private intrinsic
  registration is not serialized resumption or public schema expansion.
- TEST-001/002/003: no active Test262 selection or historical skip changed.
  Complete scans/inventory are rerun. New native/red/symbolic cases are disclosed
  regressions for root-reproduced concerns, not hidden independent evidence.
  The sole authorized P007 test change replaces its obsolete trim rejection with
  actual result/effect/correlation checks and retains the original native trim
  replacement assertion verbatim. All unrelated P007 expectations stay intact.


Correction 1's validation also migrates only the String.prototype entry of the
existing object-spread descriptor-layout rejection table from legacy host throw
to typed boundary, preserving the message constraint and adding prefix/sibling
checks. Other layouts remain unchanged, and no descriptor support or skip is
introduced (OBJ-001/REPORT-001/TEST-002). The superseded one-failure run is retained
separately from the final corrected-source validation.


## P009 reconciliation — 2026-10-14

The [bounded ASCII lowercase contract](symbolic-strings.md#bounded-ascii-stringprototypetolowercase-p009)
and [source-bound evidence](agent-tasks/P009-ascii-lowercase/evidence.json)
record worker verification pending independent Astra/high review. No ID closes.

- LIB-001/002, OBJ-001/003: shared lowercase supports ordinary string-hint
  conversion and current heap/prototype state. Its metadata follows P008;
  unknown reads, inspection and name/length writes stay typed. All 52 String
  prototype own names remain accounted for (eight modeled, 44 deferred).
  Arrays/functions, customized exotics, wrappers, public symbols/hooks,
  descriptors/getters, partial-host/cyclic-prototype paths and broader builtins
  stay open. Their shared legacy checkpoint behavior is not repaired here.
- STRING-001, SYM-001, LEGACY-002: ASCII is checked, never assumed. Non-ASCII
  (including unchanged units, context, expansion and surrogates), open symbolic
  converted strings/numbers and legacy chunks stop after reached conversion
  effects. Finite choices preserve correlations, unknown results and siblings.
  Unicode/locale casing and lastIndexOf/substring are deferred independently.
- STRING-001, SYM-004, SECURITY-002, REPORT-001: length cap 65,536 is checked
  before scans/copies/output allocation; two bounded scans and bounded output
  do not bound coercion, prototype traversal, symbolic frontiers, embedding,
  parser or CLI graphs. Successful host allocation is still assumed. A budget
  stop is unfinished analysis, never a catchable guest allocation failure.
- FS-001, TARGET-002, REPORT-001: unchanged sirv/mrmime CLI reaches lastIndexOf,
  with lowercase tmp, source frames and enumeration return/EMFILE throw histories
  retained. No FS/resource alternative is narrowed, no public gap prose added,
  and no completed headers/factory/server/request result is claimed.
- TEST-001/002/003: ten complete files add 20 variants (351 files / 693 variants
  total); all 27 lowercase candidates and 54 pinned native variants are recorded.
  A11's direct metadata `.hasOwnProperty` remains inactive whole after a failed
  development selection; no weak oracle or new skip. All documented guard,
  assertion, skip, boundary-doc and diff scans plus the complete historical
  46-file inventory are reconciled and retained in ignored hashed evidence.
  Source audits do not establish full language/Node coverage.


## P010 reconciliation — 2026-10-14

[Bounded lastIndexOf](symbolic-strings.md#bounded-stringprototypelastindexof-p010),
[whole candidates](agent-tasks/P010-string-lastindexof/upstream-candidates.md) and
[source-bound evidence](agent-tasks/P010-string-lastindexof/evidence.json) record
this partial increment. No stable group closes on one intrinsic.

- LIB-001/002, OBJ-001/003, LANG-006: shared inherited lastIndexOf now models
  ordinary conversion/search/position and conservative name/length/call metadata.
  Nine modeled/43 deferred String own names retain the pinned 52-name inventory.
  All other APIs, descriptor/reflection semantics, wrappers/public symbols and
  default/custom array/function or other exotic conversion remain work. Nonnull
  symbol hooks are guarded at each reached operand conversion. Partial-host and
  cyclic shared conversion failures retain their existing legacy limitations.
- STRING-001, SYM-001, LEGACY-002: arbitrary literal UTF-16 units are admitted,
  including lone surrogates, with no ASCII assumption. Open converted text/search/
  position and legacy chunks remain explicit unsupported results after ALL required
  conversions, so later observable effects/guest throws are preserved. No arbitrary
  open-string index proof, general coercion repair or allocation-failure model.
- SYM-004, SECURITY-002, REPORT-001: operand cap 65,536 units EACH precedes search/
  copies/preprocessing after conversions. Separate actual-comparison cap 1,048,576
  bounds synchronous near-match work; empty needle still obeys lengths. Candidate
  visits are bounded by text length. Coercion/prototype traversal, parser/input
  allocation, branch/CLI volume and V8 allocation failures remain residuals.
- LANG-001/003, REPORT-001, FS-001, TARGET-002: unchanged sirv now retains idx=5
  and tmp=hello.txt at mrmime/index.js:445 unary ~, before substring/increment or
  headers. Only the reached missing unary ~ resolver assertion is classified,
  after operand evaluation, preserving source frames/current effects and all
  enumeration/EMFILE histories. No bitwise operation or other language feature is
  implemented. All other legacy unary assertions and filesystem assumptions remain.
- TEST-001/002/003: ten whole lastIndexOf files/20 variants added; 23 whole native
  candidates/46 variants pass. All 13 inactive candidates are inventoried; A11's
  failed complete-file metadata probe remains evidence. No source trimming,
  runner workaround, new skip or removal from the prior active baseline. Complete
  guard/assertion/skip/doc/diff scans and installed/candidate/active/historical
  inventories are source-bound in evidence. All 46 historical skipped files keep
  their exact names, bytes and metadata. Audit counts do not imply full JS/Node coverage.


## P011 Number-domain unary bitwise NOT

Worker validation; independent Astra/high exact-source review remains pending.
[Boundary](number-bitwise-not.md), [specs](../test/bitwise-not.spec.ts),
[upstream](agent-tasks/P011-number-bitwise-not/upstream-candidates.md).

- LANG-001, LIB-002, OBJ-001/003: shared effectful unary dispatch adds only `~`.
  Number-hint ordinary conversion reads current heap/prototypes, preserves calls,
  mutations, forks and genuine throws; a finish continuation keeps late BigInt,
  Symbol and other unsupported primitives out of legacy ToNumber. Existing +/−,
  typeof/void/! and effectful binary paths retain behavior. Arrays/functions,
  customized exotics, wrappers, descriptors/accessors/proxies and symbol hooks
  remain unsupported. Undefined/null symbol hooks are absent; null itself is valid
  numeric input. Partial-host/cyclic inherited lookups retain legacy checkpoints
  and can lose siblings (LANG-003, REPORT-001). No group is closed.
- LANG-002, LIB-001/002: Cherow's BigInt literal marker exposes an unrelated
  Number-valued field. Reached literal evaluation rejects the marker explicitly;
  no BigInt syntax/representation, primitive wrapper or public Symbol model is
  added. Whole BigInt files remain inactive, with exact observed VM blockers.
- SYM-001/004: all concrete IEEE Numbers truncate/wrap/signed-complement;
  finite choices retain conditions, but open Numbers and open/legacy strings stop
  typed, preserving reached effects without guessed integer/proof. A 65,536-unit
  numeric-string cap precedes parsing/scanning, including late-returned primitives.
  Below/at/above, mixed unsupported/budget/throw/supported branches are specs.
  Constant bounded numeric mapping does not bound user coercion/prototype work,
  branch volume, parser/embedding/heap allocation, or graph serialization. General
  termination/resource limits remain open; successful allocation is not proved.
- FS-001, TARGET-002, REPORT-001: unchanged sirv/mrmime passes !~idx then stops at
  substring callee lookup, retaining tmp=hello.txt and idx=5 (argument ++idx has
  not run), CallExpression frames and every prior FS history beside EMFILE. No
  substring/other bitwise/server/headers feature is bundled. Factory and request
  coverage, callback exploration and resumption remain the unchanged goal.
- TEST-001/002/003: nine complete bitwise-not files add 18 variants, including
  Number-hint conversion and ToInt32 cases. All 16 files/32 variants are native
  checked and tried whole in the VM; seven incompatible files remain inactive.
  No active predecessor is removed or upstream source modified. All 46 historical
  skipped files remain; full inventories/audit evidence are recorded separately.


## P011 correction 1 — BigInt static-key admission (P011-R1)

Independent Astra/high **rejects first frozen b920a64**, retained as historical
source/evidence. Review df9ab53 disclosed two complete counterexamples: native
n=-9, VM normal n=-1 because Cherow drops the key marker and rounds its Number
name before the new complement consumes a falsely missing property. This is a
predecessor parser/key defect, not complement arithmetic. Corrected source
acceptance remains pending. [Contract](agent-tasks/P011-number-bitwise-not/correction-1.md),
[boundary](number-bitwise-not.md), [specs](../test/bitwise-not.spec.ts).

- LANG-002, LANG-004, OBJ-001/003: original parser offsets restore only omitted
  noncomputed BigInt key admission metadata on validated numeric-named Identifier
  keys whose original token ends in n. No rounded value determines identity.
  Transient ranges are stripped; no source rewrite, BigInt representation, new
  grammar or global early rejection is supplied. Existing parser traversal,
  allocation/stack and newer-grammar limits remain open, not globally bounded by
  this constant token-end inspection. All complete upstream files remain unchanged.
- LANG-003, REPORT-001: shared static-key checking executes at each reached
  object property/binding key and captures the **current after-context**. Prior
  property/RHS/default/read/binding mutations, alias/prototype state and console
  effects survive; bad value/lookup/default and subsequent work do not run.
  Earlier guest throws and unsupported paths bypass the later key guard. Normal,
  throw and typed-stopped siblings remain distinct; catch/finally consume only
  guest throws. General legacy context loss and broader key/descriptor/exotic
  domains remain open.
- LIB-002, SYM-001/004: Number complement arithmetic, effectful dispatch and
  shared numeric conversion are byte-identical to b920a64. BigInt static keys are
  explicitly unsupported; ordinary rounded large Number keys and quoted
  BigInt-looking strings retain native Number/string identity. Computed BigInt
  keys keep the earlier reached Literal guard. Uncalled functions are not
  rejected merely because their retained syntax contains an unsupported key.
- TEST-001/002/003, FS-001, TARGET-002: disclosed probes are now regression tests,
  not hidden holdouts. Native Number/key/order controls and position-prefix,
  method/shorthand, mixed effect/throw/boundary controls accompany the correction.
  Corpus remains 370 files/731 variants, 46 historical skips, all original whole
  bitwise-not candidates retained. Unchanged sirv still stops at substring callee
  lookup with tmp=hello.txt, idx=5 and every FS history beside EMFILE. Its full
  factory/server/request goal and resumption remain unfinished; no gap closes.

Original first evidence.json, handoff and all existing ignored log bytes are
preserved. Correction runs isolate P011 candidate/P009 CLI/P010 review outputs
through optional artifact-directory environment inputs; only artifact writing
paths change in P009, with all behavior assertions retained. New evidence and
handoff are separate files/commit after one corrected source freeze.

## P012 reconciliation — bounded generic substring

Worker implementation; independent Astra/high acceptance is pending.
[Boundary](string-substring.md), [candidates](agent-tasks/P012-string-substring/upstream-candidates.md)
and source-bound evidence retain residuals rather than closing groups.

- LIB-001/LIB-002: substring alone leaves the deferred registry. Name/length2,
  identity, call and nonconstruction are modeled; descriptor/reflection/writes,
  other String APIs and wrapper construction stay open. The pinned 52-name
  inventory is ten modeled/42 deferred.
- **STRING-002 — open — unsupported/precision:** substring's open symbolic
  receiver/index values and legacy chunks finish all completing conversions,
  then stop honestly. Finite correlated choices are supported; no unrestricted
  string/index summary or silent narrowing is claimed. Extend reusable value
  reasoning with positive proofs and mandatory-unknown/effect regressions.
- **STRING-003 — open — budget:** converted substring receiver exceeds 65,536
  UTF-16 units, including empty outputs. The guard follows required conversions
  and precedes copying/preparation. Below/at/above, throwing-end, and mixed
  normal/guest-throw/budget histories are tested. This analysis cap is not a JS
  restriction or native allocation guarantee.
- OBJ-001/003, LANG-002/003/004, LEGACY-002: custom nonnull symbol hooks,
  arrays/functions/wrappers, BigInt/public Symbol/late exotic primitives,
  descriptors/accessors and shared partial-host/cyclic prototype errors remain.
  String.prototype's empty-string identity is supported; no wider wrapper or
  BigInt representation is added. P011 static-key guards remain byte-identical.
- SYM-001/004, STRING-001, SECURITY-002, REPORT-001: numeric-string parsing has
  no new cap. Shared Number parsing/formatting, interpreted coercion, parser/input
  allocations, prototype depth, branch growth and successful allocation remain
  inherited limits/assumptions. Only bounded copy/output is established.
- FS-001/FS-002, LANG-003, TARGET-002: actual next Stats.size read in unchanged
  sirv is typed, preserving current ctype/name, completed mrmime activation,
  frames and every success/EMFILE call/outcome identity. Size/mtime/Date/header
  semantics and factory return stay deferred; other legacy Stats guards remain.
  No header/Node startup/network feature or future callback analysis is inferred.
- TEST-001/REPORT-001: 14 complete substring files/28 variants are added, no
  active file removed, all 43/86 native candidates checked, 29 whole inactive
  blockers retained. Complete corpus:384/759 with 46 unchanged historical skips.
  Audits scan guards/assertions/skips/key routes/checkpoints/provenance; counts
  are not complete language or host coverage. Historical reports/manifests and
  all prior log bytes are retained. P012 ENOSPC capture and failed checks remain
  classified; versioned compact capture references unchanged committed bytes.

## P012 correction1 — current own Stats size admission (P012-R1)

Independent frozen review5273aa2 rejects source3ef28e1 for one P2 introduced
regression. Correction1 is provisional until renewed Astra/high acceptance.

- FS-001/FS-002: supplied current own size values are data facts, not inferred
  native file sizes. Admission splits persistent own presence, reads its current
  value and preserves alias replacement, finite choices, undefined/zero, two
  instances and old snapshots. Unknown/unprovided size stays typed; inherited
  size cannot replace unknown native own metadata. Fresh unknown-size writes,
  broader Stats fields/brands/inspection/descriptors/Date remain existing gaps.
- LANG-003/REPORT-001: no read/effect replay or guest catch/finally on an analysis
  stop. Supported, stopped, earlier-unsupported and guest filesystem-error
  siblings retain caller/prefix/console/prototype/heap state and exact FS
  call/outcome identity. The actual sirv frontier stays Stats.size, not factory
  return or completed header/startup/request behavior.
- STRING-001/002/003, LIB-002, SYM-001/004 and TEST-001/002/003: substring,
  ordinaryStringHint, registration, every prior spec/corpus and P011 guards stay
  byte-identical. Same384 active files/759 variants/46 historical skipped files;
  no extra method, conformance claim, new skip or gap-group closure.
- Correction source/evidence are separately frozen. Original evidence/handoff,
  rejected review files, hardlinked archives, helpers and all old logs retain
  their bytes. VM red and failed correction harness/typecheck artifacts are
  classified by exact snapshots; compact capture does not duplicate dependencies.

## P013/P014/P015 reconciliation — bounded Stats.size, bounded Stats.mtime Date, bounded ASCII normalize (Instinct, 2026-10-15)

Worker implementation in-sandbox by Instinct; independent review pending.
[Filesystem boundary](node-filesystem.md#bounded-statssize-and-statsmtime-and-the-p012-r1-boundary),
[size specs](../test/node-stats-size.spec.ts),
[mtime specs](../test/node-stats-mtime.spec.ts),
[normalize specs](../test/string-normalize.spec.ts) and task records
[P013](agent-tasks/P013-stats-size/task.md),
[P014](agent-tasks/P014-stats-mtime/task.md),
[P015](agent-tasks/P015-string-normalize/task.md) retain residuals; no gap
group closes.

- FS-001/FS-002: regular-file Stats.size from declared facts and Stats.mtime
  from an explicit declared observation (CLI capture passes memoized lstat
  size/mtimeMs) complete; directory metadata, undeclared files, other Stats
  fields (mode/BigInt/atime/ctime), writes, descriptors and constructors stay
  bounded. Stats and bounded Date instances are boundary-marked, so reached
  gaps stop as retained typed boundaries beside siblings.
- LIB-001/LIB-002: normalize alone leaves the deferred registry. Only the
  omitted/undefined form (NFC) on concrete ASCII receivers is modeled (ASCII
  is NFC-closed, so identity); explicit forms, non-ASCII text, symbolic
  receivers and exotic conversion stay typed boundaries. The pinned 52-name
  inventory is eleven modeled/41 deferred; descriptor/reflection/writes and
  wrapper construction stay open.
- STRING-002/003: normalize keeps the 65,536-unit analysis cap discipline and
  ordered receiver conversion (nullish guest TypeError, Symbol.toPrimitive
  absence before ordinary conversion); no allocation-failure semantics.
- LANG-003/REPORT-001: unchanged sirv now completes header preparation
  (Content-Length, Content-Type, Last-Modified) and ASCII name.normalize,
  stopping at String.prototype.replace in the FILES key expression with the
  completed toHeaders activation retained outside the current callback chain.
  No factory return, server, request or success claim; every filesystem
  call/outcome identity beside EMFILE is preserved.
- Date residual: only bounded instances from Stats.mtime with getTime and
  toUTCString (deterministic UTC arithmetic, the pinned host's actual year
  formatting, TimeClip including -0) are modeled. Date construction, Date.now,
  other methods and timezone/locale behavior remain guarded.

## P016/P017 reconciliation — bounded no-match RegExp replace, bounded Function.prototype.bind (Instinct, 2026-10-15)

Worker implementation in-sandbox by Instinct; independent review pending.
[replace specs](../test/string-replace.spec.ts),
[bind specs](../test/function-bind.spec.ts) and task records
[P016](agent-tasks/P016-string-replace/task.md),
[P017](agent-tasks/P017-function-bind/task.md) retain residuals; no gap group
closes.

- LIB-001/LIB-002: replace alone leaves the deferred registry. Only
  intrinsic-layout flagless/g RegExp search values with no match are modeled
  (identity; the replacement is never observed). Concrete string search and
  replacement values replace the first literal occurrence through the bounded
  GetSubstitution forms ($$, $&, $`, $'), with $n/$< literal (P028). Ordered
  match positions, RegExp replacement observation, custom exec/Symbol.replace
  dispatch, other flags, function replacements, non-string conversions and
  exotic receiver conversion stay typed boundaries. The pinned 52-name inventory is twelve
  modeled/40 deferred.
- LANG-006: Function.prototype.bind leaves the gap list in bounded form:
  concrete callable receivers capture thisArg/partial arguments into a fresh
  boundary-marked bound identity with computed length, and calls forward
  through ordinary invocation. Bound construction, bound name metadata,
  descriptors and symbolic receivers stay bounded; sloppy primitive receiver
  boxing remains rejected and is now the measured stop when calling the
  returned sirv handler.
- LANG-003/REPORT-001: unchanged sirv's factory now returns its request
  handler closure; the EMFILE sibling still throws and every filesystem
  call/outcome identity beside it is preserved. No server startup, request
  or success claim; request-path analysis (parse(req), http modeling)
  remains open.

## P018 reconciliation — bounded sloppy primitive receiver boxing (Instinct, 2026-10-15)

Worker implementation in-sandbox by Instinct; independent review pending.
[boxing specs](../test/sloppy-receiver-boxing.spec.ts) and the task record
[P018](agent-tasks/P018-sloppy-boxing/task.md) retain residuals; no gap group
closes.

- LANG-003: the "Sloppy receiver boxing is not yet supported" host assertion
  is replaced by bounded ToObject boxing for concrete number/string/boolean
  receivers: fresh per-call wrappers on the original intrinsic prototypes,
  own-write visibility within the activation, guarded slot/prototype reads.
  instanceof/Symbol.hasInstance and constructor/prototype mutation remain
  guarded legacy host assertions; wrapper slot semantics (valueOf/toString
  tags) remain unmodeled. Direct symbolic choice receivers and unregistered
  receiver types stop as typed boundaries.
- LANG-006/REPORT-001: sirv's bound viaCache handler (thisArg 0) is now
  callable; request-path analysis still requires parse(req) and http
  modeling. No server or request claim.

## P019 reconciliation — bounded generic UTF-16 String.prototype.indexOf (Instinct, 2026-10-15)

Worker implementation in-sandbox by Instinct; independent review pending.
[indexOf specs](../test/string-indexof.spec.ts),
[sirv request specs](../test/sirv-request.spec.ts) and the task record
[P019](agent-tasks/P019-string-indexof/task.md) retain residuals; no gap
group closes.

- LIB-001/LIB-002: indexOf leaves the deferred registry in bounded form.
  Concrete UTF-16 operands with ordinary conversions and forward literal
  scanning are modeled within the shared 65,536-unit admission and
  1,048,576-comparison budgets; RegExp search values (native coerces via
  RegExp toString, unmodeled), exotic conversions and symbolic operands
  stay typed boundaries. The pinned 52-name inventory is thirteen
  modeled/39 deferred.
- HTTP-008/REPORT-001: the delivered request declares method, url and an
  absent _parsedUrl slot, so a delivered GET /hello.txt runs unchanged
  @polka/url parse to completion (both indexOf probes answer -1; the
  opaque querystring builtin is never invoked). The measured stop moves to
  req.headers['accept-encoding'] (sirv build.js:172), still a legacy
  unmarked host property read. Incoming headers, the rest of the request
  surface, viaCache lookup, the send path and fs streams remain open; no
  response or success claim.

## P020 reconciliation — bounded incoming request headers and ordinary-array call spread (Instinct, 2026-10-15)

Worker implementation in-sandbox by Instinct; independent review pending.
[call spread specs](../test/call-spread.spec.ts),
[sirv request specs](../test/sirv-request.spec.ts) and the task record
[P020](agent-tasks/P020-request-spread/task.md) retain residuals; no gap
group closes.

- HTTP-008/REPORT-001: the delivered request now declares an ordinary
  Object.prototype-linked headers object with no own names (pinned Node
  24.21.0 raw HTTP/1.0 control), so sirv's accept-encoding and range probes
  answer undefined through ordinary lookup. Header-carrying deliveries,
  rawHeaders and the rest of the request/response surface remain open; the
  measured stop moves to String.prototype.charCodeAt in sirv's toAssume
  (build.js:17). No response or success claim.
- LANG-001/LIB-001: call/new spread arguments are modeled for proven
  ordinary arrays (intrinsic @@iterator chain, elements in order, holes as
  undefined after inherited-index proof, conditional operands split per
  branch, 1024-element budget). Custom @@iterator hooks, exotic/accessor
  arrays, unknown layouts, non-array iterables and non-iterables stop as
  typed boundaries; native non-iterable TypeErrors are not fabricated.
  Array-literal spread, rest parameters and the implicit arguments object
  remain gaps.

## P021 reconciliation — bounded String.prototype.charCodeAt (Instinct, 2026-10-15)

Worker implementation in-sandbox by Instinct; independent review pending.
[charCodeAt specs](../test/string-charcodeat.spec.ts),
[sirv request specs](../test/sirv-request.spec.ts) and the task record
[P021](agent-tasks/P021-string-charcodeat/task.md) retain residuals; no
gap group closes.

- LIB-001/LIB-002: charCodeAt leaves the deferred registry in bounded
  form: concrete receivers with ToIntegerOrInfinity positions (NaN as +0,
  truncating fractions, infinities out of range) read one code unit with
  no scan budget; symbolic operands, array/function/symbol conversions and
  custom Symbol.toPrimitive hooks stay typed boundaries. The pinned
  52-name inventory is fourteen modeled/38 deferred. Correction: P019's
  indexOf nullish TypeError message read "lastIndexOf"; it now matches the
  pinned native "String.prototype.indexOf called on null or undefined" and
  the spec asserts the message text.
- LANG-001: ordinary for-in enumeration is modeled (P022): snapshot keys
  own-before-inherited with native mutation semantics (additions unseen,
  deletions skipped, reveals and re-additions visited) and per-iteration
  let/const cells. Chains through unmodeled prototype objects (VM
  constructor prototypes, ownPropertyModel "unmodeled") stop with the
  legacy enumeration error; deletion-driven visits await DeleteExpression;
  labeled jumps, destructuring heads and completion values remain open.
- HTTP-008/REPORT-001: content-length is an ordinary explicit serialized
  field (P024): pinned Node 24.21.0 accepts any value verbatim at
  writeHead and enforces no body-length coupling without a socket, the
  transport layer the projection excludes; the other six
  transport-sensitive exclusions keep their automatic-behavior coupling.
  fs.ReadStream and pipe are modeled with explicit embedding-driven
  delivery (P025): single-chunk files, pinned error-event and TypeError
  behavior, declared gaps for 'open'/fd identity, options and multi-chunk
  flows. On the delivered GET /hello.txt the unchanged sirv handler now
  completes end to end and the wire projection matches the pinned Node
  24.21.0 reference (status 200, body "hello from sirv\n", content-type
  text/plain, content-length "16", last-modified from the pinned mtime).
  Header-carrying requests, range requests, 404/HEAD dispatch and the
  remaining exclusions remain open.


## Instinct integration reconciliation — 2026-10-21

The [cumulative review](agent-tasks/integration-2026-10-21/review.md) covers
P012–P034 plus corrections; earlier increment sections preserve historical
frontiers and provisional worker claims, not current acceptance. No gap group
is closed by this integration.

- LANG-001/LANG-003/OBJ-003: lexical for-in RHS evaluation now observes TDZ;
  enumeration includes current enumerable Object.prototype additions and
  selected symbolic heads. Snapshot/depth/body/work limits remain explicit: at most 1,024 keys and
  64 prototype links, alongside the existing body/step budgets.
  Array patterns have at most 64 elements and nesting depth 32. Expanded calls
  cap operands/results at 4,096 (preserving existing 3,000-argument calls),
  individual spreads at 1,024 elements, and spread operands at 64; comma sequences cap
  at 64 operands. These are analysis budgets, not JavaScript restrictions.
  Array binding uses current iterator length, permanent exhaustion, and guarded
  ordinary-iterator admission; custom iterables, rest, descriptors and general
  iteration remain gaps. Boxed String receivers retain data/indices/length;
  broader wrapper APIs, symbolic indices and descriptor writes remain bounded.
- STRING-002/STRING-003/LIB-001/LIB-002/LEGACY-002: no-match replacement preserves
  replacement conversion and global lastIndex effects; custom hooks and matched
  RegExp substitutions remain guarded. includes must check RegExp identity before
  search conversion. Concrete split and parseInt retain explicit operand/work
  limits and unsupported conversion domains. Unicode normalize/casing, broader
  String methods and the legacy segmented split model remain open.
- FS-001/FS-002/HTTP-008: stream outcomes are persistent branch state; callback
  observations and handled error/close order match fresh pinned controls.
  Arbitrary pipe destinations, open/fd events, multichunk delivery, transport and
  general scheduling remain gaps. Resource availability remains a modeled input,
  never an inferred fact. Header validation preserves ordinary conversion effects
  and partial raw-store writes before failure. Parsed incoming headers require lowercase token names and concrete string
  values, in an already-parsed event domain (raw parsing, duplicate combination
  and transport-derived headers are not inferred); open symbolic names/values and unsupported hook or
  array forms remain boundaries.
- TARGET-001/TARGET-002/REPORT-001: unchanged sirv's factory and selected GET,
  HEAD, 404, range 206 and conditional 304/200 histories complete within the
  declared environment and explicit delivery schedule. EMFILE and permission
  alternatives remain visible. No complete application/all-path proof, request
  exploration beyond the stated horizon, or new vulnerability is claimed.
- TEST-001/TEST-002/TEST-003/TEST-004: inventory is 484 whole unmodified active
  files / 959 variants, with 43 parse-negative files / 85 variants. All 114
  additions (113 drafts plus one review addition) and all 370 predecessor files remain active. The complete 46-file
  historical skip inventory matches the selection exactly. New whole Node cases
  are not claimed; the existing upstream compatibility candidate lists remain
  pending their full harness/API dependencies. Guard/assertion/skip/doc scans
  and exact-source test evidence accompany the integration, not a conformance
  claim. Historical worker counts and typecheck claims are not fresh evidence.

Integration resource boundaries also cap boxed strings at 65,536 UTF-16 units,
replace/split/parseInt operands and replacement output at 65,536 units,
header validation strings at 65,536 units, and ReadStream sources at 1,048,576
units before byte preparation with selected chunks at 65,536 bytes. Conditional
stream delivery retains supported sibling outcomes beside typed unsupported
branches. Non-global RegExp replacement guards object/exotic lastIndex conversion
after replacement conversion effects; global replacement overwrites lastIndex
with zero first. These partial domains preserve the residual IDs above.

Integration Linux CI exposed an existing FS-002/TEST-004 assumption: empty-path
open errors differ between historical Linux and Linux 7.0 after kernel commit
151e3257d61941ac07a7daacdb66ddc645f6ca34. Open-error ordering is now a declared
persistent Boolean fact, unknown by default on Linux and descriptor-first on
the pinned Darwin profile. Concrete profiles and symbolic repeat-call
correlation are tested; native controls compare full error shapes against the
selected model input. CLI acquisition does not exhaust native descriptors or
guess ordering from a kernel version. The environment profile remains bounded;
this does not close kernel, libc, resource-pool or general filesystem coverage.


## Dependency capability goal reconciliation — 2026-10-21

The owner now explicitly requests package.json/lockfile-driven, per-dependency
capabilities and review prompts for newly possible behavior, including transitive
packages. This expands the SECURITY-001/SECURITY-002 acceptance target, not core
value fields. Existing HostCall observations preserve operation, receiver,
arguments, snapshots and path conditions but do not retain a complete initiating
package/call-chain attribution. Generic source provenance must precede consumer
permission inheritance; a utility package is not blanket caller authorization.
Outbound HTTP, subprocess, lockfile/lifecycle orchestration, capability enforcement,
precise behavior diffs and original Shai-Hulud analysis remain open. P035 begins
REPORT-001 input authoring; no security gap is closed by planning or dispatch.


## P035 explicit environment reconciliation — 2026-10-21

P035 adds bounded JSON input authoring to the real CLI, reusing shared VM values
and host models. No stable gap closes; this is not snapshot resumption, package
admission or a complete arbitrary-program proof. Evidence is tracked in
[the task review](agent-tasks/P035-symbolic-environment/review.md).

- REPORT-001: `--environment` validates before target realpath/source capture.
  The ordinary `node.environment` host slot retains the complete named-value Map
  (including unused aliases), normalized parsed-event template and resolved
  path/version/exact-byte SHA-256. The slot is absent without supplied input.
  Graph stdout remains roots/nodes; malformed input exits 1 without a graph.
  Version 1 accepts Boolean/string literals, unknowns, references and same-kind
  Boolean selections only. Unknown/nested keys, missing/cyclic/wrong-type refs
  and malformed unused branches reject. Full resumption, general heap/filesystem
  authoring, process.env/argv, arbitrary runtime versions and source attribution
  remain open. A template records future input knowledge, not executed callbacks.
- SYM-004/REPORT-001/SECURITY-002: authoring limits are 262144 file bytes, JSON
  nesting32, 256 names, 4096 expression nodes and references, 65536 aggregate
  literal bytes (including headers), 16384 per decoded string, 64 headers with
  names255/value8192 bytes, expanded depth32/work4096 and request method+URL
  work1024. Expanded refs count their whole dependency at each occurrence;
  counting only memoized construction would not bound downstream traversal.
  All limits reject rather than narrow inputs; these are conservative authoring
  limits, not total solver/path-volume bounds. UTF-8 input can encode escaped
  UTF-16 lone surrogates and NUL data. Duplicate decoded JSON keys reject.
- SECURITY-002/CJS-001: regular lstat, O_NOFOLLOW/O_NONBLOCK open, opening fstat
  size/metadata checks before allocation, capped reads and final metadata checks
  detect some environment-file races and close descriptors on failures. This is
  not atomic capture or a symlink-safe ancestor walk. It does not harden target
  source acquisition or sandbox adversarial archives/programs. Native embedding
  owners remain trusted, as for other VM state; frozen domain records and
  ordinary Map mutator guards are not protection against hostile native code
  bypassing prototypes or mutating VM values.
- FS-002: descriptor availability and empty-path/open-resource precedence can
  reference shared named facts. Omission retains the existing modeled defaults;
  bind availability, shared descriptor pools, resource transitions, post-open
  errors, arbitrary bytes/trees and successful-write assumptions remain open.
- HOST-002/HTTP-001: one pure zero-argument template factory applies to every
  eligible server. Inline symbolic leaves are fresh per selected arrival; named
  references share initial identity. No native arrival counter can leak sibling
  traversal. Histories still include zero/one/two arrivals, dynamic listener
  eligibility, bind failures and stopped siblings. Concrete lowercase parsed
  headers do not model raw wire parsing/duplicates, DNS, transport completion,
  timers or automatic stream consumption. Trusted custom embedding factories
  must themselves preserve branch-independent behavior.
- TARGET-001/002/TEST-004: real CLI specs run unchanged pico with successful text
  bodies, finite method/URL outcomes, 404, EMFILE, and a copied unchanged package
  plus empty data directory producing uncaught ENOENT. Existing pinned benign
  Node controls remain the independent host oracle. Fresh versus shared request
  tests retain correlation and failures after two events. No malware is run and
  no full Node/ECMAScript or all-path application claim follows.
- TEST-001/002/003: no Test262 or upstream Node file was added/modified by P035.
  The complete selected corpus/46-file historical skip inventory and guard,
  assertion, skip and documentation scans are rechecked before publication.


## P036 activation/effect origin reconciliation — 2026-10-21

[Interpreted activations](interpreted-activations.md) preserve dynamic function
identity and lexical filename; host-call origins freeze direct executing source
and the active chain. This narrows existing provenance gaps without closing them.

- REPORT-001/CJS-001/SECURITY-001: ordinary calls, constructors, CommonJS wrappers,
  aliases and actual callbacks share one entry seam. Frames/targets/parents and
  call/return/throw origins retain graph identities. Exact source bytes/hashes,
  dependency-instance/lockfile mapping, AST coordinates, cross-run IDs and portable
  resumption remain absent. A filename supplied by an embedding is not attested.
- HOST-002/HTTP-001/REPORT-001: preserved callbacks acquire no frame until invoked.
  Deferred dispatch uses the current dynamic caller, not registration ancestry.
  Async causal lineage, native stacks and broader event coverage remain open.
  An existing host invocation does not establish an outbound transport attempt.
- LANG-003/REPORT-001: entered checkpoints precede receiver/parameter guards;
  ordinary return/throw cleanup and branch joins restore identical caller frames.
  The new different-activation join guard is an internal invariant failure with
  existing legacy checkpoint behavior. Partial trees retain leaf activations and
  a common base; the base is not a final active stack for every branch. Legacy
  guard failures and directly called generators still rely on their caller for
  diagnostic/boundary conversion. No general continuation recovery is added.
- SYM-004/REPORT-001/SECURITY-002: frozen O(1) links add no semantic call-depth cap.
  General native recursion and graph DFS still lack a complete resource bound.
  A timeout-bounded 25-frame/deduplicated-target probe is regression evidence,
  not arbitrary-depth safety. Trusted native embedding mutation is not hardened.
- SYM-004/REPORT-001: summary proof hooks suppress speculative activation pushes;
  accepted cached summaries and failed singleton proofs retain caller ancestry.
  This does not alter summary proof domains or make all legacy proof diagnostics
  full application histories. Unknown eval/generated filenames stay unknown.
- TEST-001/002/003: no Test262/native behavior domain or upstream selection is
  added. Existing complete language and pinned host cases remain regressions;
  all46 historical skipped files and candidate inventories remain unchanged.
  Final audit evidence records the four scans and full pinned file inventory.

No stable gap is closed and no package permission/detection claim follows.


## P037 program identity reconciliation — 2026-10-21

The [program root](program-identities.md) exposes captured SHA-256/byteLength
identities and positive/negative resolver observations alongside launch facts.

- REPORT-001/CJS-001: root.program is an immutable final union across explored
  acquisition paths; source membership does not prove import execution on every
  branch. The entry shares its source-map record. JS/JSON/package metadata bytes
  retain identity before preprocessing; positive probes can lack read identities.
  Text is intentionally not copied into this root; native input retains it.
  No coherent OS snapshot, whole dependency graph, loader-edge reconstruction,
  source-coordinate map, portable resumption or model fingerprint is established.
- SECURITY-001/002: a consumer can match P036 known file labels to hashes and
  verify supplied bytes. Local hashing is not registry/lockfile attestation or
  package-instance authority. Capture still has race/symlink-ancestor/read-size
  gaps. Snapshot copying prevents ordinary alias mutation but is not a hardened
  native Map membrane. Unsupported eval/generated origins remain unknown.
- SYM-004/REPORT-001/SECURITY-002: added publication caps are4096sources,
  16384path observations,4096args,4194304 UTF-8 metadata-string bytes. Exact
  accounting includes runtime/filename/cwd, each argument, every source key+
  digest and every path key+kind; duplicate occurrences count and entry alias
  does not add a second charge. Counts/code units precede exact byte scans; all
  checks precede public copies. Digests and safe nonnegative byte lengths are
  validated. Overflow/invalid identity causes exit1 with diagnostic/no graph,
  never truncated evidence. These caps do not bound source reads, parser/VM/AST
  or the remaining recursive graph; JSON escaping can expand metadata on wire.
- LANG-003/REPORT-001: existing normal/guestthrow/typedpartial/legacydiagnostic
  result paths all publish acquired facts. Initial acquisition failure remains
  exit1/no result. No completion or boundary semantics change is claimed.
- TEST-001/002/003: no language/host semantics or upstream cases added. Complete
  selected/skipped Test262 inventory remains unchanged and is audited with the
  four documented scans before publication. Existing compatibility cases remain
  regressions; no coverage conclusion follows from this metadata feature.

No stable gap is closed; package policy and outbound modeling remain separate.


## P038 pending TCP reconciliation — 2026-10-21

- NET-001 retains every initial overload, options/prototype, IPv4/value and lifecycle
  restriction. Host-shape boundaries precede unpromised diagnostics; admitted
  nonempty non-NUL strings preserve numeric-port errors before DNS routing.
- NET-001/HOST-001: fresh stable submission Boolean distinguishes admitted pending
  from unmodeled failure cleanup; no omitted resource means successful connection.
  Custom submission results must satisfy the trusted host-model contract.
- NET-001/HOST-002: connectionAttempt runs before submission; listener throw/stop
  preserves the prefix. Queued destroy retains future native close. No TCP event
  provider or new interpretation of the HTTP arrival horizon is introduced.
- EVENTS-001/002: generic registration allowlist prevents borrowed-method bypass;
  missing native lifecycle/internal listener semantics remain guarded. Existing
  emitter warning/meta-event/legacy diagnostics remain gaps.
- REPORT-001/CJS-001: socket identity correlates public return, queued receiver and
  submission with existing origins/source identities; no async ancestry or package
  verdict is invented. Host slots are persistent inspection, not resumption.
- HOST-001/002/REPORT-001: options enumeration, source parsing, host allocation and
  graph work retain existing resource limitations. The pre-port-validation host
  NUL scan is linear in materialized input and not charged per character; the
  later IPv4 parser first rejects strings longer than15. No new socket-count/stack cap
  is silently imposed or claimed to follow from maxSteps.
- SECURITY-001: no HTTP transfer, policy adapter, package grant or incident
  detection is established by this network prefix. Future callbacks remain unknown.

Four documented scans and complete skipped-file reconciliation are retained in
the P038 review/evidence. Test262 remains484 complete files/959 variants, with
43 parse-negative files/85 variants and46 unchanged historical skips. No stable gap is closed.


## P039 package/timer reconciliation — 2026-10-21

- NET-001: explicit numeric-port/host positional normalization reuses endpoint
  rules and preserves original invocation arguments; default host/string ports,
  extra arguments, IPC and broader Node overloads remain guarded.
- NET-001/HOST-002: queued one-argument setTimeout models integer0..2147483647
  configuration, reset/disable and destroy cancellation with persistent unrefed
  logical arms. Arm identity is not a native Timeout handle. No clock/deadline,
  timer provider/expiration, callback setter, stream activity refresh, public
  timeout listener, process liveness or timer/HTTP interleaving is modeled.
- NET-001/HOST-001: admitted negative/nonfinite numeric duration errors retain
  the public write before guest throw and the previous active arm. Positive
  fractions/overflow/nonnumber/open/extra/late-phase and altered-prototype domains
  stop before model-side writes; public timer/method mutation stays guarded.
  Fatal native timer allocation remains the generic resource gap, not a guessed
  catchable availability Boolean. Current arm state is O(1); history/graph and
  existing enumeration/resource gaps remain.
- CJS-001/REPORT-001/SECURITY-001: complete unchanged checkGrowl source is a pinned
  package subpath under explicit caller IPv4 inputs, not package-main or whole-
  graph safety. Roots.program and origins correlate bytes and pending resources,
  not grants or a completed availability/incident-detection verdict.
- EVENTS-001/002/HOST-002: retained connect/error callbacks call unsupported end
  when eventually executed; retention is not execution. No new event-horizon
  claim is added. Default localhost still needs DNS.
- Four complete additional upstream timeout candidates were read; none activated
  because their full tests require broader server/stream/clock/lifecycle APIs.

The four documented scans and full skipped-file inventory were rerun and recorded
in the P039 review/evidence. Test262 remains484 complete files/959 variants,
43 parse-negative files/85 variants and46 historical skips. Independent review,
184 full suites/5362 passes and typecheck passed. No stable gap is closed.


## P040 TCP completion reconciliation — 2026-10-21

- NET-001: selected admitted completions retain one stable Boolean outcome record,
  consume pending/connecting state before status processing, and stop before
  failure error construction or partial-readable/writable stream actions. No
  errno, OS success/flag correlation or complete afterConnect return is invented.
  Wrong model configuration/record/Boolean/throw results reject; typed stops keep
  their actual transition prefix. Mutated prototypes/property domains stay guarded.
- NET-001/HOST-002: full-duplex success refreshes only an active logical timer
  using its retained old delay, then executes actual connect/ready listeners and
  stops before read(0), unless a callback stops earlier. Canceled timers stay
  inactive; public timeout can retain a caught invalid value. Native Timeout
  object identity, elapsed time, readStart status and future bytes remain gaps.
- HOST-002: one shared HTTP/TCP horizon0/1/2 retains waiting and independent
  eligible providers; typed delivery stops retain active state and suppress later
  jobs/events. Timer expiration, native close, broader scheduling/fairness,
  resumption and histories beyond the horizon remain unmodeled. Independent
  default completion Booleans overapproximate callback inputs, not all OS traces.
- EVENTS-001/002: supported connect/ready listener order and once removal execute
  through shared VM. Other retained lifecycle callbacks are still unexecuted;
  public emission/count/private native listener semantics remain guarded.
- CJS-001/REPORT-001/SECURITY-001: unchanged checkGrowl advances into its real
  connect listener and stops at socket.end before availability callback. Source
  identities and current origins support attribution, not a whole-package proof,
  transport grant, capability policy, or incident detection. External callbacks
  do not restore registration activation. JSON completion authoring remains open.
- HOST-001/REPORT-001: one provider per admitted socket and constant-sized outcome
  per selected delivery reuse existing budgets; registry/history/graph growth,
  native allocation and complete host-work resource accounting remain open.
  Custom completion-record validation can enumerate accumulated/conditional key
  histories and recurse through absent extras; its work is not bounded by the
  three retained fields. Default outcome creation alone is fixed-sized.
- Four complete upstream callback/connecting/refusal tests were reread. None can
  execute whole within this prefix; blockers and unchanged bytes are retained.

The complete Test262/skipped inventory remains484 files/959 variants,43
parse-negative files/85 variants and46 historical skips. Independent review,
187 full suites/5403 passes and typecheck passed. Four scans are recorded in the
P040 review/evidence before candidate CI/publication. No stable gap closes.


## P041 empty socket end reconciliation — 2026-10-22

- NET-001: first zero-argument end requires retained full completion facts and
  fresh connected empty/live state. Phase alone is insufficient. Unsupported
  arguments/repetition/connecting/partial/destroyed/altered domains stop before
  end-side changes; public writable flags and method writes remain guarded.
- NET-001/HOST-001: locally queued shutdown is derived from pinned POSIX state,
  not an assumed successful external syscall or arbitrary admission Boolean.
  Explicit ShutdownWrap/default TCP Error() exclude two generic C++ fallback
  routes. Fatal native/JS allocation remains unresolved; later syscall outcome,
  cancellation and other-platform/backend behavior remain unknown.
- NET-001/HOST-002: ending/public writableEnded precede finalization; internal
  ended follows normal shutdown submission return. finalPending and shutdown
  pending remain; no final callback, prefinish/finish job, read/EOF, shutdown/close
  provider or timer refresh is invented. afterShutdown ignores later status;
  future error/lifecycle modeling must preserve that native distinction.
- LANG-001/HOST-001: Socket.end dynamically dispatches Function.prototype.call.
  Altered/conditional Function.prototype heaps conservatively stop; interpreting
  custom dispatch and precise selective prototype mutation remain gaps.
- CJS-001/REPORT-001/SECURITY-001: unchanged checkGrowl now executes its actual
  user callback with null,true on the supported full-duplex branch, with original
  source/activation/effect identities. Its value is an application report, not a
  protocol response, successful shutdown, whole-package capability grant or
  incident detection. Normal return still reaches the read frontier; earlier
  callback throw/typed stop wins. Waiting/failure/partial paths remain distinct.
- HOST-002/REPORT-001: external horizon/provider set is unchanged. No clock,
  deadline, arbitrary schedule, process-liveness or resource-growth closure.
- NET-001/SYM-001/REPORT-001: review regressions exposed an inherited completion
  finite-record-choice crash and branch-contaminating mutable end guards. Record
  selection now precedes property reads and each end continuation owns its checks;
  full and partial siblings survive independently. This fixes specific supported
  choices, not the broader reasoner or arbitrary resumption gaps. P040 publication
  was held and combined validation is required after these corrections.
- Five complete upstream net/writable cases were read but not activated; whole-
  file blockers and exact source hashes are retained. Local injected status
  controls are compatibility evidence, not reachable fresh-POSIX outcomes.

Full independent validation and root190-suite/5448-pass/46-skip run passed with
typecheck0 and stable source hashes. Four scans and complete unchanged Test262
inventory are reconciled in P041 evidence; exact-candidate CI precedes publication.
No stable gap closes.


## P042 fresh read registration audit

- NET-001/HOST-001: fresh full-duplex live unpaused empty constructed readable
  state admits automatic read(0) through local readStart0; pinned POSIX source
  entails this prefix. No bytes, EOF, backend success or eventual delivery follows.
  Pending write-side shutdown is compatible with local read registration.
- NET-001/LANG-001: current socket, Object and Function intrinsic guards run after
  callbacks and before read changes. Per-branch own-presence/value checks preserve
  untouched intrinsic siblings; altered or unresolved intrinsic state, hooks,
  public read/pause/resume, prior reading, data/readable listeners, buffers,
  decoder/object mode and modified defaults remain explicit gaps.
- HOST-002/REPORT-001: actual normal completion lets the shared registry clear
  active delivery and drain queued work. Callback typed stop preserves active;
  guest throw and later queued-job stop retain their existing distinct semantics.
  No synthetic job, timer change or additional provider is introduced. Read,
  shutdown, timeout, EOF/close events and their competing interleavings remain
  outside the declared HTTP/TCP horizon0/1/2.
- CJS-001/SECURITY-001: unchanged helper callback and subsequent read initiation
  preserve provenance but do not establish service availability, a capability
  policy verdict, complete dependency behavior or incident detection.
- HOST-001/LANG-001: read-default validation enumerates current intrinsic names
  and recursively checks presence/value. Conditional added names make this work
  proportional to the heap domain; there is no new size cap or claim of constant
  guard cost. General evaluation/recursion/resource bounds remain gaps.
- HOST-001: fatal allocation, OS backend outcomes, cross-platform differences,
  complete native status relationships and larger graph/resource limits stay open.
- Two complete upstream candidates are inspected with whole-file blockers; zero
  are activated. Controlled native cases intercept all transport and close calls;
  no native package runs or real external I/O supplies symbolic evidence.

Full review,193 suites/5475 passes/46 historical skips and typecheck passed.
Four scans and complete unchanged skip inventory are reconciled in P042 evidence.
Exact-candidate CI precedes publication. No stable gap closes.


## P043 shutdown completion audit

- NET-001/HOST-002: pending first-empty-end shutdown registers one provider in the
  existing external registry. Horizon0/1/2 is shared with HTTP and TCP; waiting,
  shorter histories and resource competition remain. Registration is no arrival,
  and future data/EOF, timer expiry, connected destruction and close are unmodeled.
- NET-001/HOST-001: pinned Node afterShutdown ignores asynchronous status. This
  public-boundary projection supplies no success Boolean, errno, successful OS
  syscall, peer receipt or close fact. Generic native/resource failure and status
  capture remain gaps; injected status controls prove JS compatibility only.
- NET-001/REPORT-001: selected callback consumes shutdown.pending and finalPending
  before later finalization admission. A runtime-owned pending provider and
  existing guarded guest APIs establish the original full-duplex socket/public
  writable domain; no new broad intrinsic guard is claimed. Invalid modeled
  private finalization state stops explicitly after arrival, not through hidden
  ineligibility. Tests label embedding-only state mutations separately.
- HOST-002/EVENTS-001: prefinished precedes synchronous prefinish; only normal
  return queues finishPending. Actual queued finish sets finished/public flag
  before listeners without an invented needFinish recheck. Existing FIFO job
  budget and callback interruption semantics preserve active work appropriately.
  Normal post-finish open readable state excludes autodestroy; unsupported current
  endEmitted facts stop after callback effects. No timer/read mutation is implied.
- EVENTS-001/REPORT-001: independent red probes exposed the inherited untyped
  custom listener.apply guard at prefinish/finish. P043 classifies this exact
  unsupported dispatch at its actual emitter checkpoint, retaining preceding
  state and sibling branches. Custom apply execution itself remains unsupported;
  conditional unresolved apply can conservatively stop shared dispatch. Other
  legacy emitter guards remain unconverted and are not claimed fixed.
- EVENTS-001/NET-001: prefinish/finish registration is supported with zero hidden
  native listeners for those names. Public emit/count, data/readable/end/timeout
  registration, listener metadata/limits and broader event surfaces remain gaps.
- LANG-001: independent test use of implicit arguments failed outside the chosen
  guest surface; corrected fixtures inspect explicit parameters. No new arguments
  object support or language corpus activation is claimed.
- HOST-001/SYM-001: graph/provider/queue growth, callback recursion and general
  precision/resources remain open. Five complete upstream candidates were read
  but cannot run whole in this domain; zero activated, blockers retained.

Independent review and full196-suite/5518-pass/46-historical-skip run with
typecheck passed; source hashes stayed stable. Four scans and complete unchanged
Test262/skipped inventory are reconciled in P043 evidence. Exact-candidate CI
precedes publication. No stable gap is closed.


## P044 reconciliation — shared map and sirv compression setup

ARRAY-001/LIB-001 now include bounded ordinary map: captured length, current
HasProperty/Get, holes versus own undefined, inherited indices, callbacks and
fresh results with symbolic correlations. Generic ToLength receivers, Array
constructor overloads, custom species/descriptors/prototypes and unknown layouts
remain open. Constructor shadows conservatively stop even when native behavior
would use default creation; conditional layout loss remains an explicit boundary.
SYM-004 retains uncapped symbolic branch volume; map bounds 1024 positions before
allocation, with bounded quadratic private snapshot copying. LEGACY-002 retains
other inherited-hook assumptions; this increment guards map's reached sparse
lookup only and does not claim a repository-wide fix. LANG-001/LANG-004 and
TEST-002 retain delete, rest, generic subclass/harness and deferred whole upstream
cases. Nine new complete map files add18 variants; historical skips remain open.
TARGET-002 advances unchanged sirv gzip/brotli factory options with real extension
arrays and EMFILE siblings. Brotli dispatch still reaches the existing RegExp /i
boundary; no source rewrite, gzip codec support or all-path package proof is claimed.
See [task](agent-tasks/P044-array-map/task.md) for final validation/audit evidence.

P044 substep B adds dense ordinary unshift within ARRAY-001/LIB-001. Current
heap identity and symbolic values survive atomic persistent writes only after
proving ordinary indexed Get/Set. New destination prototype hooks/unknown
setter state stop before writes. Sparse/conditional presence, generic coercion,
accessors/descriptors, overflow partial mutation and >1024 total positions remain
open. Even no-argument sparse/large calls conservatively stop. Shared removeProperty
currently does not synchronize array element storage; sparse unshift is deferred
rather than treating that helper as sufficient (ARRAY-001/LEGACY-002). Target
fixtures use text-safe .gz file contents to establish selection and headers;
arbitrary binary/codec behavior remains outside this evidence (BUFFER-002/FS-002).

P044 final validation:202 suites/5637 passes/46 historical skips and typecheck
passed. Active Test262494 files/979 variants includes10 new files/20 variants;
43 parse-negative files/85 variants and the full historical46-file inventory
remain unchanged. Four documented scans were reconciled against93145f9; all
new guards map to the residual IDs above. No broad gap is closed.


## P045 reconciliation — ignoreCase and startsWith

REGEXP-001 now admits i-only matching for ASCII input and decoded pattern atoms,
with equivalence applied before set negation. Non-ASCII literal/escaped atoms,
any non-ASCII input, combined/other flags, open strings, exec/captures and earlier
syntax exclusions remain open. Existing length/state/work limits precede ASCII
scan/preparation; scan work is capped by input length but not separately charged.
STRING-001/LIB-001 now include bounded UTF-16 startsWith and ordered conversion.
Open/chunk operands, unknown positions, exotic array/function conversion, custom
toPrimitive, partial/cyclic symbol graphs and >65536 units remain boundaries.
LEGACY-002 retains older includes symbol lookup assumptions: startsWith has a
scoped corrected helper; this is not a repository-wide symbol-model repair.
SYM-004 retains branch/coercion-volume limits; REPORT-001 retains resumption.
TARGET-002 advances unchanged sirv Brotli precedence/fallback and dev filesystem
selection. Tests declare successful stream delivery and text-safe bytes; broader
failures/events, arbitrary binary/codec behavior and transport remain FS-002,
BUFFER-002 and HTTP gaps. No policy/security CLI was introduced.
TEST-002 adds13 complete startsWith files/26 variants; no admissible full /i case
was found among reviewed exec/capture/global candidates, retained in regexp docs.
Historical46 skipped files and parse-negative inventory remain open/unchanged.

P045 final frozen-source validation:207 suites/5827 passes/46 historical skips,
typecheck0. Complete active corpus507 files/1005 variants;43 parse-negative
files/85 variants and historical skipped-file inventory unchanged. Final four
scans and log/source hashes are recorded in [evidence](agent-tasks/P045-package-apis/evidence.json).
The inventory migrations change support classification only, preserving residual
guards and native own-name checks. No residual gap above is closed by this run.

## P046 reconciliation — decodeURI

LIB-001/STRING-001 now admit bounded global decodeURI with primitive/ordinary
ToString, exact reserved escape preservation, UTF8 scalar validation, raw UTF16
preservation and guest URIError. The65536-unit postconversion cap is a budget,
not a JS restriction; finite alternatives branch, open/chunk strings stop.
LEGACY-002 retains array/function/exotic conversion and custom Symbol.toPrimitive
gaps. The scoped symbol traversal rejects partial/cyclic/unmodeled chains and
budgets acyclic depth; older helpers are not globally repaired. Metadata
descriptors/writes and other URI globals remain LIB-001/OBJ-003 work.
SYM-004 retains coercion/branch budgets; REPORT-001 retains general resumption.
TARGET-002 gains unchanged sirv ASCII encoded hits, reserved escapes, once-decoding
and caught malformed paths. Unicode cached setup and postdecode dev lookup stop
at mrmime's ASCII-only toLowerCase: STRING-001 stays open, with actual decoded
state retained. Stream success, text-safe bytes and modeled HTTP delivery remain
declared FS-002/BUFFER-002/HTTP boundaries rather than established external facts.
TEST-002 adds12 whole decodeURI files/24 variants; harness includes, descriptors
and larger exhaustive cases remain unselected. The historical46 skips and
parse-negative inventory stay unchanged. No blanket UTF8/URL/Node coverage claim.

P046 R1/R2 audit: per-reached ordinary toString/valueOf lookup now uses current
heap presence and typed guards, preserving own shadows and delayed fallback.
The intrinsic Object.prototype.toString tag traversal receives its own typed
partial/cycle/prototype and depth guards. These are narrow LEGACY-002/SYM-004
corrections, not closure of all shared lookup or callback failure paths.

P046 final review retains a precision boundary under LEGACY-002/SYM-004: decoder
admission helpers reject direct conditional internal-prototype link values before
branching, while the corrected intrinsic tag helper branches them. Finite argument
choices are supported; general conditional-prototype traversal is not claimed.

P046 final validation:210 suites/6003 passes/46 unchanged historical skips,
typecheck0. Active519 whole Test262 files/1029 variants;43 parse-negative files/85
variants and full historical skip inventory unchanged. Four scans and exact
source/log hashes are bound in [evidence](agent-tasks/P046-decode-uri/evidence.json).
Passing counts do not close residual scopes above or establish whole Node coverage.

## P047 reconciliation — adversarial relational proofs

SYM-001 adds bounded exact-safe-integer affine difference comparisons for
+, - and unary minus, only with independent direct integer/bound facts at every
intermediate. No Number value rewriting; rounding, fractional/NaN/unbounded and
unsafe arithmetic stay unknown. MAX128 visits/depth24/facts256 and cycles decline;
general linear solving, transitive bounds and arbitrary floating algebra remain.
SYM-002/SYM-003 add verified two-counter sum=index induction using actual VM
base/body/update/exit over dense immutable finite arrays, including length0..1m.
Admission needs index0, two zero mutable locals among at most4 candidates, exact
index+1 and each counter unchanged/+1; at most256 scanned bindings/96 AST nodes
perbody/update/choice depth8, shared proof2400/32env/128heap caps. Calls, nested or
abrupt loops, views, unrelated writes/effects and other invariant families decline.
SYM-004 retains conservative heap identity after unrelated object allocation,
ordinary fallback merge-work growth and caller budget boundaries. Private proof
caches do not mutate caller array caches; unknown counters remain unknown.
LEGACY-002 retains member UpdateExpression unsupported behavior; independent
fixtures use explicit equivalent assignment rather than expand syntax here.
REPORT-001 retains unfinished-path/resumption limits: broken full-domain loops
may stop, never count as a concrete false proof. TEST-002 remains519 active whole
files/1029 variants,43 parse-negative/85 variants and46 historical skips; no new
syntax/host semantics or new selected upstream files in this reasoning increment.
All residuals above remain open; focused successes are not universal coverage.

P047 final local validation:214 suites/6058 passes/46 historical skips and
typecheck0, frozen source hashes unchanged. Four scans and complete skip inventory
are recorded in [evidence](agent-tasks/P047-adversarial-proofs/evidence.json).

## P048 reconciliation — nonlinear, exceptional and weighted proofs

SYM-001: comparison-only exact integer polynomial normalization extends +,-,unary
minus to multiplication; every intermediate and coefficient must be safe. Degree4,
terms64,termwork512,visits128,depth24,facts256 caps decline before growth. Direct
bounds only; floating algebra, division/powers expansion and general constraints
remain. Expensive linear expressions can now conservatively exceed termwork.
Bounded integer-domain equality uses at most256 direct facts and64 integer values;
no transitive search, no narrowing unconstrained/fractional inputs, empty domains
never provide vacuous proofs. No signed-zero Number rewriting.
SYM-002/SYM-003: exactly three zero locals with literal positive increments1..16
can propose scaled partition induction, checked via actual VM body/update/exit.
Normalized counts remain symbolic and sum to original length. Other candidate
counts, nonzero initializers, negative/dynamic scales, nested/abrupt/calling bodies
and general recurrences remain. Nonfinite-array admission remains conservative.
SYM-004: inherited private-proof/AST/frontier/heap limits remain, as do conservative
unrelated-object heap identity and ordinary fallback merge growth. Polynomial
termwork and integer-domain bounds add explicit precision limits.
LEGACY-002: += remains unsupported; specs use explicit assignment, with original
syntax failure separately attributed rather than treated as induction-red evidence.
REPORT-001: broken full-domain loops may remain unfinished; absence of a result is
not an all-path claim. TEST-002: unchanged519 whole Test262 files/1029variants,
43parse-negative files/85variants and46 historical skips. No new syntax/host API.
Every residual above remains open. See P048 evidence for scans and validation.

P048 final local validation:218 suites/6120 passes/46 historical skips/typecheck0.
Four scans and full unchanged Test262 skip inventory are recorded in
[evidence](agent-tasks/P048-adversarial-proofs/evidence.json). No residual gap is
closed solely by passing examples or the selected corpus count.


## P049 reconciliation — mutable sequences, search and callback state

P049 passed independent review,226 suites/6238 tests and typecheck, then exact-head
CI and publication at44af211. No residual gap group is closed by these examples.
OBJ-003: member references split explicit finite key choices without re-evaluating
receiver/key; generic symbolic numeric keys, Boolean/object key conversion and
other ToPropertyKey cases remain unsupported. ARRAY-001/SYM-002: conditional length
assignment and exact per-key presence allow reads after mixed-length ordinary
array merges; P050 subsequently adds direct property-based stores when no shared vector remains.
Unknown/segmented array missing positions and immutable symbolic-array writes
remain boundaries. Compaction proves only each dense ordinary length0..4 with
independent finite values; arbitrary-length mutable sequence/store relations remain.
LANG-003 retains invalid array-length host assertions rather than catchable guest
RangeError. LANG-001 retains while syntax; binary-search source uses ordinary for.

LIB-001/LIB-002: Math.floor now uses shared ToNumber and concrete/finite-choice
rounding, preserving coercion calls and failures, NaN/infinity/signed zero and
nonconstruction. Open symbolic rounding is a typed unsupported path; inherited
conversion limits and unmodeled function metadata/descriptors remain. The CLI
exposes the same intrinsic. Math.ceil and other Math methods remain separate work.
Number/undefined relational comparison preserves NaN's false result for primitive
operands only, without skipping observable object coercion.

SYM-001: P049 finite-choice Boolean/order inference passed independent review. Comparison
and equality retain finite branch guards; order plus disequality can strengthen
an edge. Bounded selection-prior inference requires agreement on all retained
leaves and nonempty evidence. This is not complete satisfiability checking;
unknown leaves and budget exhaustion must remain unknown. SYM-004: member-choice
preflight256 expanded nodes/depth16 with cycle rejection precedes continuation.
Relation preflight64nodes/depth8/inputfacts256 and dispatch256visits/facts512;
Boolean equivalence/complement64visits/depth8, complement lookup128facts;
order strengthening256facts; selection-prior128inputfacts/four priors,
128shared visits/depth8/512branchfacts/no reentry. Selected Boolean guard paths
stay separate even for known results. Numeric relation leaves can remain symbolic;
unknown/empty/exhausted inference stays conservative. These local caps do not
bound all inherited solver, continuation or merge work.

REPORT-001: callback proofs cover an explicit0..3-delivery interpreted driver plus
one optional synchronous reentry, not automatic async host exploration or all
future events. Cleanup is local accounting; external cleanup success is not
assumed. Throwing notification and empty pending histories remain visible.
TEST-002: six whole Math.floor A1..A6 files add12 variants (525 active files/1041
variants); the current complete inventory confirms43 parse-negative files/85
variants and46 unchanged historical skips. Reverify after final source freeze. A7
requires ceil; length/name/prop-desc candidates retain metadata/descriptor gaps.

P049 residual precision: a smaller selected-guard absence implication remains
unknown despite the full fixed-length binary-search proof passing. The exact
[program and domain](agent-tasks/P049-adversarial-state/remaining-precision.md)
record this representation-sensitive SYM-001 boundary; it is not a mandatory
unknown semantic result or evidence of a counterexample.

P049 SYM-004 performance correction: optional prior exploration shares128 visits
across one outer Boolean resolution rather than restarting for every recursive
query, and is disabled while constructing assumptions. Already established guard
facts need no repeated disjunction merge; unknown/disagreeing leaves decline
early. This is a precision budget, not a restricted input domain or a global
bound on inherited direct solving. Timing regressions and interrupted runs are
recorded in the task review; all three proof contracts must survive the correction.

P049 minimum-proof regression correction retains aggregate comparison operands
and an equivalent optional refinement in the expression graph. Joined values
store compact equivalent guards, while numeric facts derive from the original
comparison. Relation preflight counts the full expression closure including
guards/refinements; explicit endpoint equality facts alone strengthen order edges.
This preserves existing minimum proofs without lifting SYM-001 or SYM-004.

## P050 reconciliation — joined ordinary-array stores

ARRAY-001/OBJ-003: complete ordinary element-shape heap entries can retain exact
properties even without a common vector. Index writes now update own presence
and branch-correlated length; numeric length stores truncate indexed properties,
presence and key-order branches, or grow holes. Named properties and older heap
snapshots survive. No vector reconstruction is implied: push and other methods
requiring a vector remain unsupported after these joins. Object.keys on arrays
remains an explicit separate API gap; stored key order is tested directly.

SYM-002: immutable unknown-length symbolic snapshots, opaque lengths/indices and
segmented arrays remain unsupported for mutation. This is a prerequisite toward
mutable sequences, not a proof over arbitrary-length compaction or general loop
invariants. LANG-003 retains numeric-only valid length assignment and the legacy
invalid-length assertion on vector-backed arrays; the new joined path uses typed
unsupported boundaries for coercion/invalid lengths, not guest RangeError.
Custom receiver/descriptors and unresolved inherited write hooks remain guarded.

SYM-004: joined storage preflight bounds stored properties/presence/key-order
work before copying; sparse uint32 length alone never induces a length-sized
allocation. Finite length choices and recursive key-order graphs have separate
depth/cycle guards. These are analysis-work bounds, not JavaScript input rules or
a global inherited solver runtime guarantee. Exact final caps and evidence are
recorded in the P050 review. Historical skipped tests remain unchanged.
