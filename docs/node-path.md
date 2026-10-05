# Node POSIX path compatibility and proof boundary

The reference runtime is **Node v24.21.0**, upstream commit
`955266bfdd854cd280dffd47548673914484e4c0`. The [local path specs](../test/node-path.spec.ts)
and [parse specs](../test/node-path-parse.spec.ts)
execute the same complete fixture modules through Prophet and an independent
pinned Node child. These are local compatibility tests, separate from Test262
and from complete upstream Node cases.

`createPosixPathModel()` supplies `.module`. Register that same identity as
`path/posix` and, in a **declared POSIX environment**, `path`. The loader handles
their `node:` aliases. The model's `posix` property initially points to itself;
`sep` is `/` and `delimiter` is `:`. Selecting this model does not detect or prove
the operating system of an analyzed deployment. It does not implement Windows
paths merely because the machine running Prophet can run Windows software.

## Supported operations

The model implements `normalize(path)`, `join(...paths)` and `parse(path)` for
concrete strings
and symbolic choices whose leaves contain concrete strings. String values known
only through equality constraints are not yet materialized into those choices.
Their behavior follows the pinned
[`lib/path.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/path.js).
Normalization handles repeated separators, `.` and `..`, absolute versus
relative paths and trailing slashes. Empty input normalizes to `.`. Joining
validates its arguments in order, ignores empty segments and joins the remaining
text before normalization; no arguments or all-empty arguments produce `.`.

Parsing returns a fresh ordinary object with five own string properties, in
insertion order `root`, `dir`, `base`, `ext`, `name`. Empty input leaves all five
empty. Ordinary property reads, writes, enumeration, spread and object
identity use the shared VM; parsing does not introduce a separate result type.
Branches retain their own correlated results, including relationships between
multiple parsed fields. An extension shared by every input choice can be proved,
while a differing filename remains unknown until a branch is selected.

`parse` does not normalize the path. It ignores trailing separators when finding
the final component, but retains intervening separators and `.`/`..` in the
directory text: `/foo///bar.baz` has `dir === "/foo//"`. A leading dot usually
does not begin an extension (`.profile` has none), while `...` has extension `.`.
The exact pinned algorithm also gives `/..` and `/../` extension `.` and name `.`,
although `..`, `../`, `//..` and `a/..` have no extension. Compatibility specs
retain that runtime behavior rather than replacing it with a basename shortcut.
`parse` calls no exported normalize, basename or extname method, and its captured
String operations are unaffected by replacements of public String methods.

These operations are lexical string operations. They do not read files, obtain
the current directory, decode URLs, follow symlinks or check permissions. Only
`/` separates POSIX segments; backslashes, NUL and UTF-16 code units are ordinary
text. A successfully normalized string is not a claim that an operating system
will accept that filename or that it stays inside an application directory.

The shared branch machinery retains correlations between finite string choices.
Specs assert both determined results and alternatives that must stay unknown.
The small `servePath` spec demonstrates a `../secret` versus `asset` choice:
lexical joining can escape a supplied directory on one path. That is a proof
about the supplied function and inputs, not a file-access result or a new
finding in the static-server target.

The model also preserves an observable detail of Node's implementation:
nonempty `join` reads the **current normalize member of its captured POSIX
module**, then invokes it through the shared VM with that module as receiver.
Replacing normalize can change the result, mutate interpreted state or throw;
those effects and their branch conditions are preserved. Detaching join or
replacing its exported `posix` property does not redirect that captured module.
The empty-join cases bypass normalize. Builtin normalize ignores extra arguments,
but ordinary argument expressions still execute before the call.

The model assumes the intrinsic `Array.prototype.push` used internally by Node's
join remains unchanged. The pinned implementation calls that method dynamically
on a temporary array. Array constructor/prototype mutation is currently outside
the VM's supported surface; modeling it later must preserve its effects on join.
This assumption does not extend to mutable String methods: Node's normalization
uses captured String operations, and the compatibility specs cover their
independence from public String method replacements.

The original methods ignore supplied call receivers and are not constructors.
Their names and lengths are modeled (`normalize.length === 1`, `join.length === 0`,
`parse.length === 1`).
Host-operation traces may record their calls and returns, including the nested
normalize call; those records do not represent filesystem I/O.

## Type errors and explicit gaps

Node requires strings rather than coercing arbitrary path arguments. Known
invalid primitive values produce a catchable TypeError with
`code === "ERR_INVALID_ARG_TYPE"` and the pinned primitive diagnostic. Unknown
Booleans split into their true/false diagnostics. For an unknown number, the
rejection and code are known while the message remains an unknown string;
analysis does not invent a particular numeric spelling.

Formatting an invalid object, array or function can inspect constructor/name
properties and execute user code. Those diagnostics remain explicit analysis
gaps until their effects and failures are modeled. Node's coded-error
constructor/prototype, `toString`, stack and full descriptor behavior likewise
remain guarded; known name/message/code values do not establish that wider
error surface. See the pinned
[validators](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/internal/validators.js)
and [error implementation](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/internal/errors.js).

Open symbolic path strings are unsupported. Knowing only that an argument is a
string, or constraining an otherwise unknown string to a finite set through
equality facts, is insufficient for the present lexical algorithms; the model
stops analysis instead of choosing a convenient string or claiming containment.
Broader symbolic normalization, concatenation and path relationships remain
future reasoning work. This is distinct from the supported unknown-number
argument error with an imprecise message.

The remaining path APIs (`resolve`, `relative`, `basename`, `dirname`,
`extname`, `isAbsolute`, `format`, and others), Win32/device/UNC behavior, full
module/function descriptors and reflection, and metadata mutation remain gaps.
The separate [process environment model](node-process.md) now supplies declared
process.cwd state. This path increment does not change the
CommonJS source graph into a disk/symlink-aware loader. These residuals are
tracked by PATH-001/PATH-002 and CJS-001 in the
[implementation-gap backlog](implementation-gaps.md).

## Progress in the unchanged application

The [pico-static-server analysis spec](../test/pico-static-server-analysis.spec.ts)
now registers this POSIX module instead of an opaque path identity. For GET/HEAD,
the original expression is:

```js
path.join(options.staticPath, path.normalize(url.parse(request.url).pathname))
```

The [legacy URL model](node-url.md) now evaluates the nested parse call for
supported path-only strings. For `/folder/../missing?download=1` and staticPath
`/site`, the explicit normalize call and join's current normalize call produce
`/site/missing`. The [filesystem model](node-filesystem.md) now checks the declared
empty `/site` and the original handler completes 404. A read-only observer records
the preceding scope/effects without supplying a filesystem result. The shared
symbolic tree also classifies `/docs`: missing directory returns 404; empty
directory causes the original index read to throw ENOENT before any response
commit. Matching native GET/HEAD witnesses reproduce those two conditions.

Default reads return Buffer values and the shared `instanceof` check is false.
The original MIME function now evaluates `path.parse(url).ext`, chooses
`text/plain` for `.txt` and an unmapped `.unknown` extension, and `text/html` for the directory
index. The original handler then commits status 200. Its existing reversed
`writeHead` arguments produce numeric header fields `0: "O"` and `1: "K"` from
the supplied `"OK"` string, rather than the intended content headers. Execution
now completes `response.write`, `end` and explicit finish delivery with the
expected GET bytes and empty HEAD output under the bounded transport schedule. Source provenance preserves DEP0169
eligibility, with warning delivery separate from the synchronous handler.
Broader filesystem inputs, metadata, failures and schedules remain open.
Existing successful-bind, healthy-stdout, delivered-request-event and transport
assumptions remain unchanged, as does the scoped symbolic missing-Allow finding.

## Complete upstream cases reviewed

The following complete cases were reviewed at the pinned revision. None is
activated or counted passing in this layer, and none is trimmed to a POSIX-only
fragment:

- [`test-path-posix-exists.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-path-posix-exists.js)
  is a small alias-identity case for `path/posix` and `path.posix`, but still
  needs the actual common/assert harness.
- [`test-path-join.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-path-join.js)
  includes POSIX and Windows/UNC/device paths. Besides Win32 support it needs
  common/assert, Array apply/concat/map/forEach/isArray operations and RegExp/JSON
  diagnostics. The complete Windows cases remain part of the file.
- [`test-path-normalize.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-path-normalize.js)
  mixes extensive Windows and POSIX assertions; Win32 and the common/assert
  harness prevent whole-file activation.
- [`test-path-parse-format.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-path-parse-format.js)
  exercises parsing and formatting together across POSIX and Win32, including
  trailing separators. Whole-file activation still needs Win32, format, dirname,
  basename, extname, common/assert, loops/destructuring, Array forEach/apply/includes,
  and JSON diagnostics. Its invalid-object diagnostics also exceed the current
  primitive-error model. The pinned tree has no separate parse-only case; local
  parse compatibility specs do not count as this whole upstream case passing.
- [`test-path.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-path.js)
  checks invalid values across both platforms and many further path APIs. It
  also needs arguments objects, Array.from/apply, for-of, assert.throws and
  common.isWindows behavior.
- [`test-path-zero-length-strings.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-path-zero-length-strings.js)
  combines POSIX/Win32 operations with isAbsolute, resolve, relative and
  process.cwd. Local zero-length assertions do not replace those dependencies.
- [`test-esm-path-posix.mjs`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/es-module/test-esm-path-posix.mjs)
  additionally needs ESM and the common/assert harness.
