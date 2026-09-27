import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { TExecutionContext } from "../src/execution-context/ExecutionContext";
import { readMember } from "../src/ASTResolvers";

function run(source: string, initial: TExecutionContext = nodeInitialExecutionContext) {
  const [, context] = evaluateCode(source, initial);
  expect(context.value.uncaught).toBeUndefined();
  return context;
}

test("an uninitialized var declaration does not reset a parameter or a prior assignment", () => {
  const context = run(`
    function read(value) { var value; return value; }
    var value = 4;
    var value;
    const result = read(value);
  `);
  expect(context.value.scope.result).toMatchObject({ value: 4 });
});

test("failed lexical writes preserve RHS effects and their original bindings", () => {
  const context = run(`
    let effects = 0;
    function rhs() { effects = effects + 1; return 2; }
    const fixed = 1;
    let constantError;
    let earlyError;
    try { fixed = rhs(); } catch (error) { constantError = error.name; }
    try { later = rhs(); let later; } catch (error) { earlyError = error.name; }
    const preserved = fixed;
  `);
  expect(context.value.scope.effects).toMatchObject({ value: 2 });
  expect(context.value.scope.preserved).toMatchObject({ value: 1 });
  expect(context.value.scope.constantError).toMatchObject({ value: "TypeError" });
  expect(context.value.scope.earlyError).toMatchObject({ value: "ReferenceError" });
});

test("global closures see later declarations in the same persistent environment", () => {
  const before = run(`const read = function() { return later; };`);
  const after = run(`let later = 3; const observed = read();`, before);
  expect(after.value.scope.observed).toMatchObject({ value: 3 });
  expect(before.value.scope).not.toHaveProperty("later");
  const missing = run(`let failure; try { read(); } catch (error) { failure = error.name; }`, before);
  expect(missing.value.scope.failure).toMatchObject({ value: "ReferenceError" });
});

test("a named function expression has an immutable private name in both modes", () => {
  const context = run(`
    const sloppy = function self() { self = 0; return self; };
    const unchanged = sloppy() === sloppy;
    const strict = function self() { "use strict"; self = 0; };
    let failure;
    try { strict(); } catch (error) { failure = error.name; }
    const hidden = typeof self;
  `);
  expect(context.value.scope.unchanged).toMatchObject({ value: true });
  expect(context.value.scope.failure).toMatchObject({ value: "TypeError" });
  expect(context.value.scope.hidden).toMatchObject({ value: "undefined" });
});

test("captured initialization state keeps its symbolic guard across early returns", () => {
  const context = run(`
    const guard = Math.random() < 0.5;
    function factory() {
      const read = function() { return later; };
      if (guard) return read;
      let later = 3;
      return read;
    }
    const read = factory();
    let observed;
    if (guard) {
      try { read(); } catch (error) { observed = error.name; }
    } else observed = read();
    const proof = guard ? observed === "ReferenceError" : observed === 3;
  `);
  expect(context.value.scope.proof).toMatchObject({ value: true });
});

test("successive scripts reject conflicting global declarations before executing effects", () => {
  const before = run(`let fixed = 1; var shared = 2;`);
  for (const source of [
    `shared = 9; let fixed = 2;`,
    `shared = 9; var fixed = 2;`,
    `shared = 9; function fixed() {}`,
    `shared = 9; const shared = 2;`
  ]) {
    const [, after] = evaluateCode(source, before);
    expect(after.value.uncaught).toBeDefined();
    expect(readMember(after.value.uncaught!, "name", after)[0]).toMatchObject({ value: "SyntaxError" });
    expect(after.value.scope.fixed).toMatchObject({ value: 1 });
    expect(after.value.scope.shared).toMatchObject({ value: 2 });
  }
  expect(run(`var shared; const observed = shared;`, before).value.scope.observed)
    .toMatchObject({ value: 2 });
});
