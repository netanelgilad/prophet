# P035 design — explicit symbolic starting inputs through the CLI

**Status: design only.** This document proposes the bounded `--environment`
input surface and its semantics. No production or test files have been changed.
After orchestrator review, the first implementation stage is red specs, then
generic code. Do not treat any claim here as implemented.

Owner clarification (2026-10-21): the downstream consumer grants package and
deep-dependency capabilities (network domains, filesystem, subprocesses) and
prompts on new possible behavior with provenance and conditions. The VM stays
policy-agnostic. P035 is the bounded **environment input prerequisite**: it
declares starting facts. It does not grant, classify or approve anything, and it
adds no permission or verdict fields.

This revision resolves the seven findings of the round-1 review. The mapping is
in §18.

## 1. Scope

In scope for this design:

- One optional CLI flag `--environment <path>` supplying a JSON file.
- A small, runtime-oriented value schema: named primitive Booleans/strings,
  references, and Boolean-selected finite choices built from VM values.
- Injection of the two existing filesystem facts: descriptor availability and
  empty-path-before-open-descriptor-check ordering.
- A minimal generic provider-input seam so the automatic HTTP arrival uses
  declared method/URL choices and concrete headers instead of fresh unknown
  strings.
- Retention of the complete declared environment (named values, validated
  request domain, file identity) in actual graph host state.
- Validation, resource bounds, default/omitted meanings, arrival semantics,
  provenance, identity/correlation rules, and relative-path resolution.
- An executable red-spec plan.

Out of scope (explicit boundaries, each a later increment):

- `process.env`, `process.argv`, `process.cwd` authoring (PROCESS-001).
- Bind-profile authoring (host/port/availability), which stays
  `symbolicTCPBind`; `process` is not a v1 top-level key.
- Closed filesystem trees (`filesystem.tree`); v1 uses the automatic open
  read-only acquisition plus the two fact overrides.
- Per-file read-access facts (EACCES) — see §13.
- Arbitrary heap/closure snapshots and full resumption (REPORT-001).
- HTTP request bodies/streams, transport outcomes, parser dispatch, histories
  longer than two, and arbitrary event sequences.
- Security/policy/verdict fields — never part of VM state.
- A JavaScript environment builder. Input authoring is JSON data, never an
  eval/native JS builder.

## 2. Current machinery (verified against the worktree)

- `parseArguments` (`src/cli/arguments.ts:11`) parses `--runtime`, `--max-steps`,
  `--max-events`; `--` separates target args. `--environment` is currently an
  unknown option and is asserted to throw (`test/cli-arguments.spec.ts:45`).
- `main` (`src/cli/main.ts:18`) writes exactly `{ roots, nodes }` to stdout,
  diagnostics to stderr, and returns 0/1/2.
- `runFile` (`src/cli/runtime.ts:56`) begins with `realpathSync(resolve(cwd,
  options.script))` at line 59, then `captureModuleSources`, then
  `captureFileSystem({ cwd })`, then builds the process/path/url/console/
  filesystem/http models and runs. Environment validation must precede the
  target `realpathSync` (§8, finding 7).
- `captureFileSystem` (`src/cli/filesystem-capture.ts:14`) accepts
  `fileDescriptorsAvailable?: TESBoolean` and
  `emptyPathBeforeOpenDescriptorCheck?: TESBoolean` and defaults them to
  `ESBoolean()` / the existing platform default. It acquires the cwd ancestor
  chain and open directories on demand.
- `createFileSystemModel` (`src/node/filesystem.ts:39`) takes `root`, `cwd`,
  `platform`, `fileDescriptorsAvailable`, `emptyPathBeforeOpenDescriptorCheck`,
  and the observe hooks.
- `createHTTPModel` (`src/node/http.ts:76`) takes
  `{ bind, nextTick, externalEvents }`. `incomingRequest`
  (`src/node/http.ts:585`) is the external-event provider's deliver function and
  hardcodes `{ method: ESString(), url: ESString() }`. `deliverRequest`
  (`src/node/http.ts:590`) validates lowercase-token headers with concrete
  string values, stores them in a null-prototype record, and allocates fresh
  request/response identities.
- `createExternalEvents` (`src/external-events.ts:29`) registers one provider per
  server; eligibility is the listening state; `step`/`explore` bound arrivals to
  0/1/2 and preserve shorter histories and waiting alternatives.
