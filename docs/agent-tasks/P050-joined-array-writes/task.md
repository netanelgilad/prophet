# P050: ordinary array writes after conditional length joins

Base44af211; branch agent/p050-joined-array-writes; shared implementation worktree
/Users/netanelgilad/.codex/worktrees/p035-longcat-environment/prophet.
User continues toward mutable arrays of unknown length. This prerequisite removes
loss of subsequent mutation after finite ordinary-array length joins; it does not
claim arbitrary-length symbolic sequence stores or compaction induction.

Implement reusable persistent index/length writes for closed ordinary element-shape
arrays after joins, preserving conditional length/presence, holes, alias identity,
source evaluation order, non-index properties, enumeration and older contexts.
Reject unsupported receiver/prototype metadata before mutation; bound preparatory
work and preserve earlier effects. Keep unknown/segmented/immutable symbolic array
domains explicit. Begin with positive, negative, symbolic and pinned Node controls;
activate relevant complete unmodified Test262 cases where supported. No recognizers.

Root owns source/specs/docs/publication; design agent is read-only. Independent
review owns separate tests only after coordinated assignment. Full semantic review,
full suite/typecheck, complete gap scans and skip inventory, exact-candidate CI,
then fast-forward master and push. Preserve owner website files. No paid services.
