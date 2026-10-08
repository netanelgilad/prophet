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
import { randomNumber, resolveBoolean } from '../src/symbolic';
import { Any, ESNumber } from '../src/types';
import { ESObject } from '../src/Object';
import { captureExecutionBoundary } from '../src/execution-context/analysis-failure';
import { getObjectPrototype } from '../src/Object/prototype';
import { getArrayPrototype } from '../src/array/Array';
import { concat } from '../src/array/concat';
import { toPrimitiveSymbol } from '../src/Object/wellKnownSymbols';
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

test('concat is shared and inherited; results are fresh ordinary arrays', () => {
  compare(`const first = [1], second = [2];
    const proof = first.concat === second.concat && first.concat === Array.prototype.concat &&
      !first.hasOwnProperty("concat") && first instanceof Array && !(Array.prototype instanceof Array);`);
});

test('ordinary arrays, primitives and empty arrays concatenate in order without mutating inputs', () => {
  const [, context] = compare(`const array = [1, 2], other = [3], empty = [], value = { marker: 5 };
    const out = array.concat(other, 4, empty, "s", null, undefined, true, value);
    const proof = out.length === 9 && out[0] === 1 && out[1] === 2 && out[2] === 3 && out[3] === 4 &&
      out[4] === "s" && out[5] === null && out[6] === undefined && out[7] === true && out[8] === value &&
      out !== array && out !== other && array.length === 2 && other.length === 1 && empty.length === 0;`);
  expect(getArrayElements(context.value.scope.array as TArray<Any>, nodeInitialExecutionContext)).toHaveLength(2);
  expect(getArrayElements(context.value.scope.array as TArray<Any>, context)).toHaveLength(2);
  expect(getArrayElements(context.value.scope.out as TArray<Any>, context)).toHaveLength(9);
});

test('holes stay absent while own undefined stays present in the fresh result', () => {
  compare(`const sparse = [, undefined, , 3];
    const out = sparse.concat([, 5]);
    const proof = out.length === 6 && !out.hasOwnProperty("0") && out.hasOwnProperty("1") &&
      !out.hasOwnProperty("2") && out[3] === 3 && !out.hasOwnProperty("4") && out[5] === 5 &&
      sparse.length === 4 && !sparse.hasOwnProperty("0");`);
});

test('no-argument concat still copies by value with a fresh identity', () => {
  compare(`const array = [0, 1]; const out = array.concat();
    const proof = out.length === 2 && out[0] === 0 && out[1] === 1 && out !== array;`);
});

test('aliases observe current state and self-concatenation keeps the same reference twice', () => {
  compare(`const array = [1], alias = array;
    const out = alias.concat(array);
    const proof = out.length === 2 && out[0] === 1 && out[1] === 1 && array.length === 1;`);
});

test('receiver and argument expressions evaluate in order using current effects', () => {
  compare(`const array = [1]; let trace = "";
    function argument(label, result) { trace = trace + label; return result; }
    const inner = array.push(argument("grow;", 2));
    const out = array.concat(argument("first;", 3), argument("second;", [4]));
    const saved = array.concat; array.concat = function() { trace = trace + "own;"; return 99; };
    const own = array.concat(); const finalOut = saved.call(array, 5);
    const proof = trace === "grow;first;second;own;" && inner === 2 &&
      out.length === 4 && out[0] === 1 && out[1] === 2 && out[2] === 3 && out[3] === 4 &&
      own === 99 && finalOut.length === 3 && finalOut[0] === 1 && finalOut[1] === 2 && finalOut[2] === 5;`);
});

test('nested appends set the current read position; thrown arguments prevent invocation', () => {
  compare(`const array = [];
    const out = array.concat(array.push(1), array.push(2));
    let caught = false; function fail() { throw 3; }
    try { array.concat(fail()); } catch (error) { caught = error === 3; }
    const proof = out.length === 4 && out[0] === 1 && out[1] === 2 && out[2] === 1 && out[3] === 2 &&
      array.length === 2 && caught &&
      typeof Array.prototype.concat === "function" && Array.prototype.concat.name === "concat" &&
      Array.prototype.concat.length === 1 && Array.prototype.concat.prototype === undefined;`);
});

