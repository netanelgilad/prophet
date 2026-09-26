import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { concretePrimitive } from "./test262/runner";

function prophetResult(source: string) {
  const [, context] = evaluateCode(source, nodeInitialExecutionContext);
  if (context.value.stderr) throw new Error(context.value.stderr);
  return concretePrimitive(context.value.scope.result);
}

function matchesJavaScript(expression: string) {
  // Host execution is an independent oracle for these local differential tests,
  // never a fallback for the Prophet result or for Test262 test execution.
  const expected = Function(`"use strict"; return (${expression});`)();
  const actual = prophetResult(`var result = (${expression});`);
  if (!Object.is(actual, expected)) {
    throw new Error(`${expression}: Prophet=${String(actual)}, JavaScript=${String(expected)}`);
  }
}

const primitives = [
  "undefined", "null", "false", "true", "-1", "-0", "0", "1",
  "(1 / 0)", "(-1 / 0)", "(0 / 0)", '""', '"1"', '"10"', '"2"', '"foo"'
];

describe("concrete values use JavaScript semantics", () => {
  for (const operator of ["<", "<=", ">", ">=", "===", "!==", "==", "!="]) {
    test(`${operator}: every pair of primitive edge cases agrees with JavaScript`, () => {
      for (const left of primitives) {
        for (const right of primitives) {
          matchesJavaScript(`${left} ${operator} ${right}`);
        }
      }
    });
  }

  for (const operator of ["+", "-", "*", "/", "%"]) {
    test(`${operator}: primitive coercions agree with JavaScript`, () => {
      for (const left of primitives) {
        for (const right of primitives) {
          matchesJavaScript(`${left} ${operator} ${right}`);
        }
      }
    });
  }

  test("typeof uses language semantics rather than internal representation tags", () => {
    for (const value of [...primitives, "[]", "function () {}", "missingName"]) {
      matchesJavaScript(`typeof (${value})`);
    }
  });

  test("logical operators return operands, including falsy right-hand values", () => {
    for (const left of primitives) {
      for (const right of primitives) {
        matchesJavaScript(`${left} && ${right}`);
        matchesJavaScript(`${left} || ${right}`);
      }
    }
  });

  test("ternary selects both value and type using JavaScript truthiness", () => {
    for (const condition of [...primitives, "[]", "function () {}"] ) {
      matchesJavaScript(`${condition} ? "selected" : 42`);
      matchesJavaScript(`${condition} ? null : undefined`);
    }
  });

  test("concrete array identities and lengths remain available", () => {
    for (const expression of ["[] === []", "[] !== []", "[1, 2].length", "[1, 2][0]"]) {
      matchesJavaScript(expression);
    }
    expect(prophetResult("var a = []; var b = a; var result = a === b;")).toBe(true);
  });

  test("only selected branches perform assignments", () => {
    const sources = [
      "var x = 0; true ? (x = 1) : (x = 2); var result = x;",
      "var x = 0; false ? (x = 1) : (x = 2); var result = x;",
      "var x = 0; false && (x = 1); var result = x;",
      "var x = 0; true || (x = 1); var result = x;",
      "var x = 0; true && (x = 1); var result = x;",
      "var x = 0; false || (x = 1); var result = x;",
      "var x = 0; if (true) x = 1; else x = 2; var result = x;",
      "var x = 0; if (false) x = 1; else x = 2; var result = x;",
      "var a = [0]; false && (a[0] = 1); var result = a[0];",
      "var a = [0]; true ? (a[0] = 1) : (a[0] = 2); var result = a[0];"
    ];
    for (const source of sources) {
      expect(prophetResult(source)).toBe(Function(source + "return result;")());
    }
  });

  test("unselected throwing branches are not evaluated", () => {
    const source = "function fail() { throw 42; } ";
    for (const expression of [
      "true ? 1 : fail()", "false ? fail() : 1", "false && fail()", "true || fail()"
    ]) {
      expect(prophetResult(source + `var result = ${expression};`)).toBe(
        Function(source + `return ${expression};`)()
      );
    }
  });
});
