# CommonJS compatibility

This suite is separate from Test262: CommonJS is a Node host interface. Its
reference runtime is **Node v24.21.0**, upstream commit
`955266bfdd854cd280dffd47548673914484e4c0` (annotated tag object
`f37d7da830134b5314a14ced553273786a2bb4cd`). CI runs that exact release.

Run the locally written differential specs with the pinned release:

```sh
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/commonjs-compat.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/commonjs-loader-compat.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/commonjs-resolution-compat.spec.ts test/commonjs-package-config.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/commonjs-package-resolution.spec.ts test/commonjs-package-exports.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/commonjs-builtins.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/cli-imports.spec.ts test/cli-source-capture.spec.ts
```

When Jest itself runs under a different Node release, point `PROPHET_NODE_BINARY`
at the v24.21.0 executable. The suite checks its version and fails with setup
instructions on a mismatch; it never silently skips or changes the oracle.

Each spec supplies module source and writes it to temporary fixture files. An
independent child Node process loads that file with real `require(filename)`.
Prophet executes the same source through `evaluateCommonJS`, or loads a supplied
source graph through `createCommonJSLoader`; it never delegates interpreted
source to Node. Graph fixtures use the same canonical absolute filenames in
both runtimes, including nested directories. The helper compares concrete
exported observations or throws, preserving undefined, NaN, infinities and signed
zero. Error matching compares the error name and code when present, not stack
traces or implementation-specific messages. Optional observation expressions
call escaped exports in each runtime.
The oracle clears NODE_OPTIONS/NODE_PATH and disables global search paths to
match the declared environment. Temporary fixture files are removed after each
comparison.

The current layer covers the initial `exports` alias, replacement and rebinding,
primitive exports, the five named wrapper parameters and receiver, private
declarations/hoisting, escaped closures, caller strictness/receiver restoration,
top-level return, throws/finally, and wrapper parse failures. The supplied
filename is already resolved and absolute.
`evaluateCommonJS` executes supplied source; it does not resolve or read files.

The source-graph loader adds concrete relative and absolute requests from an
immutable, explicitly supplied source map. It resolves
relative requests from the module owning `require`, including escaped require
closures. Its compatibility specs cover cache identity, shared exports and
later replacement, primitive/undefined exports, partial exports in cycles,
retry after failure, retained effects and successful dependencies, argument
errors, missing supplied files, and `module.loaded` during and after evaluation.
`module.id`, `module.filename`, and `module.path` are also available in this API.
The original standalone `evaluateCommonJS` remains uncached and does not load
dependencies.

The supplied source map is a complete virtual snapshot without symlinks or
external search paths. By default its entry is loaded as a required file,
so its `module.id` is its filename rather than a process entry's `"."`. The CLI
uses the shared loader's main-module option to preserve `"."` and the same cached
record when a dependency cycles back to the process entry.
Cycle coverage concerns partial exports and state; Node's circular-require
warning diagnostics and temporary warning prototypes are not modeled.

Local resolution uses the pinned Node order: exact file, `.js`/`.json`/`.node`
probes, then directory `main` and index candidates. Directory intent survives
normalization (`/`, `/.`, `/..`, `.`, `..`). `.cjs` is never an inferred extension.
Main-directory indexes do not recursively consult another package main; a
missing main can fall back to the original directory index. A selected file's
failure never causes fallback. Native addon loading is an explicit gap, and
the DEP0128 warning from main fallback is not modeled.

Package names, scoped names, and legacy subpaths search ancestor `node_modules`
directories from the module owning require. A broken explicit main stops lookup;
a directory with no main/index permits farther lookup. Self-reference checks
the nearest caller package before ordinary resolution, including relative and
absolute requests. Builtin names take precedence; unknown `node:` names throw
`ERR_UNKNOWN_BUILTIN_MODULE`. The builtin catalog is pinned, including names
requiring the `node:` prefix.

`createCommonJSLoader(files, { builtins: { http: modeledHttp } })` registers
explicit VM modules. Both `require("http")` and `require("node:http")` return
that same value before file, package, or self-reference lookup. Property changes
remain in each execution context's persistent heap, including conditional
changes. The registry mapping is snapshotted; it never loads a native module or
performs host I/O. Missing models remain explicit analysis gaps, even inside an
interpreted `try`/`catch`. Supplying a partial model does not establish complete
coverage of that builtin's API.

