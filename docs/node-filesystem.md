# Node filesystem compatibility and proof boundary

The reference is **Node v24.21.0**, commit
`955266bfdd854cd280dffd47548673914484e4c0`. The public operations follow the pinned
[`lib/fs.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/fs.js)
and [Stats/path utilities](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/internal/fs/utils.js).
Filesystem compatibility is host coverage, separate from Test262 language
coverage. Explicit trees remain supplied environments. The read-only acquisition
adapter below can supply observed host facts without closing the unseen namespace.

## One shared symbolic filesystem state

`createFileSystemModel({ root, cwd?, fileDescriptorsAvailable?, platform? })` exposes `.module` for registration as
`fs` (including the loader's `node:fs` alias) and `inspectRoot(context)` plus `inspectFileDescriptorsAvailable(context)` for host
inspection. `fileSystemDirectory(entries)` builds a closed directory:
unlisted names and `ESNull` mean missing. `fileSystemFile(text, { readable? })` supplies a regular file containing concrete
UTF-8 text. Directory helpers also accept `{ readable?, searchable? }`. These are
VM Booleans, including unknown Booleans and ordinary symbolic choices; omitted
access flags and descriptor availability explicitly select the healthy assumption.
`state` exposes the persistent root, cwd, platform and descriptor availability.
Entry host slots retain kind, effective access and directory completeness as
modeled facts, separate from guest-accessible properties.
`platform` selects `"linux"` (the default) or `"darwin"`; it is not inferred from
the machine running Prophet. The default cwd is `/`; a supplied
cwd must be a canonical absolute directory that exists on every setup path.
That structural check does not assume access. Relative operations start from the
already-held cwd directory, so inaccessible ancestors do not block them; absolute
operations still traverse from root.

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
normalization. Trailing slash requires a directory but does not itself demand that final
directory's search access. An explicit `/.` does. These filesystem operations
are distinct from the lexical [path model](node-path.md).

Names and string paths pass through UTF-8 encoding, including replacement of lone
UTF-16 surrogates. The closed namespace is case-sensitive and does not normalize
Unicode. Names must be single components; collisions after UTF-8 replacement
reject setup. The supported small-path domain uses at most 255 bytes per
component and fewer than 1024 bytes for the absolute traversal spelling.
Longer inputs stop analysis rather than being reported missing.

Supported operations are:

- `existsSync(path)`: returns true for an existing file/directory, false for a
  missing/non-directory/inaccessible traversal or a string containing NUL.
  False therefore does not prove that a file is absent.
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
Closed-tree embeddings perform no real filesystem operations. The optional
acquisition adapter makes read-only observations when unknown state is first
needed; guest operations still execute through this shared model. Concrete
reference specs create their own isolated fixtures.

## Read-only environment acquisition

The CLI now constructs this adapter automatically, registers its module as
`fs`/`node:fs`, and links its persistent state through `global.hostSlots["node.fs"]`.
[CLI specs](../test/cli-filesystem.spec.ts) preserve text/missing/resource outcomes
and verify subprocess graph output. Source acquisition stays separate.

[`captureFileSystem({ cwd, ... })`](../src/cli/filesystem-capture.ts) is a trusted
host adapter, separate from the VM filesystem model and CommonJS source capture.
It returns the model's module, state and inspectors for runtime assembly.
Automatic future HTTP requests and URL/path integration remain separate work.

The adapter records the canonical identity of the already-held cwd and the
actual Linux/Darwin platform, then acquires only the cwd ancestor chain and
reached path components. `fileSystemDirectory(children, { complete: false })`
represents an open directory: omitted names are unobserved, while an explicit
`ESNull` is observed absence. Generic `observeEntry` and `observeContents` hooks
can acquire new facts. Without a hook, an unobserved operation stops analysis.
The cwd chain must already be observed when constructing the model.
`fileSystemUnobservedFile` retains file identity with unknown text; metadata
operations do not read or decode file bytes. Directory entry metadata includes
`complete: false`, so serialized state cannot mistake an unvisited sibling for
an absent file. Unknown file text is distinct from the concrete empty string.

First entry, access, content and negative observations are memoized by component
identity across branches. Reached child entries and contents enter the persistent
VM heap, leaving earlier contexts unchanged. A branch join preserves conditional
observation presence; subsequent operations acquire the same cached fact on paths
where it was previously unobserved. Relative/absolute and dot-component spellings
reach the same entries without erasing prefix ENOENT/ENOTDIR failures. A cached
negative remains negative after an external file is created. A sibling not yet
observed can be discovered later. This is a stable observational domain assembled
on demand, **not an atomic point-in-time snapshot** or a claim about future host
changes. Native acquisition caches and hooks are not resumable serialized state.

Acquisition uses lstat and rejects symlink components, detected filename aliases,
nonregular entries and unsupported platforms. It performs no writes or native
execution of the target. File reads use a bounded buffer, O_NOFOLLOW on the final
component, and metadata comparisons before and after reading. Detected changes,
unexpected stat/access/open/read/close errors, and malformed UTF-8 stop analysis;
they are never converted to absent paths, guest ENOENT, empty contents or decoded
replacement bytes. Binary files can exist/stat, but both Buffer and text reads
retain the UTF-8 capture boundary. These checks do not make ancestor traversal
race resistant, establish symlink containment, or exclude undetected changes.

Default budgets are 4,096 entry probes (including cwd ancestors), 1 MiB per file
and 8 MiB total content bytes. Positive-safe-integer overrides are embedding
configuration. Reads may inspect one extra sentinel byte to detect growth;
failed attempts retain their error and do not silently retry against changed
state. No directory enumeration or recursive subtree scan occurs. AST budgets
do not replace these bounds, and neither bounds filesystem-call latency.

Effective read/search flags come from native access checks. An observed EACCES
becomes denied access; unexpected errors remain acquisition failures. Different
real/effective uid or gid is rejected because access checks and later opens need
not otherwise consult the same credentials. This does not model ACL policy,
capabilities, namespace races or future credential/access changes. A successful
access check does not guarantee every future open/read/close will succeed.
Descriptor availability defaults to an unknown VM Boolean; a successful adapter
read does not establish the target's later capacity. An embedding can explicitly
supply a Boolean for a declared resource domain. The existing post-open success
assumptions and uncoupled HTTP/filesystem resource pools remain.

The [capture specs](../test/filesystem-capture.spec.ts) compare interpreted file,
missing path, directory/default-file, prefix traversal and effective permission
behavior against independent pinned Node fixture runs. They also cover persistent
and repeated observations, unknown capacity, binary/symlink/nonregular boundaries,
injected acquisition errors, budgets and post-join symbolic reads. These are local
host compatibility checks; no complete upstream Node file is newly activated.

## Effective access and descriptor availability

The [failure specs](../test/filesystem-failures.spec.ts) use ordinary symbolic
Booleans as stable facts about this process and its environment:

```ts
const readable = ESBoolean();
const available = ESBoolean();
const root = fileSystemDirectory({ "data.txt": fileSystemFile("hello", { readable }) });
const filesystem = createFileSystemModel({ root, fileDescriptorsAvailable: available });
```

Here existsSync/statSync succeed on `data.txt` regardless of the two unknowns.
A read throws EMFILE if no descriptor is available, EACCES if a descriptor is
available but reading is denied, and returns the bytes otherwise. Repeated reads
consult the same facts; catching an error can establish the relevant input facts.
The original unknowns remain unknown after merging. Successful synchronous reads
restore the same declared baseline; this is not a descriptor counter or a model
of concurrent allocations. The baseline applies at modeled filesystem calls;
it is not a process-wide pool shared with HTTP listen/accept. The native server
witness exhausts descriptors after accepting the request. Cross-module resource
coupling remains FS-001/HTTP-001, and startup still has its separate success assumption. Inspection of earlier contexts is unchanged.

Directory search access is checked before each further component, including
`.` and `..`, before deciding whether a child exists. Its own final metadata can
still be inspected without its search/read access. Directory read access is
independent: traversal may succeed while opening the directory for a read throws
EACCES, before the later EISDIR outcome. Entry metadata is private and separate
from filenames such as `readable` or `searchable`.

These inputs describe **effective access**, not an implementation of permission
bits, ownership, groups, ACLs, capabilities, or Node's permission subsystem. A
caller connecting the model to a real deployment must establish those inputs.
They are not independently chosen return values for each API call.

EACCES and EMFILE errors retain code, negative errno, original UTF-8 path,
syscall `open` (or `stat` for denied stat traversal), message and fresh identity.
NUL validation precedes resource access. For a nonempty supported path,
per-process descriptor exhaustion precedes path traversal. Empty filenames are
platform dependent: Linux yields ENOENT before allocating a descriptor; Darwin
can yield EMFILE first. Overlong inputs retain an analysis boundary, even when
capacity is unavailable, because kernel name validation has its own priority.

The independent [native failure specs](../test/node-filesystem-failures-reference.spec.ts)
use real chmod permissions and bounded descriptor exhaustion in isolated pinned
Node children, including restoration after close. Full server references also
reproduce EACCES/EMFILE escaping the unchanged listener for GET and HEAD of an
existing index, and the application's 404 for an inaccessible child.

## Declared environment and residual gaps

Explicit closed trees describe a stable namespace of regular files and
directories, with symbolic effective access and descriptor availability. Open
observational trees retain unacquired names/contents and the capture boundaries
above.
It excludes symlinks, namespace races, credential/access changes and concurrent
resource allocation. Linux/macOS read/error behavior is selected explicitly;
directory reads on AIX/FreeBSD and other platform rules differ. Case folding,
Unicode-normalizing filesystems, arbitrary byte contents, open symbolic names
and unbounded trees remain separate work.

Stable contents do not imply all real filesystem metadata is unchanged: reading
can update access timestamps. Metadata/atime effects, descriptor identities and
ownership, post-open fstat/read/close failures, partial I/O, cancellation,
process-wide transitions, ENFILE and allocation failures remain unmodeled.
Successful reads assume the later resource operations succeed, including closing
the temporary descriptor; an EACCES/EMFILE open failure creates no descriptor.
An EISDIR result still assumes successful allocation/cleanup on that read path.
Stats guards keep unmodeled metadata observations outside the proof domain.

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
before a directory read reports EISDIR. Allocator failures are still excluded here;
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
length, indexed contents and UTF-8 decoding are checked. Shared `instanceof`
now proves the Buffer is not an Error. The actual success branch uses path.parse
for MIME selection, commits status 200 and completes write/end/finish under the
declared successful transport schedule. The original reversed writeHead arguments
still discard the intended MIME/length headers. Symbolic index presence now
classifies success versus escaping ENOENT, including GET/HEAD body suppression.
One new full-module proof combines unknown GET/HEAD, search access to the static
root, index read access and descriptor availability. It preserves all sixteen
assignments in one symbolic execution: failed traversal produces 404; otherwise
EMFILE takes priority over read denial, then EACCES, then status 200 with the
appropriate GET/HEAD body. Throwing paths retain the attempted read and unfinished
response, with no substituted 500. Healthy startup/stdout/transport, a stable
tree and successful post-open operations remain assumptions. The entire server
is not analyzed for every file, request or environment.

## Complete upstream cases reviewed

These complete files were reviewed at the pinned revision. Their filesystem
fixtures, setup, asynchronous cases and platform branches are part of the tests;
matching one local synchronous operation does not activate an upstream file.

The separate [failure references](../test/node-filesystem-failures-reference.spec.ts)
exercise real OS permission denial and descriptor exhaustion. They create
isolated fixtures, drop the child uid when the runner is root, and fail rather
than skip when the declared environment cannot establish the failure. Resource
exhaustion uses a child-only limit of 64 descriptors, bounded allocation and
`finally` cleanup. The hard limit must accompany the soft limit because pinned
[Node initialization](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/src/node.cc#L622-L641)
raises the soft limit toward the inherited hard limit. The parent is unaffected.
These are local compatibility specs, not complete upstream case activation.

An unreadable final file can still exist and stat successfully. Directory
search denial affects traversal, including explicit `.` and missing children;
a final directory's trailing slash requires its directory kind without an
extra `.` lookup. Relative paths start from the existing cwd directory, so a
denied ancestor need not prevent relative reads. A directory without read
permission fails at `open` before a directory read could produce EISDIR.
Nonempty read paths encounter EMFILE before traversal errors when the process
has no descriptor capacity; exists/stat do not allocate a descriptor. Empty
paths differ: Linux's
[open implementation](https://github.com/torvalds/linux/blob/v6.12/fs/open.c#L1317-L1343)
calls [getname](https://github.com/torvalds/linux/blob/v6.12/fs/namei.c#L144-L154)
before descriptor allocation and returns ENOENT, whereas the pinned macOS
reference produces EMFILE. Both paths still reject a NUL-containing JavaScript
string before attempting an OS open. Linux/macOS references keep this boundary
explicit rather than treating every POSIX platform as identical.

- [`test-fs-access.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-fs-access.js)
  combines synchronous, callback and promise access checks; real writes/chmod,
  uid/platform handling, flags and argument diagnostics, internal bindings,
  stack checks and the common/assert harness. It remains inactive: effective
  read/search permissions for exists/stat/read do not supply the access API or
  those setup and asynchronous behaviors.
- [`test-fs-open.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-fs-open.js)
  exercises public synchronous, callback and promise open APIs, file handles,
  flags, modes and validation. A readFileSync environmental capacity condition
  does not implement descriptor ownership or those public APIs.
- [`test-fs-copyfile-respect-permissions.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-fs-copyfile-respect-permissions.js)
  preserves destination contents after failed synchronous/callback/promise
  copies and contains uid/platform exclusions. Writes, chmod, copy operations,
  callback/promise delivery and its complete harness remain unsupported;
  read permission failures are not coverage for this complete file.

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
