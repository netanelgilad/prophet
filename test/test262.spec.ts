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
  "language/expressions/typeof/boolean.js",
  "language/expressions/typeof/undefined.js",
  "language/expressions/typeof/unresolvable-reference.js",
  "language/expressions/less-than/S11.8.1_A4.4.js",
  "language/expressions/less-than/S11.8.1_A4.10.js",
  "language/expressions/less-than/S11.8.1_A4.11.js",
  "language/expressions/greater-than/S11.8.2_A4.4.js",
  "language/expressions/strict-equals/S11.9.4_A3.js",
  "language/expressions/strict-equals/S11.9.4_A5.js",
  "language/expressions/strict-equals/S11.9.4_A6.2.js",
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
  "language/statements/try/S12.14_A13_T3.js"
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
