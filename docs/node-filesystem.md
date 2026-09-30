# Node filesystem compatibility and proof boundary

The reference is **Node v24.21.0**, commit
`955266bfdd854cd280dffd47548673914484e4c0`. The public operations follow the pinned
[`lib/fs.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/fs.js)
and [Stats/path utilities](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/internal/fs/utils.js).
Filesystem compatibility is host coverage, separate from Test262 language
coverage. An explicit filesystem environment is not a snapshot of the machine
running Prophet unless an embedding actually supplies and validates that snapshot.

## One shared symbolic filesystem state

`createFileSystemModel({ root, cwd? })` exposes `.module` for registration as
`fs` (including the loader's `node:fs` alias) and `inspectRoot(context)` for host
inspection. `fileSystemDirectory(entries)` builds a closed directory:
unlisted names and `ESNull` mean missing. `fileSystemFile(text)` supplies a readable
regular file containing concrete UTF-8 text. The default cwd is `/`; a supplied
cwd must be a canonical absolute directory that exists on every setup path.

The state can be symbolic. The [state specs](../test/filesystem-state.spec.ts)
use the same choices as other VM values, for example:

```ts
const present = ESBoolean();
const root = fileSystemDirectory({ site: fileSystemDirectory({
  "data.txt": selectValue(present, fileSystemFile("hello 😀"), ESNull)
}) });
```

Here one unknown Boolean determines whether the file exists. An existence check,
stat and later read all consult that same tree and branch knowledge. On the
present branch, stat identifies a file and the UTF-8 read returns its text; on
the absent branch, the read throws ENOENT. Repeating existsSync does not invent
a new independent outcome. The relationship is provable while existence itself
remains unknown. Other specs choose a file versus a directory or choose between
whole roots. Finite alternatives may also contain different concrete contents;
open file contents are not currently supported.

Internally the model stores its root in a private persistent VM object. Entry
graphs are immutable, helper-created VM values; choices retain their original
conditions. Invalid entry graphs, cyclic setup and non-directory roots reject
configuration instead of inventing a valid tree. Interpreted code cannot mutate
or inspect those private entry fields. `inspectRoot` returns the actual root
representation to the embedding, not a newly sampled filesystem.

## Paths, observations and failures

The [compatibility specs](../test/node-filesystem.spec.ts) compare supported
operations with independent pinned Node fixtures. Paths are strings or choices
with concrete string leaves. The model accepts absolute paths and relative paths
against its declared cwd. It traverses components in order, including before
`.` and `..`: a missing or non-directory prefix is not erased by lexical
normalization. Trailing slash requires a directory. These filesystem operations
are distinct from the lexical [path model](node-path.md).

Names and string paths pass through UTF-8 encoding, including replacement of lone
UTF-16 surrogates. The closed namespace is case-sensitive and does not normalize
Unicode. Names must be single components; collisions after UTF-8 replacement
reject setup. The supported small-path domain uses at most 255 bytes per
component and fewer than 1024 bytes for the absolute traversal spelling.
Longer inputs stop analysis rather than being reported missing.

Supported operations are:

- `existsSync(path)`: returns true for an existing file/directory, false for a
  missing/non-directory traversal or a string containing NUL.
- `statSync(path)` with omitted/undefined options: returns a partial Stats value
  exposing shared `isDirectory` and `isFile` methods. Methods may be borrowed
  between modeled Stats receivers; arbitrary receivers, mode/_checkModeProperty
  changes, other fields, constructors and descriptor reflection remain guarded.
- `readFileSync(path, "utf8")` or `"utf-8"`: reads the supplied UTF-8 text or
  returns a supported throwing completion. Omitted, undefined or null options
  return a fresh [partial Buffer value](node-buffer.md) on success, preserving
  byte length, indexed bytes, numeric writes and UTF-8 decoding. Mutating that
  result changes neither the declared file nor another read's bytes.

The selected Linux/macOS error behavior exposes code, negative errno, syscall,
message and path where Node provides it. Missing paths yield ENOENT;
non-directory traversal yields ENOTDIR. stat errors use syscall `stat`, and
read-open failures use `open` with the original UTF-8-repaired spelling, not a
normalized replacement. Reading a directory yields EISDIR with syscall `read`
and no path field. NUL-containing stat/read paths yield a coded TypeError with
an unknown diagnostic message; existsSync instead returns false. Error stack,
constructor and complete descriptors remain guarded.

Calls, returns and throws are ordered effects with their path knowledge.
No real filesystem operation occurs during symbolic exploration. Concrete
reference specs create their own isolated fixtures; they do not supply return
values to the symbolic calls.

## Declared environment and residual gaps

The tree describes a stable, closed namespace of readable regular files and
directories. It excludes symlinks, namespace races, permission denial and
resource failures. Linux/macOS read/error behavior is selected explicitly;
directory reads on AIX/FreeBSD and other platform rules differ. Case folding,
Unicode-normalizing filesystems, arbitrary byte contents, open symbolic names
and unbounded trees remain separate work.

Stable contents do not imply all real filesystem metadata is unchanged: reading
can update access timestamps. Metadata/atime effects, descriptor allocation and
ownership, open/read/close failures, partial I/O, cancellation and concurrent
changes remain unmodeled. Stats metadata guards keep those observations outside
the current proof domain. Successful text and Buffer reads assume the declared
readable data and successful required resource operations; they do not prove
operating system availability.

Other APIs, asynchronous/promises/stream operations, writes, Buffer/typed-array
or URL path arguments, file descriptors, richer encodings and options remain
gaps. Non-string path diagnostics, including existsSync's DEP0187 warning,
reject analysis. Partial Stats is not full mode/Date/BigInt/metadata behavior.
Ordinary default read options can inherit fields, and default readFileSync uses
mutable exported helpers: unmodeled inherited option fields or replacement of
openSync/readSync/closeSync are guarded rather than ignored. The model also
conservatively guards fstatSync replacement; pinned readFileSync itself uses an
internal fstat binding rather than the exported method.

The slow/default read path also assumes Node's Buffer allocation and internal
primitives are unchanged. Public Buffer constructors/allocators are not yet
exposed to interpreted code. A nonempty file calls Buffer.allocUnsafe(size);
an empty file calls allocUnsafe(8192) and then Buffer.concat. Node may allocate
before a directory read reports EISDIR. Resource failures are excluded here;
future allocator support must preserve replacement effects and throws rather
than bypassing them, including on paths that ultimately fail.

These limits belong to FS-001/FS-002 and BUFFER-001/BUFFER-002 in the
[implementation backlog](implementation-gaps.md).
The CommonJS loader still resolves its supplied source graph independently;
registering this module does not silently make require disk-backed.

## Result in the unchanged server

The [full-module analysis specs](../test/pico-static-server-analysis.spec.ts)
now run the actual GET and HEAD listeners with request URL `/docs`, staticPath
`/site` and one symbolic filesystem entry. `/site/docs` is either missing or an
empty directory, selected by an unknown `directoryExists` Boolean. The same tree
feeds every filesystem call:

- If the directory is missing, existsSync is false and the original source
  completes a 404 response with an empty body.
- If it exists, stat identifies a directory, the original code appends
  `index.html`, and readFileSync throws ENOENT for `/site/docs/index.html` with
  syscall `open`. The exception escapes the registered request listener. No
  writeHead runs; headersSent and writableEnded are both false.

Both paths and their conditions are retained, while directoryExists remains
unknown after merging. The source's later `data instanceof Error` branch cannot
handle this failure because no data value returns. Under the declared absence
of a process exception-recovery hook, this is the unhandled-exception condition
already reproduced by the independent native reference. Prophet now reproduces
it symbolically through unchanged source; it is not a novel vulnerability claim
or an automated counterexample-generation result.

The former missing-path lookup cases now compute `/site/missing` and complete
404 through the shared filesystem model. Source placement still determines
whether DEP0169 is suppressed (installed package) or queued (checkout), with
warning delivery separate from the handler. No real socket, file operation or
stdout/stderr write occurs in the symbolic run.

Readable regular-file and existing directory-index GET/HEAD cases now return
the shared Buffer value from readFileSync. The original handler's actual `data`
binding is observed without supplying results or changing control flow; byte
length, indexed contents and UTF-8 decoding are checked. Execution then stops
explicitly at `data instanceof Error`. Successful file serving still needs that
shared language operator, path.parse and response-write behavior.
The entire server is not analyzed for every file, request or environment.

## Complete upstream cases reviewed

These complete files were reviewed at the pinned revision. Their filesystem
fixtures, setup, asynchronous cases and platform branches are part of the tests;
matching one local synchronous operation does not activate an upstream file.

- [`test-fs-exists.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-fs-exists.js)
  combines existsSync with asynchronous exists, URL/object/absent arguments,
  DEP0187 invalid-type warning expectations, and the common/assert harness.
