import { execFileSync } from 'child_process';
import { evaluateCode, nodeInitialExecutionContext } from '../src';
import { Array as ESArray, getArrayPrototype, TArray } from '../src/array/Array';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { BranchResult } from '../src/execution-context/branches';
import { isExecutionBoundary, isForkedCompletion } from '../src/execution-context/Completion';
import { setVariablesInScope } from '../src/execution-context/ExecutionContext';
import { getArrayElements } from '../src/execution-context/Heap';
import { getObjectPrototype } from '../src/Object/prototype';
import { resolveBoolean } from '../src/symbolic';
import { Any, ESNumber } from '../src/types';
import { assertPinnedNode } from './commonjs/oracle';

beforeAll(assertPinnedNode);
function run(source: string, input: { [name: string]: Any } = {}) {
  return evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, input));
}
function compare(source: string) {
  expect(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ['-e', source + ';process.stdout.write(JSON.stringify(proof));'],
    { encoding: 'utf8', timeout: 10000, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } })).toBe('true');
  const result = run(source);
  expect(isExecutionBoundary(result[0])).toBe(false);
  expect(result[1].value.scope.proof).toMatchObject({ value: true });
  return result;
}
function leaves(result: BranchResult): BranchResult[] {
  return isForkedCompletion(result[0]) ? leaves(result[0].consequent).concat(leaves(result[0].alternate)) : [result];
}

test('review: unshift preserves receiver identity, reference elements, order and returned length', () => {
  compare(`const object = {}, a = [object, 2], alias = a;
    const length = a.unshift(a, object, undefined);
    const proof = length === 5 && alias === a && a[0] === a && a[1] === object && a[2] === undefined &&
      a.hasOwnProperty('2') && a[3] === object && a[4] === 2;`);
});

test('review: arguments execute left to right before current receiver length is read', () => {
  compare(`const a = [1]; const length = a.unshift(a.push(2), a.push(3));
    const proof = length === 5 && a.length === 5 && a[0] === 2 && a[1] === 3 && a[2] === 1 && a[3] === 2 && a[4] === 3;`);
});

test('review: no argument unshift returns current length and does not copy or coerce elements', () => {
  compare(`const item = { valueOf: function() { throw 9; } }, a = [item, undefined];
    const n = a.unshift(); const proof = n === 2 && a[0] === item && a[1] === undefined && a.hasOwnProperty('1');`);
});

test('review: constructor and species are irrelevant to dense unshift', () => {
  compare(`const a = [1]; a.constructor = null;
    const n = a.unshift(2); const proof = n === 2 && a[0] === 2 && a[1] === 1 && a.constructor === null;`);
});

test('review: current receiver state after prior shrink and repeated unshift is used', () => {
  compare(`const a = [1, 2, 3]; a.length = 1; a.unshift(4); const n = a.unshift(5, 6);
    const proof = n === 4 && a[0] === 5 && a[1] === 6 && a[2] === 4 && a[3] === 1;`);
});

test('review: inherited ordinary numeric data is shadowed by own shifted destinations', () => {
  compare(`Object.prototype[2] = 9; const a = [1, 2]; a.unshift(3);
    const proof = a[0] === 3 && a[1] === 1 && a[2] === 2 && a.hasOwnProperty('2') && Object.prototype[2] === 9;`);
});

test('review: persistent input heap snapshot survives in-place modeled mutation', () => {
  const a = ESArray([ESNumber(1), ESNumber(2)]);
  const result = run(`const alias = a; const n = a.unshift(3); const proof = alias === a && alias[0] === 3 && n === 3;`, { a });
  expect(result[1].value.scope.proof).toMatchObject({ value: true });
  expect(getArrayElements(a, nodeInitialExecutionContext)).toEqual([ESNumber(1), ESNumber(2)]);
  expect(getArrayElements(a, result[1])).toEqual([ESNumber(3), ESNumber(1), ESNumber(2)]);
});

test('review: conditional receiver selects only that object and keeps symbolic inserted values', () => {
  const [, context] = run(`const a = [1], b = [2]; const selected = flag ? a : b;
    const n = selected.unshift(flag ? 3 : 4);
    const proof = n === 2 && (flag ? a[0] === 3 && a[1] === 1 && b.length === 1 : b[0] === 4 && b[1] === 2 && a.length === 1);`, { flag: ESBoolean() });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
});

