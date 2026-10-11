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

## B1 first source review: changes requested

Source `effcdd7a85bcbc9eb06f66d87a03cbf833b7e729`, evidence `3eb9e95`.
Root reviewed all changed source/spec lines and docs; verified artifact hashes
against git-show of the exact source and all recorded log hashes. Worker reports
109 focused passes, typecheck0, two Phase A representation passes and the expected
over-budget loop red. No B2 or full-suite success is claimed.

Independent reviewer source snapshot `0a2431e` is byte-identical in src and adds
14 root probes. Pinned Node/Yarn/Jest run with60s external timeout returns
11pass/3fail in3.231s; full log `/tmp/prophet-p006-b1-handoff-review-final.log`.
An earlier combined run at `afb0b5e` passed all14 worker tests and11 root tests,
with two root failures (27 total); the extra concrete-region probe was then added.
Reviewer-only commits must never be integrated as worker implementation.

Findings: inherited custom read hooks are missed (soundness); affine slice-index
aliasing stops (required precision prerequisite); the symbolic-endpoint budget
also suppresses existing concrete-region facts (precision regression). The worker's
budget test needs an eligible within-cap control. Corrections and narrowly expanded
prototype-hook ownership are in [b1-corrections.md](b1-corrections.md).

Root draft snapshot `2d65416` additionally exposed branch-cache leakage. Sol
independently fixed its branch refinements and related membership mutation before
handoff; both root cache probes now pass. Attribute this as overlapping draft
detection/self-correction, not a delivered cache defect. The corpus, provenance
and source-bound evidence are useful, but independent review remains necessary.
No first-review acceptance, trust increase or concurrency increase.

Correction turn `01a12962-2df1-72e2-bd1b-5118ac210132` runs in the same Atlas
gpt-6-sol/high thread. B1 remains unaccepted; B2 remains gated on its review.

## B1 accepted source; B2 active

Corrected source88bc034 fixes the original batch; its artifact/log hashes verify
and worker115 focused tests/typecheck pass. Root added affine-rounding and
in-place hook controls, then ran review-only snapshot6168e08:37pass/1fail
(18 root +20 worker), 3.73s. Remaining flaw: trusted hook-object identity survives
an in-place replacement of its read function. This was returned as the second
source correction; see [the exact case](b1-hook-correction.md).

Final B1 source `443221795a551eb9e0fe01e4e4954e9e95ca3403` validates the original
read function as well as the hook object. Root reviewed the entire correction,
verified all source/log hashes in e3800ba's evidence, and independently reran
18 root +21 worker cases at review-only snapshot34bafb4 (byte-identical src):
**39pass**, exit0, 3.021s, log `/tmp/prophet-p006-b1-r2-review.log`.
Worker116 focused regression passes and typecheck0 are source-bound. B1 source
is accepted in its documented representation domain; the full milestone is not.
No loop theorem or full-suite pass is claimed from these focused runs.

Evidence commit e3800ba accidentally force-added three ignored generated logs.
Root requires tracking cleanup while retaining local files/hashes. This is an
evidence handoff defect, separate from the two source correction rounds. Full
semantic review and one worker remain; no clean-first-review streak is earned.

B2 is authorized by [b2-authorization.md](b2-authorization.md), turn
`01a12973-477a-7fb3-8666-843f5290d35a`, same model/thread/worktree. The verifier must
derive current-state invariants and preserve real state/effects; final acceptance
still requires full tests/typecheck, gap/skip audit and exact-head CI.
