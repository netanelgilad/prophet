# Agent task and review ledger

Follow [the playbook](../agent-workflow.md). Task evidence is provisional until
independent review and integration. Keep actual thread IDs, model invocation,
base/tested/published commits and archive status here; do not imply a queued task
has run. Review depth changes require a recorded decision, not a growing test count.

Current calibration: **one active worker total; full implementation/spec review**.
See the [separate model/task-family trust register](../agent-models.md).
Numeric provider quotas are unknown. P001 recovered on 2026-10-08 after repeated
limits; dated cooldowns and actual recovery are recorded in its review. The pilot
needed two implementation corrections plus evidence corrections: no concurrency
increase or first-review acceptance streak.

| Task | Target | State | Review / knowledge |
| --- | --- | --- | --- |
| [P013](P013-stats-size/task.md) | Bounded Node Stats.size; advance unchanged sirv past Content-Length | Implemented by Instinct in-sandbox at 3fe7ed1; full suite 142/4487/46skip and typecheck green; independent review and wiki/evidence curation pending | [Boundary](../node-filesystem.md#bounded-statssize-and-the-p012-r1-boundary); frontier now stats.mtime |
| [P014](P014-stats-mtime/task.md) | Bounded Node Stats.mtime as a bounded Date (getTime/toUTCString); advance unchanged sirv past header preparation | Implemented by Instinct in-sandbox; full suite 143/4538/46skip and typecheck green; independent review and wiki article pending | [Boundary](../node-filesystem.md#bounded-statssize-and-statsmtime-and-the-p012-r1-boundary); frontier now String.prototype.normalize |
| [P015](P015-string-normalize/task.md) | Bounded ASCII String.prototype.normalize (omitted NFC form) | Implemented by Instinct in-sandbox; full suite 144/4496/46skip and typecheck green; independent review pending | [Task](P015-string-normalize/task.md); frontier now String.prototype.replace |
| [P016](P016-string-replace/task.md) | Bounded no-match RegExp String.prototype.replace | Implemented by Instinct in-sandbox; full suite 146/4505/46skip and typecheck green; independent review pending | [Task](P016-string-replace/task.md); frontier now Function.prototype.bind |
| [P017](P017-function-bind/task.md) | Bounded Function.prototype.bind; unchanged sirv factory returns its request handler | Implemented by Instinct in-sandbox; full suite 146/4505/46skip and typecheck green; independent review pending | [Task](P017-function-bind/task.md); next: calling the returned handler (sloppy receiver boxing gap) |
| [P018](P018-sloppy-boxing/task.md) | Bounded sloppy primitive receiver boxing (ToObject) | Implemented by Instinct in-sandbox; full suite 147/4512/46skip and typecheck green; independent review pending | [Task](P018-sloppy-boxing/task.md); next: request-path analysis (parse(req), http modeling) |
| [P019](P019-string-indexof/task.md) | Bounded generic UTF-16 String.prototype.indexOf; delivered sirv GET completes @polka/url parse | Implemented by Instinct in-sandbox; full suite 149/4638/46skip and typecheck green; independent review pending | [Task](P019-string-indexof/task.md); next: incoming request headers and the viaCache lookup path |
| [P020](P020-request-spread/task.md) | Bounded incoming request headers and ordinary-array call spread; delivered sirv GET completes header negotiation | Implemented by Instinct in-sandbox; full suite 150/4653/46skip and typecheck green; independent review pending | [Task](P020-request-spread/task.md); next: String.prototype.charCodeAt (toAssume trailing-slash probe) |
| [P021](P021-string-charcodeat/task.md) | Bounded String.prototype.charCodeAt; viaCache lookup completes on the delivered sirv GET | Implemented by Instinct in-sandbox; full suite 151/4722/46skip and typecheck green; independent review pending | [Task](P021-string-charcodeat/task.md); next: ForInStatement enumeration (send header loop) |
| [P022](P022-for-in/task.md) | Bounded for-in enumeration; send header loop completes on the delivered sirv GET | Implemented by Instinct in-sandbox; full suite and typecheck green; independent review pending | [Task](P022-for-in/task.md); next: response getHeader/setHeader/writeHead surface |
| [P023](P023-response-headers/task.md) | Response getHeader/setHeader surface with the lazily-created store and writeHead merge | Implemented by Instinct in-sandbox; full suite and typecheck green; independent review pending | [Task](P023-response-headers/task.md); next: content-length transport-sensitive decision at writeHead |
| [P024](P024-content-length/task.md) | Content-Length admitted as an ordinary explicit serialized field (no transport coupling without a socket) | Implemented by Instinct in-sandbox; full suite and typecheck green; independent review pending | [Task](P024-content-length/task.md); next: fs createReadStream/pipe |
| [P025](P025-fs-readstream/task.md) | fs.createReadStream/pipe with explicit embedding-driven delivery; sirv GET completes end to end | Implemented by Instinct in-sandbox; full suite and typecheck green; independent review pending | [Task](P025-fs-readstream/task.md); next: review + push |
| [P026](P026-sirv-dispatch/task.md) | bounded sequence (comma) expressions; sirv HEAD and 404 dispatch complete | Implemented by Instinct in-sandbox; full suite and typecheck green; independent review pending | [Task](P026-sirv-dispatch/task.md); next: review + push |
| [P012](P012-string-substring/task.md) | Bounded generic substring; unchanged mrmime MIME lookup to actual sirv Stats.size | Original3ef28e1 rejected forP012-R1; same Astra/high accepts correctedb582e2c; root integration/exact-headCI gates retained | [Boundary](../string-substring.md), [review](P012-string-substring/correction-1-independent-review.md), [publication](P012-string-substring/publication-review.md); no factory completion/trust promotion |
| [P011](P011-number-bitwise-not/task.md) | Number-domain unary ~; advance unchanged mrmime | First source b920a64 rejected for P011-R1; corrected source 5c70d29 accepted by same Astra/high reviewer; integration/CI gates retained | [Boundary](../number-bitwise-not.md), [review](P011-number-bitwise-not/correction-1-independent-review.md), [publication review](P011-number-bitwise-not/publication-review.md); no trust promotion |
| [P001](P001-array-concat/task.md) | Shared Array.concat; advance unchanged sirv | Accepted/pushed `b9c3864`; CI green; Atlas thread archived | [Two correction rounds](P001-array-concat/review.md): work limits, inherited state and invalid spec premises; full review retained |
| [P002](P002-array-foreach/task.md) | Shared Array.forEach; next reached sirv operation | Accepted/pushed `7defa45`; CI green; Atlas thread archived | [One correction round](P002-array-foreach/review.md); 12 independent probes, full suite/typecheck pass; evidence artifacts cleaned up |
| [P003](P003-for-statement/task.md) | Shared ForStatement at totalist and bounded loop-min proof | Accepted and integrated in master merge `f6da7af`; thread archived Oct10 | 14 independent probes; combined P005 suite fully green; full semantic review/corrections recorded |
| [P004](P004-loop-min-specs/task.md) | Loop-min proof-spec design; LongCat pilot | Reviewed specs from [PR70](https://github.com/netanelgilad/prophet/pull/70) landed unchanged in `f6da7af`; thread remains archived | All9 loop-min tests pass with P003/P005; spec-only LongCat evidence remains distinct from Muse implementation |
| [P005](P005-selection-membership/task.md) | Generic finite-selection membership precision | Accepted source `e18d18e`, metadata `d1d788c`, integrated in `f6da7af`; Muse thread archived Oct10 | 43 independent probes plus26 existing choice checks pass; full124 suites/3102pass/46skip and typecheck0; full solver review retained |
| [P006](P006-unknown-loop/task.md) | Verified unknown-length loop summaries | Accepted source0785ba6; Atlas thread archived Oct11; linear integration and exact-head publication gate | Sol high;78 combined review/feature checks,126 suites/3156pass/46skip/typecheck0; three source correction batches and evidence curation; full review retained |
| [P007](P007-regexp-test/task.md) | Bounded flagless RegExp.test; unchanged sirv filename filters | Sourcee13d6c1 independently accepted; isolated draft-PR candidate, no master integration | [Full semantic review](P007-regexp-test/independent-review.md): disclosed coercion correction and Jest discovery rename verified; 127 suites/3285passes/46skips/typecheck0,35 independent probes; exact-head CI gate pending |
| [P008](P008-string-trim/task.md) | Shared trim and truthful partial String surface; unchanged mrmime | Source06eefd5 independently accepted; stacked draft candidate over P007, no master integration | [Correction review](P008-string-trim/independent-correction-review.md): R1 metadata fixed, retained-state guards verified;129 suites/3476passes/46skips/typecheck0; exact-head CI gate pending |
| [P010](P010-string-lastindexof/task.md) | Bounded generic UTF-16 lastIndexOf; unchanged mrmime idx=5/unary ~ frontier | Sol 6.1/high; independent Astra/high accepts fcb650f; draft/exact-head gates tracked in PR/Atlas | [Evidence](P010-string-lastindexof/evidence.json), [review](P010-string-lastindexof/independent-review.md), [publication](P010-string-lastindexof/publication-evidence.json); no trust/concurrency promotion |
| [P009](P009-ascii-lowercase/task.md) | Bounded ASCII lowercase; unchanged mrmime lastIndexOf frontier | Sol6.1/high; independent Astra/high accepts corrected c52c3f4; draft/exact-head publication gate tracked in PR/Atlas | [Evidence](P009-ascii-lowercase/evidence.json), [wiki](../wiki/string-lowercase.md); [Review](P009-ascii-lowercase/independent-review.md), [publication evidence](P009-ascii-lowercase/publication-evidence.json); no trust/concurrency promotion |

P001–P005 are accepted in their recorded scope and their Atlas threads are
archived. P003/P005 complete the bounded loop-min milestone; P006 completes the
documented first unknown-length loop proof domain and its thread is archived.
LongCat recovery is not claimed. PR70's spec-only branch is superseded by the
combined master integration, preserving every reviewed assertion.

P007 advances unchanged sirv past its two filename filters to the typed String.trim boundary in mrmime, preserving the EMFILE sibling. Its branch is a draft-PR candidate; master remains P006 at3377cfe. Next application candidate after P007 acceptance: shared String.prototype.trim. The separate
reasoning milestone is verified unknown-length loop summaries. Explicit initial
environments and immutable larger-package scouting remain roadmap work. Scope
the next task from the actual integrated result. On Oct11 the user prioritized
unknown-length loops and a Codex Sol trial; P006's design/source gates and model
assessment are recorded in its review. The user asks for supervised
waiting/sleep through future limits; no model rotation is queued. Atlas completion
does not automatically wake the orchestrator; no unattended review is configured.
See [P005 review](P005-selection-membership/review.md) for source equivalence,
publication and CI evidence; no concurrency gate has been relaxed.


P012 correction1: original source3ef28e1/evidence82cb5c1 remain frozen and rejected
by Astra/high report5273aa2 for one P2 findingP012-R1. The same sole Sol6.1/high
writer corrects current known own Stats.size admission under the
[correction contract](P012-string-substring/correction-1.md). Original artifacts
remain byte-identical; corrected source/evidence require renewed same-reviewer
acceptance. No broader Stats semantics, factory completion or trust promotion.
