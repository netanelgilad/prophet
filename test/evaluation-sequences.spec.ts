import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { isForkedCompletion } from "../src/execution-context/Completion";
import { isThrownValue } from "../src/types";

const length = 1500;

function run(source: string) {
  const [completion, context] = evaluateCode(source, nodeInitialExecutionContext);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(isThrownValue(completion)).toBe(false);
  expect(context.value.uncaught).toBeUndefined();
  return context.value.scope;
}

test("a large flat array evaluates without growing the host call stack per element", () => {
  const elements = Array.from({ length }, (_, index) => String(index)).join(",");
  const scope = run(`
    const values = [${elements}];
    const proof = values.length === ${length} && values[0] === 0 && values[${length - 1}] === ${length - 1};
  `);
  expect(scope.proof).toMatchObject({ value: true });
});

test("a large flat argument list evaluates every argument in order without recursive sequencing", () => {
  const args = Array.from({ length }, (_, index) => `effect = ${index}`).join(",");
  const scope = run(`
    let effect = -1;
    function first(value) { return value; }
    const observed = first(${args});
    const proof = observed === 0 && effect === ${length - 1};
  `);
  expect(scope.proof).toMatchObject({ value: true });
});

test("a large flat object keeps every property without recursive sequencing", () => {
  const properties = Array.from({ length }, (_, index) => `value${index}: ${index}`).join(",");
  const scope = run(`
    const values = { ${properties} };
    const proof = values.value0 === 0 && values.value${length - 1} === ${length - 1};
  `);
  expect(scope.proof).toMatchObject({ value: true });
});

test("a large declaration list initializes each binding without recursive sequencing", () => {
  const declarations = Array.from({ length }, (_, index) => `value${index} = ${index}`).join(",");
  const scope = run(`
    let ${declarations};
    const proof = value0 === 0 && value${length - 1} === ${length - 1};
  `);
  expect(scope.proof).toMatchObject({ value: true });
});
