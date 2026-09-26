import { nodeInitialExecutionContext } from "../src";
import { Array as ESArray } from "../src/array/Array";
import { slice } from "../src/array/slice";
import { reverse } from "../src/array/reverse";
import { join } from "../src/array/join";
import { ESString } from "../src/string/String";
import { getArrayElements, getProperties } from "../src/execution-context/Heap";
import { compareNumbers } from "../src/symbolic";
import {
  Any,
  ESNumber,
  TESNumber,
  ESNull,
  Undefined
} from "../src/types";

describe("arrays with known element positions", () => {
  test("expose their length and preserve symbolic element identities", () => {
    const first = ESNumber();
    const second = ESNumber();
    const array = ESArray([first, second], "elements");

    expect(array.properties.length).toEqual(ESNumber(2));
    expect(array.properties[0]).toBe(first);
    expect(array.properties[1]).toBe(second);
    expect(array.shape).toEqual({ kind: "elements" });
    expect(array).not.toHaveProperty("concrete");
    expect(ESArray([], "elements").properties.length).toEqual(ESNumber(0));
  });

  test("retain the representation of unknown and segmented arrays", () => {
    const segment = ESArray([ESNumber(1), ESNumber(2)], "elements");
    const array = ESArray([segment, ESArray()], "segments");

    const unknownLength = ESArray().properties.length;
    const segmentLength = array.properties.length;
    expect(unknownLength.type).toBe("number");
    expect(unknownLength.value).toBeUndefined();
    expect(compareNumbers(unknownLength, ESNumber(0), ">=").value).toBe(true);
    expect(compareNumbers(unknownLength, ESNumber(0xffffffff), "<=").value).toBe(true);
    expect(segmentLength.value).toBeUndefined();
    expect(compareNumbers(segmentLength, ESNumber(2), ">=").value).toBe(true);
    expect(compareNumbers(segmentLength, ESNumber(2), "<=").value).toBeUndefined();
    expect(array.properties[0]).toBeUndefined();
    expect(array.value![0]).toBe(segment);
    expect(array.shape).toEqual({ kind: "segments" });
    expect(ESArray().shape).toEqual({ kind: "unknown" });
    expect(ESArray([segment, segment], "segments").properties.length).toEqual(ESNumber(4));
  });

  test("slice creates a fresh array and preserves each remaining element", () => {
    const elements = [ESNumber(), ESNumber(), ESNumber()];
    const array = ESArray(elements, "elements");
    const result = slice(array, [ESNumber(1)], nodeInitialExecutionContext).next();
    const [sliced, context] = result.value;

    expect(result.done).toBe(true);
    expect(context).toBe(nodeInitialExecutionContext);
    expect(sliced).not.toBe(array);
    expect(sliced.value).not.toBe(elements);
    expect(sliced.properties.length).toEqual(ESNumber(2));
    expect(sliced.properties[0]).toBe(elements[1]);
    expect(sliced.properties[1]).toBe(elements[2]);
    expect(array.value).toHaveLength(3);
    expect(array.properties[0]).toBe(elements[0]);
  });

  test("reverse updates its receiver in a new state without changing the earlier state", () => {
    const first = ESNumber();
    const second = ESNumber();
    const third = ESNumber();
    const array = ESArray([first, second, third], "elements");
    const [reversed, context] = reverse(
      array,
      [],
      nodeInitialExecutionContext
    ).next().value;

    expect(reversed).toBe(array);
    expect(context).not.toBe(nodeInitialExecutionContext);
    const properties = getProperties(array, context);
    expect(properties[0]).toBe(third);
    expect(properties[1]).toBe(second);
    expect(properties[2]).toBe(first);
    expect(properties.length).toEqual(ESNumber(3));
    expect(getProperties(array, nodeInitialExecutionContext)[0]).toBe(first);
    expect(getArrayElements(array, nodeInitialExecutionContext)).toEqual([first, second, third]);
    const [sliced] = slice(array, [ESNumber(1)], context)
      .next().value;
    expect(sliced.properties[0]).toBe(second);
    expect(sliced.properties[1]).toBe(first);
  });

  test("reverse leaves nested arrays in their original order", () => {
    const first = ESNumber(1);
    const second = ESNumber(2);
    const nested = ESArray([first, second], "elements");
    const last = ESArray([], "elements");
    const array = ESArray([nested, last], "elements");

    const [, context] = reverse(array, [], nodeInitialExecutionContext).next().value;

    expect(getProperties(array, context)[0]).toBe(last);
    expect(getProperties(array, context)[1]).toBe(nested);
    expect(nested.value![0]).toBe(first);
    expect(nested.value![1]).toBe(second);
  });

  test("reverse preserves holes and slice reads the updated array state", () => {
    const elements: Any[] = [];
    elements.length = 3;
    elements[0] = ESNumber(1);
    const array = ESArray(elements, "elements");
    const [, context] = reverse(array, [], nodeInitialExecutionContext).next().value;
    const properties = getProperties(array, context);

    expect(properties[0]).toBeUndefined();
    expect(properties[1]).toBeUndefined();
    expect(properties[2]).toBe(elements[0]);
    const [copy] = slice(array, [], context).next().value;
    expect(0 in copy.value!).toBe(false);
    expect(1 in copy.value!).toBe(false);
    expect(copy.value![2]).toBe(elements[0]);
  });

  test("join reads the updated state and follows primitive separator semantics", () => {
    const array = ESArray([ESNumber(1), ESNumber(2)], "elements");
    const [, context] = reverse(array, [], nodeInitialExecutionContext).next().value;
    expect(join(array, [], context).next().value[0].value).toBe("2,1");
    expect(join(array, [ESString("-")], context).next().value[0].value).toBe("2-1");
    expect(join(array, [], nodeInitialExecutionContext).next().value[0].value).toBe("1,2");

    const parts = [ESNumber(1), Undefined, ESNull, array];
    delete parts[1];
    const nested = ESArray(parts, "elements");
    expect(join(nested, [ESString("|")], context).next().value[0].value).toBe("1|||2,1");
    expect(join(array, [ESNull], context).next().value[0].value).toBe("2null1");
    expect(join(ESArray([], "elements"), [], context).next().value[0].value).toBe("");
  });

  test("join keeps unknown primitive elements symbolic", () => {
    const array = ESArray([ESNumber(), ESNumber(2)], "elements");
    expect(join(array, [], nodeInitialExecutionContext).next().value[0].value).toBeUndefined();
  });

  const sliceCases: [Any[], number[]][] = [
    [[], [0, 1, 2, 3]],
    [[Undefined, Undefined], [0, 1, 2, 3]],
    [[ESNumber(-2)], [2, 3]],
    [[ESNumber(1), ESNumber(-1)], [1, 2]],
    [[ESNumber(-20), ESNumber(20)], [0, 1, 2, 3]],
    [[ESNumber(3), ESNumber(1)], []],
    [[ESNumber(1.9), ESNumber(3.9)], [1, 2]],
    [[ESNumber(NaN), ESNumber(Infinity)], [0, 1, 2, 3]]
  ];
  test.each(sliceCases)("slice applies concrete bounds %j", (bounds, expected) => {
    const array = ESArray([0, 1, 2, 3].map(ESNumber), "elements");
    const [sliced] = slice(array, bounds, nodeInitialExecutionContext).next().value;

    expect((sliced.value as TESNumber[]).map(element => element.value)).toEqual(
      expected
    );
    expect(sliced.properties.length).toEqual(ESNumber(expected.length));
  });

  test("rejects unknown bounds and unknown array structure", () => {
    const array = ESArray([ESNumber()], "elements");

    expect(() =>
      slice(array, [ESNumber()], nodeInitialExecutionContext).next()
    ).toThrow("concrete numeric bounds");
    expect(() =>
      slice(array, [ESNumber(0), ESNumber()], nodeInitialExecutionContext).next()
    ).toThrow("concrete numeric bounds");
    expect(() =>
      slice(ESArray(), [], nodeInitialExecutionContext).next()
    ).toThrow("known element positions");
    expect(() =>
      slice(ESArray([array], "segments"), [], nodeInitialExecutionContext).next()
    ).toThrow("known element positions");
    expect(() =>
      reverse(ESArray(), [], nodeInitialExecutionContext).next()
    ).toThrow("known element positions");
    expect(() =>
      reverse(ESArray([array], "segments"), [], nodeInitialExecutionContext).next()
    ).toThrow("known element positions");
  });
});
