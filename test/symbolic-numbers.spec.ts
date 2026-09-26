import "../src";
import { ESNumber } from "../src/types";
import { ESBoolean } from "../src/boolean/ESBoolean";
import {
  compareNumbers,
  randomNumber,
  selectNumber
} from "../src/number/symbolic";

test("random values are distinct unknown symbols with a half-open range", () => {
  const first = randomNumber();
  const second = randomNumber();
  expect(first.id).not.toBe(second.id);
  expect(first.value).toBeUndefined();
  expect(compareNumbers(first, ESNumber(0), ">=").value).toBe(true);
  expect(compareNumbers(first, ESNumber(1), "<").value).toBe(true);
  expect(compareNumbers(first, ESNumber(0), "<").value).toBe(false);
  expect(compareNumbers(first, ESNumber(0), ">").value).toBeUndefined();
  expect(compareNumbers(first, second, "<").value).toBeUndefined();
  expect(compareNumbers(first, second, "<=").value).toBeUndefined();
});

test("a recursive comparison and selection proves every member is at least the result", () => {
  const values = Array.from({ length: 10 }, () => randomNumber());
  const minimum = (items: typeof values): typeof values[0] => {
    if (items.length === 1) {
      return items[0];
    }
    const tail = minimum(items.slice(1));
    return selectNumber(compareNumbers(items[0], tail, "<"), items[0], tail);
  };
  const result = minimum(values);
  expect(result.value).toBeUndefined();
  values.forEach(value => {
    expect(compareNumbers(value, result, "<").value).toBe(false);
    expect(compareNumbers(result, value, "<=").value).toBe(true);
    // Ties are possible: distinct random draws are not unequal by definition.
    expect(compareNumbers(result, value, "<").value).toBeUndefined();
    expect(compareNumbers(value, result, "<=").value).toBeUndefined();
  });
  expect(compareNumbers(randomNumber(), result, "<").value).toBeUndefined();
});

test("the same choice rules handle reversed operators, ties, and maxima", () => {
  const first = randomNumber();
  const second = randomNumber();
  const minimum = selectNumber(
    compareNumbers(first, second, ">="),
    second,
    first
  );
  const maximum = selectNumber(
    compareNumbers(first, second, "<="),
    second,
    first
  );
  expect(compareNumbers(first, minimum, "<").value).toBe(false);
  expect(compareNumbers(second, minimum, "<").value).toBe(false);
  expect(compareNumbers(maximum, first, ">=").value).toBe(true);
  expect(compareNumbers(maximum, second, ">").value).toBeUndefined();
  expect(compareNumbers(first, first, "<").value).toBe(false);
  expect(compareNumbers(first, first, "<=").value).toBe(true);
});

test("unrelated conditions do not imply an ordering between their alternatives", () => {
  const first = randomNumber();
  const second = randomNumber();
  const choice = selectNumber(ESBoolean(), first, second);
  expect(compareNumbers(first, choice, "<").value).toBeUndefined();
  expect(compareNumbers(choice, first, "<=").value).toBeUndefined();
  expect(compareNumbers(choice, ESNumber(1), "<").value).toBe(true);
});

test("NaN is not accidentally given total-order or reflexive <= facts", () => {
  const unknown = ESNumber();
  const finite = randomNumber();
  expect(compareNumbers(unknown, unknown, "<").value).toBe(false);
  expect(compareNumbers(unknown, unknown, "<=").value).toBeUndefined();
  expect(compareNumbers(ESNumber(NaN), finite, "<").value).toBe(false);
  expect(compareNumbers(finite, ESNumber(NaN), ">=").value).toBe(false);
  const choice = selectNumber(compareNumbers(finite, unknown, "<"), finite, unknown);
  expect(compareNumbers(choice, finite, "<=").value).toBeUndefined();
  expect(compareNumbers(finite, choice, ">=").value).toBeUndefined();
});

test("branch joins keep signed zero and potentially NaN results symbolic", () => {
  const zeros = selectNumber(ESBoolean(), ESNumber(-0), ESNumber(0));
  expect(zeros.value).toBeUndefined();
  expect(compareNumbers(zeros, ESNumber(0), "<=").value).toBe(true);
  const maybeNaN = selectNumber(ESBoolean(), randomNumber(), ESNumber(NaN));
  expect(compareNumbers(maybeNaN, ESNumber(1), "<").value).toBeUndefined();
  expect(compareNumbers(maybeNaN, maybeNaN, "<=").value).toBeUndefined();
});

test("a fact about a choice continues to hold when that choice is expanded", () => {
  const first = randomNumber();
  const second = randomNumber();
  const third = randomNumber();
  const choice = selectNumber(ESBoolean(), first, second);
  const minimum = selectNumber(compareNumbers(third, choice, "<"), third, choice);
  expect(compareNumbers(third, minimum, "<").value).toBe(false);
  expect(compareNumbers(choice, minimum, "<").value).toBe(false);
});