- `selectValue` (`src/symbolic/index.ts:899`) resolves a concrete condition or
  returns a VM value carrying a `select` expression. A select of two strings is
  an `ESString`; a select of two Booleans is an `ESBoolean`. A choice of mixed
  types is a `choice` node.
- `ESString()`/`ESBoolean()` create fresh host-side VM values with unique ids;
  the existing `deliverRequest` already creates them inside a host operation, so
  this is the established pattern. VM values are plain records (prototype
  `Object.prototype`) with no accessor or symbol keys, so the existing graph
  encoder handles them.
- The graph encoder (`src/cli/graph.ts`) already supports plain records and
  `Map` nodes (`graph.ts:91`); host slots are ordinary properties on the global
  object (`runtime.ts:90`). Retaining the environment in graph host state needs
  no serializer change.
- The fixture `test/fixtures/pico-static-server-3.0.3/package/examples/static/`
  contains `defaultfile.html` and `otherfile.html` (text) and `image.jpg`
  (binary, ~72 KiB). Acquisition accepts UTF-8 contents only.

## 3. CLI surface

```sh
prophet --runtime node@24.21.0 --environment initial.json -- app.js arg1 > result.json
prophet --environment initial.json --max-events 1 -- app.js > result.json
prophet --environment initial.json --max-events 2 -- app.js > result.json
prophet -- app.js arg1 > result.json            # unchanged default
```

- `--environment <path>` is accepted at most once, in any order before `--`.
- `--environment` requires a value; a following `--` is an error
  ("Expected an environment path").
- `--environment` after `--` is a target argument, not a Prophet option.
- `--help` alone is unchanged; `--help` with other options still errors.
- Omitted `--environment` preserves the exact current behavior (automatic
  capture, fresh unknown method/url, default descriptor availability/ordering).
- Output remains exactly `{ roots, nodes }`; diagnostics remain on stderr.

## 4. Environment file schema (version 1)

A single strict JSON object. Only Boolean and string values are supported; there
are no number expressions in v1.

```jsonc
{
  "version": 1,
  "values": { "<name>": <valueExpr> },
  "filesystem": {
    "descriptorAvailable": <booleanExpr>,
    "emptyPathBeforeOpenDescriptorCheck": <booleanExpr>
  },
  "http": {
    "requests": {
      "method": <stringExpr>,
      "url": <stringExpr>,
      "headers": { "<lowercase-token>": "<literal string>" }
    }
  }
}
```

All top-level sections except `version` are optional. Unknown top-level keys
reject. Empty `filesystem: {}` means both facts use their defaults. Empty
`http: {}` means no request template (the default fresh-unknown domain). If
`http.requests` exists, both `method` and `url` are required.

### Value expressions

`<valueExpr>` is one of:

| Form | Meaning |
| --- | --- |
| `true`, `false` | concrete Boolean |
| `"<text>"` | concrete UTF-8 string |
| `{ "symbolic": "boolean" }` | fresh unknown Boolean |
| `{ "symbolic": "string" }` | fresh unknown string |
| `{ "ref": "<name>" }` | shared named value (identity preserved) |
| `{ "select": { "condition": <expr>, "then": <expr>, "else": <expr> } }` | Boolean-selected finite choice |

Every object form accepts exactly its named key; any other key rejects. A `select`
requires a Boolean-valued `condition` and same-kind `then`/`else` (Boolean for
Booleans, string for strings). A mixed-kind select rejects rather than becoming
an unusable `choice`.

### Contexts

- `values` is evaluated **once** before any host observation or arrival. Each
  named value is a shared VM value. `{ "symbolic": ... }` here is shared.
- `filesystem.descriptorAvailable` and
  `filesystem.emptyPathBeforeOpenDescriptorCheck` must be Boolean-valued
  expressions (concrete, symbolic, ref, or select of Booleans). Non-Boolean
  rejects.
- `http.requests` is a **per-arrival template**. It is re-materialized for each
  delivered arrival. Its leaves are:
  - `{ "symbolic": "boolean" | "string" }` → a **fresh** unknown for that
    arrival;
  - `{ "ref": "<name>" }` → the shared named value;
  - literal / `{ "select": ... }` → composed from the above.
  `method` and `url` are required and must be string-valued. `headers` is an
  optional object mapping a lowercase HTTP token name to a literal string.

