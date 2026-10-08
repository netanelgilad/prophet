import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { evaluateCode, nodeInitialExecutionContext } from '../src';
import { Array as ESArray, TArray } from '../src/array/Array';
import { forEach } from '../src/array/forEach';
import { symbolicNumberArray } from '../src/array/symbolic';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { BranchResult } from '../src/execution-context/branches';
import { ExecutionContext, setVariablesInScope } from '../src/execution-context/ExecutionContext';
import { isExecutionBoundary, isForkedCompletion } from '../src/execution-context/Completion';
import { getArrayElements } from '../src/execution-context/Heap';
import { randomNumber, resolveBoolean } from '../src/symbolic';
import { Any, ESNumber, Undefined, isThrownValue } from '../src/types';
import { ESObject } from '../src/Object';
import { toPrimitiveSymbol } from '../src/Object/wellKnownSymbols';
import { captureExecutionBoundary } from '../src/execution-context/analysis-failure';
import { getObjectPrototype } from '../src/Object/prototype';
import { getArrayPrototype } from '../src/array/Array';
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

test('forEach is shared and inherited with name, length and non-construction metadata', () => {
  compare(`const first = [1], second = [2];
    const proof = first.forEach === second.forEach && first.forEach === Array.prototype.forEach &&
      !first.hasOwnProperty("forEach") && first instanceof Array && !(Array.prototype instanceof Array) &&
      typeof Array.prototype.forEach === "function" && Array.prototype.forEach.name === "forEach" &&
      Array.prototype.forEach.length === 1 && Array.prototype.forEach.prototype === undefined;`);
});

test('construction through forEach throws TypeError without analysis support', () => {
  compare(`let caught = false; try { new Array.prototype.forEach([1]); }
    catch (error) { caught = error instanceof TypeError; } const proof = caught;`);
});

test('nonempty arrays iterate in increasing index order with value, index and receiver identity', () => {
  compare(`const array = [10, 20, 30]; const seen = [];
    const result = array.forEach(function(value, index, receiver) {
      seen.push([value, index, receiver === array]); return 99; });
    const proof = result === undefined && seen.length === 3 &&
      seen[0][0] === 10 && seen[0][1] === 0 && seen[0][2] === true &&
      seen[1][0] === 20 && seen[1][1] === 1 && seen[1][2] === true &&
      seen[2][0] === 30 && seen[2][1] === 2 && seen[2][2] === true;`);
});

test('holes are skipped while own undefined elements are visited', () => {
  compare(`const array = [, undefined, , 3]; const seen = [];
    const result = array.forEach((value, index) => { seen.push([index, value]); });
    const proof = result === undefined && seen.length === 2 &&
      seen[0][0] === 1 && seen[0][1] === undefined && seen[1][0] === 3 && seen[1][1] === 3 &&
      !array.hasOwnProperty("0") && array.hasOwnProperty("1");`);
});

test('ordinary inherited indexed values are visited through shared lookup', () => {
  compare(`Object.prototype[1] = 7; const seen = [];
    [, ,].forEach((value, index) => { seen.push([index, value]); });
    const proof = seen.length === 1 && seen[0][0] === 1 && seen[0][1] === 7;`);
});

test('callback writes to later elements are visible while appends beyond the captured length are not', () => {
  compare(`const array = [1, 2, 3]; const seen = [];
    array.forEach((value, index) => { if (index === 0) array[2] = 99; seen.push(value); });
    const proof = seen.length === 3 && seen[0] === 1 && seen[1] === 2 && seen[2] === 99;`);
  compare(`const array = [1]; let calls = 0;
    array.forEach(() => { calls = calls + 1; array.push(9); });
    const proof = calls === 1 && array.length === 2 && array[1] === 9;`);
});

test('elements added inside the captured range are visited; indices beyond it are not', () => {
  compare(`const array = [1, 2, , 4, 5]; let callCnt = 0;
    array.forEach(() => { callCnt = callCnt + 1; array[2] = 3; array[5] = 6; });
    const proof = callCnt === 5 && array.length === 6 && array[2] === 3 && array[5] === 6;`);
});

