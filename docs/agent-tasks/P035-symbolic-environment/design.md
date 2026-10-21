# P035 design — explicit symbolic starting inputs through the CLI

**Status: design only.** This document proposes the bounded `--environment`
input surface and its semantics. No production or test files have been changed
yet. After orchestrator review, the first implementation stage is red specs, then
generic code. Do not treat any claim here as implemented.

Owner clarification (2026-10-21): the downstream consumer grants package and
deep-dependency capabilities (network domains, filesystem, subprocesses) and
prompts on new possible behavior with provenance and conditions. The VM stays
policy-agnostic. P035 is the bounded **environment input prerequisite**: it
declares starting facts. It does not grant, classify or approve anything, and it
adds no permission or verdict fields.

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
- Validation, budgets, default/omitted meanings, arrival semantics, provenance,
  identity/correlation rules, and relative-path resolution.
- An executable red-spec plan.

Out of scope (explicit boundaries, each a later increment):

- `process.env`, `process.argv`, `process.cwd` authoring (PROCESS-001).
- Bind-profile authoring (host/port/availability), which stays
  `symbolicTCPBind`; `process` is not a v1 top-level key.
- Closed filesystem trees (`filesystem.tree`); v1 uses the automatic open
  read-only acquisition plus the two fact overrides.
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
- `runFile` (`src/cli/runtime.ts:56`) captures sources first
  (`captureModuleSources`), then `captureFileSystem({ cwd })`, then builds the
  process/path/url/console/filesystem/http models and runs.
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
  string values and allocates fresh request/response identities.
- `createExternalEvents` (`src/external-events.ts:29`) registers one provider per
  server; eligibility is the listening state; `step`/`explore` bound arrivals to
  0/1/2 and preserve shorter histories and waiting alternatives.
- `selectValue` (`src/symbolic/index.ts:899`) resolves a concrete condition or
  returns a VM value carrying a `select` expression. A select of two strings is
  an `ESString`; a select of two Booleans is an `ESBoolean`. A choice of mixed
  types is a `choice` node.
- `ESString()`/`ESBoolean()` create fresh host-side VM values with unique ids;
  the existing `deliverRequest` already creates them inside a host operation, so
  this is the established pattern.

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

A single strict JSON object:

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

All top-level sections except `version` are optional. Unknown top-level keys are
rejected.

### Value expressions

`<valueExpr>` is one of:

| Form | Meaning |
| --- | --- |
| `true`, `false` | concrete Boolean |
| `"<text>"` | concrete UTF-8 string |
| number | concrete number (reserved for future fields) |
| `{ "symbolic": "boolean" }` | fresh unknown Boolean |
| `{ "symbolic": "string" }` | fresh unknown string |
| `{ "ref": "<name>" }` | shared named value (identity preserved) |
| `{ "select": { "condition": <expr>, "then": <expr>, "else": <expr> } }` | Boolean-selected finite choice |

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
prototype pollution through names is impossible. Duplicate names in the JSON
reject (strict parser).

## 5. Materialization into VM values

`src/cli/environment.ts` (new) compiles the file into:

- `shared: Map<string, Any>` of VM values;
- `filesystem: { descriptorAvailable?: TESBoolean; emptyPathBeforeOpenDescriptorCheck?: TESBoolean }`;
- `requestInput: (arrival: number) => { method: TESString; url: TESString; headers?: Record<string, string> }`.

Materialization rules:

- `values[name]` is compiled in dependency order. References resolve against the
  map. A reference to a name being evaluated (cycle) rejects. A reference to a
  missing name rejects.
- A `select` requires a Boolean condition and then/else of the same value kind.
  For strings and Booleans it uses `selectValue`. A mixed-kind select rejects
  (rather than becoming an unusable `choice` for method/url).
- `http.requests` compiles to a function. On each call it walks the template and
  creates fresh `ESString()`/`ESBoolean()` for inline symbolic leaves, reuses
  `shared` for refs, and uses `selectValue` for selects. The function is called
  from inside the HTTP provider operation, so the fresh values enter the branch
  heap through the normal `writeProperty` path used by `deliverRequest`.
- No native/eval code is involved. JSON data is compiled to VM value objects
  only.

### Provider-input seam (`src/node/http.ts`)

