import { TESString } from "../string/String";
import {
  Any,
  Undefined,
  FunctionImplementation,
  FunctionBinding,
  isReturnValue,
  isThrownValue
} from "../types";
import {
  TExecutionContext,
  ExecutionContext,
  setVariableInScope
} from "../execution-context/ExecutionContext";
import { evaluateStatements, mapCompletions } from "../evaluate";
import { unsafeCast } from "@deaven/unsafe-cast.macro";
import { ESObject } from "../Object";
import { tuple } from "@deaven/tuple";
import { parseECMACompliant } from "../parseECMACompliant";
import { ESTree } from "cherow";

export function ESFunction(implementation: FunctionImplementation) {
  return {
    type: "function",
    properties: {
      prototype: ESObject()
    },
    function: {
      implementation
    }
  };
}

export function isESFunction(arg: any): arg is FunctionBinding {
  return arg.type === "function";
}

export const FunctionConstructor = ESFunction(function*(
  _self: Any,
  args: Any[],
  execContext: TExecutionContext
) {
  const blockStatement = ((parseECMACompliant(
    `() => {${unsafeCast<TESString>(args[0]).value as string}}`
  ).body[0] as ESTree.ExpressionStatement)
    .expression as ESTree.ArrowFunctionExpression)
    .body as ESTree.BlockStatement;
  return [createFunction(blockStatement.body, []), execContext] as [
    FunctionBinding,
    TExecutionContext
  ];
});

export function createFunction(
  statements: ESTree.Statement[],
  params: Array<ESTree.Pattern>,
  preserveScope = false
) {
  // Each invocation owns its parameters and declarations, even when a recursive
  // call uses the same names. Nested functions own their own declarations.
  const localNames = new Set(
    params.map(param => unsafeCast<ESTree.Identifier>(param).name)
  );
  const collectDeclarations = (node: any): void => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.type === "FunctionDeclaration") {
      if (node.id) {
        localNames.add(node.id.name);
      }
      return;
    }
    if (
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression"
    ) {
      return;
    }
    if (node.type === "VariableDeclarator" && node.id.type === "Identifier") {
      localNames.add(node.id.name);
    }
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(collectDeclarations);
      } else {
        collectDeclarations(child);
      }
    }
  };
  statements.forEach(collectDeclarations);

  return {
    type: "function",
    properties: {
      prototype: ESObject()
    },
    function: {
      implementation: function*(
        _self: Any,
        args: Array<Any>,
        execContext: TExecutionContext
      ) {
        const callerScope = execContext.value.scope;
        const restoreCallerScope = (context: TExecutionContext) => {
          if (preserveScope) {
            return context;
          }
          const scope = { ...context.value.scope };
          for (const name of localNames) {
            if (Object.prototype.hasOwnProperty.call(callerScope, name)) {
              scope[name] = callerScope[name];
            } else {
              delete scope[name];
            }
          }
          return ExecutionContext({ ...context.value, scope });
        };

        let activationContext = execContext;
        if (!preserveScope) {
          const scope = { ...callerScope };
          for (const name of localNames) {
            scope[name] = Undefined;
          }
          activationContext = ExecutionContext({ ...execContext.value, scope });
        }
        const afterParametersInScopeExecContext = params.reduce(
          (prevContext, parameter, index) =>
            setVariableInScope(
              prevContext,
              unsafeCast<ESTree.Identifier>(parameter).name,
              args[index] === undefined ? Undefined : args[index]
            ),
          activationContext
        );

        const result = evaluateStatements(statements, afterParametersInScopeExecContext);
        return mapCompletions(result, (completion, context) => tuple(
          isReturnValue(completion) ? completion.value :
            isThrownValue(completion) ? completion : Undefined,
          restoreCallerScope(context)
        ));
      }
    }
  };
}
