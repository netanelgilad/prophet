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

The source map is a complete virtual snapshot without symlinks or external
search paths. The entry is loaded as a required file,
so its `module.id` is its filename rather than a process entry's `"."`.
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
absolute requests. Builtin names take precedence and stop analysis until their
APIs are modeled; unknown `node:` names throw `ERR_UNKNOWN_BUILTIN_MODULE`.
The builtin catalog is pinned, including names requiring the `node:` prefix.

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
It proves accepted-input behavior in development and production with supplied
process environment values. Rejection needs Error/string-method support; this
first success-path proof is not the complete library milestone.

This is an explicitly supplied source-graph layer, not a filesystem loader.
Disk reads, symlink/realpath behavior, wider package imports/exports behavior,
built-ins, ESM, and native addons remain unsupported. A missing
supported request throws an interpreted `MODULE_NOT_FOUND`; unsupported request
forms stop analysis explicitly. Other module metadata and require interfaces
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

No complete upstream Node case is claimed as passing yet. Reviewed candidates
at the pinned revision include:

- [`test-module-wrap.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-module-wrap.js)
  and [`test-module-wrapper.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-module-wrapper.js):
  these invoke fixture files using `child_process`; their fixtures additionally
  require the `assert` and `module` built-ins, mutate `Module.wrapper`, and load
  another file. Those interfaces are outside source execution support.
- [`test-require-exceptions.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-require-exceptions.js):
  requires the upstream harness, `assert`, `fs`, filesystem resolution, plus
  currently unsupported arrow syntax. Local source-graph specs cover repeated
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
  needs the upstream common harness, `assert`, `util/types`, object spread, and
  arrow functions. Local condition tests do not replace this complete case.
- [`test-esm-exports.mjs`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/es-module/test-esm-exports.mjs)
  combines CommonJS and ESM import promises, patterns, and the upstream fixture
  harness; it cannot be activated as a complete case in the current VM.

Activate suitable complete, unmodified upstream cases as their dependencies are
implemented. Local differential coverage is not upstream conformance coverage
and does not establish full Node loader compatibility.
