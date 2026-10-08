# Atlas worker operation notes

Observed 2026-10-07 against local Atlas checkout `78f70c50` and its live service.
Verify current API/model availability on resume; these are operational notes,
not permission to change Atlas itself or expose its loopback services.

- Local Atlas base is `http://127.0.0.1:5175`. Its JSON CLI runs from
  `/Users/netanelgilad/development/atlas-status` via `npm run cli --silent --`.
  Agent commands require `--base-url`; normal board commands can use local SQLite
  through the CLI. Never edit the database directly.
- Read `/api/agents/projects/prophet/providers/opencode/options` before selecting
  a model. P001 used `opencode/muse-spark-1.3-contributor-free`, build/high;
  `agent thread runtime prophet opencode <id>` verified all three and writable state.
  Free pricing does not establish unlimited quota; no numeric quota was supplied.
- Create with `agent thread create prophet --input @file`, then send once with
  `agent message send prophet opencode <id> --input @file`. JSON contains prompt,
  explicit modelId/agentId/reasoningEffort, and images: []. Keep actual payload in
  the task record. A successful send acknowledges acceptance, not task completion.
- `agent thread get prophet opencode <id>` returns conversation items, activeTurnId
  and runtime identity. Read tool/errors/questions and pending approvals when
  activity stalls; an active status alone does not prove execution is progressing.
- Atlas's project thread creation has no cwd override. P001's thread cwd remained
  main; its prompt required absolute edit paths/explicit workdir in the isolated
  task worktree. First reads paused on external_directory permission. The
  orchestrator verified the requested pattern was exactly the already-authorized
  P001 worktree before granting it. Never treat arbitrary queued approvals as
  authorized; do not broaden filesystem permissions or change project repoPath.
- Provider-neutral `thread link <goal> opencode <id>` is supported by the current
  CLI (older skill prose described Codex-only links). P001 is linked to the real
  application analysis goal. Preserve provider identity in all records.
- After saving the reviewed result/wiki, archive with `agent thread archive
  prophet opencode <id> --base-url ...` and verify archivedAt with thread get.
  Keep active/blocked threads available. Archive only threads owned by this run;
  it retains history and is distinct from deleting a provider session.

Sources: Atlas `cli/atlas-status.ts`, `src/shared/agent.ts`,
`server/index.ts`, `server/agent-service.ts`, `server/opencode-client.ts`, and
P001's recorded API responses. P001 archival was verified at completion on
2026-10-08T03:18:11.879Z, after accepted source and successful published CI.

## Observed provider failure

P001 encountered a provider rate limit after useful work. Three same-thread
retries following increasing cooldowns also failed with zero output and no
reset/Retry-After metadata. This establishes an operational blocker, not its
quota type or duration. See the [dated review log](../agent-tasks/P001-array-concat/review.md)
for timestamps and the resumption checkpoint. An accepted send or an active
turn may represent provider retries, so neither is evidence of model progress.

Muse recovered on 2026-10-08: the same P001 thread produced edits and completed
verification after the 02:55:31 UTC resume. No model/account substitution was
used. P002 starts separately only because it is a new accepted follow-on task;
its worktree reads can require their own scoped external_directory approval.
