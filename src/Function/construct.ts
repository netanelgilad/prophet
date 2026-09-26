import { Any, FunctionBinding, Type, isThrownValue, isArray } from "../types";
import { TExecutionContext, setCurrentThisValue } from "../execution-context/ExecutionContext";
import { unsafeCast } from "@deaven/unsafe-cast.macro";
import { tuple } from "@deaven/tuple";
import { getProperties } from "../execution-context/Heap";
import { choiceOf, selectValue, assume, Knowledge } from "../symbolic";
import { isForkedCompletion } from "../execution-context/Completion";
import { ESObject, TESObject, isESObject } from "../Object";

export function* createNewObjectFromConstructor(
  calleeType: FunctionBinding,
  argsTypes: Any[],
  execContext: TExecutionContext
) {
  const prototype = unsafeCast<TESObject>(calleeType.properties.prototype);
  const thisValue = ESObject(prototype ? { ...getProperties(prototype, execContext) } : {});
  const currExecContext = setCurrentThisValue(execContext, thisValue);

  const [result, afterCallExecContext] = yield* calleeType.function.implementation(
    thisValue,
    argsTypes,
    currExecContext
  );

  const context = setCurrentThisValue(afterCallExecContext, execContext.value.thisValue);
  if (isThrownValue(result)) return tuple(result, context);
  if (isForkedCompletion(result)) {
    throw new Error("Partially throwing symbolic constructors are not yet supported");
  }
  // An explicit object return replaces the allocated receiver. Primitive
  // returns do not; keep its identity and all writes in the persistent heap.
  return tuple(constructorResult(result, thisValue, context.value.knowledge || []), context);
}

function constructorResult(result: Any, receiver: TESObject, knowledge: Knowledge): Any {
  const choice = choiceOf(result);
  if (choice) return selectValue(choice.condition,
    constructorResult(choice.consequent, receiver, assume(knowledge, choice.condition, true)),
    constructorResult(choice.alternate, receiver, assume(knowledge, choice.condition, false)), knowledge);
  return isESObject(result) || isArray(result) || (result as Type<string>).type === "function"
    ? result : receiver;
}
