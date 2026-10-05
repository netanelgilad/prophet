import { parseTest262, runTest262Variant, variantsFor } from "./runner";

function run(source: string) {
  runTest262Variant(parseTest262(source), "sloppy");
}

describe("Test262 runner cannot silently pass failures", () => {
  test("assert.throws checks interpreted exception constructor and rejects analysis failures", () => {
    run('assert.throws(TypeError, function() { throw new TypeError("expected"); });');
    expect(() => run('assert.throws(Error, function() { throw new TypeError(); });')).toThrow(/constructor/);
    expect(() => run('assert.throws(Error, function() { return Error(); });')).toThrow(/expected an exception/);
    expect(() => run('assert.throws(TypeError, function() { throw "TypeError"; });')).toThrow(/object/);
    expect(() => run('assert.throws(Error, function() { new String(); });')).toThrow(/not yet supported/);
    expect(() => run('assert.throws(Error, function() { if (Math.random() < 0.5) throw Error(); });')).toThrow(/symbolic/);
  });
  test("assert requires exactly true, and SameValue distinguishes signed zero", () => {
    run("assert(true); assert.sameValue(1, 1); assert.notSameValue(0, -0);");
    expect(() => run("assert(false);")).toThrow("expected exactly true");
    expect(() => run("assert(1);")).toThrow("expected exactly true");
    expect(() => run("assert.sameValue(0, -0);")).toThrow("sameValue failed");
    expect(() => run("assert.notSameValue(1, 1);")).toThrow("notSameValue failed");
  });

  test("SameValue handles NaN and rejects unknown values", () => {
    run("assert.sameValue(0 / 0, 0 / 0);");
    expect(() => run("assert.sameValue(Math.random(), undefined);")).toThrow(
      "requires a concrete primitive"
    );
    expect(() => run("assert.sameValue([], []);")).toThrow(
      "sameValue failed"
    );
  });

  test("SameValue checks concrete reference identity and rejects conditional references", () => {
    run(`
      var object = {};
      var array = [];
      var fn = function () {};
      assert.sameValue(object, object);
      assert.sameValue(array, array);
      assert.sameValue(fn, fn);
      assert.notSameValue(object, {});
      assert.notSameValue(array, []);
      assert.notSameValue(fn, function () {});
      assert.notSameValue(object, null);
    `);
    expect(() => run("var object = {}; assert.notSameValue(object, object);")).toThrow(
      "notSameValue failed"
    );
    expect(() => run(`
      var value = Math.random() < 0.5 ? {} : {};
      assert.sameValue(value, value);
    `)).toThrow("requires a concrete primitive");
  });

  test("test failures and VM errors propagate", () => {
    expect(() => run('$ERROR("intentional failure");')).toThrow("intentional failure");
    expect(() => run("missingFunction();")).toThrow();
    expect(() => run("throw 42;")).toThrow();
    expect(() => run("throw '';")).toThrow();
    expect(() => run("throw undefined;")).toThrow();
  });

  test("a top-level throw on only some symbolic paths cannot count as a pass", () => {
    expect(() => run(`
      if (Math.random() < 0.5) throw "one path failed";
    `)).toThrow("Unresolved symbolic completion in Test262 test");
  });

  test("an evaluation failure cannot satisfy a parse-negative expectation", () => {
    const metadata = "/*---\nnegative:\n  phase: parse\n  type: SyntaxError\n---*/\n";
    runTest262Variant(parseTest262(metadata + "if (true) const x = 1;"), "sloppy");
    expect(() => runTest262Variant(
      parseTest262(metadata + '$ERROR("a runtime failure is not a parse error");'),
      "sloppy"
    )).toThrow("parsing succeeded");
  });

  test("strictness flags produce the required variants", () => {
    expect(variantsFor(parseTest262("var x = 1;"))).toEqual(["sloppy", "strict"]);
    expect(variantsFor(parseTest262("/*---\nflags: [onlyStrict]\n---*/"))).toEqual(["strict"]);
    expect(variantsFor(parseTest262("/*---\nflags: [noStrict]\n---*/"))).toEqual(["sloppy"]);
    expect(variantsFor(parseTest262("/*---\nflags: [raw]\n---*/"))).toEqual(["raw"]);
  });

  test("generated source metadata keeps the complete file and ordinary strictness variants", () => {
    const file = parseTest262('/*---\nflags: [generated]\n---*/\nassert.sameValue(1, 1);');
    expect(variantsFor(file)).toEqual(["sloppy", "strict"]);
    for (const variant of variantsFor(file)) runTest262Variant(file, variant);
    const failure = parseTest262('/*---\nflags: [generated]\n---*/\nassert.sameValue(1, 2);');
    expect(() => runTest262Variant(failure, "sloppy")).toThrow("sameValue failed");
    expect(() => runTest262Variant(failure, "strict")).toThrow("sameValue failed");
    expect(variantsFor(parseTest262("/*---\nflags: [generated, noStrict]\n---*/"))).toEqual(["sloppy"]);
  });

  test("unsupported metadata is rejected instead of ignored", () => {
    for (const metadata of [
      "flags: [async]",
      "flags: [module]",
      "includes: [compareArray.js]",
      "negative:\n  phase: runtime\n  type: TypeError"
    ]) {
      expect(() => variantsFor(parseTest262(`/*---\n${metadata}\n---*/`))).toThrow(
        "Unsupported Test262"
      );
    }
  });
});


test("the complete standard harness provides an independent Test262Error constructor", () => {
  const file = parseTest262('assert.throws(Test262Error, function() { throw new Test262Error("expected"); });');
  runTest262Variant(file, "sloppy");
  const mismatch = parseTest262('assert.throws(Test262Error, function() { throw new Error("wrong"); });');
  expect(() => runTest262Variant(mismatch, "sloppy")).toThrow(/constructor/);
});