Registry keys use canonical names without `node:`. For example, a `test` key
serves `require("node:test")`, while `require("test")` still searches ordinary
packages. Prefixed keys, unknown names, and values without a recognized VM type
tag are rejected. Models are trusted embedding inputs; registration does not
validate every internal field or prove their implementations correct.
The builtin specs compare identity, package precedence, mutation visibility,
prefix-only names, and unknown-name errors against the pinned Node. They also
exercise finite symbolic request choices and isolated execution state.
The reference behavior comes from Node's
[CommonJS loader](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/internal/modules/cjs/loader.js)
and [builtin name normalization](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/internal/bootstrap/realm.js).

Exports support main sugar, exact subpath maps, ordered and nested conditions,
and arrays with Node's distinct no-match, blocked, and invalid-target behavior.
Default conditions are `require`, `node`, `node-addons`, `module-sync`, and
`default`, evaluated in declaration order. Selected targets must be exact files:
missing files do not try another array item, a legacy main, or an ancestor copy.
Blocked/private subpaths throw `ERR_PACKAGE_PATH_NOT_EXPORTED`. Target validation
and URL conversion preserve encoded-path restrictions and Node error kinds.
Pattern selection, custom conditions, `#imports`, malformed URI encodings, and
NUL-containing targets remain explicit gaps. Exact matches can still resolve in
a map that also contains patterns.

`.cjs` and `.json` have explicit formats. `.js` uses the nearest package scope,
stopping before `node_modules` and the filesystem root as the pinned reader
does. An explicit commonjs scope retains ordinary SyntaxError behavior. Without
an explicit type, a valid CommonJS wrapper runs; wrapper parsing failures stop
analysis because Node may reinterpret the source as ESM. Module scopes, `.mjs`,
and other unsupported formats stop analysis. Extensionless files use the same
ambiguous-source handling.

JSON files are parsed as data, including a single leading BOM, then converted
to fresh VM objects, arrays, and primitives. They share normal cache identity,
conditional state, and heap mutations. Invalid JSON throws a fresh interpreted
SyntaxError on each load. Own `__proto__` data properties survive symbolic joins.

Package metadata is distinct from a JSON module's exported data. The pinned
[native metadata reader](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/src/node_modules.cc)
has behaviors that differ from `JSON.parse`. The current parser handles valid
JSON objects with unique, unescaped top-level keys, ignores nonstring `main`,
and rejects supported invalid shapes/name/type fields with
`ERR_INVALID_PACKAGE_CONFIG`. Escaped/duplicate top-level keys, unclassified
syntax failures, undecodable metadata strings, JSON-shaped exports strings,
and NUL-containing paths
remain analysis gaps. Changing the exported package.json object does not change
resolution metadata in the immutable snapshot. Local directory requests ignore
`exports` when selecting that directory's main, as Node does. Native metadata
ignores top-level null/boolean/number exports; null inside an exports map has
the separate blocked-target meaning.

The [published invariant spec](../published-invariant.spec.ts) uses the full,
unmodified tiny-invariant 1.3.3 fixture and its actual conditional exports.
With supplied process environment values, it proves accepted and rejected
numeric-input behavior in development and production, including NaN/infinities,
Error messages, and lazy-message effects. This is the numeric normalizer domain
in the spec, not a claim about every possible JavaScript value or Node process API.

The supplied-source adapter performs no disk reads. The separate CLI acquisition
provider below feeds the same resolver/loader from read-only disk observations.
General symlink/realpath behavior, wider package imports/exports behavior,
unregistered built-ins, ESM, and native addons remain unsupported. A missing
supported request in a complete supplied graph throws an interpreted
`MODULE_NOT_FOUND`; unsupported request forms stop analysis explicitly. Other module metadata and require interfaces
(`module.require`, `children`, `parent`, `paths`, `require.resolve`, `cache`,
`main`, and `extensions`) are not modeled. Writes to loader metadata other than
`exports` are also rejected until their effects on Node loading are implemented.
Loader-generated errors currently expose only `name` and `code`. Their messages,
stacks, require stacks, and full Error/prototype behavior are explicit gaps;
reading an unmodeled field stops analysis instead of supplying a fabricated value.
Implicit `arguments` objects are an explicit VM gap, rather than a fabricated
module argument list or caller binding.
Sloppy indirect eval introducing global `var` or function declarations is
rejected until global bindings correctly share storage with global object
properties. The rejection specs show the pinned Node behavior independently.
Indirect eval may still read/write modeled global properties, and strict eval
declarations remain local to that evaluation.

