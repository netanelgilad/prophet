# P010 whole lastIndexOf candidates

Pinned Test262 `47bf9d1db9f6e7632120ac1b1946ad092e6c214e` contains 23 whole files in
`built-ins/String/prototype/lastIndexOf`. All 46 native strict/sloppy variants
pass Node 24.21.0 with original harness includes. Ten whole files / 20 variants
are active, without runner or upstream changes. Exact hashes/metadata, the full
installed-file inventory and unchanged historical skipped-file inventory are
recorded in the source-bound evidence artifacts. Inactive is distinct from a
Jest skip and from an observed VM failure.

| Files (prefix S15.5.4.8_) | Whole-file disposition |
| --- | --- |
| A1_T10, A1_T4, A1_T5, A1_T7, A1_T8 | Active: NaN/default position, search conversion, null/undefined, ordinary String conversion |
| A4_T1, A4_T3 | Active: throwing position conversion and ordinary numeric fallback to undefined/NaN |
| A6, A7 | Active: absent prototype and nonconstruction |
| this-value-not-obj-coercible.js | Active: nullish receiver guest TypeError |
| A1_T1 | Inactive: Object(true) wrapper creation/conversion |
| A1_T2 | Inactive: Boolean wrapper construction |
| A1_T6, A1_T9, A4_T2 | Inactive: String wrapper construction (A4_T2 also tests numeric fallback throw) |
| A4_T4 | Inactive: Number wrapper construction/prototype |
| A4_T5 | Inactive: Number wrapper construction inside receiver ToString |
| A1_T12 | Inactive: multiargument Array constructor and Array.prototype.lastIndexOf; despite its directory, this does not exercise String.lastIndexOf |
| A8 | Inactive: direct function hasOwnProperty, propertyIsEnumerable, for-in/descriptors |
| A9 | Inactive: direct function hasOwnProperty and delete/descriptors |
| A10, name.js | Inactive: propertyHelper harness and descriptor mutation |
| A11 | Tried whole in both variants; typed metadata frontier at direct function .hasOwnProperty. Failed prefreeze log upstream-incompatible-A11 retained. Removed only this new exploratory selection, never an existing baseline file. Local borrowed own-presence/length controls pass. |

All 13 inactive files were inspected whole. Except A11, blockers are source
inspection findings, not claims that each was executed in the VM. No source
fragments, helper substitution, new blanket skip or weaker oracle is used.
