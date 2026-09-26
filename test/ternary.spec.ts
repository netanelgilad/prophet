import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESNumber, TESBoolean } from "../src/types";

test("complementary comparisons in both branches prove true for finite numbers", () => {
  const [, context] = evaluateCode(`
    const a = Math.random();
    const b = Math.random();
    const result = a > b ? a > b : a <= b;
  `, nodeInitialExecutionContext);
  expect(context.value.scope.result).toMatchObject({ type: "boolean", value: true });
});

test("the same expression stays unknown when either number could be NaN", () => {
  const [, context] = evaluateCode("const result = a > b ? a > b : a <= b;",
    setVariablesInScope(nodeInitialExecutionContext, { a: ESNumber(), b: ESNumber() }));
  expect((context.value.scope.result as TESBoolean).value).toBeUndefined();
});
