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
[instanceof boundary](instanceof.md), [string boundary](symbolic-strings.md),
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
selection preserves empty-path priority; overlong paths remain guarded even on
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

Reconciled in the agent/security planning increment on **2026-10-02**:
[the proposed product contract](agent-security-analysis.md) adds REPORT-001 and
SECURITY-001/002 for the missing agent protocol, dependency admission semantics,
information-flow policies and adversarial-artifact/approval boundary. These are
newly recorded goals/gaps, not implemented capabilities. Existing LANG/CJS/SYM/
HOST/LEGACY groups retain their detailed semantics and precision blockers;
known inaccurate legacy behavior must be repaired or rejected on a security
proof path, not silently trusted. Immediate priority is reporting the existing
real-server proof, then a benign outbound-effect dependency fixture; deeper FD
work remains open. No source, spec, selected Test262 or skipped inventory changed,
and no Shai-Hulud artifact was acquired or executed. There are now **62 stable
open gap groups**, with no group closed by this planning work.

At reconciliation there were **77 source files**, **83 spec files**, and
**390 source lines in 51 files** matching the broad guard/placeholder search
below. These are search hits, including internal validation and comments, **not
390 independent missing features**. Concurrent implementation can change these
counts; rerun them before publishing a reconciliation. The active Test262 corpus
now has **194 complete files / 379 variants**, including the 19 untagged-template
files from the console/template layer and five quoted-string files from the
legacy URL layer and 26 files from the shared-instanceof layer, plus fourteen slice files and nine strict equality/inequality files.
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

## JavaScript execution and properties

