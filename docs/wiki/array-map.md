# Bounded map: iteration and fresh output

P044, Codex implementation and independent review, 2026-10-29.
Source: [map](../../src/array/map.ts), [contract](../agent-tasks/P044-array-map/task.md),
[boundary](../array-push.md#shared-bounded-map-p044).

- Capture length once; re-read each index's current presence/value after callbacks.
  Holes and own undefined differ, and inherited values create own result elements.
- Map observes constructor/species; forEach does not. Do not transplant concat's
  isConcatSpreadable guards or reject irrelevant receiver symbol state.
- Default-species restriction means callbacks cannot observe intermediate output.
  Private fresh sparse snapshots preserve per-branch shape; result aliases escape
  only on normal completion. This is bounded quadratic work, not a scalability claim.
- Review found an inherited propertyAccess hook could be silently treated as an
  absent hole. Guard the reached prototype lookup and retain completed prefix
  effects. Dense own reads do not need that inherited-index lookup.
- A builtin used as a test's unsupported sentinel eventually becomes implemented.
  Move sentinel tests to another explicitly deferred API and add real behavior
  assertions for the newly implemented API; do not weaken completion assertions.
- Sirv gzip and brotli factory setup use map; Brotli's later /i regexp is a distinct
  boundary even with no accept-encoding header. Factory completion is not all
  request coverage. See [package cases](../../test/sirv-map.spec.ts).

Independent unshift review also found that a trusted lookup object identity and
read-function identity do not prove its write function is unchanged. Keep read
and write trust helpers separate; unshift checks both for new destination writes,
while map does not introduce an irrelevant write-hook premise. The regression
mutates the existing hook in place and requires a stop before array mutation.
