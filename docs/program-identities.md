# Captured program identities

P037 adds `roots.program` to the CLI's existing `{ roots, nodes }` graph. It
records launch facts and the identities of bytes actually acquired by the source
provider. A consumer can match an effect's known sourceFile against `sources`,
then verify supplied/reacquired bytes with SHA-256 and byte length before using
them as evidence. Local capture identity is not npm registry or lockfile integrity.

## Projection

```text
program = {
  runtime, filename, args, cwd,
  source: entry identity,
  sources: Map<absolute captured filename, { sha256, byteLength }>,
  paths: Map<absolute probed path, "file" | "directory" | "missing">
}
```

`filename` is the realpath-normalized entry, `cwd` the resolved launch directory,
`args` the declared target argument list, and `runtime` the chosen supported
profile. Recording arguments does not add process.argv support. `source` shares
its graph identity with `sources.get(filename)`. SHA-256 and byteLength refer to
original validated UTF-8 read bytes, including BOM, comments, CRLF and multibyte
characters; they are measured before parser/CommonJS preprocessing.

Sources include the entry, reached JS/JSON files and package configuration reads.
Paths include first positive and negative resolver observations. A `file` probe
can lack a source identity when reading/encoding subsequently failed. A missing
probe is a captured resolution fact, not an assertion that the path can never
exist. No publication-time filesystem re-read or re-hash occurs.

This root intentionally publishes identities without source text. It does not
promise a portable source archive or resumption. Existing interpreted-function
AST metadata elsewhere in the graph retains its own scope. Native runFile.input
continues to hold text for internal callers; the public builder does not read it.

## Acquisition versus execution

The published set is the final union of first observations reached across the
exploration, including paths that stopped. It is not execution history: reading
a module on one branch does not establish its execution on another. An uncalled
function's unreached require need not be acquired. Consult conditional effects,
activations and leaf states for execution, not membership in the source map.

This union is not a coherent time-zero OS snapshot, the complete npm dependency
graph, or proof that the files still contain those bytes. Acquisition remains
non-atomic and branch-shared; evaluation/cache state remains persistent per path.
Initial/current contexts are not retroactively modified to insert later capture
facts. Program and runtime are launch parameters to the core environment
transformation, so this separate ordinary graph root retains that distinction.

Normal results, guest throws, typed partial results and legacy analysis stops
publish the known acquired subset. Entry-acquisition/invocation errors before a
result exists retain exit 1/no graph. Malformed environment input still rejects
before target capture. Output contains no handwritten policy/limitation report.

## Snapshot and publication limits

The publisher copies maps, args and identity records, freezes records/args and
blocks ordinary map set/delete/clear calls. Entry aliasing survives. Later native
mutations of the capture maps/records cannot alter the public snapshot. Explicit
Map.prototype mutation and other hostile trusted-native behavior are not blocked;
this is not a security membrane or arbitrary-embedding validation API.

Preflight completes before copying public records/maps:

- At most 4,096 source identities, 16,384 path observations and 4,096 arguments.
- At most 4,194,304 aggregate UTF-8 metadata bytes: runtime,filename,cwd, each arg,
  every source key plus digest, and every path key plus kind. Repeated strings
  count per occurrence; the aliased entry record is not counted again.
- Digest is 64 lowercase hexadecimal characters; byteLength is a nonnegative
  safe integer. It is taken from the captured Buffer.length, never inferred from
  the parsed source or current filesystem contents.

Cheap container counts and code-unit bounds precede bounded UTF-8 length scans.
These are metadata-string bytes, not the exact JSON wire length: escaping and
container syntax can expand the output. Exactly-at-limit inputs are admitted.
Overflow fails publication with exit 1, stderr and empty stdout; no map entries
are silently omitted. The CLI finishes publication/encoding before writing.

These limits bound this added projection. Existing unbounded source reads,
parser/interpreter/AST/effect graph size, native recursion and general graph
serialization remain open resource gaps. A publication failure does not establish
that the analyzed program completed or lacked behavior.

## Verification and remaining work

[Core specs](../test/cli-program.spec.ts),
[real CLI integration](../test/cli-program-integration.spec.ts),
[independent review probes](../test/cli-program-review.spec.ts), and
[task evidence](agent-tasks/P037-program-identities/task.md) cover limits, snapshots,
byte identities, aliases and partial/conditional acquisition. No Test262/Node
language semantics changed and no new upstream selection is claimed.

Package-instance/lockfile mapping, dependency edges, model fingerprints, stable
cross-run execution IDs, original-artifact integrity and source coordinates
remain separate work. P036's unknown eval/generated filenames remain unknown;
a source-map lookup must not substitute an ancestor's filename. Permissions,
admission caches and behavior verdicts belong to downstream consumers.
