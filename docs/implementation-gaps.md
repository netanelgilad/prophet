# Implementation gaps and proof assumptions

This is the durable backlog for work we defer. A passing proof is relative to
its declared inputs, environment, and schedule; it must not erase the work
excluded by those declarations. In particular, **successful binding does not
prove that a port is available**, and captured console output does not prove
that an operating system successfully wrote or flushed it.

Use this alongside the [roadmap](roadmap.md), [real application target](real-world-target.md),
[HTTP boundary](node-http.md), [event boundary](node-events.md),
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

Every feature PR must reconcile new or changed guards, assumptions, rejected
domains, unknown results, skips, and partial host behavior against these IDs.
Add a specific entry when an existing one cannot accurately describe the work.
Record the supported part and retain the residual when a group is only partly
implemented. Update the relevant boundary docs and complete upstream candidate
lists too; historical blockers can become stale as shared features land.

To close an entry, state the exact domain now supported and link the implementing
PR and meaningful specs, including boundary/failure/symbolic cases and the
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

At reconciliation there were **64 source files**, **63 spec files**, and
**244 source lines in 39 files** matching the broad guard/placeholder search
below. These are search hits, including internal validation and comments, **not
244 independent missing features**. Concurrent implementation can change these
counts; rerun them before publishing a reconciliation. The active Test262 corpus
now has **140 complete files / 272 variants**, including the 19 untagged-template
files added in this layer; that is a selected baseline, not full conformance. The one explicit
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
| LANG-001 — open — unsupported | The [AST resolver table](../src/ASTResolvers.ts) is a subset: loops (including the explicit do-while rejection), switch, labels/break/continue, classes/super, modules, await/yield, sequence expressions, call/array spread, and other unregistered nodes have no evaluator. Compound/destructured assignment, member updates and nonnumeric updates are also rejected. The [operator tables](../src/operators.ts) omit bitwise/shift/exponentiation, `in`, `instanceof`, and `delete`; parser acceptance alone is not execution support. | Add reusable evaluation/completion rules per syntax/operator, preserving evaluation order, errors, state and symbolic forks; activate complete relevant Test262 cases. Split this inventory as individual capabilities land. |
| LANG-002 — open — unsupported/testing | [Declaration instantiation](../src/Function/instantiate.ts) and the [parser supplement](../src/parseECMACompliant.ts) cover selected early errors, not all global declarations or Annex B sloppy block/statement functions. Cherow 1.5.4 is an old parser; current syntax and early-error coverage are incomplete. The historical parse negatives below are unassessed activation debt, not evidence that executing async functions/classes is required. | Validate early errors before effects, strict/sloppy and block/global differences, and Annex B behavior with complete cases. Keep unsupported newer grammar and runtime support distinct. |
| LANG-003 — open — legacy/unsupported | JavaScript errors are not uniformly interpreted completions. [Member reads and calls](../src/ASTResolvers.ts), [heap writes](../src/execution-context/Heap.ts), and [construction](../src/Function/construct.ts) still use host assertions for some nullish access/noncallable/nonconstructor paths; invalid array-length assignment is likewise an analysis assertion. General statement completion values are discarded by [evaluateStatements](../src/evaluate.ts), affecting eval results. | Replace each applicable host assertion with the correct catchable language completion; test left-to-right effects and mixed normal/throw paths. Implement normal/empty statement completion values and eval propagation, without making internal analysis failures catchable. |
| LANG-004 — open — unsupported | [Parameter initialization](../src/Function/parameters.ts) supports identifier/default parameters. Rest/destructuring invocation and declaration/catch binding patterns remain gaps. Implicit mapped/unmapped `arguments` objects are represented by an unsupported binding, including lexical arrow capture and aliases. Explicit parameters named `arguments` are supported. See [arguments boundaries](../test/arguments-boundaries.spec.ts) and [default parameters](../test/default-parameters.spec.ts). | Model each binding pattern, mapped/unmapped argument object, aliasing and descriptors; preserve TDZ, defaults, eval, body separation, and symbolic effects in complete tests. |
| LANG-005 — open — unsupported | [Function creation](../src/Function/Function.ts) rejects async functions, generators, and async generators, even if their bodies never await/yield. Promises, microtasks, iterator/generator state, and async completion scheduling are not supplied by ordinary synchronous callbacks. | Implement their distinct creation/invocation/completion and scheduling semantics with complete tests; do not remove the guards by treating them as synchronous functions. |
| LANG-006 — open — unsupported/legacy | Interpreted function `length` and arrow nonconstruction/lexical `this` are supported. Inferred `name`, restricted `caller`/`arguments`, metadata writes/descriptors, `apply`, `bind`, source `toString`, full method/home-object/new-target behavior remain gaps. Sloppy primitive receiver boxing is rejected. The [dynamic Function constructor](../src/Function/Function.ts) currently treats its first argument as a body and supplies no formal parameters, so its general API is a legacy mismatch, not a supported implementation. | Model function kinds, dynamic construction/ToString/parse errors and metadata with correct descriptors; exercise capture, receivers, construction and symbolic throws independently of one arrow example. |
| LANG-007 — open — unsupported/precision | [Eval](../src/eval/eval.ts) needs concrete source. Conditional new binding presence in an existing environment is rejected by [branch merging](../src/execution-context/branches.ts). CommonJS global var/function creation is rejected until global bindings share object storage. Eval declarations crossing implicit-arguments parameter markers are rejected. Environment records are retained indefinitely. | Model binding presence and object-backed globals, preserve eval collisions/TDZ/capture on each branch, establish accurate completion values (LANG-003), and add safe reclamation only when snapshots/closures retain their meaning. |
| OBJ-001 — open — unsupported | [Property operations](../src/ASTResolvers.ts) support ordinary data writes/lookup with persistent state, not general descriptors, getters/setters, proxies, symbol keys, exotic objects, object-literal `__proto__` setters or full prototype mutation. `Object.defineProperty`, `getPrototypeOf`/related reflective APIs and symbol-based coercion are missing. Borrowed `Object.prototype.toString` rejects partial host objects and objects inheriting from them because their `Symbol.toStringTag` is unknown; for example, Node console has the tag `console`, not `Object`. | Add shared internal property/descriptor/prototype operations used by literals, reads/writes, reflection and builtins; test getter order/throws, inherited setters, attributes, symbols and symbolic state. |
| OBJ-002 — open — unsupported | [Enumeration](../src/Object/enumeration.ts) only trusts complete enumerable string-keyed data objects and concrete string indices. Arrays/functions, Error/intrinsic/global layouts, partial host objects, unknown strings/key domains and unmodeled reads are rejected. Conditional known keys/order are supported. See [spread specs](../test/object-spread.spec.ts). | Establish real own keys, order, enumerability, presence, values and descriptors for each added kind; share rules across `Object.keys` and spread, including getters and branch-specific mutation. Never infer ownership by filtering familiar names. |
| OBJ-003 — open — unsupported | Computed keys currently require concrete strings/numbers; unknown key domains and general ToPropertyKey are absent. [Object construction](../src/Object/ObjectConstructor.ts) rejects primitive wrappers; [hasOwnProperty](../src/Object/prototype.ts) rejects primitive receiver boxing and unmodeled layouts. String wrappers and primitive writes are unsupported. | Implement wrapper/exotic indexed properties and key conversion, including conversion side effects and failures; test primitive access/ownership and symbolic keys without pretending unknown keys are absent. |
| LIB-001 — open — unsupported/testing | [Initial globals](../src/execution-context/ESInitialGlobal.ts) and builtin prototypes are a small selection, not the standard library. Examples include missing Number constants/global `isNaN`, Array constructor and most methods, JSON parse/stringify, RegExp, Date, Symbol/BigInt, collections, iterators and promises. Some absent members currently return ordinary `undefined`, so missing builtin coverage needs audit as well as implementation. | Add shared concrete/symbolic semantics and complete Test262 coverage incrementally; mark partial intrinsic surfaces honestly until their absent-versus-unmodeled properties are distinguished. |
| LIB-002 — open — unsupported | [Coercion](../src/conversion/toString.ts) models supported ordinary string conversion. Exotic `Symbol.toPrimitive`, default array conversion, function source conversion and unsupported value kinds remain gaps. [Operators](../src/operators.ts) reject arithmetic object coercion and unsupported symbolic numeric/relational/loose-equality coercions. Error cause/options, stacks and full Error descriptors/prototype behavior remain gaps in [Error](../src/error/Error.ts). | Share the correct hint-specific conversion and Error operations, preserve user code, coercion order and abrupt paths, and validate with complete upstream cases. |
| LANG-008 — open — unsupported/precision | Untagged templates use cooked text plus ordered ordinary ToString/concatenation; tagged templates and template-site object identity/raw strings are not implemented. Their substitutions inherit LIB-002 conversion limits and SYM-001 string precision. See [template specs](../test/template-literals.spec.ts). | Implement tagged call receiver/evaluation order, per-site template objects, raw/cooked values and invalid escapes through shared machinery; preserve symbolic effects/throws. Complete untagged support is not tagged-template conformance. |

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
| SYM-001 — open — precision | The [fact/choice reasoner](../src/symbolic/index.ts), [numeric order](../src/number/symbolic.ts) and [arithmetic](../src/symbolic/arithmetic.ts) are incomplete. Remainder, operands possibly NaN/infinite and division intervals touching zero lack derived binary bounds. Later facts do not reanalyze stored arithmetic; relationships such as `x - x` can remain unknown. General symbolic strings, concatenation identities, encodings and unknown property keys lack a complete solver. Math.random supplies fresh unknown numbers in [0, 1), not a PRNG-state or probability/distribution analysis. | Add sound reusable inference with positive proofs and mandatory unknown/counterexample boundaries, respecting IEEE rounding, NaN, infinities and signed zero. Do not turn stronger desired precision into an input restriction. |
| SYM-002 — open — unsupported/precision | [Symbolic arrays](../src/array/symbolic.ts) are immutable dense numeric sequence snapshots with stable identities and local numeric element facts/literal bounds. Unknown holes, nonnumeric elements, mutation, symbolic indices and broader shape contracts are unmodeled. Symbolic slice requires a concrete nonnegative start and omitted end; ordinary slice/reverse need known positions and join lacks general object conversion. | Extend the shared array domain/operations while preserving aliasing, lengths, holes, coercion and out-of-bounds behavior. Verify stale snapshot facts cannot survive mutation. |
| SYM-003 — open — unsupported/precision | [Summary inference](../src/Function/summaries.ts) uses a singleton base case, strict suffix descent, four numeric candidates, one identifier array parameter and pure direct self-recursion. Inputs must be nonempty, dense and finite; NaN/infinity, empty-base strategies, captured mutable dependencies, arbitrary calls, mutation/effects, loops and general recursion are rejected. Arrow lexical-this dependencies remain outside the pure subset. | Expand verified induction strategies/candidate domains through adversarial specs, checking termination, every return path and captured dependencies before publishing/cache reuse. Nonempty is necessary for the sample min's termination, but not a permanent limitation for other functions. |
| SYM-004 — open — precision/testing | Summary caching is by function and element-template identity; known-length arrays still unroll, and equivalent contracts do not share summaries. Nested choices may grow exponentially. Proof-budget exhaustion and [effectPaths](../src/effects/trace.ts)' default 256-path limit are explicit failures, not proofs or domain restrictions. General execution has no complete termination strategy. | Improve sharing, work limits and reporting without dropping paths or weakening assumptions; test budget exhaustion, cache invalidation and retained unknown results. Preserve bounded coverage in reports. |
| HOST-001 — open — assumption/unsupported | [Host functions](../src/effects/index.ts) trust supplied models to preserve returns/throws/state/effect order. A missing model rejects analysis; registration does not prove a supplied model sound. Native generator continuations cannot resume a fork as one host generator and must use [bindNormal](../src/evaluate.ts). Effect traces describe modeled operations, not evidence that external I/O happened. | Validate each model against independent concrete behavior, include success/failure and branch isolation, and keep missing operations explicit. Generalize native continuation handling only with preserved per-path control/state. |
| HOST-002 — open — assumption/unsupported | Embeddings currently choose bounded transitions such as completeListen, deliverRequest and completeResponse. There is no general Node event loop, timer/immediate/nextTick/microtask scheduler, concurrent connection schedule, resource cancellation or ordering analysis. See [HTTP scheduling](node-http.md#declared-environment-and-remaining-gaps). | Introduce explicit bounded scheduling/environment choices and preserve ordering/state/failure under each schedule. Report bounds and unresolved schedules; never infer all-schedule safety from one delivered callback sequence. |

## CommonJS and Node interfaces

| ID / status / kind | Current boundary and evidence | Closure criterion |
| --- | --- | --- |
| CJS-001 — open — assumption/unsupported | The [loader/resolver](../src/require/resolution.ts) reads a complete immutable supplied source graph with canonical absolute paths, no host disk I/O, symlinks/realpath, external/NODE_PATH/global search paths or full platform path behavior. The entry is loaded as a required file, not a process main (its id is its filename, not `"."`). Requests need concrete strings or finite choices; NUL/nonstandard request/main forms are rejected. | Model required filesystem/resolution outcomes and platform rules explicitly; compare exact filenames, precedence, directory intent and failures with pinned Node, including symbolic request choices. |
| CJS-002 — open — unsupported | [Package exports](../src/require/package-exports.ts) support exact targets/conditions/arrays, not pattern selection, custom conditions, `#imports`, malformed URL encodings or NUL targets. Default conditions are the declared Node set. | Add each selection/validation rule using pinned Node differential fixtures and complete upstream cases when possible, retaining blocked/invalid/no-match/missing distinctions. |
| CJS-003 — open — unsupported | [Package metadata](../src/require/package-config.ts) is narrower than Node's native reader: valid JSON, unique unescaped top-level keys, supported field shapes. Duplicate/escaped keys, unclassified invalid syntax, lone surrogate decoding, JSON-shaped exports strings and NUL paths reject analysis. Ordinary JSON modules are a separate supported data parser. | Match the pinned native reader's accepted/rejected cases and error kinds, not an assumed JSON.parse equivalent; test immutable resolution metadata separately from mutated exported JSON. |
| CJS-004 — open — unsupported | [Formats](../src/require/resolution.ts) exclude ESM, `.mjs`, explicit module packages, native addons and extra formats. Ambiguous `.js`/extensionless wrapper parse failures stop analysis because Node may reinterpret them as ESM. Standalone [evaluateCommonJS](../src/require/commonjs.ts) has no dependency loading/cache. | Add actual syntax detection/format loading and interoperation rather than treating unsupported formats as missing files. Keep standalone execution versus graph loading explicit. |
| CJS-005 — open — unsupported/assumption | [Module/require objects](../src/require/loader.ts) expose selected fields. `module.require`, children/parent/paths, require.resolve/cache/main/extensions and writes to protected loader metadata remain gaps; public cache overrides and `node:` bypass behavior are not established by alias identity specs. Unregistered builtin modules stop analysis. Registered builtins are trusted typed values: registration does not guarantee that arbitrary supplied models guard their missing members (HOST-001). | Model public operations and their cache/resolution/state effects with differential and symbolic tests; guard every partial API until then. |
| CJS-006 — open — unsupported/assumption | Loader errors expose name/code only; message/stack/requireStack and full prototypes/descriptors are guarded. Circular-require warning prototypes/diagnostics and DEP0128 main-fallback warnings are omitted while supported loading can continue; their absence is not an explicit analysis stop or proof that Node emits no warning. See [CommonJS limitations](../test/commonjs/README.md). | Model observable diagnostics, fields and timing or explicitly bound diagnostic-free proofs; preserve warning/error paths and independent Node comparison. |
| HTTP-001 — open — assumption | [listen](../src/node/http.ts) assumes a primary process with successful binding. Occupied ports (`EADDRINUSE`), permission failures (`EACCES`), unavailable addresses, DNS errors, exhausted resources, IPv6 availability/fallback and cluster allocation are unmodeled. Omitted-host listening becomes true inline under that assumption; explicit-host completion later selects successful lookup/binding. A numeric valid port does not imply availability. | Represent environmental success/failure outcomes, error timing/listeners, callback non-delivery on failure, listening state, retry and retained effects. Verify occupied-port and other failure scenarios against pinned Node before claiming startup safety across those outcomes. |
| HTTP-002 — open — unsupported | Numeric `(port[, callback])` and `(port, "127.0.0.1"[, callback])` accept concrete ports/finite choices. Strings, absent/options ports, other hosts, backlog overloads, unbounded symbolic ports, overlapping pending host lookups, address inspection, close/relisten and cluster workers remain gaps. Custom callback Number conversion and inherited normalized listen options reject analysis. See [listen specs](../test/node-http-listen.spec.ts). | Implement Node argument normalization/coercions in order, possible side effects, pending/bound/closed state and overload-specific failures. Retain already-covered callback-before-invalid-port behavior and bound-duplicate precedence. |
| HTTP-003 — open — assumption/unsupported | Response output/finish currently selects successful transport on a live connection. Backpressure, write/drain, socket aborts, failing flushes, close/error events, end callbacks, repeated end and unresolved lifecycle delivery are unsupported. `writableEnded` is not successful flush; completeResponse is explicit. | Model writable/socket transitions and failing completions with retained committed output/state and callback/event ordering. Include bounded error/close races and complete upstream failing-flush cases. |
| HTTP-004 — open — assumption/unsupported | Delivery begins at an already parsed request; no HTTP parser has been analyzed. Symbolic method/URL fixtures use unrestricted strings, a conservative superset of valid syntax, not a proof of parsing. Request data/end/error streams, Buffer payloads, body encodings, JSON parsing, connection upgrades/continue/expectation and HTTP client APIs are absent. createServer options and broader request/response methods are guarded. | Model parser-domain inputs and stream transitions, flowing/listener effects, payloads and failures as needed by actual applications. Do not add generic `req.on` and claim readable-stream support. |
| HTTP-005 — open — unsupported/precision | Response end supports string/null/undefined, not encoding/callback overloads. Headers/writeHead, informational completion, nonnumeric/open-symbolic status conversion and full status behavior remain gaps; final concrete/finite-choice numeric statuses are modeled. Unknown UTF-16 output loses identity through UTF-8 encoding. See [lifecycle specs](../test/node-http-lifecycle.spec.ts). | Model header/status coercion, validation and commit order, payload forms and encoding precisely; preserve HEAD/204/304 suppression and later public mutations versus committed wire output. |
| HTTP-006 — open — unsupported | HTTP partial objects/functions expose selected values, not complete own/inherited descriptors, construction/metadata or mutation. Protected lifecycle emit/listenerCount is rejected because Node has internal listeners/transitions; other reserved host registrations await delivery semantics. | Establish actual property layouts and internal event behavior before permitting inspection, replacement or public lifecycle emission/counting; verify borrowed methods cannot bypass model state. |
| EVENTS-001 — open — unsupported | [EventEmitter](../src/node/events.ts) needs known string/finite-choice names and initialized model receivers. Symbols/open names, constructor options/custom receivers/reinitialization, prepend/removeAll/listener inspection, listenerCount's listener filter, captureRejections/asynchronous helpers, internal fields and method/metadata overrides remain gaps. | Model each public operation against pinned Node, preserving listener identities, persistent branch state, snapshots and callback receivers; enable complete upstream cases without trimming them. |
| EVENTS-002 — open — unsupported | Meta-events newListener/removeListener and warning delivery are missing. Registration reaching the default warning threshold is rejected; HTTP's known internal listeners count, so ten application listening/finish listeners can already hit it. Unhandled error with a non-Error payload and exact generated error diagnostics are unmodeled. | Preserve warning/meta-event/error timing and payloads, listener-list changes/reentrancy and per-path effects; validate threshold and internal-listener cases. |
| EVENTS-003 — open — unsupported | Node's single-listener dispatch can observe a callback's replaced/inherited `.apply`; the [model](../src/node/events.ts) guards that path. Multiple-listener dispatch calls directly. A once wrapper ignores the original callback's own `.apply`, but a single once wrapper still observes inherited `Function.prototype.apply`, which is guarded. Async rejection capture is separately EVENTS-001/LANG-005. | Implement the actual observable apply lookup/invocation with effects/throws and symbolic replacements; keep snapshot and once-before-call behavior correct. |
| CONSOLE-001 — open — unsupported | The [console model](../src/node/console.ts) supports default ungrouped log with zero arguments or one string, shared global/builtin identity and ordered captured stdout chunks. Multiargument/nonstring formatting, util.format/inspect/custom inspection, colors/options, groups/timers, stderr/other methods, Console construction, log/config replacement and full descriptors/metadata remain gaps. See [console specs](../test/node-console.spec.ts). | Add each formatter/API/configuration through the shared VM and independently compare formatting, conversion effects, receiver binding and exceptions with pinned Node. One-string logging is not full console support. |
| CONSOLE-002 — open — assumption/unsupported | Captured log output assumes healthy writable default UTF-8 stdout, no stream replacement, diagnostics subscribers or inspector hooks. Swallowed synchronous write failures, asynchronous error delivery, ignoreErrors, backpressure/drain, flush/exit loss and alternate encoding are unmodeled. Concrete surrogate replacement is modeled; unknown encoded text remains unknown. | Represent stream/config/environment outcomes and actual console failure handling, including when the application sees no throw despite failed output. Distinguish calling log, accepting a write and durably emitting/flushing bytes. |

## Real application, evidence and coverage

| ID / status / kind | Current boundary and evidence | Closure criterion |
| --- | --- | --- |
| TARGET-001 — open — unsupported | The pinned full [pico-static-server module](../test/fixtures/pico-static-server-3.0.3/package/index.js) now exercises setup through shared language/host operations; a complete request path still needs actual URL/path/fs/response APIs. HTTPS imports can have opaque identity without usable API semantics. Native reference execution observes DEP0169 from url.parse and the application's reversed writeHead arguments; modeling must preserve those behaviors, not repair the source or omit its diagnostic. Express is later ordinary source, not an Express-specific model. See [analysis spec](../test/pico-static-server-analysis.spec.ts). | Run unchanged module and dependencies end to end through actual registered callbacks. State exact URL/method/file/schedule domains and classify supported request outcomes, unknowns and unsupported paths separately. |
| TARGET-002 — open — assumption/testing | The [target plan](real-world-target.md) starts with trusted concrete HTTP configuration, a small POSIX filesystem, finite request targets, one server/request, successful startup/transport and no process exception-recovery hook. Initial files have no symlinks or concurrent changes. Filesystem existence/type/read success/failure must be correlated through shared state; permissions, races, platform differences, Buffer contents, richer URL/containment semantics and repeated requests remain expansions. The native missing-default-file failure is a reference observation, not a Prophet finding or a novel vulnerability claim. The [discount example](../test/discount-server.spec.ts) assumes supplied handler inputs and successful modeled host outcomes, not a parsed HTTP/Express application. | Execute real failure-producing source paths under declared environmental choices, retain ordered effects/uncaught exceptions, and add a known safe control. Expand domains explicitly; preserve resource availability/error gaps rather than silently choosing success. |
| TARGET-003 — open — precision/testing | Automatic satisfying-input generation and independent replay of Prophet findings are future consumers of feasible symbolic paths. A failed proof, unknown value or unsupported operation is not a counterexample. Existing native target observations do not establish that Prophet reached the path. | First obtain a feasible violating path, then produce a concrete supported-domain witness and replay the unchanged target under pinned Node with matching environment/schedule. Report replay failures/inconclusive paths without claiming a found defect. |
| TEST-001 — open — testing/unsupported | [Test262 runner](../test/test262/runner.ts) only accepts onlyStrict/noStrict/raw/generated flags, no includes, and parse-negative SyntaxError metadata. Harness supports selected assert operations/$ERROR/$DONOTEVALUATE, not Test262Error, property helpers, async/module/realm/agent machinery or the full harness. | Extend runner without native execution of test source or ignored assertions; keep whole files, metadata and strict/sloppy variants, and ensure analysis errors cannot satisfy language exception assertions. |
| TEST-002 — open — testing | The historical selection contains 46 explicitly skipped files listed below. They have not all been run through the current evaluator to establish blockers. Thirty-four are parse-negative, two newline/ASI runtime cases, three primitive Boolean cases, and seven Boolean call/construction cases. | Reassess each complete file, activate every supported variant, and record actual failures under the relevant implementation ID. Retain filename/closure evidence here when removing its skip; do not label parse-only tests blocked by unrelated runtime features. |
| TEST-003 — open — testing | Test262 is pinned to an old revision. Reviewed old parameter-eval scope cases disagree with current pinned Node/current ECMA shared parameter scope. This is version reconciliation debt, not a reason to change semantics to satisfy outdated expectations. See [Test262 notes](../test/test262/README.md). | Update/reconcile the pinned corpus deliberately, document semantic changes and rerun active cases; do not edit upstream source to make it pass. Full coverage remains the goal, never inferred from selected corpus counts. |
| TEST-004 — open — testing | No complete upstream Node compatibility test is yet claimed passing. Local differential specs use Node v24.21.0 (`955266bfdd854cd280dffd47548673914484e4c0`). Reviewed candidates in the [CommonJS](../test/commonjs/README.md), [events](node-events.md#complete-upstream-cases-reviewed) and [HTTP](node-http.md#complete-upstream-cases-reviewed) records need actual harness/API dependencies; historical lists require reconciliation as arrows/defaults/spread land. The whole [test-console.js](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-console.js) additionally needs common/assert, process/worker/stdio replacement, warning scheduling, util.inspect/Symbol, broader formatting/methods and timer/count state; none is trimmed away or counted passing from single-string local specs. | Run suitable complete unmodified Node cases with their fixtures/common/assert dependencies; preserve all scenarios, including failures. Keep local differential results separate from upstream conformance and platform/environment coverage. |

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
retain the ID, removed limitations, residual IDs, PR and validation evidence.