Add one option and one counter, keeping all existing behavior when omitted:

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
  requestInput?: (arrival: number) => IncomingRequestInput; // NEW
};
```

`incomingRequest` becomes:

```ts
let arrival = 0;
const incomingRequest = operation("http.server.incomingRequest", (call, context) => {
  const input = requestInput === undefined
    ? { method: ESString(), url: ESString() }        // unchanged default
    : requestInput(arrival++);
  return deliverRequest(call.receiver, input, context).result;
});
```

- `deliverRequest`'s existing header validation (lowercase token names, concrete
  string values) is reused unchanged; the environment factory produces exactly
  the shape `deliverRequest` already accepts.
- The counter is per-`createHTTPModel` instance, so separate runs/tests do not
  share it. It is host bookkeeping, not VM state.
- Embeddings calling `deliverRequest` directly are unaffected.

## 6. Filesystem fact injection

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
perform writes, and does not force access success.

## 7. Validation and budgets

Validation is a separate, total phase that completes **before**
`captureModuleSources`/`captureFileSystem` and before the target is interpreted.
A malformed environment therefore reports an invocation error (exit 1) and never
a target-acquisition error.

Ordered checks:

1. Read the file: must exist, be a regular file, be valid UTF-8, contain no NUL,
   and be at most **256 KiB**.
2. Strict JSON parse: reject trailing content, duplicate object keys, and a BOM.
3. Top-level shape: object with `version` and only the whitelisted sections.
   `version` must equal `1`.
4. Names: identifier shape, no reserved names, no duplicates.
5. Value expressions: known forms only; refs resolve; no cycles; type agreement
   for selects; filesystem facts Boolean; method/url string-valued; header names
   lowercase tokens and header values literal strings.
6. Budgets (reject when exceeded, counted before host work):
   - at most **4096** value-expression nodes total;
   - at most **32** expression depth;
   - at most **64** `select` nodes (choice expansion);
   - at most **256** named values;
   - at most **64 KiB** total literal string bytes, **16 KiB** per string;
   - at most **64** headers, **255** bytes per name, **8 KiB** per value;
   - file bytes at most **256 KiB**.
7. No prototype pollution: names are never used as object property keys.

Empty inputs are bounded by the same checks (a zero-node file is invalid because
`version` is required). These are input validation budgets, not execution budgets
and not a narrowing of the modeled input domain.

## 8. Default and omitted meanings

| Situation | Meaning |
| --- | --- |
| `--environment` omitted | Current behavior exactly. |
| `values` omitted/empty | No shared values; every fact uses its default. |
| `filesystem.descriptorAvailable` omitted | `ESBoolean()` (unknown). |
| `filesystem.emptyPathBeforeOpenDescriptorCheck` omitted | Existing default (Linux unknown; Darwin false). |
| `http.requests` omitted | Fresh independent unknown method/URL per arrival. |
| `http.requests.headers` omitted | No headers. |
| `--max-events 0` with a request template | Template validated, never materialized; zero-arrival/waiting preserved. |

The environment declares a **domain**, not an arrival. It never forces an arrival,
a successful bind, a successful read, or successful transport.

## 9. Identities, correlations and arrivals

- A named value used in `filesystem` and in an `http.requests` select condition
  is the same VM object id, so a pico read outcome and a response choice stay
  correlated across branches.
- Fresh per-arrival leaves are distinct objects per arrival, preserving the
  existing independence of arrival 0 and arrival 1.
- `--max-events 2` materializes the template twice against the same shared values
  and the current (post-first-arrival) context, so invocation-time state such as
  a handler `armed` flag is preserved and shorter histories remain.
- The environment never recognizes function names or source text. It only
  supplies values.

## 10. Relative path resolution

- The `--environment` path is resolved against the process cwd (`cwd` passed to
  `runFile`), not the target script's directory. It must resolve to an existing
  regular file after resolution; relative spellings are accepted at the CLI but
  the file is read by its resolved absolute path.
- v1 has no other path-valued field. If a future field adds paths (tree,
  `process.env`, etc.), they must be absolute canonical POSIX paths resolved
  against the captured cwd, with NUL, `..`, relative, and UNC forms rejected.

## 11. Provenance

- `parseEnvironment` returns a provenance record: resolved path, `version`,
  SHA-256 of the file bytes, and the sorted declared value names.
- This record is stored in `FileExecution.input` (the existing internal
  provenance container, `src/cli/runtime.ts:38`), which is not part of the
  serialized stdout graph.
- Captured facts (cwd, platform, acquired tree entries) keep their existing
  provenance in the acquisition adapter. Declared facts keep the environment file
  as their provenance.
- No provenance prose, model-domain text, or backlog ID is written into graph
  nodes. Serializing a structured provenance root is a REPORT-001 increment and
  is deliberately not part of P035.

## 12. Modeled state retention

- Materialized values are ordinary VM values in the persistent heap, retained in
  `roots.initial`/`roots.current` and correlated by branch knowledge.
- The automatic capture retains open/unobserved entries and unknown contents.
- Bind stays symbolic (`symbolicTCPBind`); failure retains the Error with unknown
  fields. The environment does not supply bind outcomes in v1.
- Successful transport remains the existing declared schedule; the environment
  does not declare transport outcomes.
- Reached unsupported siblings are retained: an open symbolic URL, an unknown
  method, a missing-index ENOENT escaping the handler, or a bound-server waiting
  alternative.
- The environment file itself is not stored as graph prose; only its materialized
  values are.

## 13. Excluded fields and why

| Excluded | Reason |
| --- | --- |
| `process`, `process.env`, `process.argv`, `cwd` authoring | Separate PROCESS-001 increment; v1 top-level whitelist rejects `process`. |
| Bind host/port/profile | Stays `symbolicTCPBind`; HTTP-001/HOST-002. |
| `filesystem.tree` (closed tree) | Separate increment; v1 uses automatic open acquisition. |
| Arbitrary heap/closure state | REPORT-001 resumption, not an input prerequisite. |
| `http.requests` bodies, streams, transport | HTTP-008 and the declared transport schedule. |
| Capability/permission/policy/verdict fields | Owner clarification: consumer-owned; VM stays policy-agnostic. |
| Backlog IDs / test-inspection prose | Never part of core state or graph nodes. |

## 14. Red-spec plan (executable, after design acceptance)

New specs (names avoid the existing `cli-node-environment` process-env spec):

1. `test/cli-environment-arguments.spec.ts`
   - `--environment <path>` accepted once in any order; path preserved.
   - Reject missing value, duplicate, value `--`, and `--help` combined with it.
   - Update the existing rejection case `test/cli-arguments.spec.ts:45` to an
     acceptance case (this is a required red-spec change).
2. `test/cli-environment-validation.spec.ts`
   - Valid minimal schema passes.
   - Reject wrong version, unknown top-level key, unknown value name, cyclic ref,
     missing ref, duplicate name, reserved/non-identifier name, non-Boolean
     filesystem fact, non-string method/url, bad header name, non-string header
     value, over-budget file/nodes/depth/choices/strings, malformed JSON,
     duplicate JSON keys, non-UTF8, directory, missing file.
   - A malformed environment plus a missing script yields the environment error
     (exit 1), never a target-acquisition error.
3. `test/cli-environment-request.spec.ts` (subprocess, real pico)
   - No-env regression unchanged (startup ready/failed).
   - Concrete `GET /image.jpg` with descriptor available completes a real
     captured read and 200.
   - Concrete `GET /missing` completes 404.
   - Symbolic `descriptorAvailable` retains EMFILE/EACCES and 200 alternatives.
   - Symbolic method/URL retains the existing open-symbolic-URL unsupported
     sibling.
   - Unknown method classification (405/200) and HEAD body suppression.
   - Zero-arrival waiting preserved with a request template and `--max-events 0`.
   - Two arrivals preserve invocation-time state and shorter histories (reuse an
     existing `/arm`-`/fire` app or add one inline source in the spec).
   - Identity/correlations: one named Boolean drives both descriptor availability
     and a request method choice.
4. `test/cli-environment-graph.spec.ts`
   - Graph round-trips materialized values and shared references.
   - No prose, backlog ID, or test-inspection field appears in any node.
5. Pinned Node controls: concrete pico GET/HEAD/OPTIONS/404 compared with
   `PROPHET_NODE_BINARY` Node 24.21.0; no Test262 claim for a CLI schema.

## 15. Ownership and split

- Proposed new file: `src/cli/environment.ts` (parser/validator/materializer).
- Minimal edits: `src/cli/arguments.ts` (flag), `src/cli/main.ts` (usage),
  `src/cli/runtime.ts` (order: environment first, then capture; wire facts and
  request factory), `src/node/http.ts` (one option, one counter, one branch).
- No solver, serializer, core-representation or host-semantics broadening. No
  split is required. If implementation grows, split parser/validation from
  CLI/provider wiring into two commits; keep one worker and full review.

## 16. Blockers and risks

1. `selectValue` of two strings returns an `ESString` with a `select` expression,
   so `deliverRequest`'s `isESString` check accepts it; confirm with a red spec
   rather than assuming.
2. `deliverRequest` rejects non-string `method`/`url`; the validator must reject a
   mixed-kind select before it reaches `deliverRequest`.
3. The fresh-value counter must be per-model-instance, not module-global, to keep
   tests isolated.
4. Validation must run before `captureModuleSources` (currently the first host
   observation); `runFile` order changes.
5. The existing `cli-arguments.spec.ts:45` expectation must be flipped; keep the
   rejection list otherwise intact.
6. `captureFileSystem` still performs host reads; if the environment is invalid
   those reads must not happen. Ordering (4) covers this.
7. The environment supplies facts, not handler glue: pico's listener is invoked
   through `events.emit` exactly as today. No function extraction or source
   recognition.

## 17. Gap reconciliation

- REPORT-001: gains explicit environment input and provenance-in-`input`; full
  serialization/round trips/resumption remain open.
- HOST-002: the provider-input seam is automatic parsed-request input, still
  bounded to 0/1/2; general scheduling remains open.
- HTTP-001: parsed method/URL choices and concrete headers; wire parser/dispatch,
  bodies/streams and transport remain open.
- FS-002: descriptor availability and empty-path ordering overrides; tree,
  access policy and full API/error/Stats gaps remain open.

All 46 historical skips and the guard/assertion inventory are retained and must
be reconciled before publication; no complete upstream Node case is newly claimed.
