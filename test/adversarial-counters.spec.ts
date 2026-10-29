import { execFileSync } from "child_process";
import { hasExecutionBoundary, isForkedCompletion } from "../src/execution-context/Completion";
import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { symbolicNumberArray } from "../src/array/symbolic";
import { ESNumber, isThrownValue } from "../src/types";


const program = `function miscounted(values) {
  let negative = 0; let nonnegative = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] < 0) negative++; else nonnegative++;
  }
  return negative + nonnegative !== values.length;
}`;
import { assertPinnedNode } from "./commonjs/oracle";
beforeAll(assertPinnedNode);

function run(source: string, budget?: number) {
  const element = ESNumber(); element.knowledge = [{kind: "finite", subject: element}];
  const initial = setVariablesInScope(nodeInitialExecutionContext, {
    input: symbolicNumberArray({minimumLength: 0, maximumLength: 1000000, element})
  });
  return evaluateCode(source, budget === undefined ? initial : ExecutionContext({...initial.value,evaluationBudget:{remaining:budget}}));
}
test("exclusive counters conserve symbolic length zero through one million", () => {
  const [completion, context] = run(program + ' const result = miscounted(input); const length = input.length;');
  expect(hasExecutionBoundary(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(isThrownValue(completion)).toBe(false);
  expect((context.value.scope.length as any).value).toBeUndefined();
  expect(context.value.scope.result).toMatchObject({value: false});
  expect(context.value.uncaught).toBeUndefined();
});
test("renamed counters and reversed classification retain the invariant", () => {
  const [, context] = run(program.replace(/negative/g, 'left').replace(/nonleft/g, 'right')
    .replace('values[i] < 0', 'values[i] >= 0') + ' const result = miscounted(input);');
  expect(context.value.scope.result).toMatchObject({value: false});
});
test("zero-skipping counter has both concrete outcomes", () => {
  const broken = program.replace('else nonnegative++', 'else if (values[i] > 0) nonnegative++');
  const [, context] = run(broken + ' const fails = miscounted([0]); const passes = miscounted([-1,1]);');
  expect(context.value.scope.fails).toMatchObject({value: true});
  expect(context.value.scope.passes).toMatchObject({value: false});
});

test("neither individual counter becomes a concrete number", () => {
  for (const counter of ['negative', 'nonnegative']) {
    const [, context] = run(program.replace('negative + nonnegative !== values.length', counter) +
      ' const count = miscounted(input);');
    expect(context.value.scope.count).toMatchObject({type: 'number'});
    expect((context.value.scope.count as any).value).toBeUndefined();
  }
});

test("counter aliases keep pre-loop values", () => {
  const source = program.replace('for (let', 'const oldNegative = negative; const oldPositive = nonnegative; for (let')
    .replace('return negative + nonnegative !== values.length',
      'return oldNegative !== 0 || oldPositive !== 0 || negative + nonnegative !== values.length');
  const [, context] = run(source + ' const result = miscounted(input);');
  expect(context.value.scope.result).toMatchObject({value: false});
});

test.each([
  ['zero skipping', program.replace('else nonnegative++', 'else if (values[i] > 0) nonnegative++')],
  ['late deviation', program.replace('if (values[i]', 'if (i === 999999) {} else if (values[i]')],
  ['wrong successor', program.replace('i++)', 'i = i + 2)')],
  ['unrelated local write', program.replace('for (let', 'let extra = 0; for (let')
    .replace('if (values[i]', 'extra++; if (values[i]')],
])('%s cannot receive a conservation proof', (_label, source) => {
  const [completion, context] = run(source + ' const result = miscounted(input);', 45);
  expect(hasExecutionBoundary(completion)).toBe(true);
  expect(context.value.scope.result).toBeUndefined();
});

test("successful proof never populates the input sequence read caches", () => {
  const element = ESNumber(); element.knowledge=[{kind:'finite',subject:element}];
  const input = symbolicNumberArray({minimumLength: 0, maximumLength: 1000000, element});
  const before = input.shape.sequence.indexedReads.size;
  const [, context] = evaluateCode(program + ' const result = miscounted(input);',
    setVariablesInScope(nodeInitialExecutionContext,{input}));
  expect(context.value.scope.result).toMatchObject({value:false});
  expect(input.shape.sequence.indexedReads.size).toBe(before);
  expect(input.shape.sequence.reads.size).toBe(0);
});

test("pinned Node witnesses include empty, signed-zero, negative, positive and broken cases", () => {
  const broken=program.replace('miscounted', 'broken').replace('else nonnegative++','else if (values[i] > 0) nonnegative++');
  const output=execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,[
    '-e', program + broken + `console.log(JSON.stringify([
      miscounted([]), miscounted([-0,0,-1,1,Number.MAX_VALUE,-Number.MAX_VALUE]),
      broken([0]), broken([-1,1])]))`
  ],{encoding:'utf8'});
  expect(JSON.parse(output)).toEqual([false,false,true,false]);
});

test("small caller budget is sufficient for positive induction", () => {
  const [completion, context] = run(program + ' const result = miscounted(input);', 45);
  expect(hasExecutionBoundary(completion)).toBe(false);
  expect(context.value.scope.result).toMatchObject({value:false});
});
test("unrelated local allocation retains the conservative heap-identity boundary", () => {
  const [completion, context] = run(program.replace('let negative', 'const box = {v:0}; let negative') +
    ' const result = miscounted(input);', 65);
  expect(hasExecutionBoundary(completion)).toBe(true);
  expect(context.value.scope.result).toBeUndefined();
});

test("candidate-pair search has an explicit bounded fallback", () => {
  const source = program.replace('for (let', 'let spareA=0; let spareB=0; let spareC=0; for (let');
  const [completion, context] = run(source + ' const result = miscounted(input);', 65);
  expect(hasExecutionBoundary(completion)).toBe(true);
  expect(context.value.scope.result).toBeUndefined();
});