| ID / status / kind | Current boundary and evidence | Closure criterion |
| --- | --- | --- |
| LANG-001 — open — unsupported | The [AST resolver table](../src/ASTResolvers.ts) is a subset: loops (including the explicit do-while rejection), switch, labels/break/continue, classes/super, modules, await/yield, sequence expressions, call/array spread, and other unregistered nodes have no evaluator. Compound/destructured assignment, member updates and nonnumeric updates are also rejected. The [operator tables](../src/operators.ts) omit bitwise/shift/exponentiation, `in` and `delete`; parser acceptance alone is not execution support. | Add reusable evaluation/completion rules per syntax/operator, preserving evaluation order, errors, state and symbolic forks; activate complete relevant Test262 cases. Split this inventory as individual capabilities land. |
| LANG-002 — open — unsupported/testing | [Declaration instantiation](../src/Function/instantiate.ts) and the [parser supplement](../src/parseECMACompliant.ts) cover selected early errors, not all global declarations or Annex B sloppy block/statement functions. Cherow 1.5.4 syntax/early-error coverage is incomplete. Raw astral quoted values and escaped physical U+2028/U+2029 continuations are now corrected with source spelling/locations and adjacent escapes preserved. Valid physical backslash-CRLF continuations and ordinary physical U+2028/U+2029 text in quoted strings still reject before AST creation; [string specs](../test/string-literals.spec.ts) preserve both gaps. Failed parsing with backslash-CRLF stops analysis conservatively. For ordinary LS/PS, only the pinned unterminated-string diagnostic at that exact code unit becomes an analysis gap; invalid Unicode-escape errors retain SyntaxError. Neither guard certifies the whole source valid. Complete line-continuation-single.js/double.js and the JSON-superset line-separator.js/paragraph-separator.js remain inactive, not trimmed; see the [Test262 record](../test/test262/README.md). Historical parse negatives below remain unassessed activation debt, not evidence that executing async functions/classes is required. | Validate early errors before effects, strict/sloppy and block/global differences, valid source acceptance and Annex B behavior with complete cases. Fix CRLF continuation and ordinary LS/PS lexing, then activate the complete upstream files. Keep unsupported newer grammar and runtime support distinct. |
| LANG-003 — open — legacy/unsupported | JavaScript errors are not uniformly interpreted completions. [Member reads and calls](../src/ASTResolvers.ts), [heap writes](../src/execution-context/Heap.ts), and [construction](../src/Function/construct.ts) still use host assertions for some nullish access/noncallable/nonconstructor paths; invalid array-length assignment is likewise an analysis assertion. General statement completion values are discarded by [evaluateStatements](../src/evaluate.ts), affecting eval results. | Replace each applicable host assertion with the correct catchable language completion; test left-to-right effects and mixed normal/throw paths. Implement normal/empty statement completion values and eval propagation, without making internal analysis failures catchable. |
| LANG-004 — open — unsupported | [Parameter initialization](../src/Function/parameters.ts) supports identifier/default parameters. Rest/destructuring invocation and declaration/catch binding patterns remain gaps. Implicit mapped/unmapped `arguments` objects are represented by an unsupported binding, including lexical arrow capture and aliases. Explicit parameters named `arguments` are supported. See [arguments boundaries](../test/arguments-boundaries.spec.ts) and [default parameters](../test/default-parameters.spec.ts). | Model each binding pattern, mapped/unmapped argument object, aliasing and descriptors; preserve TDZ, defaults, eval, body separation, and symbolic effects in complete tests. |
| LANG-005 — open — unsupported | [Function creation](../src/Function/Function.ts) rejects async functions, generators, and async generators, even if their bodies never await/yield. Promises, microtasks, iterator/generator state, and async completion scheduling are not supplied by ordinary synchronous callbacks. | Implement their distinct creation/invocation/completion and scheduling semantics with complete tests; do not remove the guards by treating them as synchronous functions. |
| LANG-006 — open — unsupported/legacy | Interpreted function `length` and arrow nonconstruction/lexical `this` are supported. Inferred `name`, restricted `caller`/`arguments`, metadata writes/descriptors, `apply`, `bind`, source `toString`, full method/home-object/new-target behavior remain gaps. Sloppy primitive receiver boxing is rejected. The [dynamic Function constructor](../src/Function/Function.ts) currently treats its first argument as a body and supplies no formal parameters, and crashes on omitted arguments. Its general API is a legacy mismatch, not a supported implementation. Selected primitive-left instanceof Test262 cases create multiargument generated functions without calling them; passing those files does not validate generated parameter/body handling. | Model function kinds, dynamic construction/ToString/parse errors and metadata with correct descriptors; exercise capture, receivers, construction and symbolic throws independently of one arrow example. |
| LANG-007 — open — unsupported/precision | [Eval](../src/eval/eval.ts) needs concrete source. Conditional new binding presence in an existing environment is rejected by [branch merging](../src/execution-context/branches.ts). CommonJS global var/function creation is rejected until global bindings share object storage. Eval declarations crossing implicit-arguments parameter markers are rejected. Environment records are retained indefinitely. | Model binding presence and object-backed globals, preserve eval collisions/TDZ/capture on each branch, establish accurate completion values (LANG-003), and add safe reclamation only when snapshots/closures retain their meaning. |
| OBJ-001 — open — unsupported | [Property operations](../src/ASTResolvers.ts) support ordinary data writes/lookup with persistent state, not general descriptors, getters/setters, proxies, symbol keys, exotic objects, object-literal `__proto__` setters or full prototype mutation. Ordinary inherited __proto__ reads/writes now reject explicitly while existing own computed data properties remain writable; Object/Function/Number/Boolean intrinsic prototype writes are guarded alongside existing Error/String guards. `Object.defineProperty`, `getPrototypeOf`/related reflective APIs and symbol-based coercion are missing. Borrowed `Object.prototype.toString` rejects partial host objects and objects inheriting from them because their `Symbol.toStringTag` is unknown; for example, Node console has the tag `console`, not `Object`. | Add shared internal property/descriptor/prototype operations used by literals, reads/writes, reflection and builtins; test getter order/throws, inherited setters, attributes, symbols and symbolic state. |
| OBJ-002 — open — unsupported | [Enumeration](../src/Object/enumeration.ts) only trusts complete enumerable string-keyed data objects and concrete string indices. Arrays/functions, Error/intrinsic/global layouts, partial host objects, unknown strings/key domains and unmodeled reads are rejected. Conditional known keys/order are supported. See [spread specs](../test/object-spread.spec.ts). | Establish real own keys, order, enumerability, presence, values and descriptors for each added kind; share rules across `Object.keys` and spread, including getters and branch-specific mutation. Never infer ownership by filtering familiar names. |
| OBJ-003 — open — unsupported | Computed keys currently require concrete strings/numbers; unknown key domains and general ToPropertyKey are absent. [Object construction](../src/Object/ObjectConstructor.ts) rejects primitive wrappers; [hasOwnProperty](../src/Object/prototype.ts) rejects primitive receiver boxing and unmodeled layouts. String wrappers and primitive writes are unsupported. | Implement wrapper/exotic indexed properties and key conversion, including conversion side effects and failures; test primitive access/ownership and symbolic keys without pretending unknown keys are absent. |
| LIB-001 — open — unsupported/testing | [Initial globals](../src/execution-context/ESInitialGlobal.ts) and builtin prototypes are a small selection, not the standard library. Examples include missing Number constants/global `isNaN`, Array constructor and most methods, JSON parse/stringify, RegExp, Date, BigInt, collections, iterators and promises. Symbol now has a partial callable global preserving typeof, but creation and property access explicitly reject; it does not implement symbol values or keys. Some absent members currently return ordinary `undefined`, so missing builtin coverage needs audit as well as implementation. | Add shared concrete/symbolic semantics and complete Test262 coverage incrementally; mark partial intrinsic surfaces honestly until their absent-versus-unmodeled properties are distinguished. |
| LIB-002 — open — unsupported | [Coercion](../src/conversion/toString.ts) models supported ordinary string conversion. Shared [numeric-hint conversion](../src/conversion/toNumber.ts) now serves slice indices, preserving valueOf/toString calls, throws and finite choices. Slice receiver/index conversion rejects explicit exotic slots and partial-host symbol reads. General exotic `Symbol.toPrimitive`, default array conversion, function source conversion and unsupported value kinds remain gaps. [Operators](../src/operators.ts) reject arithmetic object coercion and unsupported symbolic numeric/relational/loose-equality coercions. Error cause/options, stacks and full Error descriptors/prototype behavior remain gaps in [Error](../src/error/Error.ts). | Share the correct hint-specific conversion and Error operations, preserve user code, coercion order and abrupt paths, and validate with complete upstream cases. |
| LANG-008 — open — unsupported/precision | Untagged templates use cooked text plus ordered ordinary ToString/concatenation; tagged templates and template-site object identity/raw strings are not implemented. Their substitutions inherit LIB-002 conversion limits and SYM-001 string precision. See [template specs](../test/template-literals.spec.ts). | Implement tagged call receiver/evaluation order, per-site template objects, raw/cooked values and invalid escapes through shared machinery; preserve symbolic effects/throws. Complete untagged support is not tagged-template conformance. |
| LANG-009 — open — unsupported/precision | Shared [instanceof](instanceof.md) preserves symbol-method lookup/invocation, receiver, Boolean conversion, effects/throws and ordinary prototype identity, including symbolic choices. The intrinsic default handler and explicitly declared immutable embedding symbol slots work; interpreted Symbol-key creation/mutation, symbol getters/descriptors, bound functions, Proxy traps/realms and broad prototype mutation remain gaps. Missing partial-host symbol information or prototype links reject analysis; modeledPrototype opts a host into a trusted ordinary link. Array internal chains are still unavailable. NativeError constructors inherit Error, and Buffer has its actual internal chain, but these facts do not expose full descriptors/APIs. Invalid target/prototype/handler cases have interpreted TypeError with unknown message; stacks/descriptors remain incomplete. Cyclic embedding graphs stop explicitly. The readonly embedding map is a setup contract, not persistent runtime symbol state. | Implement public Symbol keys and descriptor/getter lookup, bound/Proxy/realm delegation and complete prototype transitions with ordered effects, native comparisons and whole Test262 cases. Preserve unknown relationships and mixed normal/throw paths. Expand precise diagnostics independently. Do not equate a declared internal slot or known link with full exotic-object support. |

## Legacy behavior needing explicit repair or quarantine

These entries are source-inspected mismatches or insufficiently defended old
paths. They must not be reported as proven-safe unsupported boundaries. Their
presence does not mean every recent proof uses them.

| ID / status / kind | Current boundary and evidence | Closure criterion |
| --- | --- | --- |
| LEGACY-001 — open — legacy | [Number](../src/number/Number.ts) returns its first argument rather than general number conversion (`Number("1")` therefore retains a string). [Math.round](../src/math/round.ts) uses old untagged result/NaN shapes and treats string arguments as NaN. Boolean construction lacks Boolean wrapper data, although primitive Boolean calls use shared truthiness. Legacy native function metadata/construction is not generally accurate. | Add concrete mismatch specs first, then correct primitive conversion, wrapper data, return shapes and function metadata, or explicitly reject unsupported forms. Validate coercion effects/throws and symbolic arguments. |
| LEGACY-002 — open — legacy | [String.split](../src/string/split.ts) and [substr](../src/string/substr.ts) assume the old segmented-string representation and omit general argument/receiver semantics. [Array storage](../src/array/Array.ts) and [string storage](../src/string/String.ts) place legacy methods in property tables as if own properties; enumeration is guarded, but that is not full descriptor/prototype correctness. Generic array methods, sparse/inherited elements, coercions and metadata still need audit. | Replace old representation assumptions with shared string/array/property operations, add regression cases for ordinary concrete receivers first, then missing/extra/coercing arguments, holes/prototypes and symbolic choices. Guard any residual layout queries. |
| LEGACY-003 — open — legacy/assumption | The [old require adapter](../src/require/require.ts) simply reads a builtin map, separate from the modern source-graph loader; [vm.createContext/runInContext](../src/node-builtin-modules/vm.ts) is a partial context adapter, not Node VM compatibility. [prompt](../src/window/prompt.ts) supplies an unknown string without modeling cancellation/UI effects. [nodeInitialExecutionContext](../src/execution-context/nodeInitialExecutionContext.ts) retains legacy entry points. | Audit callers and public exports, replace/quarantine incompatible paths and document deprecation if chosen. New real-world proofs must use the modeled loader/host boundary, not silently substitute these adapters. |

