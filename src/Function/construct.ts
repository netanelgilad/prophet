import { unsupportedPropertyError } from "../execution-context/analysis-failure";
import { Any, FunctionBinding, Type, ThrownValue, isThrownValue, isArray } from "../types";
import { TExecutionContext, setCurrentThisValue } from "../execution-context/ExecutionContext";
import { tuple } from "@deaven/tuple";
import { choiceOf, selectValue, assume, Knowledge } from "../symbolic";
import { ESObject, TESObject, isESObject } from "../Object";
import { evaluateThrowableIterator, mapCompletions, bindNormal } from "../evaluate";
import { evaluateBranches, BranchResult } from "../execution-context/branches";
import assert from "assert";
import { createError } from "../error/Error";
import { ESString } from "../string/String";
import { readMember } from "../ASTResolvers";
import { isObjectValue, withValue } from "../conversion/toString";

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
  if ((callee as { nonConstructible?: boolean }).nonConstructible) {
    return [ThrownValue(createError("TypeError", ESString("Value is not a constructor"))), execContext];
  }
  const unsupported = (callee as { unmodeledConstruct?: string }).unmodeledConstruct;
  if (unsupported) throw unsupportedPropertyError(callee, unsupported);
  return bindNormal(readMember(callee, "prototype", execContext), (selected, afterRead) =>
    withValue(selected, afterRead, (prototype, branch) => {
      const thisValue = ESObject();
      if (isObjectValue(prototype)) thisValue.prototype = prototype;
      const result = evaluateThrowableIterator(calleeType.function.implementation(
        thisValue, argsTypes, setCurrentThisValue(branch, thisValue)
      ));
      // Explicit object returns replace the receiver; primitives do not.
      return mapCompletions(result, (value, afterCall) => {
        const context = setCurrentThisValue(afterCall, execContext.value.thisValue);
        return tuple(isThrownValue(value) ? value :
          constructorResult(value, thisValue, context.value.knowledge || []), context);
      });
    }));
}

function constructorResult(result: Any, receiver: TESObject, knowledge: Knowledge): Any {
  const choice = choiceOf(result);
  if (choice) return selectValue(choice.condition,
    constructorResult(choice.consequent, receiver, assume(knowledge, choice.condition, true)),
    constructorResult(choice.alternate, receiver, assume(knowledge, choice.condition, false)), knowledge);
  return isESObject(result) || isArray(result) || (result as Type<string>).type === "function"
    ? result : receiver;
}
