import { Any, FunctionBinding, Type, isThrownValue, isArray } from "../types";
import { TExecutionContext, setCurrentThisValue } from "../execution-context/ExecutionContext";
import { unsafeCast } from "@deaven/unsafe-cast.macro";
import { tuple } from "@deaven/tuple";
import { getProperties } from "../execution-context/Heap";
import { choiceOf, selectValue, assume, Knowledge } from "../symbolic";
import { ESObject, TESObject, isESObject } from "../Object";
import { evaluateThrowableIterator, mapCompletions } from "../evaluate";
import { evaluateBranches, BranchResult } from "../execution-context/branches";
import assert from "assert";

export function createNewObjectFromConstructor(
  callee: Any,
  argsTypes: Any[],
  execContext: TExecutionContext
): BranchResult {
  const choice = choiceOf(callee);
  if (choice) return evaluateBranches(choice.condition, execContext,
    branch => createNewObjectFromConstructor(choice.consequent, argsTypes, branch),
    branch => createNewObjectFromConstructor(choice.alternate, argsTypes, branch));
  const calleeType = callee as FunctionBinding;
  assert(calleeType.function, "Value is not a constructor");
  const prototype = unsafeCast<TESObject>(calleeType.properties.prototype);
  const thisValue = ESObject(prototype ? { ...getProperties(prototype, execContext) } : {});
  const currExecContext = setCurrentThisValue(execContext, thisValue);

  const result = evaluateThrowableIterator(calleeType.function.implementation(
    thisValue,
    argsTypes,
    currExecContext
  ));

  // An explicit object return replaces the allocated receiver. Primitive
  // returns do not; keep its identity and all writes in the persistent heap.
  return mapCompletions(result, (value, afterCall) => {
    const context = setCurrentThisValue(afterCall, execContext.value.thisValue);
    return tuple(isThrownValue(value) ? value :
      constructorResult(value, thisValue, context.value.knowledge || []), context);
  });
}

function constructorResult(result: Any, receiver: TESObject, knowledge: Knowledge): Any {
  const choice = choiceOf(result);
  if (choice) return selectValue(choice.condition,
    constructorResult(choice.consequent, receiver, assume(knowledge, choice.condition, true)),
    constructorResult(choice.alternate, receiver, assume(knowledge, choice.condition, false)), knowledge);
  return isESObject(result) || isArray(result) || (result as Type<string>).type === "function"
    ? result : receiver;
}
