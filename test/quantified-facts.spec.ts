import "../src";
import { ESNumber } from "../src/types";
import { ESBoolean } from "../src/boolean/ESBoolean";
import {
  CollectionRegion, Knowledge, assume, compareNumbers, isFiniteNumber,
  notNaN, numberBounds, randomNumber, selectNumber, strictEquality
} from "../src/symbolic";

test("quantified order instantiates for a member without inventing strictness", () => {
  const collection: CollectionRegion = { id: {}, start: 0 };
  const lower = ESNumber();
  const upper = ESNumber();
  const member = ESNumber();
  const facts: Knowledge = [
    { kind: "every-element-order", collection, bound: lower, direction: "lower" },
    { kind: "every-element-order", collection, bound: upper, direction: "upper" },
    { kind: "member", collection, element: member }
  ];
  expect(compareNumbers(lower, member, "<=", facts).value).toBe(true);
  expect(compareNumbers(member, upper, "<=", facts).value).toBe(true);
  expect(compareNumbers(lower, upper, "<=", facts).value).toBe(true);
  expect(compareNumbers(member, lower, "<", facts).value).toBe(false);
  expect(compareNumbers(lower, member, "<", facts).value).toBeUndefined();
});

test("region facts apply to contained subregions, not overlapping or larger ones", () => {
  const id = {};
  const region: CollectionRegion = { id, start: 2, end: 8 };
  const bound = ESNumber();
  const member = ESNumber();
  const proveFor = (collection: CollectionRegion) => compareNumbers(bound, member, "<=", [
    { kind: "every-element-order", collection: region, bound, direction: "lower" },
    { kind: "member", collection, element: member }
  ]).value;
  expect(proveFor({ id, start: 2, end: 8 })).toBe(true);
  expect(proveFor({ id, start: 4, end: 6 })).toBe(true);
  expect(proveFor({ id, start: 1, end: 6 })).toBeUndefined();
  expect(proveFor({ id, start: 4, end: 9 })).toBeUndefined();
  expect(proveFor({ id, start: 4 })).toBeUndefined();
});

test("facts never transfer between collection snapshots", () => {
  const bound = ESNumber();
  const member = ESNumber();
  const facts: Knowledge = [
    { kind: "every-element-order", collection: { id: {}, start: 0 }, bound, direction: "lower" },
    { kind: "member", collection: { id: {}, start: 0 }, element: member }
  ];
  expect(compareNumbers(bound, member, "<=", facts).value).toBeUndefined();
  expect(compareNumbers(member, bound, "<", facts).value).toBeUndefined();
});

test("quantified facts cooperate with connected value knowledge and strict edges", () => {
  const collection: CollectionRegion = { id: {}, start: 0 };
  const lower = ESNumber();
  const member = ESNumber();
  const larger = ESNumber();
  lower.knowledge = [{ kind: "every-element-order", collection, bound: lower, direction: "lower" }];
  member.knowledge = [{ kind: "member", collection, element: member }];
  larger.knowledge = [{ kind: "order", left: member, right: larger, strict: true }];
  expect(compareNumbers(lower, larger, "<").value).toBe(true);
  expect(compareNumbers(larger, lower, "<=").value).toBe(false);
});

test("a selection can prove a bound for an arbitrary member through its alternatives", () => {
  const collection: CollectionRegion = { id: {}, start: 1 };
  const head = randomNumber();
  const tailResult = randomNumber();
  const witness = randomNumber();
  tailResult.knowledge = tailResult.knowledge!.concat({
    kind: "every-element-order", collection, bound: tailResult, direction: "lower"
  });
  witness.knowledge = witness.knowledge!.concat({ kind: "member", collection, element: witness });
  const result = selectNumber(compareNumbers(head, tailResult, "<"), head, tailResult);
  expect(compareNumbers(result, head, "<=").value).toBe(true);
  expect(compareNumbers(result, witness, "<=").value).toBe(true);
  expect(compareNumbers(result, witness, "<").value).toBeUndefined();
});

test("membership and vacuous universal bounds do not exclude NaN", () => {
  const collection: CollectionRegion = { id: {}, start: 0 };
  const member = ESNumber();
  const bound = ESNumber();
  member.knowledge = [{ kind: "member", collection, element: member }];
  bound.knowledge = [{ kind: "every-element-order", collection, bound, direction: "lower" }];
  expect(notNaN(member)).toBe(false);
  expect(notNaN(bound)).toBe(false);
  expect(compareNumbers(member, member, "<=").value).toBeUndefined();
  expect(compareNumbers(bound, bound, "<=").value).toBeUndefined();
  // The valid bound still cannot establish a fact about a choice that may be NaN.
  const maybeNaN = selectNumber(ESBoolean(), bound, ESNumber(NaN));
  expect(compareNumbers(maybeNaN, member, "<=").value).toBeUndefined();
});

test("integer boundary refinement separates singleton and longer array lengths", () => {
  const length = ESNumber();
  length.knowledge = [
    { kind: "integer", subject: length },
    { kind: "order", left: ESNumber(1), right: length, strict: false },
    { kind: "order", left: length, right: ESNumber(0xffffffff), strict: false }
  ];
  const singleton = strictEquality(length, ESNumber(1));
  const longer = assume([], singleton, false);
  expect(isFiniteNumber(length)).toBe(true);
  expect(notNaN(length)).toBe(true);
  expect(numberBounds(length, longer)).toEqual({
    lower: { value: 2, inclusive: true },
    upper: { value: 0xffffffff, inclusive: true }
  });
  expect(compareNumbers(length, ESNumber(1), ">", longer).value).toBe(true);
  expect(numberBounds(length).lower).toEqual({ value: 1, inclusive: true });
});

test("integer rounding preserves strict bounds when adjacent doubles are far apart", () => {
  const value = ESNumber();
  value.knowledge = [
    { kind: "integer", subject: value },
    { kind: "order", left: ESNumber(1e20), right: value, strict: true },
    { kind: "order", left: value, right: ESNumber(1e21), strict: true }
  ];
  expect(numberBounds(value)).toEqual({
    lower: { value: 1e20, inclusive: false },
    upper: { value: 1e21, inclusive: false }
  });
});
