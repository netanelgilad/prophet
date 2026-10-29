import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadTest262, test262Root } from './test262/runner';
import { evaluateCode, nodeInitialExecutionContext } from '../src';
import { map } from '../src/array/map';
import { captureExecutionBoundary } from '../src/execution-context/analysis-failure';

import { ExecutionContext, setVariablesInScope } from '../src/execution-context/ExecutionContext';
import { isExecutionBoundary, isForkedCompletion } from '../src/execution-context/Completion';
import { Any, ESNumber, isThrownValue } from '../src/types';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { randomNumber, resolveBoolean } from '../src/symbolic';
import { Array as ESArray } from '../src/array/Array';
import { getObjectPrototype } from '../src/Object/prototype';
import { assertPinnedNode } from './commonjs/oracle';
import { BranchResult } from '../src/execution-context/branches';

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
}
function leaves(result: BranchResult): BranchResult[] {
  return isForkedCompletion(result[0]) ? leaves(result[0].consequent).concat(leaves(result[0].alternate)) : [result];
}

test('map is inherited, shared, named, nonconstructable and creates a fresh result', () => {
  compare(`const a = [1, 2]; const b = a.map(v => v + 1); let caught = false;
    try { new Array.prototype.map(); } catch(e) { caught = e instanceof TypeError; }
    const proof = a !== b && a[0] === 1 && b[0] === 2 && b[1] === 3 && b.length === 2 &&
      a.map === [].map && !a.hasOwnProperty('map') && a.map.name === 'map' && a.map.length === 1 &&
      a.map.prototype === undefined && caught;`);
});

test('callback receives thisArg, value, index, and original receiver in order', () => {
  compare(`const a = [2, 3], self = { factor: 10 }; let log = '';
    const b = a.map(function(v, i, receiver) { log = log + i; return this.factor + v + (receiver === a ? 1 : 0); }, self);
    const proof = log === '01' && b[0] === 13 && b[1] === 14;`);
  compare(`const a = [1].map(function() { 'use strict'; return this; }); const proof = a[0] === undefined;`);
});

test('holes remain absent while explicit undefined is mapped', () => {
  compare(`let calls = 0; const a = [, undefined, , 7].map(v => { calls = calls + 1; return v; });
    const proof = a.length === 4 && calls === 2 && !a.hasOwnProperty('0') &&
      a.hasOwnProperty('1') && a[1] === undefined && !a.hasOwnProperty('2') && a[3] === 7;`);
});

test('inherited indices become own mapped elements', () => {
  compare(`Object.prototype[1] = 7; const a = [, ,].map(v => v + 2);
    const proof = a.length === 2 && !a.hasOwnProperty('0') && a.hasOwnProperty('1') && a[1] === 9;`);
});

test('captured length excludes appends and current visits observe mutations and shrinkage', () => {
  compare(`const a = [1, , 3]; const b = a.map((v, i) => {
      if (i === 0) { a[1] = 5; a[2] = 7; a.push(9); } return v;
    }); const proof = b.length === 3 && b[0] === 1 && b[1] === 5 && b[2] === 7 && a.length === 4;`);
  compare(`const a = [1, 2, 3]; const b = a.map((v, i) => { a.length = 1; return v; });
    const proof = b.length === 3 && b[0] === 1 && !b.hasOwnProperty('1') && !b.hasOwnProperty('2');`);
});

test.each(['null', 'undefined', '5', 'true'])('noncallable callback %s throws before visiting empty or sparse arrays', fn => {
  compare(`let n = 0; try { [].map(${fn}); } catch(e) { if (e instanceof TypeError) n = n + 1; }
    try { [,].map(${fn}); } catch(e) { if (e instanceof TypeError) n = n + 1; } const proof = n === 2;`);
});

test.each(['null', 'undefined'])('nullish receiver %s throws', value => {
  compare(`let caught = false; try { Array.prototype.map.call(${value}, v => v); }
    catch(e) { caught = e instanceof TypeError; } const proof = caught;`);
});

test('callback guest throw preserves preceding effects and stops subsequent visits', () => {
  compare(`let log = '', result = 'unset', caught = false;
    try { result = [1, 2, 3].map(v => { log = log + v; if (v === 2) throw 9; return v; }); }
    catch(e) { caught = e === 9; } const proof = log === '12' && result === 'unset' && caught;`);
});

