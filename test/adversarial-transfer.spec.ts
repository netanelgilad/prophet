import { execFileSync } from "child_process";
import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { isForkedCompletion } from "../src/execution-context/Completion";
import { exactIntegerDifference } from "../src/symbolic/affine";
import { arithmeticNumber, negateNumber } from "../src/symbolic/arithmetic";
import { strictEquality, compareNumbers } from "../src/symbolic";
import { Any, Undefined, ESNumber, TESBoolean, TESNumber, isThrownValue } from "../src/types";

import { assertPinnedNode } from "./commonjs/oracle";
beforeAll(assertPinnedNode);

function integer(low: number, high: number) {
  const value = ESNumber();
  value.knowledge = [{ kind: "integer", subject: value },
    { kind: "order", left: ESNumber(low), right: value, strict: false },
    { kind: "order", left: value, right: ESNumber(high), strict: false }];
  return value;
}
function run(source: string, inputs: { [key: string]: Any }) {
  const [completion, context] = evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, inputs));
  expect(completion).toBe(Undefined);
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(context.value.uncaught).toBeUndefined();
  return context.value.scope;
}
const transfer = `function transfer(from, to, amount) {
  const before = from.value + to.value;
  from.value = from.value - amount;
  to.value = to.value + amount;
  return from.value + to.value !== before;
}`;
const stale = `function transfer(from, to, amount) {
  const before = from.value + to.value;
  const cached = to.value;
  from.value = from.value - amount;
  to.value = cached + amount;
  return from.value + to.value !== before;
}`;
for (const alias of [false, true]) {
  test(`symbolic bounded integer transfer conserves total with alias=${alias}`, () => {
    const scope = run(`${transfer}
      const from = {value: a}; const to = ${alias ? "from" : "{value: b}"};
      const violation = transfer(from, to, amount);`,
    { a: integer(-1000000, 1000000), b: integer(-1000000, 1000000), amount: integer(0, 1000) });
    expect(scope.violation).toMatchObject({ value: false });
  });
  test(`stale target control with alias=${alias}`, () => {
    const scope = run(`${stale}
      const from = {value: a}; const to = ${alias ? "from" : "{value: b}"};
      const violation = transfer(from, to, amount);`,
    { a: integer(-1000000, 1000000), b: integer(-1000000, 1000000), amount: integer(0, 1000) });
    expect((scope.violation as TESBoolean).value).toBe(alias ? undefined : false);
  });
}
test("renamed and reordered exact arithmetic preserves conservation", () => {
  const scope = run(`const before = y + x; const debit = x - delta;
    const credit = delta + y; const violation = before !== credit + debit;
    const order = credit + debit < before;`,
  { x: integer(-1000000, 1000000), y: integer(-1000000, 1000000), delta: integer(0, 1000) });
  expect(scope.violation).toMatchObject({ value: false });
  expect(scope.order).toMatchObject({ value: false });
});
for (const domain of ["unrestricted", "fractional", "unsafe-intermediate"]) {
  test(`must not cancel ${domain} arithmetic`, () => {
    const input = domain === "unsafe-intermediate" ? integer(0, Number.MAX_SAFE_INTEGER) : ESNumber();
    if (domain === "fractional") input.knowledge = [
      { kind: "finite", subject: input },
      { kind: "order", left: ESNumber(0), right: input, strict: false },
      { kind: "order", left: input, right: ESNumber(1), strict: false }];
    const scope = run(`const violation = (x + 1) - 1 !== x;`, { x: input });
    expect((scope.violation as TESBoolean).value).toBeUndefined();
  });
}
test("cancellation never rewrites numeric values or loses signed zero", () => {
  const scope = run(`const z = (x + 0) - 0; const equality = z === x; const reciprocal = 1 / z;`, { x: integer(0, 0) });
  expect(scope.equality).toMatchObject({ value: true });
  expect((scope.reciprocal as TESNumber).value).toBeUndefined();
});
test("pinned Node witnesses validate correct and broken programs and IEEE boundaries", () => {
  const node = process.env.PROPHET_NODE_BINARY || process.execPath;
  const results = JSON.parse(execFileSync(node, ["-e", `${stale}
    const a={value:10}, b={value:10};
    console.log(JSON.stringify([process.version, transfer(a,a,0),transfer(b,b,1),
      ((0.1+1)-1)!==0.1, ((Number.MAX_SAFE_INTEGER+2)-2)!==Number.MAX_SAFE_INTEGER,
      (Infinity+1)-1!==Infinity, (NaN+1)-1!==NaN, Object.is((-0+0)-0,-0)]));`], {encoding:"utf8"}));
  expect(results).toEqual(["v24.21.0", false, true, true, true, false, true, false]);
});

test("general affine sums handle unary negation and nonzero constant differences", () => {
  const a = integer(-100, 100), b = integer(-100, 100);
  const sum = arithmeticNumber("+", a, b);
  const reverse = arithmeticNumber("-", a, negateNumber(b));
  expect(strictEquality(sum, reverse).value).toBe(true);
  const shifted = arithmeticNumber("+", reverse, ESNumber(3));
  expect(strictEquality(sum, shifted).value).toBe(false);
  expect(compareNumbers(sum, shifted, "<").value).toBe(true);
});
test("every intermediate must be safe even when the final interval is small", () => {
  const x = integer(0, Number.MAX_SAFE_INTEGER);
  const unsafe = arithmeticNumber("+", x, ESNumber(2));
  const restored = arithmeticNumber("-", unsafe, ESNumber(2));
  expect(exactIntegerDifference(restored, x)).toBeUndefined();
  const nan = arithmeticNumber("-", ESNumber(Infinity), ESNumber(Infinity));
  expect(exactIntegerDifference(nan, nan)).toBeUndefined();
});
test("normalization caps and cyclic expressions give unknown", () => {
  const x = integer(0, 10);
  let deep = x;
  for (let i = 0; i < 30; i++) deep = arithmeticNumber("+", deep, ESNumber(0));
  expect(exactIntegerDifference(deep, x)).toBeUndefined();
  const cyclic = ESNumber();
  cyclic.expression = { kind: "binary", operator: "+", left: cyclic, right: ESNumber(0) };
  expect(exactIntegerDifference(cyclic, x)).toBeUndefined();
});
test("proofs never equate independent symbolic atoms with identical bounds", () => {
  const x = integer(-100, 100), y = integer(-100, 100);
  expect(strictEquality(arithmeticNumber("+", x, ESNumber(1)),
    arithmeticNumber("+", y, ESNumber(1))).value).toBeUndefined();
});

test("an unknown alias choice preserves the conservation proof", () => {
  const scope = run(`${transfer}
    const from = {value:a}; const other = {value:b};
    const violation = transfer(from, alias ? from : other, amount);
    const after = from.value;`,
    { a: integer(-1000000,1000000), b: integer(-1000000,1000000),
      amount: integer(0,1000), alias: ESBoolean() });
  expect(scope.violation).toMatchObject({ value:false });
  expect((scope.a as TESNumber).value).toBeUndefined();
  expect((scope.after as TESNumber).value).toBeUndefined();
});
