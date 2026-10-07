# Larger package scouting

Read-only scouting on 2026-10-07. These are immutable upstream source observations,
not vendored npm artifacts, completed dependency provenance or Prophet analyses.
No target package was installed or executed. Finish useful sirv progress first;
turn a candidate into its own acquisition/spec task when review capacity allows.

| Candidate snapshot | Observed scale / features | Proposed useful question (unproved) |
| --- | --- | --- |
| [serve-handler](https://github.com/vercel/serve-handler/tree/ead85eb0819cde32eed2bc5726ff6c8ac895f975), manifest version 6.1.8 | MIT; 7 direct runtime dependencies; src/index.js is 775 lines/20,121 bytes. Async handlers use stat/realpath, streams, range parsing and hashing. | Which filesystem failures escape the request handler, and which conditions produce an unfinished response? Later examine path resolution against a declared symlink/filesystem environment. |
| [http-server](https://github.com/http-party/http-server/tree/0d3b7bb5b6e8a59fd450ae2dca65870009cfcd8b), manifest version 14.1.2 | MIT; 14 direct runtime dependencies and a CLI; lib/http-server.js is 316 lines/9,510 bytes, with authentication and proxy branches. This manifest includes semver ranges, so the transitive graph is not pinned yet. | Under which inputs/configuration can a request cause an outbound proxy operation, and what code/conditions precede it? A separate consumer can ask an authorization-history question. |

Sources inspected: pinned [serve-handler manifest](https://github.com/vercel/serve-handler/blob/ead85eb0819cde32eed2bc5726ff6c8ac895f975/package.json)
and [handler](https://github.com/vercel/serve-handler/blob/ead85eb0819cde32eed2bc5726ff6c8ac895f975/src/index.js);
pinned [http-server manifest](https://github.com/http-party/http-server/blob/0d3b7bb5b6e8a59fd450ae2dca65870009cfcd8b/package.json)
and [server](https://github.com/http-party/http-server/blob/0d3b7bb5b6e8a59fd450ae2dca65870009cfcd8b/lib/http-server.js).
Manifest versions describe these source snapshots; equivalence to published npm
archives has **not** been verified.

Expected prerequisites are inferences from source: serve-handler needs shared
async/Promise semantics, broader filesystem/stream/crypto models and its dependency
graph. http-server needs additional syntax (including nullish assignment), CLI
process state, authentication dependencies and outgoing HTTP/proxy semantics.
Do not replace the packages with models, skip their dependencies, infer a security
finding from these questions, or add policy labels to VM values. An acquisition
task must verify complete original archives/licenses and every dependency before
an executable package milestone is claimed.

SHA-256 of inspected bytes, in source order (manifest then entry):

- serve-handler: `1ac3ae19cde328ce2c2e23ba1e5bb2560f7653f70600cdf2fd98d86b000358b9`,
  `dd359ee29c7b27d35116571a3027af46e460b14126fea12e1eb11384982deab6`.
- http-server: `e62b96d7ac86228b66967fdb9dbe2bc35ae2fe01dc21bb45a222211e48d1968a`,
  `8a354bf5f0ed6f2ec9f90940a2a4ea6ddf061cadc5a5905b008f2c9453c87b95`.
