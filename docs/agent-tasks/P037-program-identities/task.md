# P037: source identities in the CLI graph

Base: `348fe0c906f3deda30edbc5f7bef305c76785fe9`, published P036.
Branch: `agent/p037-program-identities`. Owner: Codex root with its subagents,
following the user's explicit direct-implementation instruction.
Status: implementation `a7ef378` independently accepted; full177 suites/5262 passes,
46 historical skips and typecheck pass. Exact-candidate CI/publication pending.
[Review](review.md), [evidence](evidence.json).

Previous P036 supplies executing filenames and dynamic interpreted call origins.
Expose exact captured-file identities so consumers can correlate those labels
with acquired bytes. This is a generic program input observation, not npm policy.

Add roots.program to the same roots/nodes graph. Frozen record:
{runtime, filename, args, cwd, source, sources, paths}.
source aliases sources.get(filename). Each source identity is {sha256, byteLength}
for the exact validated UTF8 bytes observed by the source provider. Sources include
entry, reached JS/JSON and package metadata. Paths records positive/negative
resolver probes; a positive file probe need not have a successful source read.
No source text in this projection. Consumers must provide/reacquire bytes and
verify the identity before relying on code; no source availability/resumption or
registry/package integrity claim follows from a local digest.

The final set is the union of first acquisition observations reached across the
whole exploration. It is not import execution history, all-path dependency use,
a coherent time-zero OS snapshot or the whole resolved npm tree. Initial/current
contexts are not retroactively mutated. No new guest-visible property or API.

Capture byteLength directly when hashing original read bytes. Keep native
FileExecution.input text compatibility, but public builder snapshots copies;
freeze identities, args and record. Copy maps and block ordinary set/delete/clear
with nonenumerable throwing methods (native prototype bypass remains trusted
embedding gap). No native map alias can mutate published observations.

Bound publication preflight before allocating the copied maps:4096source entries,
16384path probes,4096args,4MiB aggregate UTF8 metadata strings (source/path keys plus each digest/kind string,
argv strings, runtime/cwd/entry labels; duplicates count once per occurrence in
those containers, entry alias no second record charge). Cheap code-unit bound before Buffer.byteLength; count all
strings before copying, no traversal over source text. byteLength must be a safe nonnegative integer from original Buffer.length; never
compute it from interpreted or normalized source. Identity records are bounded
by entry count. Exactly at limits admitted; beyond
fails publication with diagnostic+exit 1 and empty stdout, no truncation.
This does not bound existing source acquisition read sizes or native execution/
graph traversal, and does not convert incomplete analysis into success.

Normal, guestthrow, typedpartial and legacydiagnostic outputs carry acquired
observations. Entry acquisition errors before a context exists keep existing
exit 1/no graph. Malformed environment still rejects before target acquisition.

Specs before implementation: actual subprocess entry/helper/JSON/pkgmetadata and
missing candidates; exact bytehash/lengthinclBOMandmultibyte; alias target mapref;
branch acquired union vs unexecutedcounterpart; finalsubsetafterpositiveprobe/read
failure; mutation isolation; publication limitsexact/over with no omitted entries;
existinggraphroot expectations updated; mainserializewholebeforestdout. Existing
fullsuite/typecheck/gapinventory, independentreview andcandidateCI beforepublish.


## Review and ownership

Root, implementation agent and independent reviewer agreed on identity-only
publication before dispatch. Digest/byteLength establish a checkable local byte
identity, not registry/npm integrity. The initially considered full-text dump
would introduce avoidable source-text serialization work; the selected contract
omits it explicitly. Reviewer required complete digest/kind accounting, immutable
copies and limits before allocation. Captured source reads and other graph work
remain independent resource gaps.

- environment_wiring owns CLI source/capture/builder and core unit specs, plus the
  two existing exact-root expectation updates in cli.spec.ts/cli-imports.spec.ts.
- environment_scenarios owns cli-program-integration.spec.ts, actual subprocesses.
- semantic_review owns cli-program-review.spec.ts and independent source review.
- Root owns docs, audit, final validation and publication; no worker pushes.

The network scout found that request() can reach agent/createConnection work
before end(), while dispatch can queue/reuse/proxy/custom-route. Therefore no
transport-attempt claim is introduced here. The next HTTP increment must make
routing/agent facts and phase boundaries explicit; file identity is separately
required before a package-permission verdict can be trustworthy.