test('sparse concat stops at current inherited indexed elements', () => {
  const source = `Object.prototype[0] = 7; const array = [, 2]; array.concat([3]);`;
  const result = run(source);
  expect(isExecutionBoundary(result[0])).toBe(true);
  expect(getArrayElements(result[1].value.scope.array as TArray<Any>, result[1])).toHaveLength(2);
  expect(Object.prototype.hasOwnProperty.call(getArrayElements(result[1].value.scope.array as TArray<Any>, result[1]), 0)).toBe(false);
});

test('sparse concat on the argument side also stops at inherited indexed elements', () => {
  const source = `Object.prototype[1] = 7; const other = [, ,]; [0].concat(other);`;
  const result = run(source);
  expect(isExecutionBoundary(result[0])).toBe(true);
});

test('inherited indexed regression cases have independently observed Node behavior', () => {
  for (const source of [
    'const out = array.concat([3]); const proof = out[0] === 7 && out.hasOwnProperty("0") && out.length === 3;',
    'const out = [0].concat(other); const proof = out.length === 3 && !out.hasOwnProperty("1") && out[2] === 7 && out.hasOwnProperty("2");'
  ]) {
    const prefix = source.startsWith('const out = array') ?
      'Object.prototype[0] = 7; const array = [, 2]; ' : 'Object.prototype[1] = 7; const other = [, ,]; ';
    const native = execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
      ['-e', prefix + source + ' process.stdout.write(JSON.stringify(proof));'],
      { encoding: 'utf8', timeout: 10000, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } });
    expect(native).toBe('true');
  }
});

test('dense arrays ignore out-of-range inherited indices without materializing holes', () => {
  compare(`Object.prototype[0] = 7; Object.prototype[9] = 9;
    const out = [1, 2].concat([3]);
    const proof = out.length === 3 && out[0] === 1 && out[1] === 2 && out[2] === 3 &&
      out.hasOwnProperty("0") && out.hasOwnProperty("1") && out.hasOwnProperty("2");`);
});

test('conditional inherited indexed state cannot fabricate a concat result', () => {
  const result = run(`const array = [, 2]; if (selected) Object.prototype[0] = 7; array.concat([3]);`, { selected: ESBoolean() });
  expect(isExecutionBoundary(result[0])).toBe(true);
});

test.each(['concat'])('sparse custom lookup cannot be silently ignored by %s', method => {
  const elements = [ESNumber(1)]; elements.length = 2;
  const custom = Object.assign(ESArray(elements), { prototype: ESObject({ 1: ESNumber(7) }) });
  const hooked = Object.assign(ESArray(elements), { propertyAccess: {
    read() { throw new Error('unverified getter must not execute'); }, write() { return undefined; }
  } });
  for (const array of [custom, hooked]) {
    expect(isExecutionBoundary(run(`Array.prototype.${method}.call(array, [3]);`, { array })[0])).toBe(true);
  }
});

