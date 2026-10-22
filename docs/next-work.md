# Next work after P043

## Current checkpoint

Instinct draft work is integrated and reviewed. The CLI exposes conditional state/effect graphs with exact source/package identity and actual call origins. It evaluates the unchanged node-notifier5.4.0 checkGrowl helper on explicit IPv4 inputs through TCP submission, selected connection completion, its actual empty end and user callback, first read registration, and selected empty-shutdown finalization. Pending input
and timer work remain visible. Tests retain waiting/failure/partial histories and bounded HTTP/TCP combinations. This is one package subpath, not full npm coverage or Shai-Hulud detection.

## Next implementation decision

P043 implements the pending shutdown callback and synchronous prefinish/queued
finish sequence. afterShutdown ignores its asynchronous status: writable finish
still does not establish successful shutdown syscall. Current reads and timers
remain pending, with explicit waiting and bounded event histories.

Next, scope incoming data/EOF/error or timer delivery from a concrete unchanged
application path. First establish pinned native behavior and the external input
contract. Decide how each new event competes with existing providers within the
declared horizon. EOF can change autoDestroy and end behavior; timer expiration
must preserve actual listener semantics and may occur before connection completion.
Do not silently impose chronological order, default successful I/O, or broaden
repeated-end/destroy support without independent specs.

Then model incoming data/EOF/error and timeout delivery where demonstrated package behavior needs them. Each increment must retain unknown/unsupported paths and current cancellation/resource facts. Broader resumption, event horizons, DNS/default localhost, read/write overloads and stream listeners remain gaps. Continue unchanged sirv/pico paths and grow the pinned package corpus as shared semantics improve, with source and dependency provenance.

## Supply-chain direction

Keep capability policy downstream of Prophet. Build a package/dependency inventory from package.json plus lockfile provenance, consume conditional effect graphs and attribute effects to actual executing package sources. Define per-package network/domain, file, process and environment capabilities. Diff old/new dependency graphs transitively and request approval for newly reachable effects, including effects whose destinations or reachability remain unknown. A lack of modeled effects is not permission or a safety proof.

Only after sufficient execution coverage, add a pinned, isolated incident-reproduction corpus for Shai-Hulud behavior, with expected detections and benign controls. Do not execute real exfiltration or claim incident detection from these networking fixtures. Report the declared input/environment domains and coverage limits with every security result.

## Validation and publishing

Use specs first, complete unmodified upstream language/host cases when supported, pinned Node comparisons and independent semantic review. Run affected tests, the full suite and typecheck; reconcile four gap scans and every historical skip. Publish only the exact CI-validated candidate to origin/master. Preserve owner files, keep the ledger/wiki current, and never use reset credits or external paid services without authorization.