test('symbolic values retain correlation and independent comparisons remain unknown', () => {
  const [, context] = run(`const a = [value].map(v => v); const proof = a[0] === value; const unknown = a[0] === other;`,
    { value: randomNumber(), other: randomNumber() });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(context.value.scope.unknown as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test('conditional callback results and sparse presence stay correlated without sibling contamination', () => {
  const [, context] = run(`if (flag) Object.prototype[1] = 7;
    const result = [1, ,].map(v => flag ? v + 1 : v + 2);
    const proof = flag ? result[0] === 2 && result[1] === 8 && result.hasOwnProperty('1') :
      result[0] === 3 && !result.hasOwnProperty('1');`, { flag: ESBoolean() });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
});

test('throwing and unsupported callback branches preserve their prefixes beside normal siblings', () => {
  const results = leaves(run(`let count = 0; const result = [1, 2].map(v => {
      count = count + 1; if (flag && v === 2) throw 9; return v + 1;
    });`, { flag: ESBoolean() }));
  expect(results).toHaveLength(2);
  expect(results.some(([value]) => isThrownValue(value))).toBe(true);
  for (const [, context] of results) expect(context.value.scope.count).toMatchObject({ value: 2 });
  const stopped = leaves(run(`let count = 0; const result = [1, 2].map(v => {
      count = count + 1; if (flag && v === 2) [].filter(v => v); return v + 1;
    });`, { flag: ESBoolean() }));
  expect(stopped).toHaveLength(2);
  expect(stopped.some(([value]) => isExecutionBoundary(value))).toBe(true);
  for (const [, context] of stopped) expect(context.value.scope.count).toMatchObject({ value: 2 });
});

test('custom constructor stops before callbacks, but noncallable callback takes precedence', () => {
  const result = run(`const a = [1]; a.constructor = {}; let count = 0;
    a.map(v => { count = count + 1; return v; });`);
  expect(isExecutionBoundary(result[0])).toBe(true);
  expect(result[1].value.scope.count).toMatchObject({ value: 0 });
  compare(`const a = []; a.constructor = {}; let caught = false;
    try { a.map(5); } catch(e) { caught = e instanceof TypeError; } const proof = caught;`);
});

test('element cap stops before callback work and allows exactly 1024 elements', () => {
  const dense = (n: number) => ESArray(Array.from({ length: n }, (_, i) => ESNumber(i)));
  const [, context] = run(`const result = a.map(v => v + 1); const proof = result.length === 1024 && result[1023] === 1024;`, { a: dense(1024) });
  expect(context.value.scope.proof).toMatchObject({ value: true });
  const stopped = run(`let count = 0; a.map(v => { count = count + 1; return v; });`, { a: dense(1025) });
  expect(isExecutionBoundary(stopped[0])).toBe(true);
  expect(stopped[1].value.scope.count).toMatchObject({ value: 0 });
});

test.each(['Array.prototype.map.call({}, v => v)', 'Array.prototype.map.call("text", v => v)',
  'Array.prototype.map.call(Array.prototype, v => v)'])('unsupported receiver is explicit: %s', source => {
  expect(isExecutionBoundary(run(source)[0])).toBe(true);
});

test('later unresolved inherited index retains the completed prefix', () => {
  // Constructor lookup is on Array.prototype, whereas the hole reaches Object.prototype.
  const prototype = getObjectPrototype(), saved = prototype.unmodeledPropertyReads;
  prototype.unmodeledPropertyReads = ['1'];
  try {
    const result = run(`let count = 0, caught = false;
      try { [1, ,].map(v => { count = count + 1; return v; }); } catch(e) { caught = true; }`);
    expect(isExecutionBoundary(result[0])).toBe(true);
    expect(result[1].value.scope.count).toMatchObject({ value: 1 });
    expect(result[1].value.scope.caught).toMatchObject({ value: false });
  } finally { prototype.unmodeledPropertyReads = saved; }
});

const upstreamCases = ["built-ins/Array/prototype/map/15.4.4.19-1-1.js", "built-ins/Array/prototype/map/15.4.4.19-1-2.js", "built-ins/Array/prototype/map/15.4.4.19-2-2.js", "built-ins/Array/prototype/map/15.4.4.19-5-2.js", "built-ins/Array/prototype/map/15.4.4.19-8-1.js", "built-ins/Array/prototype/map/15.4.4.19-8-2.js", "built-ins/Array/prototype/map/15.4.4.19-8-4.js", "built-ins/Array/prototype/map/15.4.4.19-9-1.js", "built-ins/Array/prototype/map/15.4.4.19-9-2.js"];
test.each(upstreamCases)('whole upstream map case independently agrees with pinned Node: %s', name => {
  const file = loadTest262(name);
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

test('finite receiver and callback choices remain correlated', () => {
  const [, context] = run(`const receiver = flag ? [1] : [2, 3];
    const callback = flag ? (v => v + 10) : (v => v + 20);
    const result = receiver.map(callback);
    const proof = flag ? result.length === 1 && result[0] === 11 :
      result.length === 2 && result[0] === 22 && result[1] === 23;`, { flag: ESBoolean() });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
});

test('mapped objects retain alias identity and nested map does not overwrite outer results', () => {
  compare(`const object = { value: 1 }; const mapped = [object].map(v => v);
    mapped[0].value = 9;
    const nested = [1, 2].map(v => [v, v + 1].map(x => x + 10));
    const proof = mapped[0] === object && object.value === 9 && nested[0][0] === 11 &&
      nested[0][1] === 12 && nested[1][0] === 12 && nested[1][1] === 13 && nested[0] !== nested[1];`);
});

test('unknown and segmented array layouts stop explicitly', () => {
  for (const array of [ESArray(), ESArray([ESArray([ESNumber(1)]), ESArray()], 'segments')]) {
    expect(isExecutionBoundary(run('array.map(v => v);', { array })[0])).toBe(true);
  }
});

test('callback execution budget stop is not a guest throw', () => {
  const [, context] = run('const callback = v => v;');
  const budgeted = ExecutionContext({ ...context.value, evaluationBudget: { remaining: 0 } });
  const result = captureExecutionBoundary(budgeted, () =>
    map(ESArray([ESNumber(1)]), [budgeted.value.scope.callback as Any], budgeted));
  expect(result[0]).toMatchObject({ type: 'ExecutionBoundary', kind: 'budget' });
  expect(isThrownValue(result[0])).toBe(false);
});
