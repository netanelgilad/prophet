# CommonJS compatibility

This suite is separate from Test262: CommonJS is a Node host interface. Its
reference runtime is **Node v24.21.0**, upstream commit
`955266bfdd854cd280dffd47548673914484e4c0` (annotated tag object
`f37d7da830134b5314a14ced553273786a2bb4cd`). CI runs that exact release.

Run the locally written differential specs with the pinned release:

```sh
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/commonjs-compat.spec.ts
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/commonjs-loader-compat.spec.ts
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
Temporary fixture files are removed after each comparison.

The current layer covers the initial `exports` alias, replacement and rebinding,
primitive exports, the five named wrapper parameters and receiver, private
declarations/hoisting, escaped closures, caller strictness/receiver restoration,
top-level return, throws/finally, and wrapper parse failures. The supplied
filename is already resolved and absolute.
`evaluateCommonJS` executes supplied source; it does not resolve or read files.

The source-graph loader adds concrete relative and absolute requests for exact
`.cjs` filenames from an immutable, explicitly supplied source map. It resolves
relative requests from the module owning `require`, including escaped require
closures. Its compatibility specs cover cache identity, shared exports and
later replacement, primitive/undefined exports, partial exports in cycles,
retry after failure, retained effects and successful dependencies, argument
errors, missing supplied files, and `module.loaded` during and after evaluation.
`module.id`, `module.filename`, and `module.path` are also available in this API.
The original standalone `evaluateCommonJS` remains uncached and does not load
dependencies.

The source map is a complete virtual snapshot containing only `.cjs` files,
without symlinks or package metadata. The entry is loaded as a required file,
so its `module.id` is its filename rather than a process entry's `"."`.
Cycle coverage concerns partial exports and state; Node's circular-require
warning diagnostics and temporary warning prototypes are not modeled.

This is an explicitly supplied source-graph layer, not a filesystem loader.
Disk reads, symlink/realpath behavior, extension fallback, directory/package
lookup, built-ins, JSON, ESM, and native addons remain unsupported. A missing
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
  require filesystem mutation, JSON, public cache mutation, `require.resolve`,
  built-ins, and the upstream assertion harness beyond this source-graph layer.
- [`test-module-circular-dependency-warning.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-module-circular-dependency-warning.js):
  requires warning observation, prototype behavior, symbols, classes, and proxies.

Activate suitable complete, unmodified upstream cases as their dependencies are
implemented. Local differential coverage is not upstream conformance coverage
and does not establish full Node loader compatibility.
