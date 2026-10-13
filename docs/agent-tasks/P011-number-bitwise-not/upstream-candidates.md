# P011 complete upstream candidates

Pinned Test262 `47bf9d1db9f6e7632120ac1b1946ad092e6c214e` has 16 whole files in
language/expressions/bitwise-not. All 32 native strict/sloppy variants pass Node
24.21.0 with original sta.js/assert.js. All 32 VM variants were tried whole;
nine files/18 variants are active, seven files/14 variants remain inactive.
No upstream source, assertion, baseline file or runner was changed. Inactive is
not a Jest skip. Candidate JSON retains full metadata and SHA-256 hashes; logs
print each whole incompatible file/variant and exact observed failure. The
historical 46 skipped files remain unchanged and are inventoried independently.

| Complete filename | Actual whole VM disposition (both variants) |
| --- | --- |
| `S11.4.8_A1.js` | Active: normal completion |
| `S11.4.8_A2.1_T1.js` | Active: normal completion |
| `S11.4.8_A2.1_T2.js` | Active: normal completion |
| `S11.4.8_A2.2_T1.js` | Active: normal completion |
| `S11.4.8_A3_T1.js` | Inactive: Boolean wrapper construction is not yet supported |
| `S11.4.8_A3_T2.js` | Inactive: Number wrapper construction is not yet supported |
| `S11.4.8_A3_T3.js` | Inactive: String wrapper construction is not yet supported |
| `S11.4.8_A3_T4.js` | Active: normal completion |
| `S11.4.8_A3_T5.js` | Inactive: Unfinished execution in Test262 test |
| `S9.5_A2.1_T2.js` | Active: normal completion |
| `S9.5_A2.2_T2.js` | Inactive: Binary operator resolver for << hasn't been implemented yet |
| `S9.5_A2.3_T2.js` | Active: normal completion |
| `S9.5_A3.1_T4.js` | Active: normal completion |
| `S9.5_A3.2_T2.js` | Active: normal completion |
| `bigint-non-primitive.js` | Inactive: Unfinished execution in Test262 test |
| `bigint.js` | Inactive: Unfinished execution in Test262 test |

The Number-hint conversion cases S11.4.8_A2.2_T1 and S9.5_A3.1_T4 run whole:
current valueOf/toString priority, fallback, no unnecessary calls, throws and
real TypeError exhaustion. S9.5 numeric files exercise bounds, fractions and
wrap. S9.5_A2.2_T2 is inactive because its complete source also requires <<;
P011 does not bundle shifts. Boolean/Number/String wrapper cases are inactive,
as are functions, BigInt representation/public Symbol.toPrimitive and wrapper
construction. The old parser exposes BigInt markers with Number-valued fields;
a new explicit reached-literal guard prevents false Number execution. Before
that guard, whole bigint.js failed assert.sameValue and bigint-non-primitive.js
hit wrapper construction; those earlier failed dispositions/logs are preserved
as development evidence, not final source evidence.

Related already-active primitive conversion cases (unary-plus S9.3_A4.1_T2,
11.4.6-2-1 and the existing unary +/- suites) remain regression controls; no
broad ToNumber behavior was widened. Inspection of unary-plus S9.3_A1_T2,
S9.3_A2_T2 and S9.3_A3_T2 identifies unrelated missing isNaN/Number constants
(and eval completion for A1) as inactive candidate debt, not new VM run claims.
No Symbol-only file exists in the bitwise-not directory at this pin;
bigint-non-primitive contains Symbol.toPrimitive and remains whole/inactive.
Local native/VM embedding controls distinguish Symbol absence/custom hooks,
late BigInt/Symbol/exotic primitives and open/budget frontiers, independently of
unsupported public syntax/globals.
