# P006 review — in progress

2026-10-11: user asked to trial Codex Sol on unknown-length loop inference.
Live Atlas catalog and built-in agents both expose `gpt-6-sol`, not Sol 6.1.
Root disclosed the distinction and selected high reasoning. Runtime verified
`currentModel: gpt-6-sol`, `currentReasoningEffort: high`, writable.
Atlas Codex client/catalog version: `0.162.0-alpha.17.2` (not a weight version).

- Thread: `01a12938-45e4-7233-a657-9808dad451aa`.
- First turn: `01a12938-8a5d-7141-87aa-6883a91a48ef`.
- Worktree: `/Users/netanelgilad/development/prophet-worktrees/sol-p006-unknown-loop`.
- Branch: `agent/p006-unknown-loop`.
- Source base: `22739fa3856ad83244a643445fbac80ae16cc15d`.
- Task bootstrap: `541235e`; no implementation changes.
- Prompt payload: `/tmp/prophet-p006-dispatch.json`; task contract is durable.
- Phase A owns design/new red specs/evidence only; no production edits authorized.
- No accepted evidence, correctness score or concurrency increase yet.
- Thread remains unarchived while active. Root remains available to review.

Review will independently check inductive soundness, progress and loop exit,
state/effect dependencies, representation changes, invalid variants and exact
evidence. All solver code receives full review. A green example or bounded
unrolling does not prove the unknown-length theorem.

## Phase A review and B1 dispatch

Handoff `0f891185bb348f09614067ab63fba9f7c20229e7` changes only the owned
design, evidence and new spec (654 lines); no production change. Root read all
three, verified every artifact/log SHA256 against local bytes, and independently
reran native controls plus the three focused red probes using pinned Node and
the existing Yarn/Jest command with a 70s external timeout. Log:
`/tmp/prophet-p006-root-phase-a.log`; exit1, 2 passes/3 intended failures,
14 filtered tests, 5.46s. Failures reproduce concrete-key rejection, body budget
and the existing custom-indexed-read guard bypass. Root did not rerun the costly
inconclusive arbitrary-array timeout or claim full-suite success.

The design correctly separates initialization, arbitrary transition, candidate
refinement, progress/coverage and exit, and calls out the concrete-index/region
representation prerequisite. It is an outline, not an implemented proof.
Worker self-corrected a catch/assertion hazard before handoff and independently
found the lookup guard bypass; these are not reviewer-discovered escaped defects.

Root's correction batch: native edge cases need VM/native comparison; the positive
domain needs default uint32 lengths with nonconstant elements; invalid-loop specs
must distinguish bounded fallback from completed unknown values; abrupt-leaf
assertions need actual throw/normal contents. Choose loop-level entry at current
state so pre-loop effects run once. Detailed ownership and requirements are in
[phase-b.md](phase-b.md). These refinements do not weaken the required minimum
theorem. No correctness trust or concurrency gate is increased.

B1 started in the same Atlas thread, turn `01a1294b-d77b-74f1-9542-666b47cb4755`,
with explicit `gpt-6-sol`/high. It owns the representation prerequisite only and
must stop for source review before the loop verifier. The final milestone still
requires full suite/typecheck, gap reconciliation and exact-head CI. Red design
specs remain on the worker branch and are not published as working support.
