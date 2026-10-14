# P017 — bounded Function.prototype.bind; unchanged sirv factory returns

Worker: Instinct (sandbox), 2026-10-15. Base: P016 head c897970. Branch
agent/p017-function-bind.

Outcome: reusable bounded Function.prototype.bind for concrete callable
receivers, plus the first measured sirv milestone: the unchanged factory
returns its request handler closure. viaCache.bind captures the completed
FILES table, the CLI exits 0 with empty stderr, and the completion fork's
healthy leaf is the returned function value beside the unchanged EMFILE
readdir throw sibling. No server startup, request handling or success claim.

Supported domain:
- Concrete callable receivers only; non-callable receivers are guest
  TypeErrors and symbolic receivers branch before the check.
- Captures thisArg (default undefined) and partial arguments into a fresh
  bound function identity. Bound length is max(target.length - partial count,
  0), admitted only from a current concrete own numeric length; otherwise a
  typed boundary.
- The bound function is boundary-marked: construction is a typed boundary,
  name/caller/arguments reads are unmodeled, metadata writes and descriptors
  are guarded, inherited Function.prototype.call stays modeled. Calling it
  forwards through ordinary invocation with the captured receiver and
  partial + call arguments, preserving completions exactly like call.
- Registration mirrors the other modeled prototype methods: boundary-marked
  with length 1, non-constructible.

Specs first: test/function-bind.spec.ts (5 tests: pinned Node 24.21.0 native
controls for captured receiver/partial forwarding and computed bound length;
guest TypeError for non-callable receiver; typed boundary for bound
construction). Migrated from measured output: sirv-target.spec.ts (in-process
+ CLI graph: factory returns, exit 0, empty stderr, function/ThrownValue
leaves, tmp/idx=hello.txt/6 and ctype=text/plain retained), p009/p010/
p011-independent-review.spec.ts and p012-correction-review.spec.ts (same
frontier migration, effect histories preserved).

Validation (sandbox, Node 24.21.0, PROPHET_NODE_BINARY pinned): full suite
146 suites / 4505 passes / 46 unchanged skips, chunked
--runInBand; typecheck clean.

Remaining gaps: calling the returned handler reaches the pre-existing sloppy
primitive receiver boxing rejection; bound name metadata, bound construction,
request-path analysis (parse(req), http modeling) remain open.
