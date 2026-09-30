import { ESTree } from "cherow";
import assert from "assert";
import { TExecutionContext, declareBinding, putBinding, setEnvironment } from "../execution-context/ExecutionContext";
import { bindingError, declareVar } from "../execution-context/bindings";
import { createFunction } from "./Function";

export function hasUseStrict(statements: ESTree.Statement[]): boolean {
  for (const statement of statements) {
    if (statement.type !== "ExpressionStatement") return false;
    // Cherow records the exact source spelling only for directive statements.
    // Cooked string values would misclassify escapes and parenthesized literals.
    const directive = (statement as ESTree.ExpressionStatement & { directive?: string }).directive;
    if (typeof directive !== "string") return false;
    if (directive === "use strict") return true;
  }
  return false;
}

export function identifierName(pattern: ESTree.Pattern): string {
  assert(pattern.type === "Identifier", "Destructured bindings and parameter defaults are not yet supported");
  return (pattern as ESTree.Identifier).name;
}

// Hoist var through blocks, but never through a nested function boundary.
function collectVars(node: any, names: Set<string>): void {
  if (!node || typeof node !== "object" ||
      node.type === "FunctionDeclaration" || node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression") return;
  if (node.type === "VariableDeclaration" && node.kind === "var") {
    node.declarations.forEach((declaration: ESTree.VariableDeclarator) =>
      names.add(identifierName(declaration.id)));
  }
  Object.keys(node).forEach(key => {
    const child = node[key];
    if (Array.isArray(child)) child.forEach(value => collectVars(value, names));
    else collectVars(child, names);
  });
}

export function variableNames(statements: ESTree.Statement[]): Set<string> {
  const names = new Set<string>();
  statements.forEach(statement => {
    collectVars(statement, names);
    if (statement.type === "FunctionDeclaration") names.add(identifierName(statement.id!));
  });
  return names;
}

// The parser checks conflicts within one source text. Successive scripts also
// have to respect lexical declarations already present in the global record.
export function globalDeclarationError(statements: ESTree.Statement[], context: TExecutionContext) {
  const record = context.value.environments.get(context.value.environment)!;
  const variables = new Set<string>();
  statements.forEach(statement => collectVars(statement, variables));
  for (const statement of statements) {
    if (statement.type === "FunctionDeclaration") variables.add(identifierName(statement.id!));
    if (statement.type === "VariableDeclaration" && statement.kind !== "var") {
      for (const declaration of statement.declarations) {
        const name = identifierName(declaration.id);
        const previous = record.get(name);
        if (previous && previous.kind !== "host") {
          return bindingError("SyntaxError", `Identifier '${name}' has already been declared`);
        }
      }
    }
  }
  for (const name of Array.from(variables)) {
    const previous = record.get(name);
    if (previous && (previous.kind === "let" || previous.kind === "const")) {
      return bindingError("SyntaxError", `Identifier '${name}' has already been declared`);
    }
  }
  return undefined;
}

export function instantiateDeclarations(
  statements: ESTree.Statement[], initial: TExecutionContext, variableScope: boolean,
  variableEnvironment = initial.value.environment
): TExecutionContext {
  let context = initial;
  if (variableScope) {
    const variableContext = setEnvironment(context, variableEnvironment);
    let declared = variableContext;
    variableNames(statements).forEach(name => { declared = declareVar(declared, name); });
    context = setEnvironment(declared, initial.value.environment);
  }
  for (const statement of statements) {
    if (statement.type === "VariableDeclaration" && statement.kind !== "var") {
      for (const declaration of statement.declarations) {
        context = declareBinding(context, identifierName(declaration.id), statement.kind);
      }
    } else if (statement.type === "FunctionDeclaration") {
      const name = identifierName(statement.id!);
      if (!variableScope) context = declareBinding(context, name, "function", true);
    }
  }
  // Every name exists before any function captures the environment, including
  // forward lexical references that must remain in the temporal dead zone.
  for (const statement of statements) {
    if (statement.type === "FunctionDeclaration") {
      const name = identifierName(statement.id!);
      const environment = variableScope ? variableEnvironment : context.value.environment;
      const binding = context.value.environments.get(environment)!.get(name)!;
      context = putBinding(context, environment, name, {
        ...binding, unmodeled: undefined,
        value: createFunction(statement.body.body, statement.params, context, statement)
      });
    }
  }
  return context;
}
