import { execFileSync } from 'child_process';
import { evaluateCode, nodeInitialExecutionContext } from '../src';
import { Array as ESArray, getArrayPrototype } from '../src/array/Array';
import { getArrayConstructor } from '../src/array/prototype';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { BranchResult } from '../src/execution-context/branches';
import { isExecutionBoundary, isForkedCompletion } from '../src/execution-context/Completion';
import { setVariablesInScope } from '../src/execution-context/ExecutionContext';
import { getObjectPrototype } from '../src/Object/prototype';
import { getFunctionPrototype } from '../src/Function/prototype';
import { resolveBoolean } from '../src/symbolic';
import { Any, ESNumber, isThrownValue, WithProperties } from '../src/types';
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

test('review: sparse mapping creates own undefined results only for visited indices', () => {
  compare(`const a = [, undefined, , 4]; let calls = 0;
    const b = a.map(function() { calls = calls + 1; });
    const proof = calls === 2 && b !== a && b.length === 4 &&
      !b.hasOwnProperty('0') && b.hasOwnProperty('1') && !b.hasOwnProperty('2') &&
      b.hasOwnProperty('3') && b[1] === undefined && b[3] === undefined;`);
});

test('review: shrinking then restoring input length does not restore removed elements', () => {
  compare(`const a = [1, 2, 3]; const b = a.map(function(value, index) {
    if (index === 0) { a.length = 1; a.length = 3; } return value;
  }); const proof = b.length === 3 && b[0] === 1 && !b.hasOwnProperty('1') && !b.hasOwnProperty('2');`);
});

test('review: future holes filled by callback are mapped but newly appended elements are not', () => {
  compare(`const a = [1, , 3]; const b = a.map(function(value, index) {
    if (index === 0) { a[1] = 8; a[3] = 9; } return value + 1;
  }); const proof = a.length === 4 && b.length === 3 && b[0] === 2 && b[1] === 9 && b[2] === 4;`);
});

test('review: inherited holes read current prototype values and create own result elements', () => {
  compare(`const a = [1, ,]; const b = a.map(function(value, index) {
    if (index === 0) Object.prototype[1] = 7; return value + 1;
  }); const proof = b.length === 2 && b[1] === 8 && b.hasOwnProperty('1') && !a.hasOwnProperty('1');`);
});

test('review: returning receiver keeps alias identity while output allocation remains fresh', () => {
  compare(`const a = [1, 2]; const b = a.map(function(value, index, receiver) { return receiver; });
    a[0] = 9; const c = a.map(function(value) { return value; });
    const proof = b !== a && b !== c && b[0] === a && b[1] === a && b[0][0] === 9 && c[0] === 9;`);
});

test('review: nested maps have independent allocations and callback state', () => {
  compare(`const a = [1, 2]; const b = a.map(function(value) {
    return a.map(function(other) { return value + other; });
  }); const proof = b[0] !== b[1] && b[0][0] === 2 && b[0][1] === 3 && b[1][0] === 3 && b[1][1] === 4;`);
});

test('review: abrupt callback leaves result binding unassigned and preserves prefix writes', () => {
  compare(`let result = 'old'; const seen = []; let caught;
    try { result = [1, 2, 3].map(function(value) { seen.push(value); if (value === 2) throw 17; return value; }); }
    catch (error) { caught = error; }
    const proof = result === 'old' && caught === 17 && seen.length === 2 && seen[0] === 1 && seen[1] === 2;`);
});

test('review: noncallable callback takes precedence over unsupported constructor customization', () => {
  compare(`const a = []; a.constructor = 7; let caught = false;
    try { a.map(null); } catch (error) { caught = error instanceof TypeError; }
    const proof = caught;`);
});

test('review: symbolic callback returns retain correlations and result allocation identity', () => {
  const [, context] = run(`const a = [1, 2]; const b = a.map(function(value) { return flag ? value : 9; });
    const c = a.map(function(value) { return value; });
    const proof = b !== a && b !== c && (flag ? b[0] === 1 && b[1] === 2 : b[0] === 9 && b[1] === 9);`, { flag: ESBoolean() });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
});

test('review: symbolic guest throw and unsupported callback preserve independent prefixes', () => {
  const outcomes = leaves(run(`let seen = 0, caught = false;
    try { [1, 2].map(function(value) { seen = seen + 1;
      if (flag) throw 9; [].filter(function(x) { return x; }); return value;
    }); } catch (error) { caught = true; }`, { flag: ESBoolean() }));
  expect(outcomes).toHaveLength(2);
  expect(outcomes.filter(([value]) => isExecutionBoundary(value))).toHaveLength(1);
  const stopped = outcomes.find(([value]) => isExecutionBoundary(value))!;
  const normal = outcomes.find(([value]) => !isExecutionBoundary(value))!;
  expect(stopped[1].value.scope.seen).toMatchObject({ value: 1 });
  expect(stopped[1].value.scope.caught).toMatchObject({ value: false });
  expect(normal[1].value.scope.seen).toMatchObject({ value: 1 });
  expect(normal[1].value.scope.caught).toMatchObject({ value: true });
});

