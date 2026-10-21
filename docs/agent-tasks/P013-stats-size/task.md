# P013 — bounded Node Stats.size from declared file facts

Worker: Instinct (sandbox), 2026-10-14. Base: 34c24dc (P012 head) plus the
checkout-history CI correction. Branch agent/p013-stats-size.

Outcome: reusable Stats.size through the shared filesystem model, advancing
unchanged sirv header preparation past `stats.size` (Content-Length = 16 for
site/hello.txt) to the next measured stop at `stats.mtime` in `toHeaders`
(Last-Modified). No Date/mtime semantics, no directory sizes, no write support,
no factory/server/request success claim.

Supported domain:
- `fileSystemFile` derives the UTF-8 byte length of declared concrete contents.
- `fileSystemUnobservedFile` accepts a validated nonnegative safe-integer
  observed size; the CLI capture passes the memoized lstat size at entry
  observation (no new host call at read time).
- First read persists the reached fact after the current own property check;
  P012-R1 supplied-size precedence (own data property, conditional presence,
  alias replacement, inherited-never-substitutes) is unchanged.
- Directory sizes and files without a declared size keep the existing typed
  "Unmodeled host property 'size': Node Stats fields" boundary.
- Stats instances are boundary-marked: reached unmodeled Stats fields (mtime,
  mode, writes, inspection) stop as retained typed boundaries beside their
  siblings instead of host failures that lose state and the CLI graph.

Specs first: test/node-stats-size.spec.ts (native pinned Node 24.21.0 controls
for byte counts incl. empty/UTF-8 multibyte, nonnegative number not UTF-16
length, repeated/aliased reads, supplied-own-size precedence, directory and
undeclared boundaries, declared-size persistence, invalid declared sizes,
symbolic-branch correlations). Migrated from measured output, preserving all
other assertions: node-filesystem.spec.ts (size boundary witness moved to a
directory; write guards now retained boundaries), sirv-target.spec.ts
(frontier now stats.mtime), node-filesystem-size-presence.spec.ts and
p012-correction/independent review setups (undeclared-size fixture keeps
presence/admission semantics on genuinely unknown metadata), p009-p011 review
CLI frontier assertions (stderr/graph message now 'mtime'). Frozen git-show
review artifacts untouched.

Validation (sandbox, Node 24.21.0, PROPHET_NODE_BINARY pinned):
- Full suite: 142 suites / 4487 passes / 46 unchanged skips, run chunked with
  --runInBand per 34-37 files (environment limit on long-lived processes);
  typecheck clean.

Remaining gaps: mtime/Date modeling (next measured stop), directory sizes,
Stats writes/mode/descriptors/constructors, fresh unknown-size writes.
Wiki article and evidence.json curation pending (noted in the draft PR).