### Why a template

`--max-events 2` currently gives each arrival independent unknown method/URL.
The template keeps that default when the user writes
`{ "method": { "symbolic": "string" }, "url": { "symbolic": "string" } }`, but
lets the user declare finite choices and shared correlations. Fresh inline
symbolic leaves are distinct per arrival; `{ "ref": ... }` is stable. This is the
"fresh per-arrival inputs vs shared initial unknowns" distinction.

### Names

Names match `/^[A-Za-z_][A-Za-z0-9_]*$/`. Reserved names (`__proto__`,
`constructor`, `prototype`) and any name that is not an identifier reject. Names
are stored in a `Map`; no object property is ever created from a name, so
prototype pollution through names is impossible. Duplicate names reject.

### Strings, bytes and surrogates

- The input file's bytes must be valid UTF-8. Raw NUL bytes inside a JSON string
  are rejected by the strict parser (control characters must be escaped); an
  escaped `\u0000` inside a string is allowed as data. v1 has no path-valued
  fields, so there is no accidental JavaScript string restriction on values.
- JavaScript strings are UTF-16. An escaped lone surrogate (`\ud800`) is valid
  JSON and is accepted as JS UTF-16 data; it is not rejected at parse time. It is
  only meaningful if a future field consumes it.
- Header names are stored in a null-prototype record (`Object.create(null)`), so
  a legal token name such as `constructor` cannot collide with
  `Object.prototype`. Header-name validation uses the token regex, never a
  property lookup.

## 5. Materialization into VM values

`src/cli/environment.ts` (new) compiles the file into:

- `shared: Map<string, Any>` of VM values;
- `filesystem: { descriptorAvailable?: TESBoolean; emptyPathBeforeOpenDescriptorCheck?: TESBoolean }`;
- `requestInput: () => { method: TESString; url: TESString; headers?: Record<string, string> }`;
- `state: { values: Map<string, Any>; requests: <plain record> | undefined; provenance: { path, version, sha256 } }`.

Materialization rules:

- **Two-pass named resolution.** All names are collected first, so forward refs
  resolve; each named value is then compiled once and memoized by name.
- A reference resolves against the map; a missing name rejects. A cycle (direct or
  indirect) rejects. A reference edge is counted (§8).
- A `select` requires a Boolean condition and same-kind branches. For strings and
  Booleans it uses `selectValue`, called only after the structural work bound is
  checked. A mixed-kind select rejects.
- `http.requests` compiles to a zero-argument function. On each call it walks the
  template and creates fresh `ESString()`/`ESBoolean()` for inline symbolic
  leaves, reuses `shared` for refs, and uses `selectValue` for selects. The
  function is called from inside the HTTP provider operation, so the fresh values
  enter the branch heap through the normal `writeProperty` path used by
  `deliverRequest`.
- No native/eval code is involved. JSON data is compiled to VM value objects
  only.

### Provider-input seam (`src/node/http.ts`)

Add one zero-argument option and no counter:

```ts
export type IncomingRequestInput = {
  method: TESString;
  url: TESString;
  headers?: Record<string, string>;
};
export type HTTPModelOptions = {
  bind?: HostModel;
  nextTick?: JobQueue;
  externalEvents?: ExternalEvents;
  requestInput?: () => IncomingRequestInput; // NEW, zero-argument
};
```

`incomingRequest` becomes:

```ts
const incomingRequest = operation("http.server.incomingRequest", (call, context) => {
  const input = requestInput === undefined
    ? { method: ESString(), url: ESString() }        // unchanged default
    : requestInput();
  return deliverRequest(call.receiver, input, context).result;
});
```

There is **no native arrival counter and no ordinal argument** (finding 1). The
same template applies to every eligible server and every arrival. The factory is
invoked only on a selected arrival branch; two-event exploration may invoke it
more than twice overall (once per selected delivery branch). Each invocation
creates fresh inline values and reuses shared references. Fresh identities may
differ between explored siblings; no semantic input may depend on traversal
order.

- `deliverRequest`'s existing header validation (lowercase token names, concrete
  string values) is reused unchanged; the environment factory produces exactly
  the shape `deliverRequest` already accepts.
