/// <reference types="jest" />

import { sync } from "globby";
import { relative, join } from "path";
import {
  loadTest262,
  runTest262Variant,
  test262Root,
  variantsFor
} from "./test262/runner";

// Complete, unmodified files from the Test262 revision pinned in yarn.lock
// (47bf9d1db9f6e7632120ac1b1946ad092e6c214e). This deliberately small corpus
// is an active conformance baseline, not a claim of full compliance.
const activeCorpus = [
  // P012: whole unmodified bounded generic substring candidates.
  "built-ins/String/prototype/substring/S15.5.4.15_A1_T10.js",
  "built-ins/String/prototype/substring/S15.5.4.15_A1_T11.js",
  "built-ins/String/prototype/substring/S15.5.4.15_A1_T13.js",
  "built-ins/String/prototype/substring/S15.5.4.15_A1_T14.js",
  "built-ins/String/prototype/substring/S15.5.4.15_A1_T4.js",
  "built-ins/String/prototype/substring/S15.5.4.15_A1_T7.js",
  "built-ins/String/prototype/substring/S15.5.4.15_A1_T8.js",
  "built-ins/String/prototype/substring/S15.5.4.15_A3_T10.js",
  "built-ins/String/prototype/substring/S15.5.4.15_A3_T5.js",
  "built-ins/String/prototype/substring/S15.5.4.15_A3_T6.js",
  "built-ins/String/prototype/substring/S15.5.4.15_A3_T7.js",
  "built-ins/String/prototype/substring/S15.5.4.15_A6.js",
  "built-ins/String/prototype/substring/S15.5.4.15_A7.js",
  "built-ins/String/prototype/substring/this-value-not-obj-coercible.js",

  // P011: whole Number-domain complement/GetValue/ordinary conversion cases.
  "language/expressions/bitwise-not/S11.4.8_A1.js",
  "language/expressions/bitwise-not/S11.4.8_A2.1_T1.js",
  "language/expressions/bitwise-not/S11.4.8_A2.1_T2.js",
  "language/expressions/bitwise-not/S11.4.8_A2.2_T1.js",
  "language/expressions/bitwise-not/S11.4.8_A3_T4.js",
  "language/expressions/bitwise-not/S9.5_A2.1_T2.js",
  "language/expressions/bitwise-not/S9.5_A2.3_T2.js",
  "language/expressions/bitwise-not/S9.5_A3.1_T4.js",
  "language/expressions/bitwise-not/S9.5_A3.2_T2.js",

  // P010: whole UTF-16 search, generic conversion, abrupt and intrinsic cases.
  "built-ins/String/prototype/lastIndexOf/S15.5.4.8_A1_T10.js",
  "built-ins/String/prototype/lastIndexOf/S15.5.4.8_A1_T4.js",
  "built-ins/String/prototype/lastIndexOf/S15.5.4.8_A1_T5.js",
  "built-ins/String/prototype/lastIndexOf/S15.5.4.8_A1_T7.js",
  "built-ins/String/prototype/lastIndexOf/S15.5.4.8_A1_T8.js",
  "built-ins/String/prototype/lastIndexOf/S15.5.4.8_A4_T1.js",
  "built-ins/String/prototype/lastIndexOf/S15.5.4.8_A4_T3.js",
  "built-ins/String/prototype/lastIndexOf/S15.5.4.8_A6.js",
  "built-ins/String/prototype/lastIndexOf/S15.5.4.8_A7.js",
  "built-ins/String/prototype/lastIndexOf/this-value-not-obj-coercible.js",

  // Complete ASCII lowercase, generic conversion, abrupt completion and metadata cases.
  "built-ins/String/prototype/toLowerCase/S15.5.4.16_A1_T3.js",
  "built-ins/String/prototype/toLowerCase/S15.5.4.16_A1_T4.js",
  "built-ins/String/prototype/toLowerCase/S15.5.4.16_A1_T5.js",
  "built-ins/String/prototype/toLowerCase/S15.5.4.16_A1_T10.js",
  "built-ins/String/prototype/toLowerCase/S15.5.4.16_A1_T11.js",
  "built-ins/String/prototype/toLowerCase/S15.5.4.16_A1_T12.js",
  "built-ins/String/prototype/toLowerCase/S15.5.4.16_A1_T13.js",
  "built-ins/String/prototype/toLowerCase/S15.5.4.16_A6.js",
  "built-ins/String/prototype/toLowerCase/S15.5.4.16_A7.js",
  "built-ins/String/prototype/toLowerCase/this-value-not-obj-coercible.js",

  // Complete modern trim whitespace, generic receiver and ordered conversion cases.
  "built-ins/String/prototype/trim/15.5.4.20-0-1.js",
  "built-ins/String/prototype/trim/15.5.4.20-0-2.js",
  "built-ins/String/prototype/trim/15.5.4.20-1-1.js",
  "built-ins/String/prototype/trim/15.5.4.20-1-2.js",
  "built-ins/String/prototype/trim/15.5.4.20-1-3.js",
  "built-ins/String/prototype/trim/15.5.4.20-1-4.js",
  "built-ins/String/prototype/trim/15.5.4.20-1-5.js",
  "built-ins/String/prototype/trim/15.5.4.20-1-7.js",
  "built-ins/String/prototype/trim/15.5.4.20-1-8.js",
  "built-ins/String/prototype/trim/15.5.4.20-2-1.js",
  "built-ins/String/prototype/trim/15.5.4.20-2-3.js",
  "built-ins/String/prototype/trim/15.5.4.20-2-6.js",
  "built-ins/String/prototype/trim/15.5.4.20-2-9.js",
  "built-ins/String/prototype/trim/15.5.4.20-2-11.js",
  "built-ins/String/prototype/trim/15.5.4.20-2-28.js",
  "built-ins/String/prototype/trim/15.5.4.20-2-29.js",
  "built-ins/String/prototype/trim/15.5.4.20-2-38.js",
  "built-ins/String/prototype/trim/15.5.4.20-2-39.js",
  "built-ins/String/prototype/trim/15.5.4.20-2-40.js",
  "built-ins/String/prototype/trim/15.5.4.20-2-41.js",
  "built-ins/String/prototype/trim/15.5.4.20-2-42.js",
  "built-ins/String/prototype/trim/15.5.4.20-2-43.js",
  "built-ins/String/prototype/trim/15.5.4.20-2-44.js",
  "built-ins/String/prototype/trim/15.5.4.20-2-47.js",
  "built-ins/String/prototype/trim/15.5.4.20-2-50.js",
  "built-ins/String/prototype/trim/15.5.4.20-3-1.js",
  "built-ins/String/prototype/trim/15.5.4.20-3-2.js",
  "built-ins/String/prototype/trim/15.5.4.20-3-3.js",
  "built-ins/String/prototype/trim/15.5.4.20-3-4.js",
  "built-ins/String/prototype/trim/15.5.4.20-3-5.js",
  "built-ins/String/prototype/trim/15.5.4.20-3-6.js",
  "built-ins/String/prototype/trim/15.5.4.20-3-7.js",
  "built-ins/String/prototype/trim/15.5.4.20-3-8.js",
  "built-ins/String/prototype/trim/15.5.4.20-3-9.js",
  "built-ins/String/prototype/trim/15.5.4.20-3-10.js",
  "built-ins/String/prototype/trim/15.5.4.20-3-11.js",
  "built-ins/String/prototype/trim/15.5.4.20-3-12.js",
  "built-ins/String/prototype/trim/15.5.4.20-3-13.js",
  "built-ins/String/prototype/trim/15.5.4.20-3-14.js",
  "built-ins/String/prototype/trim/u180e.js",

  // Whole flagless Boolean matching cases, plus two abrupt ToString files.
  "built-ins/RegExp/regexp-class-chars.js",
  "built-ins/RegExp/S15.10.2.3_A1_T5.js",
  "built-ins/RegExp/S15.10.2.7_A1_T9.js",
  "built-ins/RegExp/S15.10.2.7_A6_T2.js",
  "built-ins/RegExp/S15.10.2.7_A2_T4.js",
  "built-ins/RegExp/S15.10.2.7_A3_T3.js",
  "built-ins/RegExp/S15.10.2.7_A4_T8.js",
  "built-ins/RegExp/S15.10.2.7_A5_T3.js",
  "built-ins/RegExp/S15.10.2.6_A1_T1.js",
  "built-ins/RegExp/S15.10.2.6_A2_T7.js",
  "built-ins/RegExp/S15.10.2.13_A1_T1.js",
  "built-ins/RegExp/S15.10.2.13_A2_T6.js",
  "built-ins/RegExp/S15.10.2.8_A3_T3.js",

  "built-ins/RegExp/prototype/test/S15.10.6.3_A1_T7.js",
  "built-ins/RegExp/prototype/test/S15.10.6.3_A1_T8.js",
  // Complete literal identity and parser-negative files; no matching engine or
  // descriptor-helper fragment is substituted for an upstream case.
  "language/literals/regexp/S7.8.5_A4.2.js",
  "language/literals/regexp/early-err-pattern.js",
  "language/literals/regexp/early-err-dup-flag.js",
  "language/literals/regexp/early-err-bad-flag.js",
  "language/literals/regexp/early-err-flags-unicode-escape.js",
  "language/literals/regexp/u-invalid-oob-decimal-escape.js",
  "language/literals/regexp/u-invalid-identity-escape.js",


  // Complete shared push calls and the builtin's non-construction rule.
  "built-ins/Array/prototype/push/S15.4.4.7_A1_T1.js",
  "built-ins/Array/prototype/push/S15.4.4.7_A6.7.js",
  "language/expressions/instanceof/S11.8.6_A7_T2.js",
  // Complete shared concat calls over ordinary literals (holes included) and
  // the builtin's non-construction rule. Constructor-overload, generic-receiver,
  // inherited-index, species/spreadable and descriptor files stay inactive.
  "built-ins/Array/prototype/concat/S15.4.4.4_A1_T3.js",
  "built-ins/Array/prototype/concat/S15.4.4.4_A1_T4.js",
  "built-ins/Array/prototype/concat/not-a-constructor.js",
  // Complete shared forEach calls over ordinary arrays: nullish receiver
  // TypeErrors, ordinary length reads, object thisArg, callback-added elements
  // within the captured range, empty arrays and the undefined return. Files
  // needing generic receivers, length coercion, subclassing, boolean computed
  // keys, deletion, freezing, descriptors or the propertyHelper harness stay
  // inactive rather than trimmed.
  "built-ins/Array/prototype/forEach/15.4.4.18-1-1.js",
  "built-ins/Array/prototype/forEach/15.4.4.18-1-2.js",
  "built-ins/Array/prototype/forEach/15.4.4.18-2-2.js",
  "built-ins/Array/prototype/forEach/15.4.4.18-5-2.js",
  "built-ins/Array/prototype/forEach/15.4.4.18-7-1.js",
  "built-ins/Array/prototype/forEach/15.4.4.18-8-1.js",
  "built-ins/Array/prototype/forEach/15.4.4.18-8-13.js",
  // Complete ordinary for-loop evaluation: init/test/update order, throwing
  // initializers/tests/updates, var heads, truthy/falsy test coercion, eval
  // with break and the Undefined loop completion, unlabeled break/continue in
  // nested let-bound loops, and per-iteration lexical environments. Files
  // needing labels, while/do-while/for-in/of, switch, sequence expressions,
  // compound assignment, wrapper construction or completion values stay
  // inactive rather than trimmed. Parse negatives pin the malformed-head and
  // stray-jump parser boundaries the loop driver relies on.
  "language/statements/for/S12.6.3_A2.1.js",
  "language/statements/for/S12.6.3_A2.2.js",
  "language/statements/for/S12.6.3_A6.js",
  "language/statements/for/S12.6.3_A9.js",
  "language/statements/for/S12.6.3_A13.js",
  "language/statements/for/12.6.3_2-3-a-ii-1.js",
  "language/statements/for/12.6.3_2-3-a-ii-11.js",
  "language/statements/for/12.6.3_2-3-a-ii-12.js",
  "language/statements/for/12.6.3_2-3-a-ii-13.js",
  "language/statements/for/12.6.3_2-3-a-ii-14.js",
  "language/statements/for/12.6.3_2-3-a-ii-15.js",
  "language/statements/for/12.6.3_2-3-a-ii-16.js",
  "language/statements/for/12.6.3_2-3-a-ii-17.js",
  "language/statements/for/12.6.3_2-3-a-ii-18.js",
  "language/statements/for/12.6.3_2-3-a-ii-19.js",
  "language/statements/for/12.6.3_2-3-a-ii-20.js",
  "language/statements/for/12.6.3_2-3-a-ii-21.js",
  "language/statements/for/scope-body-lex-boundary.js",
  "language/statements/continue/no-label-continue.js",
  "language/statements/continue/nested-let-bound-for-loops-outer-continue.js",
  "language/statements/for/S12.6.3_A7_T1.js",
  "language/statements/for/S12.6.3_A8_T1.js",
  "language/statements/for/decl-let.js",
  "language/statements/for/decl-const.js",
  "language/statements/break/S12.8_A1_T1.js",
  "language/statements/continue/S12.7_A1_T1.js",
  // Complete object declaration bindings: names, defaults, nested objects and errors.
  "language/statements/variable/dstr/obj-ptrn-prop-id.js",
  "language/statements/variable/dstr/obj-ptrn-prop-id-init.js",
  "language/statements/variable/dstr/obj-ptrn-prop-id-init-skipped.js",
  "language/statements/variable/dstr/obj-ptrn-prop-id-init-throws.js",
  "language/statements/variable/dstr/obj-ptrn-prop-id-init-unresolvable.js",
  "language/statements/variable/dstr/obj-ptrn-prop-id-trailing-comma.js",
  "language/statements/variable/dstr/obj-ptrn-prop-obj.js",
  "language/statements/variable/dstr/obj-ptrn-prop-obj-init.js",
  "language/statements/variable/dstr/obj-ptrn-prop-obj-value-null.js",
  "language/statements/variable/dstr/obj-ptrn-prop-obj-value-undef.js",
  "language/statements/variable/dstr/obj-ptrn-prop-eval-err.js",
  "language/statements/variable/dstr/obj-ptrn-id-init-skipped.js",
  "language/statements/variable/dstr/obj-ptrn-id-init-throws.js",
  "language/statements/variable/dstr/obj-ptrn-id-init-unresolvable.js",
  "language/statements/variable/dstr/obj-ptrn-id-trailing-comma.js",
  "language/statements/let/dstr/obj-ptrn-prop-id.js",
  "language/statements/let/dstr/obj-ptrn-prop-id-init.js",
  "language/statements/let/dstr/obj-ptrn-prop-id-init-skipped.js",
  "language/statements/let/dstr/obj-ptrn-prop-id-init-throws.js",
  "language/statements/let/dstr/obj-ptrn-prop-id-init-unresolvable.js",
  "language/statements/let/dstr/obj-ptrn-prop-id-trailing-comma.js",
  "language/statements/let/dstr/obj-ptrn-prop-obj.js",
  "language/statements/let/dstr/obj-ptrn-prop-obj-init.js",
  "language/statements/let/dstr/obj-ptrn-prop-obj-value-null.js",
  "language/statements/let/dstr/obj-ptrn-prop-obj-value-undef.js",
  "language/statements/let/dstr/obj-ptrn-prop-eval-err.js",
  "language/statements/let/dstr/obj-ptrn-id-init-skipped.js",
  "language/statements/let/dstr/obj-ptrn-id-init-throws.js",
  "language/statements/let/dstr/obj-ptrn-id-init-unresolvable.js",
  "language/statements/let/dstr/obj-ptrn-id-trailing-comma.js",
  "language/statements/const/dstr/obj-ptrn-prop-id.js",
  "language/statements/const/dstr/obj-ptrn-prop-id-init.js",
  "language/statements/const/dstr/obj-ptrn-prop-id-init-skipped.js",
  "language/statements/const/dstr/obj-ptrn-prop-id-init-throws.js",
  "language/statements/const/dstr/obj-ptrn-prop-id-init-unresolvable.js",
  "language/statements/const/dstr/obj-ptrn-prop-id-trailing-comma.js",
  "language/statements/const/dstr/obj-ptrn-prop-obj.js",
  "language/statements/const/dstr/obj-ptrn-prop-obj-init.js",
  "language/statements/const/dstr/obj-ptrn-prop-obj-value-null.js",
  "language/statements/const/dstr/obj-ptrn-prop-obj-value-undef.js",
  "language/statements/const/dstr/obj-ptrn-prop-eval-err.js",
  "language/statements/const/dstr/obj-ptrn-id-init-skipped.js",
  "language/statements/const/dstr/obj-ptrn-id-init-throws.js",
  "language/statements/const/dstr/obj-ptrn-id-init-unresolvable.js",
  "language/statements/const/dstr/obj-ptrn-id-trailing-comma.js",

  // P027: whole unmodified array destructuring declaration cases whose
  // bodies use ordinary array literals: ordered element binding, source and
  // pattern holes, defaults and skipped defaults, nested array/object
  // patterns, nullish TypeErrors, and parse-negative rest-initializer and
  // rest-not-final forms. Custom iterables, generators, rest elements and
  // function-name metadata stay inactive.
  "language/statements/variable/dstr/ary-name-iter-val.js",
  "language/statements/variable/dstr/ary-ptrn-elem-ary-elem-init.js",
  "language/statements/variable/dstr/ary-ptrn-elem-ary-elem-iter.js",
  "language/statements/variable/dstr/ary-ptrn-elem-ary-empty-iter.js",
  "language/statements/variable/dstr/ary-ptrn-elem-ary-val-null.js",
  "language/statements/variable/dstr/ary-ptrn-elem-id-init-exhausted.js",
  "language/statements/variable/dstr/ary-ptrn-elem-id-init-hole.js",
  "language/statements/variable/dstr/ary-ptrn-elem-id-init-skipped.js",
  "language/statements/variable/dstr/ary-ptrn-elem-id-init-throws.js",
  "language/statements/variable/dstr/ary-ptrn-elem-id-init-undef.js",
  "language/statements/variable/dstr/ary-ptrn-elem-id-init-unresolvable.js",
  "language/statements/variable/dstr/ary-ptrn-elem-id-iter-complete.js",
  "language/statements/variable/dstr/ary-ptrn-elem-id-iter-done.js",
  "language/statements/variable/dstr/ary-ptrn-elem-id-iter-val.js",
  "language/statements/variable/dstr/ary-ptrn-elem-obj-id-init.js",
  "language/statements/variable/dstr/ary-ptrn-elem-obj-id.js",
  "language/statements/variable/dstr/ary-ptrn-elem-obj-prop-id-init.js",
  "language/statements/variable/dstr/ary-ptrn-elem-obj-prop-id.js",
  "language/statements/variable/dstr/ary-ptrn-elem-obj-val-null.js",
  "language/statements/variable/dstr/ary-ptrn-elem-obj-val-undef.js",
  "language/statements/variable/dstr/ary-ptrn-rest-init-ary.js",
  "language/statements/variable/dstr/ary-ptrn-rest-init-id.js",
  "language/statements/variable/dstr/ary-ptrn-rest-init-obj.js",
  "language/statements/variable/dstr/ary-ptrn-rest-not-final-ary.js",
  "language/statements/variable/dstr/ary-ptrn-rest-not-final-id.js",
  "language/statements/variable/dstr/ary-ptrn-rest-not-final-obj.js",
  "language/statements/let/dstr/ary-name-iter-val.js",
  "language/statements/let/dstr/ary-ptrn-elem-ary-elem-init.js",
  "language/statements/let/dstr/ary-ptrn-elem-ary-elem-iter.js",
  "language/statements/let/dstr/ary-ptrn-elem-ary-empty-iter.js",
  "language/statements/let/dstr/ary-ptrn-elem-ary-val-null.js",
  "language/statements/let/dstr/ary-ptrn-elem-id-init-exhausted.js",
  "language/statements/let/dstr/ary-ptrn-elem-id-init-hole.js",
  "language/statements/let/dstr/ary-ptrn-elem-id-init-skipped.js",
  "language/statements/let/dstr/ary-ptrn-elem-id-init-throws.js",
  "language/statements/let/dstr/ary-ptrn-elem-id-init-undef.js",
  "language/statements/let/dstr/ary-ptrn-elem-id-init-unresolvable.js",
  "language/statements/let/dstr/ary-ptrn-elem-id-iter-complete.js",
  "language/statements/let/dstr/ary-ptrn-elem-id-iter-done.js",
  "language/statements/let/dstr/ary-ptrn-elem-id-iter-val.js",
  "language/statements/let/dstr/ary-ptrn-elem-obj-id-init.js",
  "language/statements/let/dstr/ary-ptrn-elem-obj-id.js",
  "language/statements/let/dstr/ary-ptrn-elem-obj-prop-id-init.js",
  "language/statements/let/dstr/ary-ptrn-elem-obj-prop-id.js",
  "language/statements/let/dstr/ary-ptrn-elem-obj-val-null.js",
  "language/statements/let/dstr/ary-ptrn-elem-obj-val-undef.js",
  "language/statements/let/dstr/ary-ptrn-rest-init-ary.js",
  "language/statements/let/dstr/ary-ptrn-rest-init-id.js",
  "language/statements/let/dstr/ary-ptrn-rest-init-obj.js",
  "language/statements/let/dstr/ary-ptrn-rest-not-final-ary.js",
  "language/statements/let/dstr/ary-ptrn-rest-not-final-id.js",
  "language/statements/let/dstr/ary-ptrn-rest-not-final-obj.js",
  "language/statements/const/dstr/ary-name-iter-val.js",
  "language/statements/const/dstr/ary-ptrn-elem-ary-elem-init.js",
  "language/statements/const/dstr/ary-ptrn-elem-ary-elem-iter.js",
  "language/statements/const/dstr/ary-ptrn-elem-ary-empty-iter.js",
  "language/statements/const/dstr/ary-ptrn-elem-ary-val-null.js",
  "language/statements/const/dstr/ary-ptrn-elem-id-init-exhausted.js",
  "language/statements/const/dstr/ary-ptrn-elem-id-init-hole.js",
  "language/statements/const/dstr/ary-ptrn-elem-id-init-skipped.js",
  "language/statements/const/dstr/ary-ptrn-elem-id-init-throws.js",
  "language/statements/const/dstr/ary-ptrn-elem-id-init-undef.js",
  "language/statements/const/dstr/ary-ptrn-elem-id-init-unresolvable.js",
  "language/statements/const/dstr/ary-ptrn-elem-id-iter-complete.js",
  "language/statements/const/dstr/ary-ptrn-elem-id-iter-done.js",
  "language/statements/const/dstr/ary-ptrn-elem-id-iter-val.js",
  "language/statements/const/dstr/ary-ptrn-elem-obj-id-init.js",
  "language/statements/const/dstr/ary-ptrn-elem-obj-id.js",
  "language/statements/const/dstr/ary-ptrn-elem-obj-prop-id-init.js",
  "language/statements/const/dstr/ary-ptrn-elem-obj-prop-id.js",
  "language/statements/const/dstr/ary-ptrn-elem-obj-val-null.js",
  "language/statements/const/dstr/ary-ptrn-elem-obj-val-undef.js",
  "language/statements/const/dstr/ary-ptrn-rest-init-ary.js",
  "language/statements/const/dstr/ary-ptrn-rest-init-id.js",
  "language/statements/const/dstr/ary-ptrn-rest-init-obj.js",
  "language/statements/const/dstr/ary-ptrn-rest-not-final-ary.js",
  "language/statements/const/dstr/ary-ptrn-rest-not-final-id.js",
  "language/statements/const/dstr/ary-ptrn-rest-not-final-obj.js",

  // Complete quoted-string files protect Unicode escape syntax and strict
  // early errors alongside local raw-astral literal regressions.
  "language/types/string/S8.4_A1.js",
  "language/literals/string/unicode-escape-nls-err-single.js",
  "language/literals/string/unicode-escape-nls-err-double.js",
  "language/literals/string/S7.8.4_A7.1_T4.js",
  "language/literals/string/legacy-octal-escape-sequence-strict.js",

  // Complete untagged templates: primitive/object conversion, calls, members,
  // nested templates, and head/middle/tail concatenation.
  "language/expressions/template-literal/no-sub.js",
  "language/expressions/template-literal/literal-expr-primitive.js",
  "language/expressions/template-literal/literal-expr-obj.js",
  "language/expressions/template-literal/literal-expr-function.js",
  "language/expressions/template-literal/literal-expr-method.js",
  "language/expressions/template-literal/literal-expr-member-expr.js",
  "language/expressions/template-literal/literal-expr-template.js",
  "language/expressions/template-literal/middle-list-one-expr-primitive.js",
  "language/expressions/template-literal/middle-list-one-expr-obj.js",
  "language/expressions/template-literal/middle-list-one-expr-function.js",
  "language/expressions/template-literal/middle-list-one-expr-method.js",
  "language/expressions/template-literal/middle-list-one-expr-member-expr.js",
  "language/expressions/template-literal/middle-list-one-expr-template.js",
  "language/expressions/template-literal/middle-list-many-expr-primitive.js",
  "language/expressions/template-literal/middle-list-many-expr-obj.js",
  "language/expressions/template-literal/middle-list-many-expr-function.js",
  "language/expressions/template-literal/middle-list-many-expr-method.js",
  "language/expressions/template-literal/middle-list-many-expr-member-expr.js",
  "language/expressions/template-literal/middle-list-many-expr-template.js",

  // Whole slice cases: generic conversion, numeric hints, effects and errors.
  "built-ins/String/prototype/slice/S15.5.4.13_A1_T10.js",
  "built-ins/String/prototype/slice/S15.5.4.13_A1_T11.js",
  "built-ins/String/prototype/slice/S15.5.4.13_A1_T13.js",
  "built-ins/String/prototype/slice/S15.5.4.13_A1_T14.js",
  "built-ins/String/prototype/slice/S15.5.4.13_A1_T4.js",
  "built-ins/String/prototype/slice/S15.5.4.13_A1_T7.js",
  "built-ins/String/prototype/slice/S15.5.4.13_A1_T8.js",
  "built-ins/String/prototype/slice/S15.5.4.13_A3_T1.js",
  "built-ins/String/prototype/slice/S15.5.4.13_A3_T2.js",
  "built-ins/String/prototype/slice/S15.5.4.13_A3_T3.js",
  "built-ins/String/prototype/slice/S15.5.4.13_A3_T4.js",
  "built-ins/String/prototype/slice/S15.5.4.13_A6.js",
  "built-ins/String/prototype/slice/S15.5.4.13_A11.js",
  "built-ins/String/prototype/slice/S15.5.4.13_A7.js",
  "built-ins/String/prototype/slice/this-value-not-obj-coercible.js",

  // String concatenation uses ordinary conversion, including ordered throws.
  "built-ins/String/prototype/concat/S15.5.4.6_A1_T4.js",
  "built-ins/String/prototype/concat/S15.5.4.6_A1_T5.js",
  "built-ins/String/prototype/concat/S15.5.4.6_A1_T7.js",
  "built-ins/String/prototype/concat/S15.5.4.6_A1_T8.js",
  "built-ins/String/prototype/concat/S15.5.4.6_A1_T10.js",
  "built-ins/String/prototype/concat/S15.5.4.6_A4_T1.js",
  "built-ins/String/prototype/concat/S15.5.4.6_A4_T2.js",
  "built-ins/String/prototype/concat/S15.5.4.6_A6.js",
  "built-ins/String/prototype/concat/S15.5.4.6_A11.js",
  "built-ins/String/prototype/concat/this-value-not-obj-coercible.js",
  "built-ins/Error/S15.11.1.1_A1_T1.js",
  "built-ins/Error/S15.11.2.1_A1_T1.js",
  "built-ins/Error/S15.11.1.1_A3_T1.js",
  "built-ins/Error/S15.11.2.1_A3_T1.js",
  "built-ins/Error/prototype/toString/15.11.4.4-6-1.js",
  "built-ins/Error/prototype/toString/15.11.4.4-6-2.js",
  "built-ins/Error/prototype/toString/15.11.4.4-8-1.js",
  "built-ins/Error/prototype/toString/15.11.4.4-8-2.js",
  "built-ins/Error/prototype/toString/15.11.4.4-9-1.js",
  "built-ins/Error/prototype/toString/15.11.4.4-10-1.js",
  // Complete constructor case invokes the generated parameterized function;
  // creation alone would miss using the wrong argument as its body.
  "built-ins/Function/S15.3.2.1_A2_T1.js",
  "language/expressions/typeof/boolean.js",
  "language/expressions/typeof/undefined.js",
  "language/expressions/typeof/unresolvable-reference.js",

  // Whole ordinary instanceof cases: operand evaluation/throws, constructor
  // identity and prototype chains, primitive left operands and invalid RHS.
  // A2.4_T3's RHS comma expression is unreachable after its reference error.
  // Bounded sequence expressions are covered separately (P026).
  "language/expressions/instanceof/S11.8.6_A1.js",
  "language/expressions/instanceof/S11.8.6_A2.1_T1.js",
  "language/expressions/instanceof/S11.8.6_A2.1_T2.js",
  "language/expressions/instanceof/S11.8.6_A2.1_T3.js",
  "language/expressions/instanceof/S11.8.6_A2.4_T2.js",
  "language/expressions/instanceof/S11.8.6_A2.4_T3.js",
  "language/expressions/instanceof/S11.8.6_A3.js",
  "language/expressions/instanceof/S11.8.6_A5_T1.js",
  "language/expressions/instanceof/S11.8.6_A5_T2.js",
  "language/expressions/instanceof/S11.8.6_A6_T1.js",
  "language/expressions/instanceof/S11.8.6_A6_T2.js",
  "language/expressions/instanceof/S11.8.6_A6_T3.js",
  "language/expressions/instanceof/S11.8.6_A6_T4.js",
  "language/expressions/instanceof/S11.8.6_A7_T1.js",
  "language/expressions/instanceof/S15.3.5.3_A1_T1.js",
  "language/expressions/instanceof/S15.3.5.3_A1_T2.js",
  "language/expressions/instanceof/S15.3.5.3_A1_T3.js",
  "language/expressions/instanceof/S15.3.5.3_A1_T4.js",
  "language/expressions/instanceof/S15.3.5.3_A1_T5.js",
  "language/expressions/instanceof/S15.3.5.3_A1_T6.js",
  "language/expressions/instanceof/S15.3.5.3_A1_T7.js",
  "language/expressions/instanceof/S15.3.5.3_A1_T8.js",
  "language/expressions/instanceof/S15.3.5.3_A2_T5.js",
  "language/expressions/instanceof/S15.3.5.3_A3_T1.js",
  "language/expressions/instanceof/primitive-prototype-with-object.js",
  "language/expressions/instanceof/primitive-prototype-with-primitive.js",

  "language/expressions/less-than/S11.8.1_A4.4.js",
  "language/expressions/less-than/S11.8.1_A4.10.js",
  "language/expressions/less-than/S11.8.1_A4.11.js",
  "language/expressions/greater-than/S11.8.2_A4.4.js",
  "language/expressions/strict-equals/S11.9.4_A3.js",
  "language/expressions/strict-equals/S11.9.4_A5.js",
  "language/expressions/strict-equals/S11.9.4_A6.2.js",
  // Whole equality cases protect signed zero, primitive inequality, operand
  // effects and abrupt completion alongside symbolic choice refinement.
  "language/expressions/strict-equals/S11.9.4_A4.2.js",
  "language/expressions/strict-equals/S11.9.4_A2.4_T1.js",
  "language/expressions/strict-equals/S11.9.4_A2.4_T2.js",
  "language/expressions/strict-does-not-equals/S11.9.5_A3.js",
  "language/expressions/strict-does-not-equals/S11.9.5_A5.js",
  "language/expressions/strict-does-not-equals/S11.9.5_A6.2.js",
  "language/expressions/strict-does-not-equals/S11.9.5_A4.2.js",
  "language/expressions/strict-does-not-equals/S11.9.5_A2.4_T1.js",
  "language/expressions/strict-does-not-equals/S11.9.5_A2.4_T2.js",
  "language/expressions/conditional/S11.12_A3_T4.js",
  "language/expressions/conditional/S11.12_A4_T4.js",
  "language/expressions/logical-and/S11.11.1_A3_T4.js",
  "language/expressions/logical-and/S11.11.1_A4_T4.js",
  "language/expressions/logical-or/S11.11.2_A3_T4.js",
  "language/expressions/logical-or/S11.11.2_A4_T4.js",
  "language/statements/if/if-const-else-stmt.js",
  "language/statements/if/if-const-no-else.js",

  // Arithmetic primitives, signs, and left-to-right operand evaluation.
  // IEEE boundary files requiring Number constants/isNaN remain a runtime gap;
  // the harness does not substitute host implementations for missing built-ins.
  "language/expressions/addition/S11.6.1_A1.js",
  "language/expressions/addition/S11.6.1_A2.4_T1.js",
  "language/expressions/subtraction/S11.6.2_A1.js",
  "language/expressions/subtraction/S11.6.2_A2.4_T1.js",
  "language/expressions/subtraction/S11.6.2_A2.4_T2.js",
  "language/expressions/multiplication/S11.5.1_A1.js",
  "language/expressions/multiplication/S11.5.1_A2.4_T1.js",
  "language/expressions/multiplication/S11.5.1_A2.4_T2.js",
  "language/expressions/division/S11.5.2_A1.js",
  "language/expressions/division/S11.5.2_A2.4_T1.js",
  "language/expressions/division/S11.5.2_A2.4_T2.js",
  "language/expressions/division/S11.5.2_A4_T2.js",
  "language/expressions/unary-plus/S11.4.6_A1.js",
  "language/expressions/unary-plus/S9.3_A4.1_T2.js",
  "language/expressions/unary-plus/11.4.6-2-1.js",
  "language/expressions/unary-minus/S11.4.7_A1.js",
  "language/expressions/unary-minus/11.4.7-4-1.js",

  // Lexical environments, captured bindings, and declaration instantiation.
  "language/statements/block/scope-lex-open.js",
  "language/statements/block/scope-lex-close.js",
  "language/statements/block/scope-var-none.js",
  "language/block-scope/shadowing/parameter-name-shadowing-parameter-name-let-const-and-var.js",
  "language/block-scope/shadowing/hoisting-var-declarations-out-of-blocks.js",
  "language/block-scope/shadowing/lookup-from-closure.js",
  "language/block-scope/shadowing/lookup-in-and-through-block-contexts.js",
  "language/block-scope/shadowing/let-declarations-shadowing-parameter-name-let-const-and-var.js",
  "language/block-scope/shadowing/const-declarations-shadowing-parameter-name-let-const-and-var-variables.js",
  "language/block-scope/leave/try-block-let-declaration-only-shadows-outer-parameter-value-1.js",
  "language/block-scope/leave/try-block-let-declaration-only-shadows-outer-parameter-value-2.js",
  "language/block-scope/return-from/block-let.js",
  "language/block-scope/return-from/block-const.js",
  "language/expressions/function/scope-name-var-close.js",
  "language/statements/function/S13_A6_T1.js",
  "language/statements/function/S13_A6_T2.js",
  "language/statements/variable/S14_A1.js",

  // Arrow returns, lexical capture/this, explicit arguments parameters,
  // strictness, and non-construction. Each upstream file is run whole.
  "language/expressions/arrow-function/expression-body-implicit-return.js",
  "language/expressions/arrow-function/empty-function-body-returns-undefined.js",
  "language/expressions/arrow-function/statement-body-requires-braces-must-return-explicitly.js",
  "language/expressions/arrow-function/statement-body-requires-braces-must-return-explicitly-missing.js",
  "language/expressions/arrow-function/object-literal-return-requires-body-parens.js",
  "language/expressions/arrow-function/throw-new.js",
  "language/expressions/arrow-function/strict.js",
  "language/expressions/arrow-function/non-strict.js",
  "language/expressions/arrow-function/lexical-bindings-overriden-by-formal-parameters-non-strict.js",
  "language/expressions/arrow-function/arrow/capturing-closure-variables-1.js",
  "language/expressions/arrow-function/arrow/binding-tests-1.js",
  "language/expressions/arrow-function/arrow/binding-tests-3.js",

  // Strict directives use source spelling and the directive prologue, not the
  // cooked value of arbitrary string expressions.
  "language/directive-prologue/14.1-5-s.js",
  "language/directive-prologue/14.1-14-s.js",

  // Identifier default parameters preserve TDZ and the separate parameter/body
  // environments. The generated marker is metadata, not a source transformation.
  "language/expressions/arrow-function/dflt-params-ref-prior.js",
  "language/expressions/arrow-function/dflt-params-ref-later.js",
  "language/expressions/arrow-function/dflt-params-ref-self.js",
  "language/expressions/function/dflt-params-ref-prior.js",
  "language/expressions/function/dflt-params-ref-later.js",
  "language/expressions/function/dflt-params-ref-self.js",
  "language/statements/function/dflt-params-ref-prior.js",
  "language/statements/function/dflt-params-ref-later.js",
  "language/statements/function/dflt-params-ref-self.js",
  "language/expressions/arrow-function/scope-paramsbody-var-open.js",
  "language/expressions/arrow-function/scope-paramsbody-var-close.js",
  "language/expressions/function/scope-paramsbody-var-open.js",
  "language/expressions/function/scope-paramsbody-var-close.js",

  // Complete object-spread exception cases. Positive-copy files also require
  // compound assignment; descriptor/accessor cases need more APIs.
  "language/expressions/call/spread-err-sngl-err-obj-unresolvable.js",
  "language/expressions/call/spread-err-mult-err-obj-unresolvable.js",

  // Formal parameter names cannot be redeclared lexically in the same
  // function body. Parse-negative cases do not imply generator/async runtime
  // support; each complete upstream source must fail before evaluation.
  "language/statements/async-function/early-errors-declaration-formals-body-duplicate.js",
  "language/expressions/async-function/early-errors-expression-formals-body-duplicate.js",
  "language/expressions/async-arrow-function/early-errors-arrow-formals-body-duplicate.js",
  "language/expressions/async-generator/early-errors-expression-formals-body-duplicate-let.js",
  "language/expressions/async-generator/early-errors-expression-formals-body-duplicate-const.js",
  "language/expressions/object/method-definition/generator-param-redecl-let.js",
  "language/expressions/object/method-definition/generator-param-redecl-const.js",

  // Eval inherits lexical lookup and isolates strict declarations.
  "language/eval-code/direct/lex-env-heritage.js",
  "language/eval-code/direct/var-env-var-strict-source.js",

  // Evaluation order and abrupt completions through expressions and calls.
  "language/expressions/call/S11.2.4_A1.4_T3.js",
  "language/expressions/call/S11.2.4_A1.4_T4.js",
  "language/expressions/addition/S11.6.1_A2.4_T2.js",
  "language/expressions/logical-and/S11.11.1_A2.4_T2.js",
  "language/expressions/logical-or/S11.11.2_A2.4_T2.js",
  "language/statements/function/S13.2.1_A8_T1.js",
  "language/statements/throw/S12.13_A3_T6.js",
  "language/statements/try/S12.14_A7_T2.js",
  "language/statements/try/S12.14_A13_T1.js",
  "language/statements/try/S12.14_A13_T2.js",
  "language/statements/try/S12.14_A13_T3.js",

  // P032: whole unmodified concrete String.prototype.split cases: an empty
  // receiver with an omitted separator yields the whole string, and an
  // empty receiver splitting on an absent separator keeps its single
  // empty element.
  "built-ins/String/prototype/split/S15.5.4.14_A1_T4.js",
  "built-ins/String/prototype/split/S15.5.4.14_A2_T19.js"
];