## Symbolic reasoning and host-effect infrastructure

| ID / status / kind | Current boundary and evidence | Closure criterion |
| --- | --- | --- |
| SYM-001 — open — precision | The [fact/choice reasoner](../src/symbolic/index.ts), [numeric order](../src/number/symbolic.ts) and [arithmetic](../src/symbolic/arithmetic.ts) are incomplete. Remainder, operands possibly NaN/infinite and division intervals touching zero lack derived binary bounds. Later facts do not reanalyze stored arithmetic; relationships such as `x - x` can remain unknown. Shared [string inference](symbolic-strings.md) now derives concatenation length bounds and slices known UTF-16 edges, returning the original unknown middle when known boundaries are removed. Opaque slices retain expressions and bounds, including unknown indices. Arbitrary string equations, repeated slice identities/composition, later equality-based content refinement, full length algebra, mixed symbolic number/string + inference, encodings and unknown property keys still lack a complete solver. Shared [choice-equality refinement](symbolic-choice-equality.md) now derives discriminating/common guard facts from equality or inequality over existing nested choices, including mixed primitives and reference identity. The combined GET/HEAD/static-server index-presence proof excludes the impossible 405 and relates body suppression to the original Boolean. General disjunctive relationships remain unknown: equality of independently selected strings may imply agreement between guards without fixing either; repeated matching leaves can imply an OR. Later assumptions do not generally revisit stored equalities to derive these relationships. The dedicated specs retain these as mandatory unknowns, not rejected inputs or feasible counterexamples. Math.random supplies fresh unknown numbers in [0, 1), not a PRNG-state or probability/distribution analysis. | Add sound reusable inference with positive proofs and mandatory unknown/counterexample boundaries, respecting IEEE rounding, NaN, infinities and signed zero. Do not turn stronger desired precision into an input restriction. |
| STRING-001 — open — assumption/unsupported | String-producing operations, including concatenation and slice, currently assume successful allocation. ECMAScript string lengths are finite nonnegative integers at most 2^53-1; actual engine string-size limits, allocation/resource failures and RangeError/OOM outcomes are not modeled. Unknown inputs are not restricted to sampled text, but normal-result proofs cannot establish absence of allocation failures. Deep expression traversal also has no guaranteed resource bound. The [string boundary](symbolic-strings.md) records this assumption; no claim of Node/V8 resource compatibility follows from ordinary string results. | Model the target runtime resource/size contract and observable failure order without performing real large allocations, preserve prior coercion effects and branch conditions, and add boundary/normal/throwing symbolic specs plus independent feasible native checks. Keep process-level OOM distinct from catchable language errors. |
| SYM-002 — open — unsupported/precision | [Symbolic arrays](../src/array/symbolic.ts) are immutable dense numeric sequence snapshots with stable identities and local numeric element facts/literal bounds. Unknown holes, nonnumeric elements, mutation, symbolic indices and broader shape contracts are unmodeled. Symbolic slice requires a concrete nonnegative start and omitted end; ordinary slice/reverse need known positions and join lacks general object conversion. | Extend the shared array domain/operations while preserving aliasing, lengths, holes, coercion and out-of-bounds behavior. Verify stale snapshot facts cannot survive mutation. |
| SYM-003 — open — unsupported/precision | [Summary inference](../src/Function/summaries.ts) uses a singleton base case, strict suffix descent, four numeric candidates, one identifier array parameter and pure direct self-recursion. Inputs must be nonempty, dense and finite; NaN/infinity, empty-base strategies, captured mutable dependencies, arbitrary calls, mutation/effects, loops and general recursion are rejected. Arrow lexical-this dependencies remain outside the pure subset. | Expand verified induction strategies/candidate domains through adversarial specs, checking termination, every return path and captured dependencies before publishing/cache reuse. Nonempty is necessary for the sample min's termination, but not a permanent limitation for other functions. |
| SYM-004 — open — precision/testing | Summary caching is by function and element-template identity; known-length arrays still unroll, and equivalent contracts do not share summaries. Nested choices may grow exponentially. Equality refinement keeps stored expressions shared instead of eagerly expanding them, but resolution/assumption can revisit that graph under different facts; this inference has no dedicated memoization/work budget or guaranteed stack bound. Proof-budget exhaustion and [effectPaths](../src/effects/trace.ts)' default 256-path limit are explicit failures, not proofs or domain restrictions. General execution has no complete termination strategy. | Improve sharing, work limits and reporting without dropping paths or weakening assumptions; test budget exhaustion, cache invalidation and retained unknown results. Preserve bounded coverage in reports. |
| HOST-001 — open — assumption/unsupported | [Host functions](../src/effects/index.ts) trust supplied models to preserve returns/throws/state/effect order. A missing model rejects analysis; registration does not prove a supplied model sound. Native generator continuations cannot resume a fork as one host generator and must use [bindNormal](../src/evaluate.ts). Exotic host property read/write hooks can return shared value/context completions or defer to ordinary behavior; presence/descriptors/enumeration need their own models and remain guarded for Buffers. Effect traces describe modeled operations, not evidence that external I/O happened. | Validate each model against independent concrete behavior, include success/failure and branch isolation, and keep missing operations explicit. Generalize native continuation handling only with preserved per-path control/state. |
| HOST-002 — open — assumption/unsupported | Embeddings currently choose bounded transitions such as completeListen, deliverRequest, completeResponse and warning deliverNext. HTTP bodies currently consume all queued bytes at synchronous end, with no flush between writes; other consumption times remain open (HTTP-008). A persistent warning queue does not establish a general Node event loop, timer/immediate/nextTick/microtask scheduler, concurrent connection schedule, resource cancellation or ordering analysis. See [HTTP scheduling](node-http.md#declared-environment-and-remaining-gaps) and [warning delivery](node-url.md#scheduling-and-presenting-warnings). | Introduce explicit bounded scheduling/environment choices and preserve ordering/state/failure under each schedule. Report bounds and unresolved schedules; never infer all-schedule safety from one delivered callback sequence. |

## CommonJS and Node interfaces

| ID / status / kind | Current boundary and evidence | Closure criterion |
| --- | --- | --- |
| CJS-001 — open — assumption/unsupported | The [loader/resolver](../src/require/resolution.ts) reads a complete immutable supplied source graph with canonical absolute paths, no host disk I/O, symlinks/realpath, external/NODE_PATH/global search paths or full platform path behavior. The entry is loaded as a required file, not a process main (its id is its filename, not `"."`). Requests need concrete strings or finite choices; NUL/nonstandard request/main forms are rejected. | Model required filesystem/resolution outcomes and platform rules explicitly; compare exact filenames, precedence, directory intent and failures with pinned Node, including symbolic request choices. |
| CJS-002 — open — unsupported | [Package exports](../src/require/package-exports.ts) support exact targets/conditions/arrays, not pattern selection, custom conditions, `#imports`, malformed URL encodings or NUL targets. Default conditions are the declared Node set. | Add each selection/validation rule using pinned Node differential fixtures and complete upstream cases when possible, retaining blocked/invalid/no-match/missing distinctions. |
| CJS-003 — open — unsupported | [Package metadata](../src/require/package-config.ts) is narrower than Node's native reader: valid JSON, unique unescaped top-level keys, supported field shapes. Duplicate/escaped keys, unclassified invalid syntax, lone surrogate decoding, JSON-shaped exports strings and NUL paths reject analysis. Ordinary JSON modules are a separate supported data parser. | Match the pinned native reader's accepted/rejected cases and error kinds, not an assumed JSON.parse equivalent; test immutable resolution metadata separately from mutated exported JSON. |
| CJS-004 — open — unsupported | [Formats](../src/require/resolution.ts) exclude ESM, `.mjs`, explicit module packages, native addons and extra formats. Ambiguous `.js`/extensionless wrapper parse failures stop analysis because Node may reinterpret them as ESM. Standalone [evaluateCommonJS](../src/require/commonjs.ts) has no dependency loading/cache. | Add actual syntax detection/format loading and interoperation rather than treating unsupported formats as missing files. Keep standalone execution versus graph loading explicit. |
| CJS-005 — open — unsupported/assumption | [Module/require objects](../src/require/loader.ts) expose selected fields. `module.require`, children/parent/paths, require.resolve/cache/main/extensions and writes to protected loader metadata remain gaps; public cache overrides and `node:` bypass behavior are not established by alias identity specs. Unregistered builtin modules stop analysis. Registered builtins are trusted typed values: registration does not guarantee that arbitrary supplied models guard their missing members (HOST-001). | Model public operations and their cache/resolution/state effects with differential and symbolic tests; guard every partial API until then. |
| CJS-006 — open — unsupported/assumption | Loader errors expose name/code only; message/stack/requireStack and full prototypes/descriptors are guarded. Circular-require warning prototypes/diagnostics and DEP0128 main-fallback warnings are omitted while supported loading can continue; their absence is not an explicit analysis stop or proof that Node emits no warning. See [CommonJS limitations](../test/commonjs/README.md). | Model observable diagnostics, fields and timing or explicitly bound diagnostic-free proofs; preserve warning/error paths and independent Node comparison. |
| PATH-001 — open — unsupported/assumption | The [POSIX path model](node-path.md) supports lexical join/normalize/parse, fresh mutable five-field parse objects, posix self-identity, separators and selected function metadata in an explicitly POSIX environment. It assumes unchanged intrinsic Array.prototype.push/internal array behavior: pinned join dynamically calls push on a temporary array; Array constructor/prototype mutation remains a VM gap. Win32/device/UNC semantics, other path APIs (including resolve/relative/isAbsolute/basename/dirname/extname/format), process.cwd, full descriptors/reflection and metadata writes remain gaps. Invalid object/array/function diagnostics can execute constructor/name inspection, so they reject analysis. Coded TypeError constructor/prototype/toString/stack/descriptor behavior remains guarded. Lexical normalization and parsing accept NUL/backslash/UTF-16 text; parse preserves spelling rather than normalizing it, including the pinned /.. extension behavior. Success proves neither filesystem validity nor containment. | Extend each actual Node API/platform and diagnostic boundary with independent pinned tests and complete upstream cases. Preserve join's current normalize lookup on its captured module, receiver, empty-input bypass, effects/throws and mutable state. When Array prototype mutation is supported, preserve its observable effects on join. Keep filesystem resolution/symlinks separate under CJS-001/TARGET-002. |
| PATH-002 — open — unsupported/precision | [Path specs](../test/node-path.spec.ts) and [parse specs](../test/node-path-parse.spec.ts) support concrete strings and symbolic choices with concrete string leaves, retaining their correlations. Open symbolic strings stop analysis; equality facts constraining an unknown string to a finite set do not yet materialize supported choices. General symbolic segment/normalization/containment relationships are not inferred. An unknown numeric argument does produce a known TypeError/code but an unknown message, while unknown Booleans retain their two diagnostics. That loss of diagnostic precision is distinct from unsupported string evaluation. | Add reusable symbolic string/path operations and precise diagnostics where justified, with positive proofs, mandatory unknowns and error paths. Never substitute a convenient path, infer containment from normalization, or convert an unsupported input into a safe result. |
| URL-001 — open — unsupported/assumption | The [legacy URL model](node-url.md) supports path-only parsing, falsy query-string flags, twelve mutable own fields and identity when a returned Url is parsed again. Protocol/authority/auth/host/port/IDNA/IPv6 forms, query objects, format/resolve, Url/URL/URLSearchParams APIs, inherited Url methods, construction and full metadata/descriptors remain gaps. Native new url.parse succeeds; its explicit rejection is not a modeled TypeError. Modified String charCodeAt/slice reject analysis. Internal RegExp exec/test and Set.has are assumed unchanged while those constructors/prototypes remain unsupported (LIB-001). Invalid object/function diagnostics and coded-error constructor/stack/formatting/reflection remain guarded. | Extend actual pinned parsing/API domains with independent boundary/error/mutation tests and complete upstream cases. Preserve mutable primitive/intrinsic effects when their shared VM support lands, rather than treating them permanently pure. Keep legacy parsing separate from WHATWG URL and filesystem containment. |
| URL-002 — open — unsupported/precision | [URL specs](../test/node-url.spec.ts) support concrete strings and concrete-leaf symbolic choices with correlated fields. Open strings and strings constrained only through equality facts stop analysis; general symbolic parsing/encoding/normalization is not inferred. An unknown numeric input definitely throws a coded TypeError but retains an unknown message. Known primitives/Boolean choices have precise diagnostics. | Add reusable symbolic string/parser reasoning with valid proofs, mandatory unknowns and abrupt paths. Do not choose a convenient URL or count an unsupported form as invalid input or a safe request. |
| WARN-001 — open — assumption/unsupported/precision | The [warning model](node-url.md) supports string emitWarning messages with optional concrete/finite-choice type/code, a persistent queue and explicit default deliverNext presentation. It assumes default handlers/console.error, Node release/argv0, no flags/listeners/redirects/subscribers and healthy stderr; unknown pid/text preserves unknown output. Error/options/constructor overloads, non-string messages, open type/code, object presentation conversion, broader Error metadata and process APIs remain gaps. Flag writes and inherited enabled flags reject. DEP0169 uses captured CommonJS/interpreted source filenames; eval/Function-generated or absent provenance cannot decide fresh eligibility. This is not full V8 bounded-stack/native-frame reconstruction. Node_modules suppression preserves the URL once flag; an eligible call consumes it before mutable emitWarning and input validation. CJS-006/EVENTS-002 diagnostics remain unimplemented. | Extend warning overloads, source/stack eligibility, flags, listener/default-handler interactions and independent scheduling with pinned comparisons and complete upstream cases. Preserve effects/throws/queue state, formatter failures, once flags and output order. Add stdio replacement/redirect/failure/backpressure/flush/exit outcomes rather than assuming them successful; HOST-002 remains the general scheduler boundary. |
| FS-001 — open — assumption/unsupported | The [filesystem model](node-filesystem.md) keeps one private persistent root with immutable helper-created entries and existing symbolic choices at roots/entries. Omitted names/ESNull are missing in a closed case-sensitive UTF-8 byte-name namespace, with no Unicode normalization. The declared cwd exists as a directory on every setup path. Component traversal preserves prefix failures; paths/components outside the <1024/<=255-byte domain reject analysis. The stable Linux(default)/Darwin environment now accepts symbolic effective read/search access and filesystem-call descriptor availability. These are supplied process-access facts, not derived mode/UID/ACL/capability policy. Omitted flags still assume allowed/available. Relative lookup begins at a structurally held cwd, not its possibly inaccessible ancestors. Symlinks, races, changing credentials/access/capacity, per-process descriptor identity/count/ownership, ENFILE, post-open fstat/read/close failures and memory allocation failures remain unmodeled. Availability is a baseline at filesystem calls, not a pool coupled to HTTP listen/accept; native server exhaustion is established after acceptance. Successful synchronous reads assume later work/close succeeds and restores this baseline. Open names/contents, arbitrary bytes, other platforms/filesystems, descriptor state, writes and unbounded trees remain gaps. Reads can change real access timestamps: stable contents are not a claim that all metadata is unchanged. | Expand correlated tree/content/metadata and environment transitions with positive, negative and mandatory-unknown specs. Model remaining permission policy/resource/open/read/close failures, cross-host descriptor ownership, partial I/O, atime, links and races explicitly. Do not replace one shared state with independently sampled API returns or equate successful modeled reads with OS availability. Keep CommonJS source-graph resolution separate until CJS-001 is implemented. |
| FS-002 — open — unsupported/assumption/precision | [Compatibility specs](../test/node-filesystem.spec.ts) cover string existsSync/statSync/readFileSync paths, partial Stats isDirectory/isFile, UTF8-string reads and ENOENT/ENOTDIR/EISDIR plus EACCES/EMFILE failures. [Failure specs](../test/filesystem-failures.spec.ts) and independent [native failures](../test/node-filesystem-failures-reference.spec.ts) preserve priority, repeated-read correlations, unknowns and platform differences; no complete upstream file is activated. Successful default reads now return fresh [Buffer values](node-buffer.md), with persistent byte operations and UTF-8 decoding; remaining Buffer gaps are BUFFER-001/BUFFER-002. Async/promises/streams, writes, fd/Buffer/URL path inputs, non-string argument diagnostics/DEP0187, options/encodings/signals and broader APIs are unmodeled. NUL stat/read paths have a known TypeError/code with unknown message; system-error stacks/constructors/descriptors remain guarded. Stats mode/_checkModeProperty/prototype mutation, arbitrary borrowed receivers, other metadata/Date/BigInt fields and public constructors are guarded. Mutable read helpers and inherited option fields reject rather than dropping their effects. Slow/default reads assume unchanged Node Buffer allocators/internal primitives while constructors/allocator APIs remain inaccessible (BUFFER-002); allocation can precede even EISDIR, and allocator mutation effects/throws must be preserved when those APIs land. | Implement each API/value/option/metadata boundary with pinned Node comparisons and complete upstream cases, preserving validation order, mutation, exact failures, shared state and effect order. Scoped response consumption now completes file serving under HTTP-008; preserve remaining Buffer boundaries when expanding it. Preserve all FS-001 environment exclusions until modeled. |
| BUFFER-001 — open — unsupported/precision | The [Buffer model](node-buffer.md) exposes copied concrete unsigned bytes, length/byteLength, canonical numeric index reads/writes and shared UTF-8 toString. Bytes live in the persistent heap; finite choices and mutations preserve correlation, aliases and earlier contexts. Open symbolic bytes/numeric writes/indices, unbounded lengths, nonnumeric write coercions, other encodings/diagnostics, start/end bounds, borrowed non-Buffer receivers, Buffer/module/global constructors, typed-array/ArrayBuffer APIs, backing stores/views/slicing, additional Buffer methods and ordinary named properties remain gaps. Length writes, descriptors/reflection/enumeration/prototype access and function construction/metadata changes reject analysis. Internal Buffer/Uint8Array/TypedArray/Object prototype links now support ordinary instanceof while public reflection and those APIs remain guarded. Empty buffers with omitted bounds return empty text before encoding conversion, matching Node. | Extend each API/exotic property rule with native boundary/error/effect comparisons and complete upstream cases. Model coercion even for ignored out-of-range writes; preserve shared backing-store mutations before exposing views or typed-array constructors. Extend symbolic byte domains without choosing convenient contents. |
| BUFFER-002 — open — assumption/testing | Creation assumes successful allocation and UTF-8 encoding/decoding resources; no allocator/pool/slab/offset/retention or shared/detached/resizable store state is modeled. Successful default filesystem reads copy declared UTF-8 text into fresh Buffer identities. Node dynamically calls Buffer.allocUnsafe (including for empty files/directories), and empty reads also Buffer.concat; the model assumes these unavailable APIs and internal primitives unchanged. The helper accepts arbitrary raw bytes but the filesystem setup still accepts only text. [Local compatibility specs](../test/node-buffer.spec.ts) compare pinned Node; no full upstream Buffer case is activated, and this does not claim general typed-array conformance. | Model allocator replacement effects/throws, resource failures, raw-byte filesystem contents, backing-store identity/lifetimes and memory limits as their APIs become accessible. Activate complete unmodified Buffer/typed-array cases with required harness support, keeping host and language coverage distinct. |
| HTTP-001 — open — assumption | [listen](../src/node/http.ts) assumes a primary process with successful binding. Occupied ports (`EADDRINUSE`), permission failures (`EACCES`), unavailable addresses, DNS errors, exhausted resources, IPv6 availability/fallback and cluster allocation are unmodeled. Omitted-host listening becomes true inline under that assumption; explicit-host completion later selects successful lookup/binding. A numeric valid port does not imply availability. Filesystem-call descriptor availability (FS-001) is not yet shared with socket/listen/accept allocation; native filesystem-exhaustion witnesses deliberately exhaust after request acceptance. | Represent environmental success/failure outcomes, error timing/listeners, callback non-delivery on failure, listening state, retry and retained effects. Verify occupied-port and other failure scenarios against pinned Node before claiming startup safety across those outcomes. |
| HTTP-002 — open — unsupported | Numeric `(port[, callback])` and `(port, "127.0.0.1"[, callback])` accept concrete ports/finite choices. Strings, absent/options ports, other hosts, backlog overloads, unbounded symbolic ports, overlapping pending host lookups, address inspection, close/relisten and cluster workers remain gaps. Custom callback Number conversion and inherited normalized listen options reject analysis. See [listen specs](../test/node-http-listen.spec.ts). | Implement Node argument normalization/coercions in order, possible side effects, pending/bound/closed state and overload-specific failures. Retain already-covered callback-before-invalid-port behavior and bound-duplicate precedence. |
| HTTP-003 — open — assumption/unsupported | Response output/finish currently selects successful transport on a live connection. Backpressure state/drain, socket aborts, failing flushes, close/error events, end callbacks, truthy repeated end and unresolved lifecycle delivery are unsupported. Scoped writes and falsy repeated end now work under HTTP-008. `writableEnded` is not successful flush; completeResponse is explicit. | Model writable/socket transitions and failing completions with retained committed output/state and callback/event ordering. Include bounded error/close races and complete upstream failing-flush cases. |
| HTTP-004 — open — assumption/unsupported | Delivery supplies an already parsed request event; no HTTP parser or protocol/method-to-event dispatcher has been analyzed. Symbolic method/URL fixtures use unrestricted strings, a conservative superset of possible request-event inputs. Node routes CONNECT through separate connect/upgrade handling; not every symbolic method is a feasible wire request reaching this callback. Request data/end/error streams, Buffer payloads, body encodings, JSON parsing, connection upgrades/continue/expectation and HTTP client APIs are absent. createServer options and broader request/response methods are guarded. | Model parser-domain inputs, actual event dispatch/reachability and stream transitions with payloads/failures. Require feasible wire-to-event conditions for concrete witnesses; preserve independently checked OPTIONS/POST/DELETE cases. Do not add generic `req.on` and claim readable-stream support. |
| HTTP-005 — open — unsupported/precision | Response write/end support strings and modeled Buffers; end also ignores falsy primitive payloads, including repeated empty end. Encoding/callback overloads remain unsupported. Primitive invalid chunks produce TypeError/code, with unknown non-null diagnostic text; object/function chunk diagnostics remain unsupported. HTTP-008 retains queue/transport limits. Direct writeHead now commits supported explicit fields, numeric final statuses and reasons; the 63-entry pinned STATUS_CODES table is ordinary persistent mutable data. See [header specs](../test/node-http-headers.spec.ts), [catalog specs](../test/node-http-status-codes.spec.ts) and residual HTTP-007. Informational completion, nonnumeric/open-symbolic status conversion, general status-message coercion and full status behavior remain gaps. Unknown UTF-16 body output loses identity through UTF-8 encoding. | Expand status/payload/coercion/encoding domains precisely; preserve HEAD/204/304 suppression, failed-call partial mutations, later public fields versus committed output and actual original-catalog identity. Partial header support does not close the broader response boundary. |
| HTTP-006 — open — unsupported | HTTP partial objects/functions expose selected values, not complete own/inherited descriptors, construction/metadata or mutation. Protected lifecycle emit/listenerCount is rejected because Node has internal listeners/transitions; other reserved host registrations await delivery semantics. | Establish actual property layouts and internal event behavior before permitting inspection, replacement or public lifecycle emission/counting; verify borrowed methods cannot bypass model state. |
| HTTP-007 — open — unsupported/assumption/precision | [Direct serialization](../src/node/http-headers.ts) supports complete own data/string fields with concrete or finite-choice primitive text values. Progressive setHeader/appendHeader/getHeader/getHeaders/removeHeader caches, raw arrays, duplicate case-insensitive names, getters/descriptors, effectful object/array conversions and open symbolic text remain unsupported. Content-Length, Transfer-Encoding, Connection, Keep-Alive, Trailer, Expect and Content-Disposition reject analysis until framing/encoding/state coupling is modeled. Inspected headers are only explicit serialized fields with lower-case names and exact whitespace, excluding automatic Date/connection/framing; they are not complete wire headers or Node's getHeaders API. Lenient validation, unique-header options, raw duplicate order and full output serialization remain gaps. | Add each header domain with independent Node checks, including validation/coercion order, cache interactions, duplicate/raw ordering, framing/body coupling, errors and conditional state. Preserve the projection boundary until automatic fields and full wire behavior are actually modeled. Keep transport failures/schedules open under HTTP-003/HOST-002. |
| HTTP-008 — open — assumption/unsupported/precision | The [body queue](../src/node/http-body.ts) preserves ordered string values and Buffer references in persistent state. Its declared healthy schedule consumes all queued bytes at synchronous end, with no intervening flush; finish is delivered later. Normal/empty write returns remain unknown without socket-capacity facts; HEAD/204/304 suppression returns true. Earlier/later consumption, partial writes, cork/uncork/drain/high-water state, socket errors/abort/destruction, callbacks/encodings/extra-argument overloads, non-Buffer Uint8Array and deferred write-after-end errors remain unmodeled. Primitive chunk failures are catchable; object/function diagnostic inspection rejects analysis. Unknown strings lose content/length/identity through UTF-8 and expose an unknown byte array; indexed inspection explicitly rejects rather than fabricating absent/concrete bytes. Queue traversal/assembly, array projections and Buffer callbacks assume successful allocation within representable array lengths and sufficient host stack/memory; unbounded chunk/byte growth has no complete resource analysis. Inspected text/bytes are read-only embedding projections, not public Node properties or complete framing. [Write specs](../test/node-http-write.spec.ts) compare pinned Node bytes, validation order, recovery, alias mutations, suppression, return uncertainty and branch isolation. | Model consumption/return/error/callback timing against explicit bounded transport states, preserving retained Buffer references until actual consumption and callback order. Expand overloads, arbitrary views, resource failures and precise symbolic encodings with boundary/error/native/symbolic specs; run complete upstream cases with their real harness. Keep all-schedule and allocation guarantees unclaimed until verified. |
| EVENTS-001 — open — unsupported | [EventEmitter](../src/node/events.ts) needs known string/finite-choice names and initialized model receivers. Symbols/open names, constructor options/custom receivers/reinitialization, prepend/removeAll/listener inspection, listenerCount's listener filter, captureRejections/asynchronous helpers, internal fields and method/metadata overrides remain gaps. | Model each public operation against pinned Node, preserving listener identities, persistent branch state, snapshots and callback receivers; enable complete upstream cases without trimming them. |
| EVENTS-002 — open — unsupported | Meta-events newListener/removeListener and EventEmitter warning generation/delivery are missing; the scoped process warning queue does not connect this surface. Registration reaching the default warning threshold is rejected; HTTP's known internal listeners count, so ten application listening/finish listeners can already hit it. Unhandled error with a non-Error payload and exact generated error diagnostics are unmodeled. | Preserve warning/meta-event/error timing and payloads, listener-list changes/reentrancy and per-path effects; validate threshold and internal-listener cases. |
| EVENTS-003 — open — unsupported | Node's single-listener dispatch can observe a callback's replaced/inherited `.apply`; the [model](../src/node/events.ts) guards that path. Multiple-listener dispatch calls directly. A once wrapper ignores the original callback's own `.apply`, but a single once wrapper still observes inherited `Function.prototype.apply`, which is guarded. Async rejection capture is separately EVENTS-001/LANG-005. | Implement the actual observable apply lookup/invocation with effects/throws and symbolic replacements; keep snapshot and once-before-call behavior correct. |
| CONSOLE-001 — open — unsupported | The [console model](../src/node/console.ts) supports default ungrouped log with zero arguments or one string, shared global/builtin identity and ordered captured stdout chunks. Multiargument/nonstring formatting, util.format/inspect/custom inspection, colors/options, groups/timers, stderr/other methods, Console construction, log/config replacement and full descriptors/metadata remain gaps. See [console specs](../test/node-console.spec.ts). | Add each formatter/API/configuration through the shared VM and independently compare formatting, conversion effects, receiver binding and exceptions with pinned Node. One-string logging is not full console support. |
| CONSOLE-002 — open — assumption/unsupported | Captured log output assumes healthy writable default UTF-8 stdout, no stream replacement, diagnostics subscribers or inspector hooks. Swallowed synchronous write failures, asynchronous error delivery, ignoreErrors, backpressure/drain, flush/exit loss and alternate encoding are unmodeled. Concrete surrogate replacement is modeled; unknown encoded text remains unknown. | Represent stream/config/environment outcomes and actual console failure handling, including when the application sees no throw despite failed output. Distinguish calling log, accepting a write and durably emitting/flushing bytes. |

## Agent contract and supply-chain security

| ID / status / kind | Current boundary and evidence | Closure criterion |
| --- | --- | --- |
| REPORT-001 — open — unsupported/precision | [The proposed agent contract](agent-security-analysis.md) is not implemented: there is no versioned declarative request/report API or scan CLI, stable serialized expression graph, source-attributed effect report, structured partial/unsupported/budget outcome, or policy/coverage protocol. Current low-level library values/effect traces use internal identities and exceptions. Existing real-server specs establish bounded outcomes but do not provide the agent product surface. | Add schema/serialization/library specs over unchanged real source, deterministic provenance and conditions, actionable source/effect paths, partial result/error distinctions and mandatory inconclusive outcomes. CLI must consume the same contract. Separate policy verdict, feasibility and coverage; budget exhaustion is not a narrowed input domain or proof. |
| SECURITY-001 — open — unsupported/assumption/testing | Dependency admission is a goal, not present behavior. npm lifecycle/resolution/acquisition orchestration is unmodeled; importing a CommonJS module does not cover install scripts, ESM, future exports, shell/native/Bun programs or asynchronous triggers. No shared outbound-network/DNS/socket/subprocess model, endpoint inventory, secret dataflow/control-flow policy, protected-file/publish policy or original Shai-Hulud benchmark exists. Existing LANG/CJS/HOST/SYM/FS/BUFFER gaps apply; reached LEGACY-001/002/003 and absent-unmodeled-builtin fallbacks can invalidate security conclusions, even without an explicit rejection. | Establish a strict admitted-semantics contract, generic benign policy fixtures with safe/violating/unknown controls, and separately pinned install/import/use scopes. Then analyze an immutable original incident loader and clean control with conditions, feasible forbidden effects, evidence and complete blocker inventory. Model unknown destinations/continuations soundly; an allowed host does not authorize secret disclosure. No names, hashes or malware-source patterns become inference rules. |
| SECURITY-002 — open — assumption/unsupported/testing | Prophet is not a hardened adversarial-code sandbox or enforcement gate. Archive/parser/interpreter resource/escape risks, safe artifact acquisition, exact-byte/transitive-graph integrity, policy/model/scenario-bound caches and approvals, prevention of pre-scan hooks, runtime capability enforcement and separately isolated adversarial replay are not implemented. A future registry fetch by the trusted adapter is distinct from granting package network authority. | Validate inert acquisition/extraction/analysis isolation and resource limits; test traversal/unsafe archives, tamper/cache invalidation, script-before-scan and alternate-command bypasses. Bind admission/exception decisions to reviewed bytes, graph, scope and model versions and enforce actual capabilities separately. Unknown scans must not silently pass; accepted risk is not a proof. Never execute original malware natively in ordinary Jest/developer runs. |

## Real application, evidence and coverage

| ID / status / kind | Current boundary and evidence | Closure criterion |
| --- | --- | --- |
| TARGET-001 — open — unsupported | The pinned full [pico-static-server module](../test/fixtures/pico-static-server-3.0.3/package/index.js) now completes setup and supplied non-GET/HEAD events through shared operations. Its [symbolic proofs](../test/pico-static-server-analysis.spec.ts) retain missing Allow, empty body and conditional 200/405 for an unknown non-GET/HEAD method/unknown URL; HTTP-004 preserves dispatch feasibility and HTTP-007 the explicit-header projection. GET/HEAD `/docs` over one shared missing/empty-directory choice now proves 404 or an escaping missing-index ENOENT with no committed/ended response. Matching native witnesses independently replay both conditions. Readable-file and populated-directory-index reads return Buffer values; shared instanceof proves they are not Errors and path.parse determines MIME. The original success branch commits status 200, but its reversed writeHead arguments discard the intended MIME/length fields and produce numeric O/K headers. The original write/end and explicit finish delivery now serve file bytes on GET and suppress them on HEAD under HTTP-008. Both concrete methods and a combined symbolic GET/HEAD choice with symbolic index presence now prove success versus ENOENT and the matching body. Every path reaches the actual read; no impossible 405 is filtered out. Wider equality relationships remain under SYM-001. An additional sixteen-assignment method/access/capacity proof now classifies 404, EACCES, EMFILE and successful 200/body, with native permission/resource witnesses and unfinished throwing responses. Broader URL/path/fs/HTTPS APIs and environmental/scheduling outcomes remain gaps. Installed/checkout provenance preserves DEP0169 suppression/scheduling. Express remains ordinary source. | Expand unchanged-source analysis through broader environmental failure paths and transport schedules. Retain both bounded findings and mandatory unknowns while expanding URL/method/file/schedule domains; classify unsupported paths separately. No novel vulnerability or whole-server safety claim follows from the supported cases. |
| TARGET-002 — open — assumption/testing | The [target plan](real-world-target.md) uses trusted HTTP configuration, one parsed request/server, successful startup/transport with queued bytes consumed at synchronous end and no intervening flush, and no process exception-recovery hook. The filesystem is a closed case-sensitive UTF-8 tree with selected Linux/macOS behavior, symbolic effective read/search access and baseline filesystem-call descriptor availability, but no symlinks, credential-policy inference, post-open failures or concurrent changes. Availability is not globally coupled to successful HTTP startup/acceptance; this is an explicit schedule assumption, not a resource-safety proof. Shared root/entry choices now correlate existence/type/read; the initial missing-default-file condition is a bounded Prophet finding, with an absent-path 404 control and native witnesses. Default reads now expose the declared text as UTF-8 bytes. Broader files, arbitrary raw filesystem contents, open symbolic bytes, metadata/atime, partial I/O, races, platforms, URL/containment and repeated requests remain expansions under FS-001/FS-002/BUFFER-001/BUFFER-002. The [discount example](../test/discount-server.spec.ts) still assumes supplied handler inputs and successful modeled host outcomes, not a parsed HTTP/Express application. | Expand actual source paths and declared domains, retaining ordered effects, normal/throw conditions and resource state. Preserve every excluded failure family rather than silently choosing success. A successful case or one bounded exception proof does not close the environment contract. |
| TARGET-003 — open — precision/testing | Automatic satisfying-input generation remains future work. The [native target specs](../test/pico-static-server-reference.spec.ts) now replay manually supplied GET/HEAD `/docs` witnesses for missing versus empty-directory state, matching the symbolic 404/ENOENT conditions. This is independent concrete evidence, not automatic witness extraction or complete replay machinery. A failed proof, unknown value or unsupported operation is not a counterexample; native observations alone still do not establish an unobserved symbolic path. | Derive concrete supported-domain witnesses from feasible symbolic conditions and replay the unchanged target with matching environment/schedule. Retain the current explicit witnesses and report failed/inconclusive replay without claiming a found defect. |
| TEST-001 — open — testing/unsupported | [Test262 runner](../test/test262/runner.ts) only accepts onlyStrict/noStrict/raw/generated flags, no includes, and parse-negative SyntaxError metadata. Harness supports selected assert operations/$ERROR/$DONOTEVALUATE, not Test262Error, property helpers, async/module/realm/agent machinery or the full harness. | Extend runner without native execution of test source or ignored assertions; keep whole files, metadata and strict/sloppy variants, and ensure analysis errors cannot satisfy language exception assertions. |
| TEST-002 — open — testing | The historical selection contains 46 explicitly skipped files listed below. They have not all been run through the current evaluator to establish blockers. Thirty-four are parse-negative, two newline/ASI runtime cases, three primitive Boolean cases, and seven Boolean call/construction cases. | Reassess each complete file, activate every supported variant, and record actual failures under the relevant implementation ID. Retain filename/closure evidence here when removing its skip; do not label parse-only tests blocked by unrelated runtime features. |
| TEST-003 — open — testing | Test262 is pinned to an old revision. Reviewed old parameter-eval scope cases disagree with current pinned Node/current ECMA shared parameter scope. This is version reconciliation debt, not a reason to change semantics to satisfy outdated expectations. See [Test262 notes](../test/test262/README.md). | Update/reconcile the pinned corpus deliberately, document semantic changes and rerun active cases; do not edit upstream source to make it pass. Full coverage remains the goal, never inferred from selected corpus counts. |
| TEST-004 — open — testing | No complete upstream Node compatibility test is yet claimed passing. Local differential specs use Node v24.21.0 (`955266bfdd854cd280dffd47548673914484e4c0`). Reviewed candidates in the [CommonJS](../test/commonjs/README.md), [events](node-events.md#complete-upstream-cases-reviewed), [HTTP](node-http.md#complete-upstream-cases-reviewed), [path](node-path.md#complete-upstream-cases-reviewed), [URL/warnings](node-url.md#complete-upstream-cases-reviewed), [filesystem](node-filesystem.md#complete-upstream-cases-reviewed) and [Buffer](node-buffer.md#complete-upstream-cases-reviewed) records need actual harness/API dependencies. Buffer cases still need Buffer.from/allocators, broader encodings/bounds, iterators, subclasses, large memory and the common/assert harness. The response-write candidate list now includes whole invalid-type, empty-string/Buffer, suppression, multiple-end and write-after-end cases; their client/socket/common/assert, callback/drain/error queue, Uint8Array and framing requirements remain open. Filesystem files include mutations, async/fd/Buffer/Stats metadata, warnings and platform branches; even the misleading readfilesync-enoent file tests Windows realpath instead. URL cases include broader protocols/query objects/Url APIs; warning cases need actual process events/flags/scheduling/stdio and child processes. Path parse/format cases still need Win32, format/dirname/basename/extname, loops/destructuring, Array iteration and the actual common/assert harness; the pinned tree has no standalone parse-only case. Even the small posix alias case needs common/assert. None is trimmed to an easier fragment. The whole [test-console.js](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-console.js) additionally needs common/assert, process/worker/stdio replacement, general warning scheduling, util.inspect/Symbol, broader formatting/methods and timer/count state; none is counted passing from single-string local specs. | Run suitable complete unmodified Node cases with their fixtures/common/assert dependencies; preserve all scenarios, including failures. Reconcile historical blockers as shared features land. Keep local differential results separate from upstream conformance and platform/environment coverage. |

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