test('review: unsupported sparse receiver remains unchanged beside supported dense sibling', () => {
  const outcomes = leaves(run(`const dense = [1], sparse = [, 2]; let caught = false;
    try { (flag ? dense : sparse).unshift(3); } catch (error) { caught = true; }`, { flag: ESBoolean() }));
  expect(outcomes).toHaveLength(2);
  const stopped = outcomes.filter(([value]) => isExecutionBoundary(value));
  expect(stopped).toHaveLength(1);
  expect(stopped[0][1].value.scope.caught).toMatchObject({ value: false });
  const elements = getArrayElements(stopped[0][1].value.scope.sparse as TArray<Any>, stopped[0][1])!;
  expect(elements).toHaveLength(2); expect(0 in elements).toBe(false);
  const normal = outcomes.find(([value]) => !isExecutionBoundary(value))!;
  expect(getArrayElements(normal[1].value.scope.dense as TArray<Any>, normal[1])).toEqual([ESNumber(3), ESNumber(1)]);
});

test('review: unknown inherited destination hook stops without mutating input', () => {
  const proto = getObjectPrototype(), saved = proto.propertyAccess;
  try {
    Object.assign(proto, { propertyAccess: {
      read() { return undefined; }, write() { throw new Error('unverified inherited setter must not execute'); }
    } });
    const a = ESArray([ESNumber(1)]);
    const result = run('Array.prototype.unshift.call(a, 2);', { a });
    expect(isExecutionBoundary(result[0])).toBe(true);
    expect(getArrayElements(a, result[1])).toEqual([ESNumber(1)]);
  } finally {
    if (saved === undefined) delete proto.propertyAccess; else proto.propertyAccess = saved;
  }
});

test('review: inherited unmodeled write for new destination is not ignored', () => {
  const proto = getObjectPrototype(), saved = proto.unmodeledPropertyWrites;
  try {
    Object.assign(proto, { unmodeledPropertyWrites: ['1'] });
    const a = ESArray([ESNumber(1)]);
    const result = run('a.unshift(2);', { a });
    expect(isExecutionBoundary(result[0])).toBe(true);
    expect(getArrayElements(a, result[1])).toEqual([ESNumber(1)]);
  } finally {
    if (saved === undefined) delete proto.unmodeledPropertyWrites; else proto.unmodeledPropertyWrites = saved;
  }
});

test('review: custom Array prototype hook identity is not trusted on destination creation', () => {
  const proto = getArrayPrototype(), saved = proto.propertyAccess;
  try {
    Object.assign(proto, { propertyAccess: { read() { return undefined; }, write() { return undefined; } } });
    const a = ESArray([ESNumber(1)]);
    const result = run('a.unshift(2);', { a });
    expect(isExecutionBoundary(result[0])).toBe(true);
    expect(getArrayElements(a, result[1])).toEqual([ESNumber(1)]);
  } finally { proto.propertyAccess = saved; }
});

test('review: oversized dense array is an analysis boundary without partial writes', () => {
  const a = ESArray(Array.from({ length: 1024 }, (_, i) => ESNumber(i)));
  const result = run('a.unshift(9);', { a });
  expect(isExecutionBoundary(result[0])).toBe(true);
  expect(getArrayElements(a, result[1])).toBe(a.value);
});

test('review: exact supported result bound retains endpoint order', () => {
  const a = ESArray(Array.from({ length: 1023 }, (_, i) => ESNumber(i)));
  const result = run('const n = a.unshift(9); const proof = n === 1024 && a[0] === 9 && a[1] === 0 && a[1023] === 1022;', { a });
  expect(isExecutionBoundary(result[0])).toBe(false);
  expect(result[1].value.scope.proof).toMatchObject({ value: true });
});

test('review: receiver symbol metadata unrelated to unshift does not imply species lookup', () => {
  const a = ESArray([ESNumber(1)]);
  Object.assign(a, { wellKnownSymbols: new Map([[{ name: 'Symbol.species' }, ESNumber(7)]]) });
  const result = run('const n = a.unshift(2); const proof = n === 2 && a[0] === 2 && a[1] === 1;', { a });
  expect(isExecutionBoundary(result[0])).toBe(false);
  expect(result[1].value.scope.proof).toMatchObject({ value: true });
});

test('review: changing intrinsic indexed write hook in place invalidates destination proof', () => {
  const access = getArrayPrototype().propertyAccess!, saved = access.write;
  try {
    access.write = () => { throw new Error('unverified mutated setter must not run'); };
    const a = ESArray([ESNumber(1)]);
    const result = run('a.unshift(2);', { a });
    expect(isExecutionBoundary(result[0])).toBe(true);
    expect(getArrayElements(a, result[1])).toEqual([ESNumber(1)]);
  } finally { access.write = saved; }
});
