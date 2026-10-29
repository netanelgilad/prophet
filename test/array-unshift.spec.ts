import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { evaluateCode, nodeInitialExecutionContext } from '../src';
import { unshift } from '../src/array/unshift';
import { captureExecutionBoundary } from '../src/execution-context/analysis-failure';
import { setVariablesInScope } from '../src/execution-context/ExecutionContext';
import { isExecutionBoundary, isForkedCompletion } from '../src/execution-context/Completion';
import { getArrayElements } from '../src/execution-context/Heap';
import { Array as ESArray, TArray } from '../src/array/Array';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { Any, ESNumber } from '../src/types';
import { randomNumber, resolveBoolean } from '../src/symbolic';
import { assertPinnedNode } from './commonjs/oracle';
import { loadTest262, test262Root } from './test262/runner';

beforeAll(assertPinnedNode);
function run(source: string, inputs: { [name: string]: Any } = {}) {
  return evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, inputs));
}
function compare(source: string) {
  const native = execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ['-e', source + '; process.stdout.write(JSON.stringify(proof));'],
    { encoding: 'utf8', timeout: 10000, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } });
  expect(JSON.parse(native)).toBe(true);
  const result = run(source);
  expect(isExecutionBoundary(result[0])).toBe(false);
  expect(result[1].value.scope.proof).toMatchObject({ value: true });
  return result;
}

test('unshift is shared, inherited, named and nonconstructible', () => {
  compare(`const a = []; let caught = false;
    try { new a.unshift(); } catch(e) { caught = e instanceof TypeError; }
    const proof = caught && a.unshift === Array.prototype.unshift && a.unshift === [].unshift &&
      !a.hasOwnProperty('unshift') && a.unshift.name === 'unshift' && a.unshift.length === 1 &&
      a.unshift.prototype === undefined;`);
});

test('dense unshift returns new length and preserves argument ordering and aliases', () => {
  compare(`const a = [3, 4], alias = a; const length = a.unshift(1, 2);
    const proof = length === 4 && a === alias && alias.length === 4 &&
      a[0] === 1 && a[1] === 2 && a[2] === 3 && a[3] === 4;`);
});

test('empty and noargument unshift preserve correct lengths', () => {
  compare(`const a = [], b = [1, 2]; const x = a.unshift(), y = b.unshift(), z = a.unshift(7);
    const proof = x === 0 && y === 2 && z === 1 && a[0] === 7 && b[0] === 1 && b[1] === 2;`);
});

test('argument evaluation and prior heap mutations precede shifting', () => {
  compare(`const a = [1, 2]; function arg() { a[1] = 9; return 3; }
    const result = a.unshift(arg(), a[1]);
    const proof = result === 4 && a[0] === 3 && a[1] === 9 && a[2] === 1 && a[3] === 9;`);
});

test('mapped value aliases, explicit undefined and expandos survive', () => {
  compare(`const object = { n: 1 }, a = [undefined, object]; a.extra = 7;
    a.unshift(object); a[0].n = 9;
    const proof = a.length === 3 && a[0] === a[2] && object.n === 9 && a[1] === undefined &&
      a.hasOwnProperty('1') && a.extra === 7;`);
});

test('constructor shadow is unobserved by unshift', () => {
  compare(`const a = [2]; a.constructor = {}; const result = a.unshift(1);
    const proof = result === 2 && a[0] === 1 && a[1] === 2;`);
});

test.each(['null', 'undefined'])('nullish receiver %s is a TypeError', value => {
  compare(`let caught = false; try { Array.prototype.unshift.call(${value}, 1); }
    catch(e) { caught = e instanceof TypeError; } const proof = caught;`);
});

