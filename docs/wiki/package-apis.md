# Package-driven matching and prefix operations

P045 (Codex,2026-10-29), see [contract](../agent-tasks/P045-package-apis/task.md).

- Case-insensitive classes must expand membership equivalence before complement;
  folding endpoints destroys punctuation ranges such as [A-z]. ASCII-only matching
  is explicit and rejects decoded non-ASCII escapes as well as literal text.
- Keep RegExp input/lastIndex conversions before matching-domain guards. A later
  conversion may throw or mutate even if a matcher cannot analyze its input.
- String.startsWith must run IsRegExp before converting search and position.
  The intrinsic RegExp.prototype owns match; Object.prototype does not override
  it. Root review corrected a copied shortcut before handoff, independently tested.
- Whole upstream files needing exec/captures cannot be trimmed to manufacture
  /i conformance. Keep the blocked candidates and use independent native matrices.
- Sirv .br/.gz text-safe stand-ins establish selection/headers/byte preservation,
  not codec or arbitrary binary support. Dev-mode references use unchanged files
  and Writable adapters; no actual socket transport claim follows.

P046 decoder review extends these lessons: percent escapes decode once, and
decodeURI preserves reserved escapes including their original hex case. Raw
surrogates and percent-encoded surrogate scalars have different outcomes. Test
malformed input as a guest URIError, not an analysis boundary. A catch-only
package test can hide a missing-global ReferenceError; retain a positive encoded
filename hit. Unicode paths expose mrmime's separate lowercase boundary even
after decoding succeeds. Prototype lookup needs a depth budget in addition to
cycle detection; the P046 scoped helper does not repair older unbounded helpers.
See [decoder contract](../decode-uri.md) and P046 review/evidence for final scope.
