# P026: bounded sequence expressions; sirv HEAD and 404 dispatch complete

Implemented by Instinct in-sandbox; independent review pending.

## Goal

Resolve the measured sirv stop on the is404 path: with GET /hello.txt
completing end to end (P025), HEAD /hello.txt already matched the pinned
reference, but GET /missing never ended its response. Measurement localized
the stop to is404's return statement (build.js:57),
`return (res.statusCode = 404, res.end())` - SequenceExpression (the comma
operator) had no AST resolver, so the dispatch boundary stopped the
statement and the response stayed open.

## Decision record

Pinned Node 24.21.0 semantics for the comma operator: operands evaluate
left to right, each value except the last is discarded, and the sequence
completes with the last operand's value; an abrupt operand propagates and
skips the rest. The resolver binds each operand's normal completion to the
next operand and completes with the final value - no sirv-specific
special casing, a reusable language capability.

Independent pinned checks covered: value identity and left-to-right side
effects; two-operand discard; the is404 return-position shape (assignment,
end call, trailing value); a sequence nested in a callee-ternary alternate
(the `next ? next() : isNotFound(req, res)` dispatch shape); an abrupt
operand propagating into try/catch with the rest skipped; a sequence as a
single call argument.

Migrated from measured output, not spec text:

- test/p008-independent-correction.spec.ts pinned the OLD SequenceExpression
  boundary ("stops before RHS effects"). With the resolver, the RHS runs
  and the conservative stop moves to the pre-existing unmodeled
  String.prototype.trim extra-property write, after the RHS effects; the
  test now pins that measured behavior.
- Test262 `built-ins/String/prototype/slice/S15.5.4.13_A3_T4.js`, previously
  inactive for needing sequence expressions (its factory constructor body is
  `this.value = value, this.slice = String.prototype.slice;`), now runs
  complete and unmodified in both language variants - activated, slice
  corpus 14 -> 15 files / 28 -> 30 variants, README inventory updated.
- LANG-001, the for-statement limits list, the test262 README loop-needs
  list and the instanceof corpus comment dropped sequence expressions as a
  gap; sirv-target.md records HEAD/404 completion.

Specs first: six new tests in test/sequence-expression.spec.ts against
pinned native controls (the compare helper runs each source under pinned
Node and requires the VM scope to agree). sirv-request.spec.ts extends the
single delivered-request spec with the HEAD and missing-file cases on the
same server: HEAD /hello.txt opens a second read stream, delivers it, and
the wire projection is status 200, body "", and the same three headers;
GET /missing opens no stream, completes through is404, and the wire
projection is status 404, body "", no headers.

Validation (sandbox, Node 24.21.0, PROPHET_NODE_BINARY pinned): full suite
and typecheck on the shipped tree (totals in the ledger);
sequence-expression, p008-independent-correction, test262 and sirv-request
suites green individually.

## Frontier after P026

Range requests ({start,end} stream options), header-carrying requests
(accept-encoding negotiation, if-modified-since), the declared stream gaps
('open'/fd registration, option fields, >64KiB multi-chunk, repeat
delivery), and the transport-sensitive exclusions in HTTP-003/HTTP-008.
