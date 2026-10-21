# Source identity is acquisition evidence

P037 publishes a bounded frozen program root with captured hashes/byte lengths,
path observations and launch parameters. [Contract](../program-identities.md),
[task](../agent-tasks/P037-program-identities/task.md).

- Hash original valid UTF-8 bytes once during capture, before BOM/shebang/wrapper
  parsing; record Buffer.length then. Do not re-read at serialization time.
- Keep entry record aliased to its source-map entry. Copy native capture maps
  and records so later embedding mutation cannot rewrite prior evidence.
- Publish the observed union honestly. Conditional acquisition does not mean
  conditional execution on all paths; positive file probe is not successful read.
- Identity-only projection avoids copying full source text. Consumer-supplied
  bytes must match the digest; this is not registry/npm package attestation.
- Count metadata slots precisely, including digests and probe kinds, before
  copying. UTF-8 string bytes differ from JSON wire size because of escaping.
  Caps on this root leave reader/parser/VM/generalgraph resource gaps open.
- Native Map prototype bypass remains trusted embedding behavior; freezing a
  Map object alone never hardens its internal entries.

Evidence remains provisional until independent review, full validation and
publication are recorded. Policy belongs outside these generic program facts.