test('shrinking the length skips later indices without stopping iteration', () => {
  compare(`const array = [1, 2, 3, 4]; const seen = [];
    array.forEach((value, index) => { seen.push(value); if (index === 0) array.length = 1; });
    const proof = seen.length === 1 && seen[0] === 1 && array.length === 1;`);
});

test('expandos and non-index properties are not visited', () => {
  // Boolean computed keys need general ToPropertyKey conversion (OBJ-003);
  // the visited-prefix behavior is pinned here with an ordinary string expando.
  compare(`const array = [1, 2, 3, 4, 5]; array["i"] = 10;
    let callCnt = 0; array.forEach(() => { callCnt = callCnt + 1; });
    const proof = callCnt === 5;`);
});

test('empty arrays call nothing and return undefined', () => {
  compare(`let accessed = false;
    const result = [].forEach(() => { accessed = true; });
    const proof = result === undefined && accessed === false;`);
});

test.each(['null', 'undefined', '5', 'true'])('noncallable callback %s throws even on empty and holey arrays', callback => {
  compare(`let empty = false, holey = false;
    try { [].forEach(${callback}); } catch (error) { empty = error instanceof TypeError; }
    try { [, ,].forEach(${callback}); } catch (error) { holey = error instanceof TypeError; }
    const proof = empty && holey;`);
});

