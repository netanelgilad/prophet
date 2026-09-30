import { Any } from "../types";
import { TESObject } from "../Object";
import { Knowledge } from "../symbolic";
import { Heap } from "./Heap";

export type TExecutionContext = {
  value: {
    thisValue: Any;
    scope: {
      [identifier: string]: Any;
    };
    global: TESObject;
    stderr: string;
    uncaught?: Any;
    knowledge?: Knowledge;
    heap?: Heap;
    // Temporary proof-session hooks, never installed for ordinary execution.
    interceptCall?: (
      callee: Any, args: Any[], context: TExecutionContext, receiver?: Any
    ) => [Any, TExecutionContext] | undefined;
    validateRead?: (object: Any, name: string, context: TExecutionContext) => void;
    evaluationBudget?: { remaining: number };
  };
};

export function ExecutionContext(value: any): TExecutionContext & { type: "ExecutionContext" } {
  return {
    type: "ExecutionContext",
    value: { stderr: "", ...value }
  };
}

export function setCurrentThisValue(
  execContext: TExecutionContext,
  val: Any
): TExecutionContext {
  return ExecutionContext({ ...execContext.value, thisValue: val });
}

export function setVariableInScope(
  execContext: TExecutionContext,
  name: string,
  val: Any
) {
  return ExecutionContext({
    ...execContext.value,
    scope: { ...execContext.value.scope, [name]: val }
  });
}

export function setVariablesInScope(
  execContext: TExecutionContext,
  variables: {
    [name: string]: Any;
  }
) {
  let result = execContext;
  for (const [name, type] of Object.entries(variables)) {
    result = setVariableInScope(result, name, type);
  }

  return result;
}
