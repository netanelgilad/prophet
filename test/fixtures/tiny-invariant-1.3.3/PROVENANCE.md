# tiny-invariant 1.3.3 fixture

`package/` contains all 13 files from the unmodified published npm tarball:
https://registry.npmjs.org/tiny-invariant/-/tiny-invariant-1.3.3.tgz

Metadata: https://registry.npmjs.org/tiny-invariant/1.3.3

Published Git revision: `a6b189389aeaf2b6b2d8517bd3869ec993de4507`.
The archive was verified against its published SHA-512 integrity value before
extraction; `integrity.json` records that value and each extracted file's SHA-256.
The original MIT license is retained in `package/LICENSE`.

The spec reads these files as a supplied module graph. It does not install the
package, run its scripts, rewrite its source/metadata, or substitute a model for
its invariant function. Its conditional exports choose the CommonJS build.
`process.env.NODE_ENV` is an explicitly supplied environment value.

The first proof covers inputs that satisfy the invariant, in development and
production, including that the lazy message is never called. It does not claim
the rejection path: full Error construction and string concatenation methods
remain VM implementation work for the next published-library proof.
