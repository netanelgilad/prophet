import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { evaluateCode, nodeInitialExecutionContext } from '../src';
import { Array as ESArray, TArray } from '../src/array/Array';
import { symbolicNumberArray } from '../src/array/symbolic';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { BranchResult } from '../src/execution-context/branches';
import { isExecutionBoundary, isForkedCompletion } from '../src/execution-context/Completion';
import { setVariablesInScope } from '../src/execution-context/ExecutionContext';
import { getArrayElements } from '../src/execution-context/Heap';
import { resolveBoolean } from '../src/symbolic';
import { Any, ESNumber, Undefined } from '../src/types';
import { ESObject } from '../src/Object';
import { assertPinnedNode } from './commonjs/oracle';
import { loadTest262, test262Root } from './test262/runner';

beforeAll(assertPinnedNode);
function run(source: string, input: { [name: string]: Any } = {}) {
  return evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, input));
}
function compare(source: string) {
  const native = execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ['-e', source + '; process.stdout.write(JSON.stringify(proof));'],
    { encoding: 'utf8', timeout: 10000, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } });
  expect(JSON.parse(native)).toBe(true);
  const result = run(source);
  expect(result[1].value.scope.proof).toMatchObject({ value: true });
  return result;
}
function leaves(result: BranchResult): BranchResult[] {
  return isForkedCompletion(result[0]) ? leaves(result[0].consequent).concat(leaves(result[0].alternate)) : [result];
}

test('push is shared and inherited; Array.prototype is an empty array with the ordinary parent', () => {
  compare(`const first = [], second = Array(), third = new Array();
    const proof = first !== second && second !== third && first.push === second.push &&
      first.push === Array.prototype.push && first.constructor === Array &&
      !first.hasOwnProperty("push") && !first.hasOwnProperty("join") &&
      first instanceof Array && first instanceof Object && Array.prototype instanceof Object &&
      !(Array.prototype instanceof Array) && Array.prototype.length === 0;`);
});

test('push mutates current heap state and returns new length through aliases and call', () => {
  const [, context] = compare(`const array = [1], alias = array, push = array.push;
    const empty = push.call(array); array[0] = 3;
    const length = push.call(alias, true, undefined, { value: 4 });
    const proof = empty === 1 && length === 4 && array.length === 4 && alias[0] === 3 &&
      array[1] === true && array[2] === undefined && array.hasOwnProperty("2") && array[3].value === 4;`);
  expect(getArrayElements(context.value.scope.array as TArray<Any>, nodeInitialExecutionContext)).toHaveLength(1);
  expect(getArrayElements(context.value.scope.array as TArray<Any>, context)).toHaveLength(4);
});

test('holes stay absent while own undefined stays present during append', () => {
  compare(`const array = [, undefined, , 3];
    const length = array.push(4);
    const proof = length === 5 && !array.hasOwnProperty("0") && array.hasOwnProperty("1") &&
      !array.hasOwnProperty("2") && array[3] === 3 && array[4] === 4;`);
});

test('method lookup and argument expressions precede push using their current effects and identities', () => {
  compare(`const array = [], value = {}; let trace = "";
    function argument(label, result) { trace = trace + label; return result; }
    const length = array.push(argument("first;", value), argument("second;", array));
    const saved = array.push; array.push = function() { trace = trace + "own;"; return 99; };
    const own = array.push(); const finalLength = saved.call(array, 7);
    const proof = trace === "first;second;own;" && length === 2 && own === 99 && finalLength === 3 &&
      array[0] === value && array[1] === array && array[2] === 7;`);
});

test('shared inherited legacy methods retain reverse/join/slice behavior without fake own methods', () => {
  compare(`const array = [1, 2], second = [3]; const copied = array.slice(1);
    const proof = array.join === second.join && array.reverse === second.reverse && array.slice === second.slice &&
      !array.hasOwnProperty("reverse") && !array.hasOwnProperty("slice") && array.reverse() === array &&
      array.join("|") === "2|1" && copied.length === 1 && copied[0] === 2;`);
});

test.each(['slice()', 'join()', 'reverse()'])('sparse legacy %s stops at current inherited indexed elements', operation => {
  const source = `Object.prototype[0] = 7; const array = [, 2]; array.${operation};`;
  const result = run(source);
  expect(isExecutionBoundary(result[0])).toBe(true);
  expect(getArrayElements(result[1].value.scope.array as TArray<Any>, result[1])).toHaveLength(2);
  expect(Object.prototype.hasOwnProperty.call(getArrayElements(result[1].value.scope.array as TArray<Any>, result[1]), 0)).toBe(false);
});

