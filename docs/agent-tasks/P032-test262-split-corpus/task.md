# P032: Test262 split corpus activation

Implemented by Instinct in-sandbox; independent review pending.

## Goal

Activate the complete, unmodified Test262 split files that P030's
concrete-receiver String.split made pass, extending the active
conformance baseline without hiding any failure.

## Decision record

Sweep probe over all 107 files in built-ins/String/prototype/split at the
pinned Test262 revision (yarn.lock 47bf9d1): 2 files (4 strictness
variants) complete pass, unmodified:

- S15.5.4.14_A1_T4: an empty receiver with an omitted separator yields
  the whole string ([""]).
- S15.5.4.14_A2_T19: an empty receiver splitting on an absent separator
  keeps its single empty element, with the Array constructor intact.

The remaining 105 files fail honestly and stay inactive: wrapper
construction gaps (String/Number/Boolean/Object wrapper receivers),
unfinished executions (RegExp separators, limit coercion and other
unmodelled paths), unhandled throws and unsupported harness includes
(propertyHelper.js).

The active corpus grows from 361 files / 713 variants to 363 files / 717
variants; the 46 historical skipped files are unchanged. test262.spec.ts
gains a P032 block and test/test262/README.md's count line moves with it.

Self-caught fix riding along: P030's shipped tree (cf7b59e) carried two
latent TypeScript errors in src/string/split.ts - an implicit-any arrow
parameter and a split(undefined) call the ES2015+ lib typings reject.
P030's validation had misread the suite runner's unconditional SUITE_DONE
line as a clean typecheck. The runtime semantics were always correct
(all specs green, wire cases host-pinned); the fix spells out the absent
separator per spec 22.1.3.20 (the whole string as the single element)
and annotates the map parameter. string-split, test262 and sirv-request
specs were re-verified green on the fix before the full suite.

Validation (sandbox, Node 24.21.0, PROPHET_NODE_BINARY pinned): full
suite on the shipped tree reports 4972 passed / 46 skipped / 0 failed
across the four chunks, and the typecheck is verified clean by grepping
the suite log for "error TS" (zero matches) - the runner's SUITE_DONE
line is unconditional and is no longer trusted as the tsc signal.

## Follow-ups

- RegExp separators, limit coercion and wrapper receivers would unlock
  more of the directory; each is its own increment.
