# Next work after P042

## Current checkpoint

Instinct draft work is integrated and reviewed. The CLI exposes conditional state/effect graphs with exact source/package identity and actual call origins. It evaluates the unchanged node-notifier5.4.0 checkGrowl helper on explicit IPv4 inputs through TCP submission, selected connection completion, its actual empty end and user callback, and first read registration. Pending work remains visible. Tests retain waiting/failure/partial histories and bounded HTTP/TCP combinations. This is one package subpath, not full npm coverage or Shai-Hulud detection.

## Next implementation decision

Start with a spec/design increment for pending shutdown completion on this same unchanged dependency path. Read pinned Node afterShutdown/finalization and full upstream candidates, define the external input and ordering contract, and use controlled native compatibility cases. afterShutdown ignores its asynchronous status: do not equate finish with successful shutdown syscall. Preserve finalPending, prefinish/finish ordering, callback exceptions and pending readable/timer state. Decide explicitly how this event competes with existing providers within the declared horizon; do not silently invent chronological ordering or timer behavior.

Then model incoming data/EOF/error and timeout delivery where demonstrated package behavior needs them. Each increment must retain unknown/unsupported paths and current cancellation/resource facts. Broader resumption, event horizons, DNS/default localhost, read/write overloads and stream listeners remain gaps. Continue unchanged sirv/pico paths and grow the pinned package corpus as shared semantics improve, with source and dependency provenance.

## Supply-chain direction

Keep capability policy downstream of Prophet. Build a package/dependency inventory from package.json plus lockfile provenance, consume conditional effect graphs and attribute effects to actual executing package sources. Define per-package network/domain, file, process and environment capabilities. Diff old/new dependency graphs transitively and request approval for newly reachable effects, including effects whose destinations or reachability remain unknown. A lack of modeled effects is not permission or a safety proof.

Only after sufficient execution coverage, add a pinned, isolated incident-reproduction corpus for Shai-Hulud behavior, with expected detections and benign controls. Do not execute real exfiltration or claim incident detection from these networking fixtures. Report the declared input/environment domains and coverage limits with every security result.

## Validation and publishing

Use specs first, complete unmodified upstream language/host cases when supported, pinned Node comparisons and independent semantic review. Run affected tests, the full suite and typecheck; reconcile four gap scans and every historical skip. Publish only the exact CI-validated candidate to origin/master. Preserve owner files, keep the ledger/wiki current, and never use reset credits or external paid services without authorization.