test('review: symbolic throw on second callback retains normal completed sibling', () => {
  const outcomes = leaves(run(`let seen = 0;
    const result = [1, 2].map(function(value) { seen = seen + 1; if (flag && value === 2) throw 9; return value; });`, { flag: ESBoolean() }));
  expect(outcomes).toHaveLength(2);
  expect(outcomes.filter(([value]) => isThrownValue(value))).toHaveLength(1);
  expect(outcomes.filter(([value]) => isExecutionBoundary(value))).toHaveLength(0);
  for (const [, context] of outcomes) expect(context.value.scope.seen).toMatchObject({ value: 2 });
});

test('review: conditional constructor shadow stops customized sibling without losing ordinary result', () => {
  const outcomes = leaves(run(`const a = [1]; let seen = 0;
    if (flag) a.constructor = 7;
    const result = a.map(function(value) { seen = seen + 1; return value; });`, { flag: ESBoolean() }));
  // Conservative joined-property rejection is permitted but must not invent success.
  expect(outcomes.some(([value]) => isExecutionBoundary(value))).toBe(true);
  for (const [value, context] of outcomes) {
    if (isExecutionBoundary(value)) expect(context.value.scope.seen).toMatchObject({ value: 0 });
  }
});

for (const owner of ['array-prototype', 'constructor', 'function-prototype', 'object-prototype']) {
  test('review: unresolved constructor/species lookup stops before callbacks: ' + owner, () => {
    const model: WithProperties = owner === 'array-prototype' ? getArrayPrototype() : owner === 'constructor' ? getArrayConstructor()
      : owner === 'function-prototype' ? getFunctionPrototype() : getObjectPrototype();
    const saved = model.unknownProperties;
    try {
      Object.assign(model, { unknownProperties: 'unresolved species or constructor state' });
      const result = run(`let seen = 0; Array.prototype.map.call(a, function(value) { seen = seen + 1; return value; });`,
        { a: ESArray([ESNumber(1)]) });
      expect(isExecutionBoundary(result[0])).toBe(true);
      expect(result[1].value.scope.seen).toMatchObject({ value: 0 });
    } finally {
      if (saved === undefined) delete model.unknownProperties;
      else model.unknownProperties = saved;
    }
  });
}

test('review: later unresolved inherited numeric read retains completed callback state and throw sibling', () => {
  const model = getObjectPrototype(), saved = model.unmodeledPropertyReads;
  try {
    Object.assign(model, { unmodeledPropertyReads: (saved || []).concat(['1']) });
    const outcomes = leaves(run(`let seen = 0; [1, ,].map(function(value) {
      seen = seen + 1; if (flag) throw 9; return value;
    });`, { flag: ESBoolean() }));
    expect(outcomes).toHaveLength(2);
    expect(outcomes.filter(([value]) => isThrownValue(value))).toHaveLength(1);
    expect(outcomes.filter(([value]) => isExecutionBoundary(value))).toHaveLength(1);
    for (const [, context] of outcomes) expect(context.value.scope.seen).toMatchObject({ value: 1 });
  } finally {
    if (saved === undefined) delete model.unmodeledPropertyReads;
    else model.unmodeledPropertyReads = saved;
  }
});

test('review: constructor changes during callbacks do not repeat species creation', () => {
  compare(`const a = [1, 2]; const b = a.map(function(value) { a.constructor = 7; return value; });
    const proof = b.length === 2 && b[0] === 1 && b[1] === 2 && a.constructor === 7;`);
});

test('review: custom inherited indexed access cannot silently become a hole after a completed prefix', () => {
  const model = getObjectPrototype(), saved = model.propertyAccess;
  try {
    Object.assign(model, { propertyAccess: {
      read(name: string) { if (name === '1') throw new Error('unverified inherited hook must not run'); return undefined; },
      write() { return undefined; }
    } });
    const result = run(`let seen = 0; [1, ,].map(function(value) { seen = seen + 1; return value; });`);
    expect(isExecutionBoundary(result[0])).toBe(true);
    expect(result[1].value.scope.seen).toMatchObject({ value: 1 });
  } finally {
    if (saved === undefined) delete model.propertyAccess;
    else model.propertyAccess = saved;
  }
});
