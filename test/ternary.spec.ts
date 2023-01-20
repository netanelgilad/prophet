import { evaluateCodeAsExpression, nodeInitialExecutionContext } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESNumber } from "../src/types";

test("both branches evaluate to the same type", () => {
  expect(
    evaluateCodeAsExpression(
      `a > b ? a > b : a <= b`,
      setVariablesInScope(nodeInitialExecutionContext, {
        a: ESNumber,
        b: ESNumber
      })
    )
  ).toEqual(evaluateCodeAsExpression(`true`, nodeInitialExecutionContext));
});
