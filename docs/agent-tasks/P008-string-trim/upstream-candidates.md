# Complete pinned String.trim candidate inventory

Test262 revision `47bf9d1db9f6e7632120ac1b1946ad092e6c214e`;
128 complete unmodified files, 40 active / 88 inactive. Pinned Node 24.21.0
passes every file in strict and sloppy mode (256 variants), with original
sta/assert/include harness files. The exact native results and source hashes
are bound in evidence.json. No upstream file or dependency was edited.

Modern whitespace expectations already omit U+180E; `u180e.js` tests its
preservation. Historical Unicode membership is not substituted for modern ES.
Inactive means not activated in Prophet, not skipped within the active corpus.
No fragment of a file is executed as its substitute.

| Whole file under built-ins/String/prototype/trim | Status / residual |
| --- | --- |
| `15.5.4.20-0-1.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-0-2.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-1-1.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-1-2.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-1-3.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-1-4.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-1-5.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-1-6.js` | Inactive: wrapper construction; OBJ-003/LIB-002 |
| `15.5.4.20-1-7.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-1-8.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-1-9.js` | Inactive: wrapper construction; OBJ-003/LIB-002 |
| `15.5.4.20-2-1.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-2-10.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-11.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-2-12.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-13.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-14.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-15.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-16.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-17.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-18.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-19.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-2.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-20.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-21.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-22.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-23.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-24.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-25.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-26.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-27.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-28.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-2-29.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-2-3.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-2-30.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-31.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-32.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-33.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-34.js` | Inactive: array conversion; LIB-002/LEGACY-002 |
| `15.5.4.20-2-35.js` | Inactive: wrapper construction; OBJ-003/LIB-002 |
| `15.5.4.20-2-36.js` | Inactive: wrapper construction; OBJ-003/LIB-002 |
| `15.5.4.20-2-37.js` | Inactive: wrapper construction; OBJ-003/LIB-002 |
| `15.5.4.20-2-38.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-2-39.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-2-4.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-40.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-2-41.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-2-42.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-2-43.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-2-44.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-2-45.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-46.js` | Inactive: function conversion; LIB-002 |
| `15.5.4.20-2-47.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-2-49.js` | Inactive: RegExp constructor/conversion; REGEXP-001 |
| `15.5.4.20-2-5.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-50.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-2-51.js` | Inactive: arguments object tag/conversion; LANG-006/LIB-002 |
| `15.5.4.20-2-6.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-2-7.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-8.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-2-9.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-3-1.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-3-10.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-3-11.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-3-12.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-3-13.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-3-14.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-3-2.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-3-3.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-3-4.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-3-5.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-3-6.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-3-7.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-3-8.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-3-9.js` | Active: complete strict/sloppy VM variants |
| `15.5.4.20-4-1.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-10.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-11.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-12.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-13.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-14.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-16.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-18.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-19.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-2.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-20.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-21.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-22.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-24.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-27.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-28.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-29.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-3.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-30.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-32.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-34.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-35.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-36.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-37.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-38.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-39.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-4.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-40.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-41.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-42.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-43.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-44.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-45.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-46.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-47.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-48.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-49.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-5.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-50.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-51.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-52.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-53.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-54.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-55.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-56.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-57.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-58.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-59.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-6.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-60.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `15.5.4.20-4-8.js` | Inactive: additional numeric/string coverage candidate; TEST-001/002 (not a claimed VM failure) |
| `name.js` | Inactive: propertyHelper descriptor harness; OBJ-001/TEST-003 |
| `u180e.js` | Active: complete strict/sloppy VM variants |