test('symbolic elements and arguments preserve correlation while unrelated comparison stays unknown', () => {
  const [, context] = run(`const a = [value]; a.unshift(other);
    const proof = a[0] === other && a[1] === value; const unknown = a[0] === a[1];`,
    { value: randomNumber(), other: randomNumber() });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(context.value.scope.unknown as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test('conditional receiver mutation changes only selected alias', () => {
  const [, context] = run(`const a = [1], b = [2]; (flag ? a : b).unshift(9);
    const proof = flag ? a.length === 2 && a[0] === 9 && b.length === 1 :
      b.length === 2 && b[0] === 9 && a.length === 1;`, { flag: ESBoolean() });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
});

test('unsupported sparse sibling retains normal dense result', () => {
  const result = run(`const a = flag ? [1] : [,]; a.unshift(9); const done = true;`, { flag: ESBoolean() });
  expect(isForkedCompletion(result[0])).toBe(true);
  if (!isForkedCompletion(result[0])) throw new Error('expected fork');
  const sides = [result[0].consequent, result[0].alternate];
  expect(sides.filter(([value]) => isExecutionBoundary(value))).toHaveLength(1);
  const normal = sides.filter(([value]) => !isExecutionBoundary(value));
  expect(normal[0][1].value.scope.done).toMatchObject({ value: true });
});

test('persistent original snapshot remains unchanged', () => {
  const array = ESArray([ESNumber(2), ESNumber(3)]);
  const result = run('array.unshift(1);', { array });
  expect(getArrayElements(array, nodeInitialExecutionContext)!.map(v => (v as { value: number }).value)).toEqual([2, 3]);
  expect(getArrayElements(array as TArray<Any>, result[1])!.map(v => (v as { value: number }).value)).toEqual([1, 2, 3]);
});

test('cap checked before mutation with exactly 1024 final positions admitted', () => {
  const dense = (n: number) => ESArray(Array.from({ length: n }, (_, i) => ESNumber(i)));
  const [, context] = run('const length = a.unshift(9); const proof = length === 1024 && a[0] === 9 && a[1023] === 1022;', { a: dense(1023) });
  expect(context.value.scope.proof).toMatchObject({ value: true });
  const a = dense(1024), stopped = run('a.unshift(9);', { a });
  expect(isExecutionBoundary(stopped[0])).toBe(true);
  expect(getArrayElements(a, stopped[1])).toHaveLength(1024);
  expect(getArrayElements(a, stopped[1])![0]).toMatchObject({ value: 0 });
});

test.each(['[,].unshift(1)', 'Array.prototype.unshift.call({}, 1)',
  'Array.prototype.unshift.call("abc", 1)', 'Array.prototype.unshift(1)'])('unsupported domain is explicit: %s', source => {
  expect(isExecutionBoundary(run(source)[0])).toBe(true);
});

test('complete upstream noarg/onearg unshift case agrees independently with pinned Node', () => {
  const file = loadTest262('built-ins/Array/prototype/unshift/S15.4.4.13_A1_T1.js');
  const sta = readFileSync(join(test262Root, 'harness/sta.js'), 'utf8');
  const assert = readFileSync(join(test262Root, 'harness/assert.js'), 'utf8');
  for (const directive of ['', '"use strict";\n']) {
    expect(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
      ['-e', 'const vm = require("node:vm"), context = vm.createContext();' +
        'vm.runInContext(' + JSON.stringify(sta) + ', context);' +
        'vm.runInContext(' + JSON.stringify(assert) + ', context);' +
        'vm.runInContext(' + JSON.stringify(directive + file.contents) + ', context); process.stdout.write("passed");'],
      { encoding: 'utf8', timeout: 10000, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } })).toBe('passed');
  }
});

test('maximum array length and excessive argument count stop before scanning or mutation', () => {
  const array = ESArray<Any>([]);
  array.value = new Array(0xffffffff);
  array.properties.length = ESNumber(0xffffffff);
  const result = run('array.unshift(1);', { array });
  expect(result[0]).toMatchObject({ type: 'ExecutionBoundary', kind: 'unsupported' });
  expect(getArrayElements(array, result[1])).toBe(array.value);
  const empty = ESArray<Any>([]);
  const direct = captureExecutionBoundary(nodeInitialExecutionContext, () =>
    unshift(empty, Array.from({ length: 1025 }, () => ESNumber(1)), nodeInitialExecutionContext));
  expect(direct[0]).toMatchObject({ type: 'ExecutionBoundary', kind: 'unsupported' });
  expect(getArrayElements(empty, direct[1])).toHaveLength(0);
});

test('unknown array layout stops before a fabricated shift', () => {
  expect(isExecutionBoundary(run('array.unshift(1);', { array: ESArray() })[0])).toBe(true);
});
