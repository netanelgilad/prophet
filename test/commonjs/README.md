# CommonJS compatibility

This suite is separate from Test262: CommonJS is a Node host interface. Its
reference runtime is **Node v24.21.0**, upstream commit
`955266bfdd854cd280dffd47548673914484e4c0` (annotated tag object
`f37d7da830134b5314a14ced553273786a2bb4cd`). CI runs that exact release.

Run the locally written differential specs with the pinned release:

```sh
node .yarn/releases/yarn-3.1.1.cjs test --runInBand test/commonjs-compat.spec.ts
```

When Jest itself runs under a different Node release, point `PROPHET_NODE_BINARY`
at the v24.21.0 executable. The suite checks its version and fails with setup
instructions on a mismatch; it never silently skips or changes the oracle.

Each spec supplies module source and writes it to a temporary `.cjs` file. An
independent child Node process loads that file with real `require(filename)`.
Prophet executes the same source through `evaluateCommonJS`; it never delegates
interpreted source to Node. The helper compares concrete exported observations,
or throws, preserving undefined, NaN, infinities and signed zero. Error matching
currently compares the error name, not stack traces or implementation-specific
messages. Optional observation expressions call escaped exports in each runtime.
Temporary fixture files are removed after each comparison.

The current layer covers the initial `exports` alias, replacement and rebinding,
primitive exports, the five named wrapper parameters and receiver, private
declarations/hoisting, escaped closures, caller strictness/receiver restoration,
top-level return, throws/finally, and wrapper parse failures. The supplied
filename is already resolved and absolute.
`evaluateCommonJS` executes supplied source; it does not resolve or read files.

Module resolution, `require()` calls, cache identity, cycles, retry after failed
initialization, module metadata (`loaded`, `children`, etc.), built-ins, JSON,
package lookup, ESM, native addons, and filesystem/platform behavior are not
implemented by this layer. Implicit `arguments` objects are also an explicit VM
gap, rather than a fabricated module argument list or caller binding.
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
  requires the upstream harness, `assert`, `fs`, resolution and repeated-load
  failure/cache behavior, plus currently unsupported arrow syntax.

Activate suitable complete, unmodified upstream cases as their dependencies are
implemented. Local differential coverage is not upstream conformance coverage
and does not establish full Node loader compatibility.