- Embeddings calling `deliverRequest` directly are unaffected.

## 6. Graph host state (retains the complete declared environment)

Merely constructing VM values does not put them in the heap, and
`FileExecution.input` is not serialized by `main`. The environment therefore
exposes its complete declared state through an ordinary runtime-owned global
host slot, using the same mechanism as `node.nextTick`, `node.fs`,
`node.url.deprecation` and `externalEvents` (`runtime.ts:90`).

`environment.state` is a frozen plain record:

```ts
{
  values: Map<string, Any>,              // all named VM values, including unused ones
  requests: <plain record> | undefined,  // validated request-domain template, or undefined
  provenance: { path: string, version: 1, sha256: string }
}
```

- `values` is the same `Map` the compiler uses, so every named value (used or
  unused) is reachable from the graph.
- `requests` is the normalized template data (plain record of JSON-compatible
  values), not the host closure, so the graph encoder can represent it.
- `provenance` is the structured file identity: resolved absolute path, schema
  version, and SHA-256 of the exact file bytes.
- The injected filesystem facts are the **same VM objects** as the
  `values` entries they reference, so the graph shows the alias. This is an
  actual declared-state/provenance fact, not limitation prose.
- The existing graph encoder supports plain records and `Map` nodes, so no
  serializer change and no report/policy envelope is needed.
- The slot is omitted **entirely** when no environment was supplied, preserving
  the existing no-environment shape (`node.nextTick`, `node.fs`,
  `node.url.deprecation`, `externalEvents` only).
- The validated template and the complete shared map are encapsulated before
  use: `state` is a frozen record, the shared `Map` is never mutated after
  materialization, and no compilation cache changes after the initial graph
  state is linked. Named VM values are retained through these graph links; they
  are not automatically heap entries on their own.

The slot is linked in `runtime.ts` after the global is created:

```ts
Object.assign(global, { hostSlots: Object.freeze({
  "node.nextTick": nextTick.state,
  "node.fs": filesystem.state,
  "node.url.deprecation": url.state,
  externalEvents: externalEvents.state,
  "node.environment": environment.state
}) });
```

The declared state is retained in the graph as an inspection projection, not a
resumable snapshot; a graph round trip requires a decoder and is future work.

## 7. Filesystem fact injection

`runFile` passes the compiled facts through:

```ts
const filesystem = captureFileSystem({
  cwd,
  fileDescriptorsAvailable: environment.filesystem.descriptorAvailable,
  emptyPathBeforeOpenDescriptorCheck: environment.filesystem.emptyPathBeforeOpenDescriptorCheck
});
```

The automatic read-only acquisition still runs. The two facts only override the
process-level defaults. The environment does not replace the tree, does not
perform writes, and does not force access success. Descriptor availability alone
selects EMFILE (no descriptor) versus the successful-read path; it does not by
itself produce EACCES (see §13).

## 8. Validation and resource bounds

Validation is a separate, total phase that completes **before** the target
`realpathSync` at `runtime.ts:59`, before `captureModuleSources` and before
`captureFileSystem` (finding 7). A malformed environment therefore reports an
invocation error (exit 1) and never a target-acquisition error.

### Bounded read strategy (before allocation)

1. Resolve the environment path against the process cwd to an absolute path.
2. `lstatSync` the resolved path: it must be a regular file. Symlinks,
   directories, FIFOs, sockets and devices reject before any read.
3. Check `lstat.size` is a safe nonnegative integer `<= 262144` (256 KiB).
   Larger files reject before reading.
4. `openSync(path, O_RDONLY | O_NONBLOCK | O_NOFOLLOW)` on the supported POSIX
   platforms. `fstatSync(fd)` must confirm a regular file whose size is a safe
   nonnegative integer `<= 262144` and whose `dev`/`ino`/`size`/`mtimeMs` agree
   with the opening `lstat`. Only then allocate at most `262145` bytes. A final
   size check cannot repair a huge allocation made from an unchecked opening
   `fstat`, so the opening `fstat` is the allocation gate.
5. Read in bounded chunks by that capacity. Reject short or long reads, a final
   `fstatSync` that disagrees with the opening metadata, or an overlong result.
   Always `closeSync(fd)` in `finally`.