test('symbolic element values retain correlations while unresolved comparisons stay unknown', () => {
  // Bare unknown numbers cannot prove self-equality (NaN): finite element
  // facts establish the correlation while an independent element stays unknown.
  const value = randomNumber(), other = randomNumber();
  const [, context] = run(`const array = [value, 7];
    const out = array.concat([9]);
    const proof = out.length === 3 && out[0] === value && out[1] === 7 && out[2] === 9;
    const unknown = out[0] === other;`, { value, other });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(context.value.scope.unknown as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test('conditional array arguments spread on each path with a joined conditional result', () => {
  const selected = ESBoolean();
  const [, context] = run(`const first = [1], second = [2, 3];
    const chosen = selected ? first : second;
    const out = [0].concat(chosen);
    const proof = out.length === (selected ? 2 : 3) && out[0] === 0 &&
      (selected ? out[1] === 1 : out[1] === 2 && out[2] === 3);`, { selected });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
});

test('finite receiver choices concatenate only the selected identity', () => {
  const selected = ESBoolean();
  const [, context] = run(`const first = [1], second = [2, 3]; const receiver = selected ? first : second;
    const out = Array.prototype.concat.call(receiver, [4]);
    const proof = selected ? out.length === 2 && out[1] === 4 : out.length === 3 && out[2] === 4;`, { selected });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
});

test('a supported sibling survives a typed unsupported conditional argument', () => {
  const selected = ESBoolean();
  const exotic = Object.assign(ESArray([ESNumber(1)]), { propertyAccess: {
    read() { throw new Error('must not invoke hidden getter'); }, write() { return undefined; }
  } });
  const outcomes = leaves(run('const out = [0].concat(selected ? [1] : exotic);', { selected, exotic }));
  expect(outcomes.some(([value]) => isExecutionBoundary(value))).toBe(true);
  const survived = outcomes.filter(([value]) => !isExecutionBoundary(value));
  expect(survived).toHaveLength(1);
  expect(getArrayElements(survived[0][1].value.scope.out as TArray<Any>, survived[0][1])).toHaveLength(2);
});

test('concat reads current element state through a same-length conditional join', () => {
  const selected = ESBoolean();
  const [, context] = run(`const array = [1, 2];
    if (selected) array[0] = 9;
    const out = array.concat([3]);
    const proof = out.length === 3 && out[2] === 3 &&
      (selected ? out[0] === 9 && out[1] === 2 : out[0] === 1 && out[1] === 2);`, { selected });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
});

test.each(['null', 'undefined'])('nullish receiver %s throws TypeError with an honest unknown diagnostic', receiver => {
  compare(`let caught = false; try { Array.prototype.concat.call(${receiver}, 1); }
    catch (error) { caught = error instanceof TypeError; } const proof = caught;`);
  const [, context] = run(`let unknown; try { Array.prototype.concat.call(${receiver}); }
    catch (error) { unknown = error.message === "invented message"; }`);
  expect(resolveBoolean(context.value.scope.unknown as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test.each([
  'Array(1)', 'new Array(1, 2)', 'Array.prototype.concat.call({ length: 0 }, 1)',
  'Array.prototype.concat.call("text", 1)', 'Array.prototype.concat.call(Array.prototype, 1)',
  'Array.prototype.concat = function() {}', 'Array.prototype[0] = 1', 'Array.prototype.length = 1',
  'Array.prototype.map', '[].filter', 'Array.from'
])('remaining constructor, receiver, prototype and descriptor boundary: %s', source => {
  const result = run(source);
  expect(isExecutionBoundary(result[0])).toBe(true);
});

test('unknown, segmented or symbolic-layout arrays stop rather than guessing elements', () => {
  for (const array of [ESArray(), ESArray([ESArray([ESNumber(1)]), ESArray()], 'segments'),
    symbolicNumberArray({ element: ESNumber() })]) {
    expect(isExecutionBoundary(run('[0].concat(array);', { array })[0])).toBe(true);
    expect(isExecutionBoundary(run('array.concat([0]);', { array })[0])).toBe(true);
  }
});

test('accessor/exotic array operands stop before a hidden read or fabricated result', () => {
  const array = Object.assign(ESArray([ESNumber(1)]), { propertyAccess: {
    read() { return undefined; }, write() { throw new Error('must not invoke hidden setter'); }
  } });
  expect(isExecutionBoundary(run('Array.prototype.concat.call(array, [2]);', { array })[0])).toBe(true);
  expect(isExecutionBoundary(run('[0].concat(array);', { array })[0])).toBe(true);
});

test('constructor shadows and internal symbol slots stop before unmodeled species/spread effects', () => {
  const shadowed = ESArray([ESNumber(1)]);
  Object.assign(shadowed.properties, { constructor: ESArray([]) });
  expect(isExecutionBoundary(run('array.concat([2]);', { array: shadowed })[0])).toBe(true);
  const shadowedArg = ESArray([ESNumber(2)]);
  Object.assign(shadowedArg.properties, { constructor: ESArray([]) });
  expect(isExecutionBoundary(run('[1].concat(arg);', { arg: shadowedArg })[0])).toBe(true);
  const spreadable = ESArray([ESNumber(1)]);
  Object.assign(spreadable, { wellKnownSymbols: new Map([[toPrimitiveSymbol, ESBoolean(true)]]) });
  expect(isExecutionBoundary(run('[0].concat(spreadable);', { spreadable })[0])).toBe(true);
});

test.each([
  { unmodeledPropertyReads: ['length'] }, { unmodeledPropertyWrites: ['1'] },
  { unmodeledOwnPropertyInspection: 'custom descriptors' },
  { unmodeledPrototype: 'custom prototype' }, { unknownProperties: 'custom layout' }
])('concat preserves explicit embedding boundaries: %p', metadata => {
  const array = Object.assign(ESArray([ESNumber(1)]), metadata);
  expect(isExecutionBoundary(run('Array.prototype.concat.call(array, [2]);', { array })[0])).toBe(true);
  expect(isExecutionBoundary(run('[0].concat(array);', { array })[0])).toBe(true);
});

test('plain objects append by reference as single elements', () => {
  compare(`const value = { marker: 1 }, nested = { inner: [2] };
    const out = [0].concat(value, nested);
    const proof = out.length === 3 && out[0] === 0 && out[1] === value && out[2] === nested;`);
});

test('function arguments stop at internal symbol slots instead of ignoring spread state', () => {
  // Function.prototype carries an internal hasInstance slot, so a function
  // operand cannot prove the observable IsConcatSpreadable lookup is absent.
  const result = run(`const fn = function named() {}; const out = [0].concat(fn);`);
  expect(isExecutionBoundary(result[0])).toBe(true);
});

test('maximum array length stops explicitly instead of allocating or throwing', () => {
  const array = ESArray<Any>([]);
  array.value = new Array(0xffffffff);
  array.properties.length = ESNumber(0xffffffff);
  const empty = run('const out = array.concat();', { array });
  expect(isExecutionBoundary(empty[0])).toBe(true);
  expect(getArrayElements(array, empty[1])).toBe(array.value);
  const overflow = run('array.concat([1]);', { array });
  expect(isExecutionBoundary(overflow[0])).toBe(true);
  expect(getArrayElements(array, overflow[1])).toBe(array.value);
});

test('cumulative totals respect the documented element limit without copying', () => {
  const dense = (count: number) =>
    ESArray(Array.from({ length: count }, (_, index) => ESNumber(index)));
  const sevenHundred = dense(700), otherSevenHundred = dense(700), threeHundred = dense(300);
  const [, under] = run('const out = first.concat(second);',
    { first: sevenHundred, second: threeHundred });
  expect((under.value.scope.out as TArray<Any>).properties.length).toMatchObject({ value: 1000 });
  expect(getArrayElements(under.value.scope.out as TArray<Any>, under)).toHaveLength(1000);
  expect(getArrayElements(under.value.scope.first as TArray<Any>, under)).toHaveLength(700);
  for (const [script, input] of [
    ['const out = first.concat(second);', { first: sevenHundred, second: otherSevenHundred }],
    ['const out = first.concat(second, third);',
      { first: threeHundred, second: sevenHundred, third: otherSevenHundred }],
  ] as Array<[string, { [name: string]: Any }]> ) {
    const result = run(script, input);
    expect(isExecutionBoundary(result[0])).toBe(true);
    expect(getArrayElements(input.first as TArray<Any>, result[1])).toHaveLength(
      (input.first as TArray<Any>).value!.length);
  }
});

test('the operand limit counts zero-length operands before any descent', () => {
  // Guest call/array spread is unsupported, so host-built operand lists pin
  // the bound directly: each operand is one host recursion level even when it
  // contributes no elements. The limit is 32 total operands including the
  // receiver; the caps below bound per-path copying and recursion depth, not
  // total symbolic fork growth or allocation failure.
  const empty = () => ESArray([]);
  expect(isExecutionBoundary(concat(empty(), new Array(30).fill(null).map(empty),
    nodeInitialExecutionContext)[0])).toBe(false);
  const at = concat(empty(), new Array(31).fill(null).map(empty), nodeInitialExecutionContext);
  expect(isExecutionBoundary(at[0])).toBe(false);
  expect(getArrayElements(at[0] as TArray<Any>, at[1])).toHaveLength(0);
  // Direct calls bypass the evaluator's boundary capture, so apply the same
  // capture here: only a typed unsupported boundary may emerge, never a host
  // RangeError from unbounded recursion.
  const [overValue] = captureExecutionBoundary(nodeInitialExecutionContext, () =>
    concat(empty(), new Array(32).fill(null).map(empty), nodeInitialExecutionContext));
  expect(overValue).toMatchObject({ type: 'ExecutionBoundary', kind: 'unsupported' });
});

test('hundreds of empty operands stop fast instead of overflowing the host stack', () => {
  const empty = ESArray([]);
  const args = new Array(500).fill(null).map(() => ESArray([]));
  const [value, after] = captureExecutionBoundary(nodeInitialExecutionContext, () =>
    concat(empty, args, nodeInitialExecutionContext));
  expect(value).toMatchObject({ type: 'ExecutionBoundary', kind: 'unsupported' });
  expect(getArrayElements(empty, after)).toHaveLength(0);
});

test('argument effects are preserved at and above the operand limit', () => {
  const pushes = (count: number) =>
    Array.from({ length: count }, (_, index) => `log.push(${index + 1})`).join(', ');
  compare(`const log = []; const out = [0].concat(${pushes(31)});
    const proof = out.length === 32 && out[0] === 0 && out[31] === 31 &&
      log.length === 31 && log[0] === 1 && log[30] === 31;`);
  const over = run(`const log = []; const out = [0].concat(${pushes(32)});`);
  expect(isExecutionBoundary(over[0])).toBe(true);
  expect(getArrayElements(over[1].value.scope.log as TArray<Any>, over[1])).toHaveLength(32);
});

test('unresolved inherited symbol state stops concat instead of guessing spreadability', () => {
  const objectPrototype = getObjectPrototype(), arrayPrototype = getArrayPrototype();
  const savedUnknown = objectPrototype.unknownProperties;
  const savedObjectSlots = objectPrototype.wellKnownSymbols;
  const savedArraySlots = arrayPrototype.wellKnownSymbols;
  try {
    Object.assign(objectPrototype, { unknownProperties: 'possible inherited spreadable flag' });
    expect(isExecutionBoundary(run('[1].concat([2]);')[0])).toBe(true);
  } finally {
    if (savedUnknown === undefined) delete objectPrototype.unknownProperties;
    else objectPrototype.unknownProperties = savedUnknown;
  }
  try {
    Object.assign(objectPrototype, { wellKnownSymbols: new Map([[toPrimitiveSymbol, ESBoolean(true)]]) });
    expect(isExecutionBoundary(run('[1].concat([2]);')[0])).toBe(true);
  } finally {
    if (savedObjectSlots === undefined) delete objectPrototype.wellKnownSymbols;
    else objectPrototype.wellKnownSymbols = savedObjectSlots;
  }
  try {
    Object.assign(arrayPrototype, { wellKnownSymbols: new Map([[toPrimitiveSymbol, ESBoolean(false)]]) });
    expect(isExecutionBoundary(run('[1].concat([2]);')[0])).toBe(true);
  } finally {
    if (savedArraySlots === undefined) delete arrayPrototype.wellKnownSymbols;
    else arrayPrototype.wellKnownSymbols = savedArraySlots;
  }
  compare(`const out = [1].concat([2]);
    const proof = out.length === 2 && out[0] === 1 && out[1] === 2;`);
});

test('missing Number constants cannot make a deferred whole upstream case pass accidentally', () => {
  expect(() => run('const array = []; array.concat(Number.POSITIVE_INFINITY);')).toThrow(/Unmodeled.*POSITIVE_INFINITY/);
});

test('construction through concat throws TypeError without analysis support', () => {
  compare(`let caught = false; try { new Array.prototype.concat([1]); }
    catch (error) { caught = error instanceof TypeError; } const proof = caught;`);
});

test.each(['built-ins/Array/prototype/concat/S15.4.4.4_A1_T3.js',
  'built-ins/Array/prototype/concat/S15.4.4.4_A1_T4.js',
  'built-ins/Array/prototype/concat/not-a-constructor.js'])('complete selected upstream case agrees independently with pinned Node: %s', name => {
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