describe("Test262 active corpus", () => {
  for (const path of activeCorpus) {
    const file = loadTest262(path);
    for (const variant of variantsFor(file)) {
      test(`${path} (${variant})`, () => {
        runTest262Variant(file, variant);
      });
    }
  }
});

// Preserve the old backlog visibly, without invoking the former subprocess
// host, which swallowed exceptions and could report a failing test as passed.
const historicalGlobs = [
  "language/statements/if/if-{async,cls,const,decl,fun,gen,let,stmt}-*.js",
  "language/statements/if/labelled-fn-stmt-*.js",
  "language/statements/if/let-*-with-newline.js",
  "language/types/boolean/S8.3_A{3,1_T{1,2}}.js",
  "built-ins/Boolean/S15.6.1.1_A1_T*.js",
  "built-ins/Boolean/S15.6.1.1_A2.js",
  "built-ins/Boolean/S15.6.2.1_A1.js"
];

describe("Test262 historical backlog (not yet supported)", () => {
  const files = sync(historicalGlobs.map(glob => join(test262Root, "test", glob)));
  for (const file of files) {
    const path = relative(join(test262Root, "test"), file);
    if (!activeCorpus.includes(path)) {
      test.skip(path, () => {
        const parsed = loadTest262(path);
        for (const variant of variantsFor(parsed)) {
          runTest262Variant(parsed, variant);
        }
      });
    }
  }
});