6. Decode the bytes as UTF-8; reject if re-encoding does not round-trip (invalid
   UTF-8). Raw NUL bytes are rejected by the strict JSON parser (control
   characters must be escaped); escaped `\u0000` in a string is allowed as data.
7. Strict recursive-descent JSON parse on the already-bounded bytes: max nesting
   depth 32, duplicate object keys rejected at parse time, trailing tokens
   rejected, non-finite numbers rejected, token lengths bounded. The parser runs
   on the bounded buffer, so no unbounded recursion or allocation occurs.

This detects some races; it does not claim atomic capture or a complete
symlink-safe ancestor walk. A mocked `lstat`/`open`/`fstat` race test covers the
allocation order without making giant files or depending on a timing race.

### Schema validation (before any host observation)

- Walk the whole schema. Validate every object's key set and every named
  definition, even unused refs and both select branches behind a concrete
  condition. A constant guard never skips validation.
- Two-pass named resolution (forward refs resolve), then memoized compilation.
- **Expanded work.** Before constructing any VM value, compute a saturating
  structural weight for every expression, memoizing the numeric weight per named
  definition:
  - literal / symbolic leaf = `1`;
  - `ref` = `1 + weight(definition)`;
  - `select` = `1 + weight(condition) + weight(then) + weight(else)`.
  A reused reference adds its full weight at each occurrence even though its VM
  value is built once. This bounds `selectValue` / Boolean reasoning that may
  traverse a shared DAG repeatedly, which memoization of value construction alone
  does not.
- **Expanded depth.** A memoized longest path: leaf = `0`; `ref` = `1 +
  depth(definition)`; `select` = `1 + max(depth(condition), depth(then),
  depth(else))`.
- Reject cycles (direct or indirect), any root depth `> 32`, and a saturating
  total expanded work `> 4096` across all named definitions, explicit filesystem
  expressions and request-template expressions. Request `method` + `url` together
  also have a `1024` expanded-work cap.
- Keep separate syntactic limits: `MAX_VALUE_NODES = 4096`, `MAX_REF_EDGES =
  4096`, `MAX_NAMED = 256`, `MAX_JSON_DEPTH = 32`, `MAX_LITERAL_BYTES = 65536`,
  `MAX_STRING_BYTES = 16384`, `MAX_HEADERS = 64`, `MAX_HEADER_NAME_BYTES = 255`,
  `MAX_HEADER_VALUE_BYTES = 8192`.
- `selectValue` is called only after the expanded-work and depth bounds pass.
- Forward refs accept. Deep chains beyond `MAX_DEPTH` reject. Repeated DAG fanout
  beyond the expanded-work bound rejects. Empty expression objects (`{}`) reject.
  A small repeated-DAG input with a tiny syntactic node count but an expanded
  weight over the limit rejects, with a nearby accepted case.

### Accepted/rejected boundary tests

- Accepted: forward ref; acyclic DAG with shared subgraphs within the expanded
  work bound; the nearby repeated-DAG case.
- Rejected: indirect cycle; deep ref chain `> MAX_DEPTH`; repeated DAG fanout
  beyond expanded work; empty expression; unknown key at any object level;
  mixed-kind select; non-Boolean filesystem fact; non-string method/url; bad
  header name or non-string header value; file `> 256 KiB`; symlink environment
  file; malformed UTF-8; duplicate JSON keys; a huge allocation from an unchecked
  opening `fstat` (mocked race).

These are rejected authoring domains, never a silent narrowing of an accepted
input.

## 9. Default and omitted meanings

| Situation | Meaning |
| --- | --- |
| `--environment` omitted | Current behavior exactly. |
| `values` omitted/empty | No shared values; every fact uses its default. |
| `filesystem` omitted/empty | Both facts use their defaults. |
| `filesystem.descriptorAvailable` omitted | `ESBoolean()` (unknown). |
| `filesystem.emptyPathBeforeOpenDescriptorCheck` omitted | Existing default (Linux unknown; Darwin false). |
| `http` omitted/empty | No request template; fresh independent unknown method/URL per arrival. |
| `http.requests` omitted | Default fresh-unknown domain. |
| `http.requests` present | `method` and `url` required; `headers` optional (empty object means none). |
| `--max-events 0` with a request template | Template validated and retained in graph state, never materialized; zero-arrival/waiting preserved. |

