import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { compareModule } from "./commonjs/oracle";

for (const [parameters, expected] of [["", 0], ["first", 1], ["first, second", 2],
  ["first = 1, second", 0], ["first, second = 2, third", 1]] as Array<[string, number]>) {
  test(`ordinary and arrow functions expose their required parameter count: (${parameters})`, () => {
    const { loaded } = compareModule(`
      function declaration(${parameters}) {}
      const expression = function(${parameters}) {};
      const arrow = (${parameters}) => 0;
      module.exports = declaration.length === ${expected} &&
        expression.length === ${expected} && arrow.length === ${expected};
    `);
    expect(loaded).toMatchObject({ value: true });
  });
}

test("ordinary function length writes remain unsupported until descriptors are modeled", () => {
  expect(() => evaluateCode("function f(a = 1) {} f.length = 3;", nodeInitialExecutionContext))
    .toThrow(/Unmodeled host property write/);
});

test("anonymous default function names remain an explicit inference gap", () => {
  expect(() => evaluateCode("function f(a = function() {}) { return a.name; } f();", nodeInitialExecutionContext))
    .toThrow(/Unmodeled property read/);
});
