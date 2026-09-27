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

The specs execute a percentage normalizer that calls this package with
`value >= 0 && value <= 100`, then returns `value / 100`. Its symbolic input is
an unrestricted JavaScript number, including NaN and both infinities. In both
development and production, Prophet proves that the call either rejects the
input or returns a number in [0, 1], and that rejection occurs exactly when the
range check fails. Rejection has the concrete Error name and expected message.
The lazy message runs once on development rejection and never on acceptance
or in production.

Independent Node v24.21.0 fixtures cover signed zero, NaN, infinities, subnormal
and extreme finite inputs, both range boundaries, callback failures, and the
ordering and effects of message-object string conversion, including conversion
failures. These claims concern this unmodified package under the supplied
environment; they do not establish complete JavaScript Error, string, or Node
host conformance.
