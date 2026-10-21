# P022: Bounded for-in enumeration

Implemented by Instinct in-sandbox; independent review pending.

## Goal

Model the ordinary ForInStatement so sirv's send() header enumeration
(build.js:66, `for (let key in headers)`) evaluates, advancing the delivered
GET toward the response writes.

## Semantics

Follows ECMA ForIn/OfHeadEvaluation (EnumerateObjectProperties) and
ForInOfBodyEvaluation (unlabeled break/continue only), pinned against Node
24.21.0 native controls (test/for-in.spec.ts compares every behavior against
the pinned binary):

- The head expression runs once. Nullish heads complete with no iterations;
  strings contribute UTF-16 indices; other primitives contribute none.
- The key list is a snapshot of enumerable string keys, own before
  inherited, first occurrence winning (shadowed inherited keys skip),
  integer indices before insertion order within each holder (the existing
  PropertyKeys model already orders so).
- The snapshot fixes which keys can be visited: keys added during iteration
  are never visited (pinned). Before each visit the key's presence is
  re-resolved along the current chain, so a key deleted before its visit is
  skipped, an inherited key revealed by deleting a shadowing own key is
  visited, and a deleted-then-readded key is visited (all pinned natively;
  VM-tested deletion waits on DeleteExpression, see gaps).
- let/const heads bind a fresh cell per iteration (closures capture distinct
  keys, pinned); var heads share one hoisted binding that survives the loop;
  identifier heads assign the existing binding; member-expression heads
  assign through the shared member machinery.
- The VM's Object.prototype contributes no enumerable keys natively, so the
  chain walk ends at it; objects with no internal link end the chain too.
- Host work is bounded like the ForStatement driver: a per-path body-entry
  budget (1024) and a shared step cap (8192), each retaining the actual
  unfinished context as a typed budget boundary.
- Statement completion values keep the residual: loops complete with
  Undefined; full eval-value semantics remain out of scope under LANG-003.

Specs first: test/for-in.spec.ts (16 tests: pinned order/domain matrix,
binding shapes, control flow, value reads through the key, legacy-error pin
for unmodeled prototype chains). Migrated from measured output:
sirv-request.spec.ts asserts the new measured stop.

The unchanged consumer advances: the delivered GET completes send's for-in
over the file headers (the raw dispatch carries no own header names, so the
enumeration visits nothing) and the measured stop is the response header
read res.getHeader (build.js:67) — a legacy host error asserted through
toThrow because the response object is not boundary-marked.

## Boundaries and gaps

- Chains through unmodeled prototype objects stop: VM constructor prototype
  objects carry ownPropertyModel "unmodeled" and Object.create is unmodeled,
  so inherited-key programs stop with the legacy host error "Own property
  enumeration is not yet supported for unmodeled descriptors or keys"
  (asserted via .toThrow). Modeling constructor-prototype descriptors would
  open the inherited-key domain; the native pins are recorded above.
- Deletion-driven visits (deleted keys skipped, revealed inherited keys
  visited, re-added keys visited) are implemented in the chain presence
  re-resolution and pinned natively, but no VM test can drive them until
  DeleteExpression is modeled.
- Labeled break/continue, destructuring heads, multi-declarator heads,
  legacy sloppy-mode initializers and for-in completion values remain work.
- for-in over arrays and exotic propertyAccess objects is unexplored; the
  enumerable-data domain guard decides.

Validation (sandbox, Node 24.21.0, PROPHET_NODE_BINARY pinned): full suite
152 suites / 4738 passes / 46 unchanged skips / 0 failures, chunked
--runInBand; typecheck clean (the shipped tree removes one unused import
the first typecheck flagged; sirv-request re-run green after it).

Remaining frontier after this task: the response getHeader/setHeader/
writeHead surface consumed by sirv's send (the measured next stop), then
fs createReadStream/pipe.
