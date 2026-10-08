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

## An active turn can hide a provider retry

Observed during [P003](../agent-tasks/P003-for-statement/review.md), 2026-10-08:
Atlas continued reporting an active turn with unchanged completed reads after
OpenCode's provider log recorded a rate-limit error. Its conversation projection
had no retry/error item and the approval queue was empty. `readThread` in
`server/opencode-client.ts` maps both OpenCode `busy` and `retry` to an active
turn; activity alone is not evidence of progress or a reason to resend.

When the conversation and approvals do not explain a stalled owned worker, a
bounded read of the local OpenCode provider log filtered to that exact session
can establish a provider error without changing the service or exposing secrets.
Record the timestamp and observed message; do not invent quota/reset metadata.
Keep the existing turn during provider backoff. Polling a local status endpoint
does not warrant additional model prompts or model/account substitution.

## Reset metadata discovered after P003

The later [quota investigation](provider-quotas.md) recovered an actual
FreeUsageLimitError response and Retry-After targeting 2026-10-09 00:00 UTC.
That changes the interpretation of the apparently stalled active turn: OpenCode
may have been honoring a long provider wait. Do not interrupt/resubmit based
only on minutes without output. Prefer the error/reset metadata, which current
Atlas conversation projections omit. A different free-model pilot can have
capacity, but belongs in a new thread and a separate trust record.

## Archive verification can differ from cached conversation metadata

P004 archive returned `archived: true` at 2026-10-08T12:53:27.172Z. The thread
list GET independently showed that timestamp, while cached conversation GET
still showed null. Verify archive through the project thread list after the
mutation; do not resend the archive merely because a conversation snapshot is
stale. This is observed Atlas behavior, not a change to its service.

The blocker PATCH API updates status/owner/source only; a supplied body is ignored.
For a materially obsolete blocker description, create an accurate replacement,
then close the old record with a `superseded-by:<id>` source and a progress note
that this is replacement, not recovery. Never claim a body was edited without
reading the persisted result. P004 replaced the earlier Muse-only description
with blocker `blocker_5d08fc2f-542a-4341-985c-4432651a598f`.
