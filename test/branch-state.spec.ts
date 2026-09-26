import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getArrayElements, getProperties } from "../src/execution-context/Heap";
import { TArray } from "../src/array/Array";
import { Any, WithProperties } from "../src/types";

function run(code: string, context: TExecutionContext = nodeInitialExecutionContext) {
  return evaluateCode(code, context)[1];
}

function expectTrue(context: TExecutionContext, ...names: string[]) {
  for (const name of names) {
    expect(context.value.scope[name]).toMatchObject({ type: "boolean", value: true });
  }
}

describe("symbolic branches and persistent state", () => {
  test("aliased object writes stay isolated and retain their guard", () => {
    const context = run(`
      const guard = Math.random() < 0.5;
      const box = { value: 0 };
      const alias = box;
      if (guard) {
        alias.value = 1;
      } else {
        box.value = box.value + 2;
      }
      const proof = guard ? box.value === 1 : alias.value === 2;
      const same = alias === box;
    `);

    expectTrue(context, "proof", "same");
    const box = context.value.scope.box as WithProperties;
    expect(context.value.scope.alias).toBe(box);
    expect(box.properties.value).toMatchObject({ value: 0 });
    expect(getProperties(box, context).value).toMatchObject({ type: "number" });
    expect((getProperties(box, context).value as any).value).toBeUndefined();
  });

  test("ternary effects start from the same state and correlate with their return values", () => {
    const context = run(`
      const guard = Math.random() < 0.5;
      const box = { value: 0 };
      const selected = guard ? (box.value = 1) : (box.value = box.value + 2);
      const proof = guard ? box.value === 1 : box.value === 2;
      const agrees = selected === box.value;
    `);

    expectTrue(context, "proof", "agrees");
  });

  test("evaluating from a context cannot modify objects visible in an earlier context", () => {
    const before = run(`const box = { value: 0 }; const alias = box;`);
    const after = run(`alias.value = 9; const observed = box.value;`, before);
    const readEarlier = run(`const observed = box.value;`, before);
    const box = before.value.scope.box as WithProperties;

    expect(after.value.scope.box).toBe(box);
    expect(after.value.scope.alias).toBe(box);
    expect(after.value.scope.observed).toMatchObject({ value: 9 });
    expect(readEarlier.value.scope.observed).toMatchObject({ value: 0 });
    expect(getProperties(box, before).value).toMatchObject({ value: 0 });
    expect(getProperties(box, after).value).toMatchObject({ value: 9 });
  });

  test("array assignment, reverse, aliases, and slice observe the current branch state", () => {
    const context = run(`
      const guard = Math.random() < 0.5;
      const items = [1, 2, 3];
      const alias = items;
      if (guard) {
        alias[0] = 9;
      } else {
        items.reverse();
      }
      const tail = alias.slice(1);
      const firstProof = guard ? items[0] === 9 : alias[0] === 3;
      const tailProof = guard ? tail[1] === 3 : tail[1] === 1;
      const middleProof = tail[0] === 2;
    `);

    expectTrue(context, "firstProof", "tailProof", "middleProof");
    const items = context.value.scope.items as TArray<Any>;
    expect(context.value.scope.alias).toBe(items);
    expect(getArrayElements(items, context)).toHaveLength(3);
    expect((items.value![0] as any).value).toBe(1);
  });

  test("different branch lengths retain conditional lengths without inventing known positions", () => {
    const before = run(`const items = [1, 2, 3]; const guard = Math.random() < 0.5;`);
    const after = run(`
      if (guard) {
        items.length = 1;
      } else {
        items.length = 2;
      }
      const proof = guard ? items.length === 1 : items.length === 2;
    `, before);
    const items = before.value.scope.items as TArray<Any>;

    expectTrue(after, "proof");
    expect(getArrayElements(items, before)).toHaveLength(3);
    expect(getArrayElements(items, after)).toBeUndefined();
    expect(() => run(`items.slice(0);`, after)).toThrow("known element positions");
  });

  test("the same guard makes mixed-type selections and typeof answers precise", () => {
    const context = run(`
      const guard = Math.random() < 0.5;
      const selected = guard ? 7 : "seven";
      const selectedType = typeof selected;
      const valueProof = guard ? selected === 7 : selected === "seven";
      const typeProof = guard ? selectedType === "number" : selectedType === "string";
      const arrayType = typeof [] === "object";
      const nullType = typeof null === "object";
    `);

    expectTrue(context, "valueProof", "typeProof", "arrayType", "nullType");
    expect((context.value.scope.selected as any).value).toBeUndefined();
    expect((context.value.scope.selectedType as any).value).toBeUndefined();
  });

  test("new objects selected by a guard support subsequent member reads and writes", () => {
    const context = run(`
      const guard = Math.random() < 0.5;
      const selected = guard ? { value: 1 } : { value: "two" };
      const before = selected.value;
      const beforeProof = guard ? before === 1 : before === "two";
      selected.value = 3;
      const afterProof = selected.value === 3;
      const savedProof = guard ? before === 1 : before === "two";
    `);

    expectTrue(context, "beforeProof", "afterProof", "savedProof");
  });
});
