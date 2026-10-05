import { parseScript, ESTree } from "cherow";
import { UnsupportedAnalysisError } from "./execution-context/analysis-failure";

export function parseECMACompliant(code: string): ESTree.Program {
  let program: ESTree.Program;
  try {
    program = parseScript(code, { loc: true, raw: true });
  } catch (error) {
    // Cherow also rejects some valid quoted CRLF continuations before it can
    // return an AST. Do not expose that known lexer failure as a JavaScript
    // SyntaxError. This conservative boundary does not claim the source is valid.
    if (error instanceof SyntaxError && code.includes("\\\r\n")) {
      throw new Error("Parser analysis is not yet supported: failed parsing source with a CRLF line continuation");
    }
    // Older Cherow rejects the JSON-superset spelling of ordinary LS/PS in
    // quoted strings. Its pinned diagnostic points at that exact code unit;
    // do not intercept other errors merely because they mention this character.
    const lexerError = error as SyntaxError & { description?: string; index?: number };
    // Cherow predates these valid modern flags. This is a parser admission
    // boundary, not proof that the entire source has valid RegExp syntax.
    if (error instanceof SyntaxError &&
        /^Unexpected regular expression flag '[dv]'$/.test(lexerError.description || "")) {
      throw new UnsupportedAnalysisError("RegExp parser analysis is not yet supported: d/v flags");
    }
    if (error instanceof SyntaxError && lexerError.description === "Unterminated string literal" &&
        typeof lexerError.index === "number" &&
        (code[lexerError.index] === "\u2028" || code[lexerError.index] === "\u2029")) {
      throw new Error("Parser analysis is not yet supported: ordinary Unicode line separators in quoted strings");
    }
    throw error;
  }
  sanitizeRegExpLiterals(program);
  correctStringLiteralValues(program);
  validateFunctionDeclarations(program);
  return program;
}

// Cherow uses host RegExp compilation for grammar validation and returns null
// when flag-sensitive compilation fails. Validate that result before ANY guest
// execution, including literals inside uncalled functions, then discard the
// native object from all retained ASTs. .regex/raw/loc remain the source record.
// This preserves Cherow's admission profile; it is not a new matching backend or
// full modern RegExp grammar validation independent of the running host version.
function sanitizeRegExpLiterals(node: any): void {
  if (!node || typeof node !== "object") return;
  if (node.type === "Literal" && node.regex) {
    if (node.value === null) throw new SyntaxError("Invalid regular expression literal");
    if (!(node.value instanceof RegExp)) throw new Error("Parser returned an invalid RegExp literal value");
    node.value = null;
    return;
  }
  Object.keys(node).forEach(key => {
    if (key === "loc") return;
    const child = node[key];
    if (Array.isArray(child)) child.forEach(sanitizeRegExpLiterals);
    else sanitizeRegExpLiterals(child);
  });
}

// Cherow 1.5.4 can consume a raw astral character twice while cooking a quoted
// string, duplicating its low surrogate, and retain a continued U+2028/U+2029.
// Reparse only the already-validated literal's spelling with equivalent UTF-16
// escapes and equivalent LF continuations. Keep its original raw
// spelling, directive metadata and source locations, and never rewrite source
// outside the literal (identifiers, comments, RegExp and templates included).
function correctStringLiteralValues(node: any): void {
  if (!node || typeof node !== "object") return;
  if (node.type === "Literal" && typeof node.value === "string" &&
      typeof node.raw === "string" && /[\ud800-\udbff][\udc00-\udfff]|\\[\u2028\u2029]/.test(node.raw)) {
    const raw: string = node.raw;
    const pairAt = (index: number) => raw.charCodeAt(index) >= 0xd800 &&
      raw.charCodeAt(index) <= 0xdbff && raw.charCodeAt(index + 1) >= 0xdc00 &&
      raw.charCodeAt(index + 1) <= 0xdfff;
    let escaped = "";
    for (let index = 0; index < raw.length; index++) {
      if (raw[index] === "\\") {
        if (raw[index + 1] === "\u2028" || raw[index + 1] === "\u2029") {
          // Keep a lexical boundary: removing the whole continuation could
          // merge an earlier short octal escape with following digits.
          escaped += "\\\n";
          index++;
          continue;
        }
        // A backslash before an astral SourceCharacter is an identity escape.
        // Other escapes, including escaped backslashes and continuations, must
        // retain their spelling instead of changing backslash parity.
        if (pairAt(index + 1)) index++;
        else { escaped += raw[index] + raw[++index]; continue; }
      }
      if (pairAt(index)) {
        escaped += "\\u" + raw.charCodeAt(index).toString(16) +
          "\\u" + raw.charCodeAt(index + 1).toString(16);
        index++;
      } else escaped += raw[index];
    }
    // The original full parse already checked strictness and early errors.
    // This nonrecursive parse obtains only the corrected literal value.
    const recooked: any = parseScript(escaped).body[0];
    node.value = recooked.expression.value;
  }
  Object.keys(node).forEach(key => {
    if (key === "loc") return;
    const child = node[key];
    if (Array.isArray(child)) child.forEach(correctStringLiteralValues);
    else correctStringLiteralValues(child);
  });
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
