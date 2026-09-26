import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESNumber, TESBoolean, TESNumber } from "../src/types";

function finiteNumber(): TESNumber {
  const value = ESNumber();
  value.knowledge = [{ kind: "finite", subject: value }];
  return value;
}

test("compound guards imply required operands while optional operands stay unknown", () => {
  const initial = setVariablesInScope(nodeInitialExecutionContext, {
    x: finiteNumber(), y: finiteNumber()
  });
  const [, context] = evaluateCode(`
    const both = x > 0 && y > 0;
    const either = x > 0 || y > 0;
    const conjunction = both ? x > 0 && y > 0 : true;
    const neither = !either ? x <= 0 && y <= 0 : true;
    const optionalAnd = !both ? x <= 0 : true;
    const optionalOr = either ? x > 0 : true;
  `, initial);
  const scope = context.value.scope;
  expect(context.value.uncaught).toBeUndefined();
  expect(scope.conjunction).toMatchObject({ value: true });
  expect(scope.neither).toMatchObject({ value: true });
  expect((scope.optionalAnd as TESBoolean).value).toBeUndefined();
  expect((scope.optionalOr as TESBoolean).value).toBeUndefined();
});

test("a ternary guard retains only implications shared by both feasible alternatives", () => {
  const initial = setVariablesInScope(nodeInitialExecutionContext, {
    guard: ESBoolean(), x: finiteNumber(), y: finiteNumber(), z: finiteNumber()
  });
  const [, context] = evaluateCode(`
    const accepted = guard ? x > 0 && y > 0 : x > 0 && z > 0;
    const shared = accepted ? x > 0 : true;
    const leftOnly = accepted ? y > 0 : true;
    const rightOnly = accepted ? z > 0 : true;
    const selectedPath = accepted ? guard : true;
    const ties = guard ? x < y : x <= y;
    const strictOnly = ties ? x < y : true;
  `, initial);
  const scope = context.value.scope;
  expect(context.value.uncaught).toBeUndefined();
  expect(scope.shared).toMatchObject({ value: true });
  for (const name of ["leftOnly", "rightOnly", "selectedPath", "strictOnly"]) {
    expect((scope[name] as TESBoolean).value).toBeUndefined();
  }
});

test("false compound comparisons preserve possible NaN instead of inventing range facts", () => {
  // No finite or not-NaN fact: rejection of both comparisons also permits NaN.
  const initial = setVariablesInScope(nodeInitialExecutionContext, { input: ESNumber() });
  const [, context] = evaluateCode(`
    const rejected = !(input < 0 || input > 1);
    const consistent = rejected ? !(input < 0) && !(input > 1) : true;
    const unsafe = rejected ? input >= 0 && input <= 1 : true;
    const accepted = input >= 0 && input <= 1;
    const reflexive = accepted ? input <= input : true;
  `, initial);
  const scope = context.value.scope;
  expect(context.value.uncaught).toBeUndefined();
  expect(scope.consistent).toMatchObject({ value: true });
  expect(scope.reflexive).toMatchObject({ value: true });
  expect((scope.unsafe as TESBoolean).value).toBeUndefined();
});

test("recomputed boolean choices share facts only when their guard and both alternatives match", () => {
  // The numeric inputs may be NaN; the two Boolean guards are independent.
  const initial = setVariablesInScope(nodeInitialExecutionContext, {
    guard: ESBoolean(), other: ESBoolean(), x: ESNumber(), y: ESNumber(), z: ESNumber()
  });
  const [, context] = evaluateCode(`
    const original = guard ? x < 0 : y > 0;
    const copy = guard ? x < 0 : y > 0;
    const repeated = original ? copy : !copy;
    const changedThen = guard ? z < 0 : y > 0;
    const changedElse = guard ? x < 0 : z > 0;
    const swapped = guard ? y > 0 : x < 0;
    const changedGuard = other ? x < 0 : y > 0;
    const thenProof = original ? changedThen : !changedThen;
    const elseProof = original ? changedElse : !changedElse;
    const swappedProof = original ? swapped : !swapped;
    const guardProof = original ? changedGuard : !changedGuard;
    const nested = guard ? (other ? x < 0 : y > 0) : z <= 0;
    const nestedCopy = guard ? (other ? x < 0 : y > 0) : z <= 0;
    const nestedProof = nested ? nestedCopy : !nestedCopy;
    const literal = guard ? true : x < 0;
    const literalCopy = guard ? true : x < 0;
    const literalProof = literal ? literalCopy : !literalCopy;
    const oppositeLiteral = guard ? false : x < 0;
    const oppositeProof = literal ? oppositeLiteral : !oppositeLiteral;
  `, initial);
  const scope = context.value.scope;
  expect(context.value.uncaught).toBeUndefined();
  for (const name of ["repeated", "nestedProof", "literalProof"]) {
    expect(scope[name]).toMatchObject({ value: true });
  }
  for (const name of ["thenProof", "elseProof", "swappedProof", "guardProof", "oppositeProof"]) {
    expect((scope[name] as TESBoolean).value).toBeUndefined();
  }
});

test("concrete compound-guard claims agree with independent JavaScript edge cases", () => {
  // Both symbolic inputs permit all numbers, including NaN and infinities.
  const initial = setVariablesInScope(nodeInitialExecutionContext, {
    x: ESNumber(), y: ESNumber()
  });
  const guards = [
    "x < 0 && y > 0",
    "x < 0 || y > 0",
    "x < y ? x >= 0 && y >= 0 : x >= 0 && y < 0",
    "(x < 0 || y < 0) && (x > 0 || y > 0)"
  ];
  const queries = ["x < 0", "x >= 0", "x <= x", "y <= y", "x < y", "x < 0 && y > 0"];
  const domain = [NaN, -Infinity, -1, -0, 0, 1, Infinity];
  let concreteClaims = 0;
  for (const guard of guards) {
    for (const query of queries) {
      for (const onTrue of [true, false]) {
        const expression = onTrue
          ? `(${guard}) ? (${query}) : true`
          : `(${guard}) ? true : (${query})`;
        const [, context] = evaluateCode(`const result = ${expression};`, initial);
        expect(context.value.uncaught).toBeUndefined();
        const claimed = (context.value.scope.result as TESBoolean).value;
        if (claimed === undefined) continue;
        concreteClaims += 1;
        // This host oracle checks Prophet's claim; it never supplies a VM result.
        const concrete = Function("x", "y", `return ${expression};`);
        for (const x of domain) {
          for (const y of domain) {
            expect({ expression, x, y, result: claimed }).toEqual({
              expression, x, y, result: concrete(x, y)
            });
          }
        }
      }
    }
  }
  expect(concreteClaims).toBeGreaterThan(3);
});
