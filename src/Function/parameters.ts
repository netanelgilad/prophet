import { ESTree } from "cherow";
import { Any, Undefined, isUndefined } from "../types";
import { TExecutionContext, declareBinding, enterEnvironment, putBinding } from "../execution-context/ExecutionContext";
import { initializeBinding } from "../execution-context/bindings";
import { BranchResult } from "../execution-context/branches";
import { bindNormal, evaluate } from "../evaluate";
import { withValue } from "../conversion/toString";
import { identifierName, instantiateDeclarations, variableNames } from "./instantiate";

// Invocation validates all patterns before executing any initializer. Function
// creation still supports inspecting functions whose invocation is unmodeled.
export function initializeParameters(
  params: ESTree.Pattern[], args: Any[], initial: TExecutionContext, arrow: boolean,
  statements: ESTree.Statement[]
): BranchResult {
  const names = params.map(parameter => identifierName(
    parameter.type === "AssignmentPattern" ? parameter.left : parameter));
  const hasDefaults = params.some(parameter => parameter.type === "AssignmentPattern");
  const duplicates = new Set(names).size !== names.length;
  // Sloppy direct eval in a default can add variables outside the parameter
  // record, but must not redeclare any of the parameters themselves.
  let context = hasDefaults && !initial.value.strict ? enterEnvironment(initial, "parameters") : initial;
  for (const name of new Set(names)) {
    context = declareBinding(context, name, "parameter", duplicates);
  }
  const bodyShadowsArguments = !arrow && !hasDefaults && statements.some(statement =>
    (statement.type === "FunctionDeclaration" && identifierName(statement.id!) === "arguments") ||
    (statement.type === "VariableDeclaration" && statement.kind !== "var" &&
      statement.declarations.some(declaration => identifierName(declaration.id) === "arguments")));
  if (!arrow && !names.includes("arguments") && (hasDefaults || !bodyShadowsArguments)) {
    context = putBinding(context, context.value.environment, "arguments", {
      kind: "var", mutable: true, initialized: true, value: Undefined,
      unmodeled: "Implicit arguments objects are not yet supported"
    });
  }
  const initialize = (index: number, current: TExecutionContext): BranchResult => {
    if (index === params.length) return [Undefined, current];
    const parameter = params[index];
    const supplied = index < args.length ? args[index] : Undefined;
    const result: BranchResult = parameter.type === "AssignmentPattern"
      // Split the original value choices so effects retain their input guards,
      // without requiring reverse inference from a derived undefined test.
      ? withValue(supplied, current, (value, branch) => isUndefined(value)
        ? evaluate(parameter.right, branch) : [value, branch])
      : [supplied, current];
    return bindNormal(result, (value, after) => {
      const name = names[index];
      const next = duplicates
        ? declareBinding(after, name, "parameter", true, value)
        : initializeBinding(after, name, value);
      return initialize(index + 1, next);
    });
  };
  return initialize(0, context);
}

export function instantiateFunctionBody(
  statements: ESTree.Statement[], params: ESTree.Pattern[], initial: TExecutionContext
): TExecutionContext {
  let context = initial;
  if (params.some(parameter => parameter.type === "AssignmentPattern")) {
    const parameters = context.value.environments.get(context.value.environment)!;
    context = enterEnvironment(context, "function");
    const functions = new Set(statements.filter(statement => statement.type === "FunctionDeclaration")
      .map(statement => identifierName((statement as ESTree.FunctionDeclaration).id!)));
    // Body vars start with a copy of same-named parameters. They are distinct
    // bindings: closures created by defaults retain the parameter record.
    for (const name of variableNames(statements)) {
      const parameter = !functions.has(name) && parameters.get(name);
      context = parameter ? putBinding(context, context.value.environment, name, { ...parameter, kind: "var" }) :
        declareBinding(context, name, "var", true);
    }
  }
  const variableEnvironment = context.value.environment;
  // Keep sloppy eval's variable target distinct from body lexical bindings.
  if (!context.value.strict) context = enterEnvironment(context, "block");
  return instantiateDeclarations(statements, context, true, variableEnvironment);
}