test('inherited indexed regression cases have independently observed Node behavior', () => {
  for (const source of [
    'const copied = array.slice(); const proof = copied[0] === 7 && copied.hasOwnProperty("0");',
    'const proof = array.join() === "7,2";',
    'array.reverse(); const proof = array[1] === 7 && array.hasOwnProperty("1");'
  ]) {
    const native = execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
      ['-e', 'Object.prototype[0] = 7; const array = [, 2]; ' + source + ' process.stdout.write(JSON.stringify(proof));'],
      { encoding: 'utf8', timeout: 10000, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } });
    expect(native).toBe('true');
  }
});

test('legacy sparse methods preserve absent versus own undefined and unaffected inherited indices', () => {
  compare(`Object.prototype[0] = 7; Object.prototype[9] = 9;
    const array = [undefined, , 2], copied = array.slice();
    const joined = array.join(); array.reverse();
    const proof = copied.hasOwnProperty("0") && copied[0] === undefined && !copied.hasOwnProperty("1") &&
      joined === ",,2" && array[0] === 2 && !array.hasOwnProperty("1") && array.hasOwnProperty("2") && array[2] === undefined;`);
});

test.each(['slice()', 'join()', 'reverse()'])('conditional inherited indexed state cannot fabricate a %s result', operation => {
  const result = run(`const array = [, 2]; if (selected) Object.prototype[0] = 7; array.${operation};`, { selected: ESBoolean() });
  expect(isExecutionBoundary(result[0])).toBe(true);
});

test('nested join checks inherited holes; push still preserves inherited reads without materializing holes', () => {
  expect(isExecutionBoundary(run('Object.prototype[0] = 7; const array = [[, 2]]; array.join();')[0])).toBe(true);
  compare(`Object.prototype[0] = 7; const array = [, 2]; array.push(3);
    const proof = array[0] === 7 && !array.hasOwnProperty("0") && array.length === 3 && array[2] === 3;`);
});

test.each(['slice', 'join', 'reverse'])('sparse custom lookup cannot be silently ignored by %s', method => {
  const elements = [ESNumber(1)]; elements.length = 2;
  const custom = Object.assign(ESArray(elements), { prototype: ESObject({ 1: ESNumber(7) }) });
  const hooked = Object.assign(ESArray(elements), { propertyAccess: {
    read() { throw new Error('unverified getter must not execute'); }, write() { return undefined; }
  } });
  for (const array of [custom, hooked]) {
    expect(isExecutionBoundary(run(`Array.prototype.${method}.call(array);`, { array })[0])).toBe(true);
  }
});

test('a proved absent inherited index remains usable after a conditional prototype write', () => {
  const [, context] = run(`const array = [, 2]; if (selected) Object.prototype[0] = 7;
    const proof = selected ? true : array.join() === ",2";`, { selected: ESBoolean() });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
});