The [CLI adapter](../../docs/cli.md) now acquires reached dependencies and
package-format metadata through the same resolver and loader. It handles
computed/saved requires, local and parent-relative imports, JSON, package main,
supported exact exports and finite symbolic names. Source bytes/hashes and
positive/negative path probes are shared first observations; module evaluation
cache contents remain in each execution context's persistent heap. The entry's
process-main id `"."`, cycle identity and normal-completion `loaded` stay coherent.

This POSIX acquisition layer rejects dependency symlinks at any component,
filename aliases, nonregular sources, invalid UTF-8 and host acquisition errors.
Entry paths are realpath-normalized; alternate Node symlink/launch modes remain
unsupported. Verified missing local candidates can throw an interpreted
`MODULE_NOT_FOUND`; unresolved bare package lookup stops because `NODE_PATH`
and global search paths are uncaptured. Only `console` is registered as a builtin.
Reads are non-atomic and source/probe caches are not a modeled target filesystem.
Errors after a positive probe remain acquisition failures. Source bytes/hashes
and probe provenance are retained internally, not yet in the stdout graph.
General source-size/I/O/parser limits and the remaining process/main/require
APIs are still open.

The [CLI import specs](../cli-imports.spec.ts) compare supported resolution and
cycles with pinned Node and retain symbolic alternatives without native target
execution. [Acquisition specs](../cli-source-capture.spec.ts) test changing files,
cached absence, failed reads and unsupported path/encoding domains. These specs
do not activate the complete upstream cases below: their module/cache/resolve
interfaces, process/assert harness and target external effects remain blockers.

No complete upstream Node case is claimed as passing yet. Reviewed candidates
at the pinned revision include:

- [`test-require-node-prefix.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-require-node-prefix.js)
  also mutates `require.cache.fs` to demonstrate the prefix's cache bypass. It
  needs the upstream common/assert harness, RegExp error-message matching, and
  public cache mutation. The local registration specs cover ordinary alias
  identity; they do not establish compatibility with that cache override.
- [`test-module-wrap.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-module-wrap.js)
  and [`test-module-wrapper.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-module-wrapper.js):
  these invoke fixture files using `child_process`; their fixtures additionally
  require the `assert` and `module` built-ins, mutate `Module.wrapper`, and load
  another file. Local dependency loading is now connected in the CLI; the
  child-process/public Module/assert interfaces remain outside support.
- [`test-require-exceptions.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-require-exceptions.js):
  requires the upstream harness, `assert` with RegExp/error-shape matching, `fs`,
  and target filesystem operations. Its synchronous arrows and supported
  resolution rules are available. CLI acquisition does not implement the test's
  `fs` API. Local source-graph specs cover repeated
  initialization failure and cache behavior; they do not replace this complete
  upstream case.
- [`test-module-cache.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-module-cache.js)
  and [`test-require-cache.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-require-cache.js):
  require filesystem mutation, public cache mutation, `require.resolve`,
  built-ins, and the upstream assertion harness beyond this source-graph layer.
- [`test-module-circular-dependency-warning.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-module-circular-dependency-warning.js):
  requires warning observation, prototype behavior, symbols, classes, and proxies.
- [`test-require-empty-main.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-require-empty-main.js)
  needs `require.resolve`, timers, and the upstream harness.
- [`test-require-extension-over-directory.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-require-extension-over-directory.js)
  and [`test-require-json.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-require-json.js)
  need upstream fixtures, assertion/path built-ins, and RegExp diagnostics.
- [`test-require-module-conditional-exports.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/es-module/test-require-module-conditional-exports.js)
  needs the upstream common/fixture harness, `assert`, `util/types`, and binding
  destructuring. Its synchronous arrows and ordinary data-object spread are
  supported. Local condition tests do not replace this complete case.
- [`test-esm-exports.mjs`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/es-module/test-esm-exports.mjs)
  combines CommonJS and ESM import promises, patterns, and the upstream fixture
  harness; it cannot be activated as a complete case in the current VM.

Activate suitable complete, unmodified upstream cases as their dependencies are
implemented. Local differential coverage is not upstream conformance coverage
and does not establish full Node loader compatibility.