The environment declares a **domain**, not an arrival. It never forces an arrival,
a successful bind, a successful read, or successful transport.

## 10. Identities, correlations and arrivals

- A named value used in `filesystem` and in an `http.requests` select condition
  is the same VM object id, so a pico read outcome and a response choice stay
  correlated across branches. Infeasible combinations are excluded by the
  branch knowledge, not by input filtering.
- Fresh per-arrival leaves are distinct objects per arrival, preserving the
  existing independence of arrival 0 and arrival 1.
- `--max-events 2` materializes the template twice against the same shared values
  and the current (post-first-arrival) context, so invocation-time state such as
  a handler `armed` flag is preserved and shorter histories remain.
- The factory is zero-argument; there is no ordinal and no traversal-order
  dependence. Two-event exploration may invoke it more than twice overall, once
  per selected delivery branch, and fresh identities may differ between explored
  siblings.
- The environment never recognizes function names or source text. It only
  supplies values.

## 11. Relative path resolution

- The `--environment` path is resolved against the process cwd (`cwd` passed to
  `runFile`), not the target script's directory. It must resolve to an existing
  regular file after resolution; relative spellings are accepted at the CLI but
  the file is read by its resolved absolute path.
- v1 has no other path-valued field. Future path semantics (tree paths,
  `process.env`, etc.) are a separate design; `process.env` values need not be
  canonical paths and must not be constrained by v1 path rules.

## 12. Provenance

- `parseEnvironment` returns the structured file identity: resolved path,
  `version`, and SHA-256 of the exact bytes, exposed in `environment.state`.
- Captured facts (cwd, platform, acquired tree entries) keep their existing
  provenance in the acquisition adapter. Declared facts keep the environment file
  as their provenance through the `node.environment` host slot.
- No provenance prose, model-domain text, or backlog ID is written into graph
  nodes. Serializing a portable provenance contract is a REPORT-001 increment.

## 13. Modeled state retention

- Materialized values are ordinary VM values in the persistent heap, retained in
  `roots.initial`/`roots.current` and correlated by branch knowledge.
- The complete declared environment (named values, request domain, file
  identity) is retained through the `node.environment` global host slot (§6).
- The automatic capture retains open/unobserved entries and unknown contents.
- Bind stays symbolic (`symbolicTCPBind`); failure retains the Error with unknown
  fields. The environment does not supply bind outcomes in v1.
- Successful transport remains the existing declared schedule; the environment
  does not declare transport outcomes.
- Retained siblings are classified separately from actual analysis boundaries:
  a missing-index ENOENT is a **modeled thrown program error** that escapes the
  handler (not an unsupported-analysis leaf); a bound-server waiting alternative
  is a modeled timeline end (not a failure). Unknown URL/method values remain
  symbolic; operations that cannot handle a reached value produce an analysis
  boundary, while supported branches still complete. Unknown input alone is
  not a boundary. No stopped branch is silently converted into success.
- String literals are UTF-16 values decoded from valid UTF-8 JSON; escaped
  surrogates can already appear in URL/header fields and are accepted as data.
- Two-event exploration materializes **at most two arrivals per represented
  history**, potentially more factory calls across explored alternatives; fresh
  per-arrival identities are created per call.
- The environment file bytes are not stored as graph prose. Its materialized
  values, normalized request-domain records and structured provenance are retained.

## 14. Excluded fields and why

| Excluded | Reason |
| --- | --- |
| Number expressions | v1 is Boolean/string values only. |
| `process`, `process.env`, `process.argv`, `cwd` authoring | Separate PROCESS-001 increment; v1 top-level whitelist rejects `process`. |
| Bind host/port/profile | Stays `symbolicTCPBind`; HTTP-001/HOST-002. |
| `filesystem.tree` (closed tree) | Separate increment; v1 uses automatic open acquisition. |
| Per-file read-access facts (EACCES) | v1 injects descriptor availability and empty-path ordering only; a read-access fact is a separate increment. |
| Arbitrary heap/closure state | REPORT-001 resumption, not an input prerequisite. |
| `http.requests` bodies, streams, transport | HTTP-008 and the declared transport schedule. |
| Capability/permission/policy/verdict fields | Owner clarification: consumer-owned; VM stays policy-agnostic. |
| Backlog IDs / test-inspection prose | Never part of core state or graph nodes. |

