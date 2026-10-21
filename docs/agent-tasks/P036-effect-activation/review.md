# P036 root review and validation

Accepted implementation `fea694239883e4b2dccf93e38c127ddcadc34960` in the
[declared activation/origin domain](../../interpreted-activations.md).
Root reviewed all six production diffs and integration/core/independent specs.
The [independent reviewer](independent-review.md) traced invocation, constructor,
CommonJS, eval, proof-summary and scheduler paths and ran nine separate probes.
Final reviewed source hashes match the implementation commit.

## Evidence and corrections

- Core first red: seven failed/one passed before source changes, missing origin
  or activation; the proof-hook exclusion case already passed. Core focused
  regression runs and typecheck then passed.
- Independent first red: eight missing-provenance failures on stable original
  source. Final nine pass with stable hashes and an external30-second timeout.
  One graph assertion was refined to test target references without imposing
  an omitted-vs-explicit-undefined parent encoding. This was an oracle refinement.
- Integration first red: two absent-origin failures on the original source.
  Later expansion ran concurrently with implementation and is not claimed as
  all-red evidence. A macOS /var versus canonical /private/var fixture expectation
  was corrected with realpath; public process.nextTick is still unmodeled, so
  the scenario uses actual HTTP.listen startup-queue callbacks instead. Allnine
  integration cases pass; no new process API is claimed.
- Final full suite: 174 suites,5233 passed,46 historical skips; typecheck exit0,
  pinned Node24.21.0. Exact commands, durations and log hashes in evidence.json.
- Root's actual CLI subprocess evaluates unchanged pico startup with max-steps1.
  Exit2/stderr correctly report the budget stop; graph current.activation retains
  the entered module and target while initial has no activation. This manual
  transport probe supplements the committed generic graph/spec cases.
- Four documented scans rerun. The sole new guard is different-activation join
  rejection; receiver guards only moved indentation. Complete Test262 inventory
  remains484files/959variants,43parse-negative/85variants,46historical skips;
  every selected source hash and skipped filename is retained in evidence.

The entry checkpoint and branch-join design findings were addressed before the
first implementation review. Full source review found no remaining actionable
findings. This increment changes generic metadata, not Test262/Node semantics or
summary answers; existing full compatibility suites remain regressions. No new
upstream case is represented as activated. Native stack equivalence, arbitrary
depth, asynchronous causality, package identity, outbound transport and policy
remain explicit gaps. No stable gap closed; no trust/concurrency promotion.

## Publication gate

The implementation and evidence candidate require exact-candidate CI before
fast-forward to origin/master. User authorization already covers publication.
Unrelated primary checkout files must match their saved hashes before and after.