- [`test-fs-existssync-false.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-fs-existssync-false.js)
  creates a long directory path using recursive mkdir, then checks synchronous
  existence and asynchronous access. It also needs path.resolve, tmpdir setup,
  loops and the common/assert harness; the historical Windows concern stays in
  the complete case.
- [`test-fs-stat.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-fs-stat.js)
  mixes stat/lstat/fstat, callbacks and descriptors, full numeric fields and Date
  properties, all type predicates, public Stats construction with DEP0180,
  mutation, invalid inputs and throwIfNoEntry options. Two type predicates alone
  do not cover this file.
- [`test-fs-stat-bigint.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-fs-stat-bigint.js)
  additionally needs BigInt/time conversions, hrtime, symlinks, writes, file
  descriptors, callbacks/promises and FileHandle operations, with real timestamp
  comparisons and mutable Date fields.
- [`test-fs-read-file-sync.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-fs-read-file-sync.js)
  includes a UTF-8 corpus and append-mode file creation across several encodings,
  Buffer conversion, process.umask and stat mode checks. It is not a read-only
  fixture that can be activated by its first UTF-8 assertion.
- [`test-fs-readfile-fd.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-fs-readfile-fd.js)
  requires open/read/close/write, Buffer allocation/conversion, asynchronous
  callbacks and persistent descriptor positions. Replacing fd reads with fresh
  path reads would change the behavior under test.
- [`test-fs-readfile-buffer-option.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-fs-readfile-buffer-option.js)
  exercises user buffers and buffer-producing callbacks, internal binding
  replacement, unknown file sizes, size failures, and synchronous/asynchronous
  paths. It needs Buffer operations, promises, Reflect and the real harness.
- [`test-fs-readfile-error.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-fs-readfile-error.js)
  runs an actual child-process fixture and checks stderr/stack behavior, plus
  asynchronous readFile argument diagnostics. Its AIX/FreeBSD exclusion also
  demonstrates why directory-read errors cannot be inferred from the word POSIX
  alone.
- [`test-fs-readfile-flags.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-fs-readfile-flags.js)
  creates files, exercises asynchronous reads with create/exclusive/default
  flags and verifies EEXIST/ENOENT. A fixed read-only tree does not supply those
  state transitions.
- [`test-fs-read-file-assert-encoding.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-fs-read-file-assert-encoding.js)
  is small but checks the asynchronous readFile API, callback validation and an
  invalid encoding through common/assert; it is not a readFileSync test.

The misleadingly named
[`test-fs-readfilesync-enoent.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-fs-readfilesync-enoent.js)
actually checks Windows realpath behavior for fileserver/drive paths, including
asynchronous realpath and os.hostname. It is not evidence for a missing-file
readFileSync case. None of these complete files is currently activated or
counted passing, and none is trimmed to an easier fragment.
