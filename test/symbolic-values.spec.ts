import "../src";
import { ESNumber, TESNumber, TESBoolean } from "../src/types";
import { ESString, TESString } from "../src/string/String";
import { ESBoolean, coerceToBoolean } from "../src/boolean/ESBoolean";
import {
  Knowledge, assume, choiceOf, compareNumbers, isChoice, negate,
  randomNumber, resolveBoolean, selectValue, strictEquality
} from "../src/symbolic";

describe("shared expressions and composable knowledge", () => {
  test("a comparison is an expression, and a branch assumption is a fact", () => {
    const value = randomNumber();
    const condition = compareNumbers(value, ESNumber(0.5), "<");
    expect(condition.expression).toMatchObject({ kind: "compare", operator: "<" });
    expect(condition.value).toBeUndefined();
    expect(value.knowledge!.map(fact => fact.kind)).toEqual(["finite", "order", "order"]);
    const initial: Knowledge = [];
    const inside = assume(initial, condition, true);
    expect(initial).toEqual([]);
    expect(inside.some(fact => fact.kind === "truth")).toBe(true);
    expect(inside.some(fact => fact.kind === "order")).toBe(true);
    expect(compareNumbers(value, ESNumber(0.5), ">=", inside).value).toBe(false);
    expect(compareNumbers(value, ESNumber(0.5), ">=").value).toBeUndefined();
  });

  test("string choices retain their condition and resolve on either path", () => {
    const condition = ESBoolean();
    const result = selectValue(condition, ESString("accepted"), ESString("rejected")) as TESString;
    expect(result.type).toBe("string");
    expect(result.value).toBeUndefined();
    expect(choiceOf(result)!.condition).toBe(condition);
    expect(strictEquality(result, ESString("accepted")).value).toBeUndefined();
    expect(strictEquality(result, ESString("accepted"), assume([], condition, true)).value).toBe(true);
    expect(strictEquality(result, ESString("rejected"), assume([], condition, false)).value).toBe(true);
  });

  test("boolean choices and negation preserve correlation with an unknown guard", () => {
    const condition = ESBoolean();
    const selected = selectValue(condition, ESBoolean(true), ESBoolean(false)) as TESBoolean;
    expect(selected.value).toBeUndefined();
    expect(strictEquality(selected, condition).value).toBe(true);
    expect(resolveBoolean(negate(condition), assume([], condition, true))).toBe(false);
    expect(resolveBoolean(condition, assume([], negate(condition), true))).toBe(false);
  });

  test("mixed primitive choices support equality and truthiness", () => {
    const condition = ESBoolean();
    const result = selectValue(condition, ESNumber(0), ESString("ready"));
    expect(isChoice(result)).toBe(true);
    expect(strictEquality(result, ESNumber(0), assume([], condition, true)).value).toBe(true);
    expect(strictEquality(result, ESString("ready"), assume([], condition, false)).value).toBe(true);
    expect(strictEquality(coerceToBoolean(result), negate(condition)).value).toBe(true);
  });

  test("a mixed choice containing NaN cannot be declared equal to itself", () => {
    const condition = ESBoolean();
    const result = selectValue(condition, ESNumber(NaN), ESString("ready"));
    expect(strictEquality(result, result).value).toBeUndefined();
    expect(strictEquality(result, result, assume([], condition, true)).value).toBe(false);
    expect(strictEquality(result, result, assume([], condition, false)).value).toBe(true);
  });

  test("numeric identity respects NaN, while selection preserves signed zero", () => {
    const unknown = ESNumber();
    const bounded = randomNumber();
    expect(strictEquality(unknown, unknown).value).toBeUndefined();
    expect(strictEquality(bounded, bounded).value).toBe(true);
    expect(strictEquality(ESNumber(NaN), ESNumber(NaN)).value).toBe(false);
    expect(strictEquality(ESNumber(-0), ESNumber(0)).value).toBe(true);
    const selected = selectValue(ESBoolean(), ESNumber(-0), ESNumber(0)) as TESNumber;
    expect(selected.value).toBeUndefined();
    expect(choiceOf(selected)).toBeDefined();
  });

  test("a false numeric comparison does not rule out NaN", () => {
    const unknown = ESNumber();
    const finite = randomNumber();
    const condition = compareNumbers(unknown, finite, "<");
    const knowledge = assume([], condition, false);
    expect(compareNumbers(unknown, finite, "<", knowledge).value).toBe(false);
    expect(compareNumbers(unknown, finite, ">=", knowledge).value).toBeUndefined();
  });

  test("string lengths are ordinary numeric values with shared facts", () => {
    expect(ESString("").properties.length.value).toBe(0);
    expect(ESString("hello").properties.length.value).toBe(5);
    expect(ESString([ESString("ab"), ESString("c")]).properties.length.value).toBe(3);
    const length = ESString().properties.length;
    expect(length.value).toBeUndefined();
    expect(compareNumbers(length, ESNumber(0), ">=").value).toBe(true);
  });
});
