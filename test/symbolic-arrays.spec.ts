import { nodeInitialExecutionContext } from "../src";
import { Array as ESArray } from "../src/array/Array";
import { slice } from "../src/array/slice";
import {
  symbolicNumberArray, getSymbolicArrayShape, readSymbolicIndex,
  symbolicArrayRegion, sliceSymbolicArray
} from "../src/array/symbolic";
import { ESNumber, TESNumber, Undefined } from "../src/types";
import { compareNumbers, randomNumber, choiceOf, strictEquality } from "../src/symbolic";
import { assumeInContext } from "../src/execution-context/branches";
import { writeProperty } from "../src/execution-context/Heap";

const context = nodeInitialExecutionContext;

describe("symbolic dense numeric arrays", () => {
  test("lengths have generic integer and bound facts while singleton lengths are concrete", () => {
    const array = symbolicNumberArray({ minimumLength: 2, maximumLength: 12, element: randomNumber() });
    const length = array.properties.length;

    expect(length.value).toBeUndefined();
    expect(length.knowledge).toContainEqual({ kind: "integer", subject: length });
    expect(compareNumbers(length, ESNumber(2), ">=").value).toBe(true);
    expect(compareNumbers(length, ESNumber(12), "<=").value).toBe(true);
    expect(symbolicNumberArray({ minimumLength: 1, maximumLength: 1, element: randomNumber() })
      .properties.length.value).toBe(1);
  });

  test("repeated reads and copied suffixes share primitive identities and per-element facts", () => {
    const array = symbolicNumberArray({ minimumLength: 3, element: randomNumber() });
    const first = readSymbolicIndex(array, 0, context) as TESNumber;
    const second = readSymbolicIndex(array, 1, context) as TESNumber;
    const tail = sliceSymbolicArray(array, 1, context);
    const anotherTail = sliceSymbolicArray(array, 1, context);

    expect(readSymbolicIndex(array, 0, context)).toBe(first);
    expect(second).not.toBe(first);
    expect(tail).not.toBe(array);
    expect(anotherTail).not.toBe(tail);
    expect(readSymbolicIndex(tail, 0, context)).toBe(second);
    expect(readSymbolicIndex(anotherTail, 0, context)).toBe(second);
    expect(compareNumbers(first, ESNumber(0), ">=").value).toBe(true);
    expect(compareNumbers(second, ESNumber(1), "<").value).toBe(true);
    expect(strictEquality(first, second).value).toBeUndefined();
    expect(second.knowledge).toContainEqual({
      kind: "member",
      collection: { id: array.shape.sequence.id, start: 1, end: 2 },
      element: second
    });
  });

  test("a nonempty recursive suffix is provably shorter and occupies the source suffix region", () => {
    const array = symbolicNumberArray({ minimumLength: 2, element: randomNumber() });
    const [tail, after] = slice(array, [ESNumber(1)], context).next().value;
    const shape = getSymbolicArrayShape(tail)!;

    expect(after).toBe(context);
    expect(shape.minimumLength).toBe(1);
    expect(shape.maximumLength).toBe(0xfffffffe);
    expect(compareNumbers(tail.properties.length, ESNumber(1), ">=").value).toBe(true);
    expect(compareNumbers(tail.properties.length, array.properties.length, "<").value).toBe(true);
    expect(symbolicArrayRegion(tail)).toEqual({ id: array.shape.sequence.id, start: 1, end: 0xffffffff });
    expect(symbolicArrayRegion(array)).toEqual({ id: array.shape.sequence.id, start: 0, end: 0xffffffff });
  });

  test("slice normalizes starts and clamps empty results without inventing elements", () => {
    const array = symbolicNumberArray({ minimumLength: 2, maximumLength: 4, element: randomNumber() });
    const zero = sliceSymbolicArray(array, 0, context);
    const fractional = sliceSymbolicArray(array, 1.8, context);
    const empty = sliceSymbolicArray(array, 10, context);
    const infinite = sliceSymbolicArray(array, Infinity, context);

    expect(zero).not.toBe(array);
    expect(zero.properties.length).toBe(array.properties.length);
    expect(readSymbolicIndex(zero, 0, context)).toBe(readSymbolicIndex(array, 0, context));
    expect(fractional.shape.offset).toBe(1);
    expect(empty.properties.length.value).toBe(0);
    expect(infinite.properties.length.value).toBe(0);
    expect(readSymbolicIndex(empty, 0, context)).toBe(Undefined);
    expect(() => sliceSymbolicArray(array, -1, context)).toThrow("nonnegative start");
    expect(() => slice(array, [ESNumber(0), ESNumber(1)], context).next()).toThrow("end bound");
  });

  test("potentially missing reads preserve undefined and narrow inside length guards", () => {
    const array = symbolicNumberArray({ maximumLength: 3, element: randomNumber() });
    const first = readSymbolicIndex(array, 0, context)!;
    const choice = choiceOf(first)!;

    expect(choice).toBeDefined();
    expect(choice.alternate).toBe(Undefined);
    expect(readSymbolicIndex(array, 3, context)).toBe(Undefined);
    const nonempty = assumeInContext(context, compareNumbers(array.properties.length, ESNumber(0), ">"), true);
    expect(readSymbolicIndex(array, 0, nonempty)).toBe(choice.consequent);
    const empty = assumeInContext(context, strictEquality(array.properties.length, ESNumber(0)), true);
    expect(readSymbolicIndex(array, 0, empty)).toBe(Undefined);
  });

  test("slice carries a branch's refined length bounds into its copied shape", () => {
    const array = symbolicNumberArray({ minimumLength: 1, maximumLength: 10, element: randomNumber() });
    const atLeastThree = assumeInContext(context,
      compareNumbers(array.properties.length, ESNumber(3), ">="), true);
    const tail = sliceSymbolicArray(array, 1, atLeastThree);
    const singleton = assumeInContext(context, strictEquality(array.properties.length, ESNumber(1)), true);
    const empty = sliceSymbolicArray(array, 1, singleton);
    const longer = assumeInContext(context, strictEquality(array.properties.length, ESNumber(1)), false);
    const recursiveTail = sliceSymbolicArray(array, 1, longer);

    expect(tail.shape.minimumLength).toBe(2);
    expect(compareNumbers(tail.properties.length, array.properties.length, "<", atLeastThree.value.knowledge).value).toBe(true);
    expect(empty.properties.length.value).toBe(0);
    expect(recursiveTail.shape.minimumLength).toBe(1);
    expect(compareNumbers(recursiveTail.properties.length, array.properties.length, "<", longer.value.knowledge).value).toBe(true);
  });

  test("templates are copied and cannot carry unrelated symbolic relationships or computations", () => {
    const template = randomNumber();
    const array = symbolicNumberArray({ minimumLength: 1, element: template });
    template.knowledge = [];
    const first = readSymbolicIndex(array, 0, context) as TESNumber;
    expect(compareNumbers(first, ESNumber(1), "<").value).toBe(true);

    const unrelated = ESNumber();
    const relational = ESNumber();
    relational.knowledge = [{ kind: "order", left: relational, right: unrelated, strict: true }];
    expect(() => symbolicNumberArray({ element: relational })).toThrow("literal bounds");
    const computed = ESNumber();
    computed.expression = { kind: "binary", operator: "+", left: ESNumber(), right: ESNumber(1) };
    expect(() => symbolicNumberArray({ element: computed })).toThrow("plain numeric template");
    const withProperties = ESNumber();
    withProperties.properties.extra = ESNumber(1);
    expect(() => symbolicNumberArray({ element: withProperties })).toThrow("plain numeric template");
  });

  test("unknown shapes remain distinct from dense arrays and heap changes invalidate dense views", () => {
    expect(getSymbolicArrayShape(ESArray())).toBeUndefined();
    expect(readSymbolicIndex(ESArray(), 0, context)).toBeUndefined();
    const array = symbolicNumberArray({ minimumLength: 1, element: randomNumber() });
    const after = writeProperty(array, "0", ESNumber(4), context);

    expect(() => getSymbolicArrayShape(array, after)).toThrow("writes");
    expect(() => readSymbolicIndex(array, 0, after)).toThrow("writes");
    expect(() => sliceSymbolicArray(array, 1, after)).toThrow("writes");
    expect(getSymbolicArrayShape(array, context)).toBe(array.shape);
  });

  test("rejects inconsistent or noninteger length bounds", () => {
    for (const [minimumLength, maximumLength] of [[-1, 3], [1.5, 3], [4, 3], [0, 0x100000000]]) {
      expect(() => symbolicNumberArray({ minimumLength, maximumLength, element: randomNumber() }))
        .toThrow("uint32 bounds");
    }
  });
});
