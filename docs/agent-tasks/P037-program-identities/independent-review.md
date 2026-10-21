# P037 independent semantic review

Reviewer: Codex subagent semantic_review. No production changes, commits or pushes.
Owned regression file: test/cli-program-review.spec.ts.

## Result

No actionable semantic defect found in the reviewed final implementation. Independent focused run: 1 suite, 5 tests passed on pinned Node 24.21.0, exit 0, 1.73 seconds wall time under an external 45-second watchdog. Exact argv and stable before/after hashes are in independent-evidence.json; complete output is independent-focused.log. This is bounded review evidence, not complete coverage or an all-path proof.

The earlier independent-red.log is a reviewer harness failure (old Babel parser rejects `as const`, zero tests executed), corrected to the repository-compatible literal type assertion. Production existed by that run. It is NOT semantic preimplementation red evidence. Core/scenario red evidence is separate.

## Source coverage

Read every line of new src/cli/program.ts, complete source-capture.ts, changed main.ts and its surrounding output/error handling, runtime.ts acquisition/error return paths, and relevant graph.ts map/alias encoding. Read the accepted draft contract and core/scenario tests.

- Source byteLength is recorded from the same original Buffer used for SHA256, after valid UTF8 roundtrip validation. BOM/CRLF remain in captured text and identity; interpretation normalization cannot change this record.
- Snapshot admission checks count sources/paths/args before copying. Metadata accounting charges runtime/filename/cwd/args, every source key and digest, every path key and kind, with repeated strings charged in each slot. Entry identity alias adds no charge. Code-unit precheck is a safe lower bound for UTF8 bytes, including astral pairs and unpaired surrogate replacement.
- Counts bound preflight loops and identity/map allocations. Exact UTF8 calculation only sees strings within the remaining code-unit budget. Digest validation and safe nonnegative byteLength reject invalid identity inputs without guessing repairs.
- Sources, paths, args, identity records and root are copied/frozen. Ordinary map mutators reject. Entry identity aliases the copied source map record. No source text is read by the builder, and no new native acquisition occurs there.
- main builds the complete program snapshot and encoded JSON before its first stdout write. Publication failure uses the existing catch path: diagnostic on stderr, return 1, no graph output.
- Source acquisition errors after a positive probe preserve that path observation while omitting nonexistent validated source bytes. Existing runFile catch returns the acquired subset. Entry acquisition failure before context creation retains the existing no-graph exit.

## Independent probes

1. Exact 4 MiB aggregate metadata with astral Unicode, repeated labels across entry/source/path maps, both digests and all three path-kind strings; accepted graph has every record. One additional byte rejects. The oracle independently sums Buffer.from UTF8 bytes.
2. A 2 Mi-code-unit astral argument already occupies 4 MiB bytes, so metadata overhead makes it reject despite being below the cheap code-unit ceiling.
3. Actual runFile BOM/CRLF/multibyte entry matches independent original-byte hash and length. Encoding of the snapshot stays identical after native input text/digest/length, args, source map and path map mutations, and after attempted ordinary public map mutations.
4. An invalid UTF8 dependency reached through actual require leaves a known positive file probe, entry identity and no fabricated dependency source record.
5. Actual CLI subprocess with 4097 arguments exits 1 with publication diagnostic and exactly empty stdout.

Core tests separately cover exact/over source/path/argument counts, invalid digest and numeric byte lengths, source-text getter nonobservation, ordinary freeze checks and missing entry identity. Scenario tests separately cover full CLI dependency/JSON/manifest acquisition, branch-union observations, normal/guest-throw/partial outcomes and graph entry aliases.

## Boundaries retained

This is local source identity and final acquired-set publication. It does not attest packages/lockfiles, provide source bytes or resumption, establish import execution on every path, or describe a coherent time-zero OS snapshot. Maps and native CapturedSource records are trusted embedding inputs; malicious iterator/getter replacement and Map.prototype mutation bypass are outside the declared ordinary-mutation guard. Native capture input remains mutable by design; copied public snapshot has no mutable alias to it.

The 4 MiB cap concerns UTF8 metadata strings, not escaped JSON size. Existing source acquisition read sizes, graph traversal/encoding size, execution recursion and host memory remain separate resource gaps. Publication caps do not justify claiming those operations bounded. No production behavior changes were requested from this review.
