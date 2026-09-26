import { ESFunction } from "../Function/Function";
import {
  TExecutionContext, Environment, ExecutionContext, enterEnvironment, setEnvironment
} from "../execution-context/ExecutionContext";
import { Any, Undefined, isESString, isThrownValue } from "../types";
import { evaluate, mapCompletions } from "../evaluate";
import { parseECMACompliant } from "../parseECMACompliant";
import { instantiateDeclarations, hasUseStrict, variableNames } from "../Function/instantiate";
import { bindingError } from "../execution-context/bindings";
import { BranchResult } from "../execution-context/branches";
import { ESTree } from "cherow";

export const evalFn = ESFunction(function*(_self, args, context) {
  return evaluateEval(args, context, false);
});

export function evaluateEval(args: Any[], caller: TExecutionContext, direct: boolean): BranchResult {
  const source = args.length ? args[0] : Undefined;
  if (!isESString(source)) return [source, caller];
  if (typeof source.value !== "string") throw new Error("Eval requires concrete source text");
  const inheritedStrict = direct && !!caller.value.strict;
  let statements: ESTree.Statement[];
  try {
    statements = parseECMACompliant((inheritedStrict ? '"use strict";\n' : "") + source.value).body as ESTree.Statement[];
    if (inheritedStrict) statements = statements.slice(1);
  } catch (error) {
    if (error.name !== "SyntaxError") throw error;
    return [bindingError("SyntaxError", error.message), caller];
  }
  let parent = caller.value.environment;
  if (!direct) while (parent.parent) parent = parent.parent;
  const strict = inheritedStrict || hasUseStrict(statements);
  let local = enterEnvironment(caller, "block", parent);
  local = ExecutionContext({
    ...local.value, strict, thisValue: direct ? caller.value.thisValue : caller.value.global
  });
  let variableEnvironment = local.value.environment;
  if (!strict) {
    variableEnvironment = parent;
    while (variableEnvironment.kind !== "function" && variableEnvironment.kind !== "global") {
      variableEnvironment = variableEnvironment.parent!;
    }
    if (variableEnvironment.unmodeledGlobalDeclarations && variableNames(statements).size) {
      throw new Error(variableEnvironment.unmodeledGlobalDeclarations);
    }
    // Sloppy eval may add vars to its caller, but cannot cross a lexical
    // declaration between its call site and that variable environment.
    for (const name of Array.from(variableNames(statements))) {
      for (let environment: Environment | undefined = parent; environment; environment = environment.parent) {
        const binding = caller.value.environments.get(environment)!.get(name);
        if (binding && (binding.kind === "let" || binding.kind === "const")) {
          return [bindingError("SyntaxError", `Identifier '${name}' has already been declared`), caller];
        }
        if (environment === variableEnvironment) break;
      }
    }
  }
  local = instantiateDeclarations(statements, local, true, variableEnvironment);
  // Preserve the existing evaluator's last-expression result while routing
  // each completion through normal scope restoration. General statement
  // completion values (e.g. an if as eval's last statement) remain a gap.
  const resume = (index: number, context: TExecutionContext): BranchResult => {
    if (index === statements.length) return [Undefined, context];
    const statement = statements[index];
    const node = index === statements.length - 1 && statement.type === "ExpressionStatement"
      ? statement.expression : statement;
    return mapCompletions(evaluate(node, context), (value, after) => {
      if (index === statements.length - 1 || isThrownValue(value)) return [value, after];
      return resume(index + 1, after);
    });
  };
  return mapCompletions(resume(0, local), (value, after) => [value, ExecutionContext({
    ...setEnvironment(after, caller.value.environment).value,
    strict: caller.value.strict, thisValue: caller.value.thisValue
  })]);
}
