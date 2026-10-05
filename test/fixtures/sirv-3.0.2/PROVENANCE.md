# sirv 3.0.2 and pinned dependency fixture

The `package/` directory contains all six unmodified files from the published
MIT-licensed npm archive. The neighboring fixtures contain the complete runtime
dependency graph selected for this target, with no dependency scripts executed:

| Package | Pinned version | Files | Published gitHead |
| --- | --- | --- | --- |
| sirv | 3.0.2 | 6 | `1135207e92c40354543cbd15c763c7a61d79d432` |
| mrmime | 2.0.1 | 6 | `c95e4bf5ac71e7847c7e74d409e237a37c7b5053` |
| totalist | 3.0.1 | 9 | `4b071d3e54d466a4059de89006c752da782c8b02` |
| @polka/url | 1.0.0-next.29 | 5 | `02cbdb529ddca0a9f3d225e2abb2931924219cc3` |

On **2026-10-05**, each archive was fetched from the official npm registry and
its SHA-512 compared with that version's registry integrity. Extraction accepted
only ordinary files/directories below `package/`, rejecting traversal, symlinks
and other archive entry types. All 26 files are retained, including licenses,
types, ESM and CommonJS builds, and readmes. Each fixture's `integrity.json`
records the metadata/archive URLs, archive integrity, published gitHead and
SHA-256 of every file. Offline specs verify the exact file set and hashes.
The archives themselves are not retained. Git revisions identify the published
metadata; unlike the pico fixture, these generated builds have not been asserted
byte-identical to repository source files.

The selected dependencies satisfy sirv's published ranges: mrmime `^2.0.0`,
totalist `^3.0.0`, and @polka/url `^1.0.0-next.24`. They have no further runtime
package dependencies. Tests copy the unchanged directories to a temporary
`node_modules` layout, preserving package exports and Node's normal resolution.
No package install, postinstall, source rewrite or symlink workaround is used.
Published fixture type declarations are inert data, excluded from Prophet's own
TypeScript compilation; the old compiler cannot parse their modern `import type`
syntax. The complete original declarations remain in the integrity inventory.

## Current evidence and boundary

`test/sirv-target.spec.ts` runs the shared CLI runtime acquisition against
`module.exports = require("sirv")`. Conditional package exports select the
actual `build.js`; evaluation currently stops at the shared identifier-only
binding guard for its object destructuring. No successful sirv startup or
symbolic request result is claimed yet. Replace this boundary assertion with
supported behavior as the generic VM feature lands, keeping later reached gaps
explicit.

The independent pinned Node **v24.21.0** reference uses a temporary regular-file
tree, the original default sirv factory, Node HTTP and its actual registered
request listener. An ephemeral server binds only to `127.0.0.1`; sequential
GET/HEAD requests to the fixture file return 200 with the expected body/empty
body, and a missing request returns 404. No runtime monkeypatch supplies package
results. These concrete witnesses do not prove all URLs, schedules, filesystem
states or dependency behavior. Real I/O occurs only in this independent oracle,
never as a native fallback during symbolic execution.