## 15. Red-spec plan (executable, after design acceptance)

New specs (names avoid the existing `cli-node-environment` process-env spec):

1. `test/cli-environment-arguments.spec.ts`
   - `--environment <path>` accepted once in any order; path preserved.
   - Reject missing value, duplicate, value `--`, and `--help` combined with it.
   - Update the existing rejection case `test/cli-arguments.spec.ts:45` to an
     acceptance case (required red-spec change).
2. `test/cli-environment-validation.spec.ts`
   - Valid minimal schema passes.
   - Reject wrong version, unknown key at every object level, unknown value name,
     indirect cycle, deep ref chain, repeated DAG fanout, forward-ref miss,
     reserved/non-identifier name, non-Boolean filesystem fact, non-string
     method/url, bad header name, non-string header value, over-budget
     file/nodes/edges/work/depth/strings, malformed JSON, duplicate JSON keys,
     non-UTF8, directory, symlink, missing file.
   - A malformed environment plus a nonexistent target yields no graph on stdout
     and the environment error (exit 1), never a target-acquisition error.
3. `test/cli-environment-graph.spec.ts`
   - The `node.environment` host slot appears in both `initial` and `current`.
   - An unused named value is present; a request template is retained with
     `--max-events 0`; a delivered arrival's inline symbolic method/url are fresh
     values while `{ "ref": ... }` values alias the shared object.
   - No prose, backlog ID, or test-inspection field appears in any node.
4. `test/cli-environment-request.spec.ts` (subprocess, real pico)
   - No-env regression unchanged (startup ready/failed).
   - **Successful text reads**: concrete `GET /otherfile.html` (and the default
     file) with descriptor available completes a real captured read and 200.
     `image.jpg` is binary; acquisition keeps its UTF-8 boundary. If exercised,
     the binary read is a separate acquisition-boundary rejection, not a
     successful read.
   - **Descriptor availability**: symbolic `descriptorAvailable` retains EMFILE
     versus the successful-read path. EACCES requires an explicit read-access
     fact, which v1 does not declare; do not claim EACCES here.
   - **Missing default file**: `GET /missing` completes 404.
   - **Missing index**: copy the entire pinned package unchanged into a temporary
     fixture, add an empty subdirectory under `static/`, request that directory,
     and expect `readFileSync` to throw ENOENT as a **modeled thrown completion**
     that escapes the handler. Do not expect an `ExecutionBoundary` leaf, the
     unreachable `data instanceof Error` 500 branch, or a fabricated response.
     Retain/verify all original program bytes.
   - **Unknown/symbolic siblings**: symbolic method or URL retains the existing
     open-symbolic-URL unsupported sibling beside completed paths.
   - **Zero-arrival waiting** preserved with a request template and
     `--max-events 0`.
   - **Correlation**: one shared Boolean drives both descriptor availability and
     a request method/URL choice; infeasible combinations are excluded.
   - **Two arrivals**: fresh per-arrival finite `/arm` or `/fire` choices reach a
     second-event-only throw; a shared URL reference cannot fabricate an
     arm-then-fire sequence; shorter histories are retained.
   - **Two eligible servers**: the same template, eligibility/listener mutation
     and shorter histories are retained.
   - **Identity**: repeated identity correlations and unused values are visible.
5. `test/cli-environment-correlation.spec.ts` (focused interpreted sources)
   - Shared Boolean -> descriptor fact plus URL/method selection.
   - Fresh per-arrival `/arm`/`/fire` reaching a second-event-only throw.
   - Shared URL reference unable to fabricate arm-then-fire.
   - Two eligible servers with the same template and listener mutation.
   - Unknown-string unsupported siblings alongside completed paths.
6. `test/cli-environment-bounds.spec.ts`
   - A small repeated-DAG input whose syntactic node count is tiny but whose
     expanded weight exceeds `4096` rejects, plus a nearby accepted case.
   - A deep ref chain `> MAX_DEPTH` rejects; forward refs accept.
   - A mocked `lstat`/`open`/`fstat` race test confirms the opening `fstat`
     gates allocation (no giant files, no timing race).
   - Stress probes run under an external timeout; a timeout is recorded as
     inconclusive resource evidence, never as a proof result.
