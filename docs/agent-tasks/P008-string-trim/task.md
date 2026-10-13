# P008 — shared String.prototype.trim through unchanged mrmime

Assigned2026-10-13 after P007 independent acceptance. Base8a2b976fff5d03589660f1fc344c4549d3c01771 (draftPR71); exact-headGitHubCI is still pending and root monitors it. No P007 source edits. Master stays3377cfe.
Sole implementer Atlas gpt-6-astra/high; current parent instruction makes high the normal effort. Work ONLY in /Users/netanelgilad/development/prophet-worktrees/astra-p008-string-trim on agent/p008-string-trim. Every command explicitly sets this workdir, every edit uses absolute paths.
One Atlas Astra implementer in a new branch/worktree, independent strong review
of frozen exact source follows, draft PR only. No merge/release/push by worker,
paid APIs, credentials/access expansion, model/account switching or subagents.

Outcome: implement generic String.prototype.trim needed by unchanged mrmime's
lookup in unchanged sirv factory. Preserve original fixtures and FS alternatives;
next actually reached API stays typed boundary. Don't broaden to toLowerCase,
lastIndexOf, Date/Stats metadata, streams, normalization, replace or server setup
in the same task. If next legacy assertion loses state, minimal typed lookup
boundary is permitted with a precise retained-state regression and gap record.

Own src/string/trim.ts, src/string/String.ts, focused test/string-trim.spec.ts;
src/ASTResolvers.ts only integration/next-boundary classification if required;
test/sirv-target.spec.ts only actual progression, real CLI graph and provenance;
test/test262.spec.ts and README for whole unmodified cases; affected string/sirv
boundary docs, stable gap inventory, wiki/string-trim.md and wiki/README.md;
this task folder. Never edit P007 matcher/intrinsic/probes or other worker files.

Use shared RequireObjectCoercible/ToString/branch/heap/completion semantics;
interpret user coercion with actual effects and abrupt results. Concrete strings,
finite choices, borrowed primitive/object receivers, canonical full modern ES
Whitespace+LineTerminator trimming at both ends are core acceptance. Preserve
interior whitespace and excluded U+0085/U+180E/U+200B, astral/surrogate contents,
empty/all-whitespace strings, immutability and identity of prototype intrinsic.
Null/undefined throw guest TypeError before ToString; effects/prototype changes
at current heap respected; nonconstructible builtin name/length as applicable.
Open symbolic strings remain an explicit boundary or rigorously represented
symbolic result with dependencies—never a guessed string/proof. Keep existing
exotic primitive-hook guards; don't invent Symbol.toPrimitive semantics.

Start red specs, verify exact expectations in pinned Node24.21.0, then implement.
Whole unmodified Test262 cases cover whitespace/receivers/ToString; choose modern
compatible expectations and document old historical Unicode assumptions rather
than alter upstream files. No new skips or weakened assertions. Caps bound scan
work and allocation before large-input preparation and preserve reached coercion
state; external timeout for stress. No regex native matching shortcut required.
Actual unchanged sirv + CLI graph must advance beyond trim and retain all FS
throws/boundaries; no claimed factory/server completion unless truly reached.

Run focused checks and full suite/typecheck with pinned runtime, exact source SHA,
complete log paths/exits/counts, generated SHA256 evidence, full documented
unsupported guard/skip audit and residual gap IDs. Commit locally and freeze;
return one complete evidence-bound handoff. Root publishes stacked draft PR
against P007 only after independent review. Budget review capacity; report actual
provider limitations and stop instead of rotating/circumventing quota.

Read AGENTS, agent-workflow, current sirv and string boundary docs and P007 wiki lessons. Source primary: https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.trim . PinnedNode at /tmp/prophet-node-24.21.0/node-v24.21.0-darwin-arm64/bin/node; set PROPHET_NODE_BINARY. Existing node_modules is linked; do not install/mutate dependencies. Use existing pinnedNode/.yarn/releases/yarn-3.1.1.cjs Jest command. Check default Jest discovery before long validation; production helpers must not be named test.ts. Use a900s external limit for full suite (known baseline329s), not300s. Freeze source/specs before final validation and give evidence docs a separate commit. Stop at complete handoff; root owns draftPR and review. Follow-up PR base is agent/p007-regexp-test; never merge or publish master.
