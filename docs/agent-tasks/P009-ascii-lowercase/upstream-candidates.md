# P009 whole lowercase candidates

Pinned Test262 `47bf9d1db9f6e7632120ac1b1946ad092e6c214e` has 27 files in
`built-ins/String/prototype/toLowerCase`. Sources remain unmodified. All 54
strict/sloppy native controls passed pinned Node 24.21.0. Exact source hashes,
metadata and selected/skip inventories are in the ignored inventory artifact,
whose hash is committed in evidence.json. Active selection is ten files / 20
variants; inactive does not mean skipped or proven incorrect.

| Files (prefix S15.5.4.16_) | Status / whole-file blocker |
| --- | --- |
| A1_T3, A1_T4, A1_T5, A1_T10, A1_T11, A1_T12, A1_T13, A6, A7 | Active: ASCII, empty, conversion/fallback/throws, absent prototype, nonconstruction |
| this-value-not-obj-coercible.js | Active: undefined/null guest TypeError |
| A1_T1, A1_T2, A1_T9, A2_T1 | Inactive: Object/Boolean/String wrappers (A2_T1 needs new String in its final assertion) |
| A1_T6, A1_T7, A1_T8 | Inactive: Number prototype/constant primitive lookup |
| A1_T14 | Inactive: RegExp constructor and ordinary RegExp conversion |
| A8 | Inactive: propertyIsEnumerable, descriptors and for-in |
| A9 | Inactive: delete/descriptors and direct metadata hasOwnProperty |
| A10, name.js | Inactive: propertyHelper and descriptor mutation; direct metadata access also guarded |
| A11 | Inactive: direct inherited function metadata hasOwnProperty is conservatively guarded. Initial activation failed both variants; removed whole, failure log preserved. Known length/borrowed own-presence have local controls. |
| Final_Sigma_U180E.js, special_casing.js, special_casing_conditional.js, supplementary_plane.js | Inactive: non-ASCII/Unicode context, expansion and supplementary mapping |

All 46 historical skipped files retain exactly the predecessor inventory and
metadata. No new blanket skip or edited upstream source; local Unicode native
controls are boundary evidence, not passing VM conformance.