7. Pinned Node controls: concrete pico GET/HEAD/OPTIONS/404 and the missing-index
   ENOENT compared with `PROPHET_NODE_BINARY` Node 24.21.0, using the existing
   `pico-static-server-reference.spec.ts` fixtures; no Test262 claim for a CLI
   schema. Native controls are benign fixtures only. Existing pinned native
   controls are validated before labeling red tests as missing features.

## 16. Ownership and split

- Proposed new file: `src/cli/environment.ts` (parser/validator/materializer/
  graph state).
- Minimal edits: `src/cli/arguments.ts` (flag), `src/cli/main.ts` (usage),
  `src/cli/runtime.ts` (order: environment first, then target `realpathSync`;
  wire facts, request factory, and `node.environment` host slot), `src/node/http.ts`
  (one zero-argument option, one branch, no counter).
- No solver, serializer, core-representation or host-semantics broadening. No
  split is required. If implementation grows, split parser/validation from
  CLI/provider wiring into two commits; keep one worker and full review.

## 17. Blockers and risks

1. `selectValue` of two strings returns an `ESString` with a `select` expression,
   so `deliverRequest`'s `isESString` check accepts it; confirm with a red spec
   rather than assuming.
2. `deliverRequest` rejects non-string `method`/`url`; the validator must reject a
   mixed-kind select before it reaches `deliverRequest`.
3. The zero-argument factory must not carry traversal-order state; confirm that
   fresh identities may differ across explored siblings and that no semantic
   input depends on order.
4. Validation and materialization must run before the target `realpathSync`;
   `runFile` order changes.
5. The existing `cli-arguments.spec.ts:45` expectation must be flipped; keep the
   rejection list otherwise intact.
6. `captureFileSystem` still performs host reads; if the environment is invalid
   those reads must not happen. Ordering (4) covers this.
7. The environment supplies facts, not handler glue: pico's listener is invoked
   through `events.emit` exactly as today. No function extraction or source
   recognition.
8. The `node.environment` host slot must encode cleanly: `values` is a `Map` of
   VM values, `requests` is a plain record, `provenance` is a plain record.

## 18. Gap reconciliation and review-correction index

- REPORT-001: gains explicit environment input and structured provenance in the
  `node.environment` graph host slot; full serialization/round trips/resumption
  remain open.
- HOST-002: the provider-input seam is automatic parsed-request input, still
  bounded to 0/1/2; general scheduling remains open.
- HTTP-001: parsed method/URL choices and concrete headers; wire parser/dispatch,
  bodies/streams and transport remain open.
- FS-002: descriptor availability and empty-path ordering overrides; tree,
  read-access facts, and full API/error/Stats gaps remain open.

Review-correction index (round 1):

1. **No native counter/ordinal** — §5 uses a zero-argument factory; no ordinal,
   no per-server state, traversal-order independence stated.
2. **Complete declared environment in graph state** — §6 adds the
   `node.environment` global host slot with the value `Map`, request-domain data
   and structured file identity; filesystem facts alias the same VM objects;
   no serializer change; round trip not claimed.
3. **Executable bounds** — §8 gives the bounded read strategy, strict parse,
   two-pass resolution, memoized compilation, saturating `MAX_WORK`/`MAX_DEPTH`,
   per-arrival `MAX_TEMPLATE_WORK`, and accepted/rejected boundary tests.
4. **Genuinely bounded schema** — §4 removes number expressions, rejects unknown
   keys at every level, documents empty sections, distinguishes raw NUL from
   escaped `\u0000`, accepts escaped lone surrogates, uses null-prototype header
   records, and removes speculative future path restrictions.
5. **Corrected acceptance matrix** — §15 uses text files for successful reads,
   tests EMFILE (not EACCES) from descriptor availability, expects the missing
   index ENOENT as a modeled thrown completion, and copies the pinned package
   unchanged into a temporary fixture.
6. **Correlation and scheduling coverage** — §15 adds shared-Boolean descriptor +
   URL/method selection, fresh per-arrival `/arm`/`/fire`, shared-URL
   non-fabrication, two eligible servers, and unknown-string siblings.
7. **Validation before the first target observation** — §8 orders environment
   validation before the target `realpathSync`, with a malformed-environment +
   nonexistent-target red test.

All 46 historical skips and the guard/assertion inventory are retained and must
be reconciled before publication; no complete upstream Node case is newly claimed.
