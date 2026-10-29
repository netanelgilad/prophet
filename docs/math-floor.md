# Shared Math.floor boundary (P049)

[Implementation](../src/math/floor.ts) and [specs](../test/math-floor.spec.ts)
are undergoing final review and validation. The same intrinsic is exposed by the
ordinary VM and automatic Node CLI runtime.

Arguments are evaluated normally, then shared VM ToNumber converts the first
argument (or undefined when omitted). Ordinary valueOf/toString effects and throws
remain interpreted. Concrete Numbers round with JavaScript floor semantics,
including negative fractions, NaN, infinities and signed zero. Explicit finite
choices are split through shared conversion machinery and preserve correlations.
Extra arguments are evaluated but ignored by floor. Construction throws a guest
TypeError. An open symbolic Number reaches an explicit unsupported boundary;
no arbitrary integer or interval-rounded result is fabricated.

Function metadata and descriptors remain unmodeled. The intrinsic exposes its
supported inherited call behavior; unknown API properties are guarded. Conversion
inherits the shared wrapper/BigInt/Symbol/host-object limitations. This operation
does not establish general symbolic rounding, Math coverage or IEEE algebra.

## Complete pinned upstream candidate inventory

The installed Test262 Math/floor directory contains10 whole files:

| Files | P049 disposition |
| --- | --- |
| S15.8.2.9_A1.js through S15.8.2.9_A6.js | Activated unchanged, six files/twelve strict-sloppy variants. |
| S15.8.2.9_A7.js | Inactive whole: requires Math.ceil and a2000-iteration loop exceeding the ordinary1024-iteration bound. |
| length.js | Inactive whole: function length metadata and descriptor/propertyHelper operations. |
| name.js | Inactive whole: function name metadata and descriptor/propertyHelper operations. |
| prop-desc.js | Inactive whole: descriptor/propertyHelper operations on Math.floor. |

No file is trimmed to fit the model and no new skip is introduced. These cases
cover concrete language behavior; local symbolic and coercion specs provide
additional coverage without substituting for the inactive whole files. The current complete
skip inventory confirms46 unchanged historical files; final full-validation
evidence remains pending at this implementation checkpoint.