test.each(['null', 'undefined'])('nullish receiver %s throws TypeError with an honest unknown diagnostic', receiver => {
  compare(`let caught = false; try { Array.prototype.forEach.call(${receiver}, () => {}); }
    catch (error) { caught = error instanceof TypeError; } const proof = caught;`);
  const [, context] = run(`let unknown; try { Array.prototype.forEach.call(${receiver}, () => {}); }
    catch (error) { unknown = error.message === "invented message"; }`);
  expect(resolveBoolean(context.value.scope.unknown as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test('ordinary thisArg keeps its identity; strict callbacks see undefined; arrows keep lexical this', () => {
  compare(`const o = { res: true }; let result;
    [1].forEach(function() { result = this.res; }, o);
    const proof = result === true;`);
  compare(`let got = "unset";
    [1].forEach(function() { "use strict"; got = this; });
    const proof = got === undefined;`);
  compare(`const o = { tag: 1 }; let got;
    [1].forEach(() => { got = this; }, o);
    const proof = got !== o;`);
});

test('sloppy callbacks without thisArg share one object receiver', () => {
  compare(`let first, second;
    [1].forEach(function() { first = this; });
    [2].forEach(function() { second = this; });
    const proof = first !== undefined && first === second;`);
});

test('guest throws stop later calls and preserve earlier effects', () => {
  compare(`const array = [1, 2, 3]; const seen = []; let caught = "";
    try { array.forEach((value, index) => { seen.push(value); if (index === 1) throw new Error("boom"); }); }
    catch (error) { caught = error.message; }
    const proof = seen.length === 2 && seen[0] === 1 && seen[1] === 2 && caught === "boom" &&
      array.length === 3;`);
});

test('symbolic element values retain correlations while unresolved comparisons stay unknown', () => {
  // Bare unknown numbers cannot prove self-equality (NaN): finite element
  // facts establish the correlation while an independent element stays unknown.
  const value = randomNumber(), other = randomNumber();
  const [, context] = run(`const array = [value, 7]; const seen = [];
    array.forEach((element) => { seen.push(element); });
    const proof = seen.length === 2 && seen[0] === value && seen[1] === 7;
    const unknown = seen[0] === other;`, { value, other });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(context.value.scope.unknown as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test('finite receiver choices iterate only the selected identity', () => {
  const selected = ESBoolean();
  const [, context] = run(`const first = [1], second = [2, 3];
    const receiver = selected ? first : second;
    let count = 0; receiver.forEach(() => { count = count + 1; });
    const proof = selected ? count === 1 : count === 2;`, { selected });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
});

test('conditional callback choices correlate their effects per path', () => {
  const selected = ESBoolean();
  const [, context] = run(`const log = [];
    const yes = (value) => { log.push(1); };
    const no = (value) => { log.push(2); };
    [7].forEach(selected ? yes : no);
    const proof = log.length === 1 && (selected ? log[0] === 1 : log[0] === 2);`, { selected });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
});

test('a guest throw on one symbolic path survives beside its normal sibling', () => {
  const selected = ESBoolean();
  const result = run(`let count = 0;
    [1, 2].forEach((value) => { count = count + 1; if (selected && value === 2) throw 9; });`, { selected });
  expect(isExecutionBoundary(result[0])).toBe(false);
  expect(isForkedCompletion(result[0])).toBe(true);
  const outcomes = leaves(result);
  expect(outcomes).toHaveLength(2);
  const thrown = outcomes.filter(([value]) => isThrownValue(value));
  const normal = outcomes.filter(([value]) => !isThrownValue(value));
  expect(thrown).toHaveLength(1);
  expect(normal).toHaveLength(1);
  expect((thrown[0][0] as { value: Any }).value).toMatchObject({ value: 9 });
  expect(thrown[0][1].value.scope.count).toMatchObject({ value: 2 });
  expect(normal[0][1].value.scope.count).toMatchObject({ value: 2 });
});

test('a supported sibling survives a typed unsupported conditional callback', () => {
  const selected = ESBoolean();
  const seen = ESArray([]);
  const outcomes = leaves(run(`[0].forEach(selected ? (value) => { seen.push(value); } : (value) => { seen.push(value); [].map((item) => item); });`,
    { selected, seen }));
  expect(outcomes.some(([value]) => isExecutionBoundary(value))).toBe(true);
  const survived = outcomes.filter(([value]) => !isExecutionBoundary(value));
  expect(survived).toHaveLength(1);
  expect(getArrayElements(survived[0][1].value.scope.seen as TArray<Any>, survived[0][1])).toHaveLength(1);
  const stopped = outcomes.filter(([value]) => isExecutionBoundary(value));
  expect(stopped).toHaveLength(1);
  expect(getArrayElements(stopped[0][1].value.scope.seen as TArray<Any>, stopped[0][1])).toHaveLength(1);
});

test('conditional inherited writes visit each presence path with correlated effects', () => {
  const selected = ESBoolean();
  const [, context] = run(`let seen = -1;
    const array = [,];
    if (selected) Object.prototype[0] = 7;
    array.forEach((value) => { seen = value; });
    const proof = selected ? seen === 7 : seen === -1;`, { selected });
  expect(isExecutionBoundary(context.value.scope.proof as Any)).toBe(false);
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
});

test('unresolved inherited index state stops holey iteration but leaves dense arrays alone', () => {
  const objectPrototype = getObjectPrototype();
  const savedUnknown = objectPrototype.unknownProperties;
  try {
    Object.assign(objectPrototype, { unknownProperties: 'possible inherited forEach index' });
    expect(isExecutionBoundary(run('[1, 2].forEach(() => {});')[0])).toBe(false);
    expect(isExecutionBoundary(run('[,].forEach(() => {});')[0])).toBe(true);
  } finally {
    if (savedUnknown === undefined) delete objectPrototype.unknownProperties;
    else objectPrototype.unknownProperties = savedUnknown;
  }
  compare(`const seen = []; [1, 2].forEach((value) => { seen.push(value); });
    const proof = seen.length === 2 && seen[0] === 1 && seen[1] === 2;`);
});

test('a later layout boundary preserves effects of completed callback visits', () => {
  const flag = ESBoolean();
  const result = run(`const a = [1, 2]; let seen = 0, caught = false;
    try { a.forEach(function(value, index) {
      seen = seen + 1;
      if (index === 0 && flag) a.push(9);
    }); } catch (error) { caught = true; }`, { flag });
  expect(isExecutionBoundary(result[0])).toBe(true);
  expect(result[1].value.scope.seen).toMatchObject({ value: 1 });
  expect(result[1].value.scope.caught).toMatchObject({ value: false });
});

test('unknown inherited state is encountered after the dense prefix, not before it', () => {
  const objectPrototype = getObjectPrototype(), saved = objectPrototype.unknownProperties;
  Object.assign(objectPrototype, { unknownProperties: 'possible inherited numeric field' });
  try {
    const result = run(`let seen = 0, caught = false;
      try { [1, ,].forEach(function() { seen = seen + 1; }); }
      catch (error) { caught = true; }`);
    expect(isExecutionBoundary(result[0])).toBe(true);
    expect(result[1].value.scope.seen).toMatchObject({ value: 1 });
    expect(result[1].value.scope.caught).toMatchObject({ value: false });
  } finally {
    if (saved === undefined) delete objectPrototype.unknownProperties;
    else objectPrototype.unknownProperties = saved;
  }
});

test('unrelated inherited symbol slots do not change a string-index lookup', () => {
  // String-index HasProperty/Get never consult well-known-symbol slots (the
  // spreadability lookup does, but this algorithm performs no such lookup),
  // so they cannot stop iteration here.
  const objectPrototype = getObjectPrototype(), arrayPrototype = getArrayPrototype();
  const savedObjectSlots = objectPrototype.wellKnownSymbols;
  const savedArraySlots = arrayPrototype.wellKnownSymbols;
  try {
    Object.assign(objectPrototype, { wellKnownSymbols: new Map([[toPrimitiveSymbol, ESBoolean(true)]]) });
    const objectResult = run(`let seen = 0; [1, ,].forEach(function() { seen = seen + 1; });
      const proof = seen === 1;`);
    expect(isExecutionBoundary(objectResult[0])).toBe(false);
    expect(resolveBoolean(objectResult[1].value.scope.proof as ReturnType<typeof ESBoolean>,
      objectResult[1].value.knowledge)).toBe(true);
  } finally {
    if (savedObjectSlots === undefined) delete objectPrototype.wellKnownSymbols;
    else objectPrototype.wellKnownSymbols = savedObjectSlots;
  }
  try {
    Object.assign(arrayPrototype, { wellKnownSymbols: new Map([[toPrimitiveSymbol, ESBoolean(false)]]) });
    const arrayResult = run(`let seen = 0; [1, ,].forEach(function() { seen = seen + 1; });
      const proof = seen === 1;`);
    expect(isExecutionBoundary(arrayResult[0])).toBe(false);
    expect(arrayResult[1].value.scope.proof).toMatchObject({ value: true });
  } finally {
    if (savedArraySlots === undefined) delete arrayPrototype.wellKnownSymbols;
    else arrayPrototype.wellKnownSymbols = savedArraySlots;
  }
});

test('a later inherited lookup stop does not erase an already thrown sibling', () => {
  const objectPrototype = getObjectPrototype(), saved = objectPrototype.unknownProperties;
  Object.assign(objectPrototype, { unknownProperties: 'unresolved inherited index' });
  try {
    const flag = ESBoolean();
    const result = run(`let seen = 0;
      [1, ,].forEach(function() { seen = seen + 1; if (flag) throw 9; });`, { flag });
    expect(isForkedCompletion(result[0])).toBe(true);
    const outcomes = leaves(result);
    expect(outcomes.some(([value]) => isExecutionBoundary(value))).toBe(true);
    expect(outcomes.some(([value]) => isThrownValue(value))).toBe(true);
    for (const [, after] of outcomes) expect(after.value.scope.seen).toMatchObject({ value: 1 });
  } finally {
    if (saved === undefined) delete objectPrototype.unknownProperties;
    else objectPrototype.unknownProperties = saved;
  }
});

test('typed unsupported, budget and guest-throw completions stay distinct', () => {
  const thrown = run('[1, 2, 3].forEach((value, index) => { if (index === 1) throw 9; });');
  expect(isExecutionBoundary(thrown[0])).toBe(false);
  expect(isThrownValue(thrown[0])).toBe(true);
  const unsupported = run('[1].forEach(() => [].map((item) => item));');
  expect(isThrownValue(unsupported[0])).toBe(false);
  expect(unsupported[0]).toMatchObject({ type: 'ExecutionBoundary', kind: 'unsupported' });
  const [, base] = run('const cb = (value) => value;');
  const budgeted = ExecutionContext({ ...base.value, evaluationBudget: { remaining: 0 } });
  const [budgetValue] = captureExecutionBoundary(budgeted, () =>
    forEach(ESArray([ESNumber(1)]), [budgeted.value.scope.cb as Any], budgeted));
  expect(isThrownValue(budgetValue)).toBe(false);
  expect(budgetValue).toMatchObject({ type: 'ExecutionBoundary', kind: 'budget' });
});

test('aliases observe callback writes; earlier snapshots survive; closure effects persist', () => {
  const [, context] = compare(`const array = [1, 2], alias = array, log = [];
    array.forEach((value, index) => { log.push(value); if (index === 0) array[1] = 9; });
    const proof = log.length === 2 && log[0] === 1 && log[1] === 9 &&
      alias[1] === 9 && array[1] === 9;`);
  expect(getArrayElements(context.value.scope.array as TArray<Any>, nodeInitialExecutionContext)).toHaveLength(2);
  expect(getArrayElements(context.value.scope.array as TArray<Any>, context)).toHaveLength(2);
  expect(getArrayElements(context.value.scope.log as TArray<Any>, context)).toHaveLength(2);
});

test('same-length conditional writes stay correlated after the join', () => {
  const selected = ESBoolean();
  const [, context] = run(`const array = [1, 2];
    if (selected) array[0] = 9;
    const seen = []; array.forEach((value) => { seen.push(value); });
    const proof = seen.length === 2 && seen[1] === 2 &&
      (selected ? seen[0] === 9 : seen[0] === 1);`, { selected });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
});

test.each([
  'Array(1)', 'new Array(1, 2)', 'Array.prototype.forEach.call({ length: 1, 0: 7 }, () => {})',
  'Array.prototype.forEach.call("text", () => {})', 'Array.prototype.forEach.call(Array.prototype, () => {})',
  'Array.prototype.forEach = function() {}', 'Array.prototype[0] = 1',
  'Array.prototype.map', '[].filter', 'Array.from'
])('remaining constructor, receiver, prototype and descriptor boundary: %s', source => {
  const result = run(source);
  expect(isExecutionBoundary(result[0])).toBe(true);
});

test('unknown, segmented or symbolic-layout arrays stop rather than guessing elements', () => {
  for (const array of [ESArray(), ESArray([ESArray([ESNumber(1)]), ESArray()], 'segments'),
    symbolicNumberArray({ element: ESNumber() })]) {
    expect(isExecutionBoundary(run('[0].forEach.call(array, () => {});', { array })[0])).toBe(true);
    expect(isExecutionBoundary(run('array.forEach(() => {});', { array })[0])).toBe(true);
  }
});

test('accessor/exotic array receivers stop before a hidden read or fabricated visit', () => {
  const array = Object.assign(ESArray([ESNumber(1)]), { propertyAccess: {
    read() { return undefined; }, write() { throw new Error('must not invoke hidden setter'); }
  } });
  expect(isExecutionBoundary(run('Array.prototype.forEach.call(array, () => {});', { array })[0])).toBe(true);
  expect(isExecutionBoundary(run('array.forEach(() => {});', { array })[0])).toBe(true);
});

test.each([
  { unmodeledPropertyReads: ['length'] }, { unmodeledOwnPropertyInspection: 'custom descriptors' },
  { unmodeledPrototype: 'custom prototype' }, { unknownProperties: 'custom layout' }
])('forEach preserves explicit embedding boundaries: %p', metadata => {
  // Method lookup on the dirty receiver itself is a pre-existing host
  // assertion outside this task; the shared operation is reached through an
  // explicit .call, mirroring the concat receiver-boundary precedent.
  const array = Object.assign(ESArray([ESNumber(1)]), metadata);
  expect(isExecutionBoundary(run('Array.prototype.forEach.call(array, () => {});', { array })[0])).toBe(true);
});

test('sparse custom lookup cannot be silently ignored by forEach', () => {
  const elements = [ESNumber(1)]; elements.length = 2;
  const custom = Object.assign(ESArray(elements), { prototype: ESObject({ 1: ESNumber(7) }) });
  const hooked = Object.assign(ESArray(elements), { propertyAccess: {
    read() { throw new Error('unverified getter must not execute'); }, write() { return undefined; }
  } });
  for (const array of [custom, hooked]) {
    expect(isExecutionBoundary(run('Array.prototype.forEach.call(array, () => {});', { array })[0])).toBe(true);
  }
});

test('direct implementation calls apply the same boundary capture as the evaluator', () => {
  const [, scope] = run('const cb = (value) => value;');
  const callback = scope.value.scope.cb as Any;
  const small = ESArray([ESNumber(1)]);
  const [thrown] = captureExecutionBoundary(nodeInitialExecutionContext, () =>
    forEach(small, [ESNumber(5)], nodeInitialExecutionContext));
  expect(isThrownValue(thrown)).toBe(true);
  const dense = (count: number) =>
    ESArray(Array.from({ length: count }, (_, index) => ESNumber(index)));
  const [overValue, after] = captureExecutionBoundary(nodeInitialExecutionContext, () =>
    forEach(dense(1025), [callback], nodeInitialExecutionContext));
  expect(overValue).toMatchObject({ type: 'ExecutionBoundary', kind: 'unsupported' });
  expect(getArrayElements(dense(1025), after)).toHaveLength(1025);
});

test('cumulative visits respect the documented element limit without invoking extra callbacks', () => {
  const dense = (count: number) =>
    ESArray(Array.from({ length: count }, (_, index) => ESNumber(index)));
  const atLimit = dense(1024);
  const [, under] = run(`const out = []; const result = array.forEach((value, index) => { out.push(index); });
    const proof = result === undefined && out.length === 1024 && out[0] === 0 && out[1023] === 1023;`,
    { array: atLimit });
  expect(under.value.scope.result).toBe(Undefined);
  expect(under.value.scope.proof).toMatchObject({ value: true });
  expect(getArrayElements(under.value.scope.out as TArray<Any>, under)).toHaveLength(1024);
  const justOver = dense(1025);
  const over = run('array.forEach((value) => value);', { array: justOver });
  expect(isExecutionBoundary(over[0])).toBe(true);
  expect(getArrayElements(justOver, over[1])).toHaveLength(1025);
});

test('maximum array length stops explicitly instead of iterating outside the VM budget', () => {
  const array = ESArray<Any>([]);
  array.value = new Array(0xffffffff);
  array.properties.length = ESNumber(0xffffffff);
  const result = run('array.forEach(() => {});', { array });
  expect(isExecutionBoundary(result[0])).toBe(true);
  expect(getArrayElements(array, result[1])).toBe(array.value);
});

test('callback-added appends beyond the captured range never extend host iteration', () => {
  const result = run(`const array = [1]; let calls = 0;
    array.forEach(() => { calls = calls + 1; array.push(9); });
    const proof = calls === 1;`);
  expect(isExecutionBoundary(result[0])).toBe(false);
  expect(result[1].value.scope.proof).toMatchObject({ value: true });
});

test('missing Number constants cannot make a deferred whole upstream case pass accidentally', () => {
  expect(() => run('const array = []; array.forEach(Number.POSITIVE_INFINITY);')).toThrow(/Unmodeled.*POSITIVE_INFINITY/);
});

test.each(['built-ins/Array/prototype/forEach/15.4.4.18-1-1.js',
  'built-ins/Array/prototype/forEach/15.4.4.18-1-2.js',
  'built-ins/Array/prototype/forEach/15.4.4.18-2-2.js',
  'built-ins/Array/prototype/forEach/15.4.4.18-5-2.js',
  'built-ins/Array/prototype/forEach/15.4.4.18-7-1.js',
  'built-ins/Array/prototype/forEach/15.4.4.18-8-1.js',
  'built-ins/Array/prototype/forEach/15.4.4.18-8-13.js'])('complete selected upstream case agrees independently with pinned Node: %s', name => {
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
