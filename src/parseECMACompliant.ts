import { parseScript, ESTree } from "cherow";

export function parseECMACompliant(code: string): ESTree.Program {
  const program = parseScript(code, { loc: true });
  validateFunctionDeclarations(program);
  return program;
}

// Cherow 1.5.4 accepts formal parameters that collide with the function body's
// lexical declarations. Check that early error in the shared parser, before
// any source effects, including for nested functions that are never called.
function validateFunctionDeclarations(node: any): void {
  if (!node || typeof node !== "object") return;
  if ((node.type === "FunctionDeclaration" || node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression") && node.body.type === "BlockStatement") {
    const parameters = new Set<string>();
    node.params.forEach((parameter: ESTree.Pattern) => collectBoundNames(parameter, parameters));
    const lexical = new Set<string>();
    // A nested block owns a separate lexical scope. Top-level function
    // declarations and var declarations can reuse a parameter's binding.
    node.body.body.forEach((statement: any) => {
      if (statement.type === "VariableDeclaration" && statement.kind !== "var") {
        statement.declarations.forEach((declaration: ESTree.VariableDeclarator) =>
          collectBoundNames(declaration.id, lexical));
      } else if (statement.type === "ClassDeclaration") {
        collectBoundNames(statement.id, lexical);
      }
    });
    lexical.forEach(name => {
      if (parameters.has(name)) throw new SyntaxError(`Identifier '${name}' has already been declared`);
    });
  }
  Object.keys(node).forEach(key => {
    if (key === "loc") return;
    const child = node[key];
    if (Array.isArray(child)) child.forEach(validateFunctionDeclarations);
    else validateFunctionDeclarations(child);
  });
}

function collectBoundNames(pattern: any, names: Set<string>): void {
  if (!pattern) return;
  switch (pattern.type) {
    case "Identifier":
      names.add(pattern.name);
      break;
    case "RestElement":
      collectBoundNames(pattern.argument, names);
      break;
    case "AssignmentPattern":
      collectBoundNames(pattern.left, names);
      break;
    case "ArrayPattern":
      pattern.elements.forEach((element: ESTree.Pattern) => collectBoundNames(element, names));
      break;
    case "ObjectPattern":
      pattern.properties.forEach((property: any) =>
        collectBoundNames(property.type === "RestElement" ? property.argument : property.value, names));
      break;
  }
}
