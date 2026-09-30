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
  "language/statements/if/if-const-no-else.js"
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
