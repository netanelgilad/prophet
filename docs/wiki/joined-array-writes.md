# Joined ordinary-array writes

P050 uses the existing heap property/presence/key-order representation when a
join drops the optional element vector. Missing vector does not mean unknown
property state. Do not restore the original array.value: that resurrects truncated
elements and discards branch writes. Do not enumerate every hole combination.

A write owns one index on every reaching path; length grows only when that index
exceeds the old length. Truncation deletes own indexed keys and presence/order
records, never substitutes own undefined. Growth creates holes. Keep persistent
contexts and alias identity intact. Receiver and prototype write semantics must
be admitted before atomic mutation, with bounded preparatory work.

[Specs](../../test/joined-array-writes.spec.ts),
[task and review](../agent-tasks/P050-joined-array-writes/task.md),
[array boundary](../array-push.md#p050-joined-ordinary-array-storage).
This prerequisite is not arbitrary-length sequence/store induction.