test('symbolic element values and same-length conditional mutations retain correlations after joining', () => {
  const selected = ESBoolean(), value = ESBoolean();
  const [, context] = run(`const array = [];
    if (selected) array.push(value); else array.push(7);
    const length = array.push(9);
    const proof = length === 2 && array[1] === 9 && (selected ? array[0] === value : array[0] === 7);
    const unknown = array[0] === 7;`, { selected, value });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(context.value.scope.unknown as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test('finite receiver choices mutate only the selected identity and preserve normal siblings', () => {
  const selected = ESBoolean();
  const [, context] = run(`const first = [], second = []; const receiver = selected ? first : second;
    const length = Array.prototype.push.call(receiver, 4);
    const proof = length === 1 && (selected ? first.length === 1 && second.length === 0 : second.length === 1 && first.length === 0);`, { selected });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  const outcomes = leaves(run('const receiver = selected ? {} : []; receiver.result = Array.prototype.push.call(receiver, 1);', { selected }));
  expect(outcomes.some(([value]) => isExecutionBoundary(value))).toBe(true);
  expect(outcomes.some(([value]) => value === Undefined)).toBe(true);
});

test.each(['null', 'undefined'])('nullish receiver %s throws TypeError with an honest unknown diagnostic', receiver => {
  compare(`let caught = false; try { Array.prototype.push.call(${receiver}, 1); }
    catch (error) { caught = error instanceof TypeError; } const proof = caught;`);
  const [, context] = run(`let unknown; try { Array.prototype.push.call(${receiver}); }
    catch (error) { unknown = error.message === "invented message"; }`);
  expect(resolveBoolean(context.value.scope.unknown as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test.each([
  'Array(1)', 'new Array(1, 2)', 'Array.prototype.push.call({ length: 0 }, 1)',
  'Array.prototype.push.call("text", 1)', 'Array.prototype.push(1)',
  'Array.prototype.push = function() {}', 'Array.prototype[0] = 1', 'Array.prototype.length = 1',
  'Array.prototype.reverse.call(Array.prototype)', 'Array.prototype.map', '[].filter', 'Array.from'
])('remaining constructor, receiver, prototype and descriptor boundary: %s', source => {
  const result = run(source);
  expect(isExecutionBoundary(result[0])).toBe(true);
});

test('unknown or merged-length array states stop rather than overwriting a guessed suffix', () => {
  const selected = ESBoolean();
  expect(isExecutionBoundary(run('const array = []; if (selected) array.push(1); array.push(2);', { selected })[0])).toBe(true);
  for (const array of [ESArray(), ESArray([ESArray([ESNumber(1)]), ESArray()], 'segments'),
    symbolicNumberArray({ element: ESNumber() })]) {
    expect(isExecutionBoundary(run('array.push(2);', { array })[0])).toBe(true);
  }
});

test('accessor/exotic array receivers stop before a hidden mutation or fabricated success', () => {
  const array = Object.assign(ESArray([ESNumber(1)]), { propertyAccess: {
    read() { return undefined; }, write() { throw new Error('must not invoke hidden setter'); }
  } });
  const [value] = run('Array.prototype.push.call(array, 2);', { array });
  expect(isExecutionBoundary(value)).toBe(true);
});

test.each(['built-ins/Array/prototype/push/S15.4.4.7_A1_T1.js',
  'built-ins/Array/prototype/push/S15.4.4.7_A6.7.js', 'language/expressions/instanceof/S11.8.6_A7_T2.js'])('complete selected upstream case agrees independently with pinned Node: %s', name => {
  const file = loadTest262(name);
  const harness = readFileSync(join(test262Root, 'harness/sta.js'), 'utf8');
  for (const directive of ['', '"use strict";\n']) {
    expect(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
      ['-e', 'const vm = require("node:vm"), context = vm.createContext();' +
        'vm.runInContext(' + JSON.stringify(harness) + ', context);' +
        'vm.runInContext(' + JSON.stringify(directive + file.contents) + ', context); process.stdout.write("passed");'],
      { encoding: 'utf8', timeout: 10000, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } })).toBe('passed');
  }
});

// Descriptor creation and own-key enumeration predate this slice and remain
// legacy diagnostic stops; they cannot install an unmodeled non-writable length.
test('remaining descriptor and enumeration APIs stop explicitly', () => {
  expect(() => run('Object.keys([])')).toThrow('Own property enumeration is not yet supported');
  expect(() => run('Object.defineProperty([], "length", { writable: false })')).toThrow('Value is not callable');
});

test('maximum array length permits a no-op and explicitly stops overflowing writes', () => {
  const array = ESArray<Any>([]);
  array.value = new Array(0xffffffff);
  array.properties.length = ESNumber(0xffffffff);
  expect(run('const length = array.push();', { array })[1].value.scope.length).toMatchObject({ value: 0xffffffff });
  const result = run('array.push(1);', { array });
  expect(isExecutionBoundary(result[0])).toBe(true);
  expect(getArrayElements(array, result[1])).toBe(array.value);
});

test('nested argument mutations set the current append position; thrown arguments prevent invocation', () => {
  compare(`const array = []; const length = array.push(array.push(1));
    let caught = false; function fail() { throw 3; }
    try { array.push(fail()); } catch (error) { caught = error === 3; }
    const proof = length === 2 && array.length === 2 && array[0] === 1 && array[1] === 1 && caught &&
      typeof Array.prototype.push === "function" && Array.prototype.push.name === "push" &&
      Array.prototype.push.length === 1 && Array.prototype.push.prototype === undefined;`);
});

test('missing Number constants cannot make a deferred whole upstream case pass accidentally', () => {
  expect(() => run('const array = []; array.push(Number.POSITIVE_INFINITY);')).toThrow(/Unmodeled.*POSITIVE_INFINITY/);
});

test.each([
  { unmodeledPropertyReads: ['length'] }, { unmodeledPropertyWrites: ['1'] },
  { unmodeledOwnPropertyInspection: 'custom descriptors' },
  { unmodeledPrototype: 'custom prototype' }, { unknownProperties: 'custom layout' }
])('push preserves explicit embedding boundaries: %p', metadata => {
  const array = Object.assign(ESArray([ESNumber(1)]), metadata);
  const result = run('Array.prototype.push.call(array, 2);', { array });
  expect(isExecutionBoundary(result[0])).toBe(true);
  expect(getArrayElements(array, result[1])).toHaveLength(1);
});
