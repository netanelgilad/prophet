# Directory enumeration

`fs.readdirSync(path)` supports concrete string paths and finite string choices,
with omitted, undefined or null options. It returns a fresh mutable VM array of
UTF-8 names. An explicit closed directory enumerates its present, non-null
children under the current path conditions. A conditional child therefore
changes the corresponding list and length without selecting one arbitrary
outcome. Missing and inaccessible paths remain distinct throwing outcomes.

Names follow the pinned Node 24.21.0 Linux/Darwin
[libuv scandir byte comparator](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/deps/uv/src/unix/fs.c#L524-L539).
This differs from JavaScript's UTF-16 sort for some BMP/astral names, and from
object property order for integer-looking names. Dot entries are excluded;
`__proto__` is an ordinary filename. Returned array mutation cannot change the
directory or a later result.

Listing needs read access on the final directory and search access while walking
its ancestors. It does not require the final directory's search permission;
an explicit `/.` still performs that traversal. Shared component lookup preserves
missing and non-directory prefixes before `..`. ENOENT, ENOTDIR, EACCES and EMFILE
retain the input path and syscall `scandir`. NUL validation precedes resource
access; per-call descriptor availability precedes nonempty path resolution.
The existing Linux/Darwin empty-path priority remains explicit. A successful
list assumes allocation, reading and cleanup succeed; there is no descriptor
counter, process-wide resource pool or model of later I/O failures.

## Complete names and partial metadata

Open directories require the generic factory hook
`observeDirectoryNames(directory): ReadonlyArray<string>`. The factory captures
the callback, copies and validates its returned names, and publishes the complete
list in the persistent directory `node.fs.entry.names` host slot. Before this
observation `names` is undefined. The existing `complete` flag continues to
describe the declared child table: acquiring names does not turn it into a
complete table of child metadata. Known names may have no acquired child node.

An unlisted name is absent after complete enumeration. A listed child is acquired
only when a subsequent stat/existence/read needs it. Contradictions with prior
positive or negative child observations are acquisition/configuration failures,
not newly fabricated guest errors. Branch joins retain conditional name-list
observations, and earlier contexts stay unchanged. Without a complete declaration
or an acquisition hook, enumeration stops at an explicit unsupported frontier;
it never returns just the already visited names.

## Bounded native acquisition

The separate [capture adapter](../src/cli/filesystem-capture.ts) memoizes the first
complete enumeration for each directory identity across branches and later calls.
It uses the public native directory iterator with a one-entry buffer, checks the
shared acquisition budget before accepting each name, validates raw Buffer names
as lossless UTF-8, and closes the iterator in `finally`. The default 4,096-observation
budget counts both metadata probes and encountered names; each name has the
existing 255-byte limit. It does not first allocate an unbounded native
`readdirSync` result or recursively scan descendants.

Only names enter the listing state. Symlink, FIFO and binary-file names can be
listed; later metadata/content operations retain their existing boundaries.
The native iterator may internally resolve an unknown directory-entry type;
any resulting host error remains a diagnostic acquisition failure. Its incidental
metadata is not silently installed as a modeled stat result.

Before/after directory identity, mode and modification/change-time comparisons
reject detected changes. Previously observed child facts must agree with the
first listing. A listed child disappearing before its first metadata observation
is a diagnostic failure. After a successful listing the memoized namespace stays
fixed even if the host later changes. These checks establish neither an atomic
snapshot nor a race-resistant component walk; undetected changes, aliases,
ACL/effective-user effects and future syscall outcomes retain the existing capture
limits. Unexpected open/read/close errors are memoized diagnostics. Filename-byte
and budget boundaries are classified unsupported leaves, preserving completed
siblings; no truncated list is returned.

## Evidence and remaining scope

[Generic model specs](../test/node-filesystem-readdir.spec.ts) cover complete/open
directories, symbolic names, path alternatives, mandatory unknowns, permissions,
resource errors, post-join observations, contradictory facts and independent
result arrays. [Acquisition/reference specs](../test/filesystem-enumeration-capture.spec.ts)
compare real names, permission denial, absent paths and descriptor exhaustion
with independent pinned Node runs. Raw invalid filename bytes are injected at the
adapter boundary because the reference Darwin filesystem refuses their creation.
The tests also retain host-error, namespace-change, nonregular-name and budget
boundaries. No target source runs natively during analysis.

Options objects, even `{}`, explicit encoding strings, `withFileTypes`, recursive
enumeration, Buffer/URL paths, arbitrary filename bytes and open symbolic names
remain explicit gaps. General options have observable reads and validation; this
slice does not ignore them. Dirent values/type fallback and broader encodings
need their own semantics. The default options use Node's private empty object,
so they do not acquire inherited Object.prototype option values.

The motivating unchanged totalist/sync code calls `readdirSync(dir)`, then loops
over names and stats each child. This shared operation contains no application
recognition. Its loop and sirv's size/mtime consumers require their own support;
enumeration alone is not a complete application proof.

Whole pinned upstream candidates remain inactive:

- [test-fs-readdir.js](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-fs-readdir.js)
  includes setup writes, asynchronous callbacks, invalid path arguments,
  Array iteration/sort and the real common/assert harness.
- [test-fs-readdir-types.js](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-fs-readdir-types.js)
  additionally requires Dirent predicates, promises, recursive options,
  internal-binding replacement and unknown-type fallback.

These cases are not trimmed or counted as passing. FS-001/FS-002, HOST-002,
SECURITY-002 and TEST-004 retain the remaining environment, API, scheduling,
acquisition and upstream-harness gaps.
