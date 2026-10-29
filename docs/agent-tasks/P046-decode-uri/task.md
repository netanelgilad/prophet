# P046: shared decodeURI through unchanged sirv paths

Continue the user-authorized generic language/API coverage; security CLI deferred.
Base is P045 candidate a5d687b (CI pending at branch creation).
Branch agent/p046-decode-uri.
Worktree /Users/netanelgilad/.codex/worktrees/p035-longcat-environment/prophet.

## Ownership

regexp_i owns src/string/decode-uri.ts, src/execution-context/ESInitialGlobal.ts
and test/decode-uri.spec.ts. R2 explicitly expands ownership to the narrow
withModeledStringTag helper in src/Object/prototype.ts to preserve typed intrinsic
boundaries and bounded traversal; no blanket wrapping of callback failures. Independent reviewer owns test/decode-uri-review.spec.ts
and test/sirv-decode-uri.spec.ts. Root owns corpus activation, docs/backlog/wiki,
validation and publication. No agent commits/pushes or edits another owner's files.

## Behavior and domain

Global decodeURI is nonconstructible, length1/name/call metadata; missing argument
converts undefined; extra argument evaluation remains normal JS. Reuse shared
ToString ordinary string-hint conversion and finite symbolic branches. Admit
primitives and ordinary object conversions, with explicit typed cycle/partial/
unmodeled symbol-prototype traversal; do not silently ignore Symbol.toPrimitive.
Own null/undefined symbol slot shadows inherited hooks. Arrays/functions/exotic
conversion and custom hooks remain explicit boundaries. Conversion effects,
throws and conditional results must survive. Open converted strings are unknown.

Bound input65536 UTF16 units after conversion and before scan/allocation. Implement
iterative percent-byte UTF8 decoding without native decodeURI/Buffer/TextDecoder
fallback. Reserved ;/?:@&=+$,# escapes preserve exact original spelling/case.
Other ASCII and valid2/3/4-byte sequences decode once. Reject missing/invalid hex,
truncation, invalid lead/continuation, overlong encoding, surrogate scalars and
values above10FFFF with guest URIError. Raw UTF16 including lone surrogates stays
unchanged. Valid supplementary scalars emit surrogate pairs; noncharacters valid.

## Evidence and review

Spec-first concrete, conversion effect/throw, finite correlation, unsupported
sibling, exact/over-budget and malformed matrix cases, compared independently with
pinned Node24.21.0. Root activates complete unmodified Test262 direct candidates:
A1.1_T1, A3_T1/T2/T3, A4_T1/T2/T3/T4, A5.4/5.6/5.7, A6_T1 under
built-ins/decodeURI/S15.1.3.1_*.js. Do not trim upstream cases or shim includes.
Keep deferred descriptor/name/exhaustive harness-dependent cases documented.

Real unchanged sirv must resolve /%61.txt to /a.txt, preserve encoded slash,
and catch URIError retaining original malformed pathname. Positive encoded-hit
spec must be red on the missing global; a catch-only test can hide ReferenceError.
Use declared FS/HTTP facts and pinned local native adapters, no actual networking.
Full source semantic review, affected specs, full suite/typecheck, four gap scans,
complete skip inventory and exact source/log hashes required. Root only publishes
fast-forward master after exact candidate CI succeeds. Preserve owner files.
