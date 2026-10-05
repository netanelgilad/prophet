# Declared Node process environment

`createProcessModel({ cwd, warnings? })` composes a minimal POSIX process
with the existing [warning model](node-url.md). It returns `.process`, `.state`
and `.warnings`. Supply an already configured warning model to reuse its process
identity and optional shared next-tick queue. Without one, the factory creates
the existing explicit-delivery warning model. Runtime assembly should register
that same `.process` as the global process and CommonJS `process`/`node:process`
value. This factory does not change CLI assembly or auto-register builtins.

The required `cwd` is a concrete canonical absolute POSIX directory string:
root `/` is accepted; relative paths, empty/dot/dot-dot components, trailing
separators, NUL and non-round-tripping UTF-8 strings reject. The factory neither
consults the implementation process's cwd nor checks or changes the host
filesystem. It represents a declared, stable, successfully retrievable cwd.
An embedding composing filesystem state must supply the same directory and
validate its own filesystem assumptions. Missing/unlinked/inaccessible cwd,
getcwd errors, chdir, native cached-cwd invalidation, concurrent changes, byte
names outside this UTF-8 domain and Win32 cwd remain unsupported under PROCESS-001.

`.state.cwd` holds the VM string. The process object's immutable
`hostSlots["node.process.environment"]` references this state and preserves its
existing warning/next-tick slots. `process.cwd()` reads the current persistent
state through the shared host-call model and records ordered call/return effects.
Its behavior never runs real getcwd/chdir. State inspection therefore sees the
same identities as execution and earlier contexts retain their own heap versions.
Embedding-level state construction is distinct from a modeled `process.chdir`;
there is no public cwd setter or resumable environment format in this slice.

The process's `cwd` member is mutable. Replacing it affects subsequent ordinary
calls; a captured original continues reading its process environment state.
Finite symbolic invocation choices retain their conditions and effects. Pinned
Node v24.21.0 reports the original method's name as `wrappedCwd`, length zero,
and ignores receiver and extra arguments after normal argument evaluation.
These values/calls are supported. Pinned Node also permits constructing this
function; the current model explicitly rejects construction rather than claiming
it is nonconstructible. Prototype/descriptor inspection, caller/arguments,
metadata writes and broader function APIs remain guarded.

Composition happens once, before interpreted execution. Reconfiguring an already
composed warning process rejects instead of mutating earlier declared process
state. This assembly API must not retrofit a process into previously executed
snapshots. The process still exposes only its modeled cwd/warning members:
argv, env, execPath, chdir, signals, exit/lifecycle behavior and the rest of Node's
process/EventEmitter API are neither invented nor read from the host.

[Process specs](../test/node-process-environment.spec.ts) compare metadata,
receiver/argument behavior, mutable methods and construction boundaries with
independent pinned Node v24.21.0 children. They also cover global/import aliases,
shared warning jobs, concrete and symbolic calls, effects, persistent snapshots,
graph references and rejected input/API domains. This is Node host compatibility
evidence, not a new Test262 selection or complete upstream process coverage.

Complete upstream process tests remain inactive:

- [`test-cwd-enoent.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-cwd-enoent.js)
  removes the current directory and launches a child, checking its exit behavior.
  It needs filesystem mutation, chdir, subprocess streams/events, worker detection
  and the common/assert harness. A declared cwd does not cover those transitions.
- [`test-process-chdir.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-process-chdir.js)
  changes directories, creates Unicode-named directories and checks argument
  errors. It needs filesystem mutation, chdir, ICU/string normalization, worker
  detection, process version fields and common/assert support.

These complete cases are not reduced to the local fixtures or counted passing.

The shared warning process now opts into typed partial-object boundaries, so
reached absent APIs such as env/chdir preserve supported branch siblings. The
cwd function itself retains its existing unmarked constructor/metadata guards;
this does not implement those APIs or broaden the declared environment.
