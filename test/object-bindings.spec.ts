import { evaluateCode, nodeInitialExecutionContext, isForkedCompletion } from '../src';
import { invoke } from '../src/ASTResolvers';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { BranchResult } from '../src/execution-context/branches';
import { setVariablesInScope } from '../src/execution-context/ExecutionContext';
import { ESObject } from '../src/Object';
import { ESString } from '../src/string/String';
import { resolveBoolean, selectValue } from '../src/symbolic';
import { ESNull, ESNumber, isThrownValue, TESBoolean, Undefined } from '../src/types';

function leaves(result: BranchResult): BranchResult[] {
  const value = result[0];
  return isForkedCompletion(value) ? leaves(value.consequent).concat(leaves(value.alternate)) : [result];
}

for (const kind of ['var', 'let', 'const']) {
  test(`${kind} object binding supports shorthand, rename, nesting and undefined-only defaults`, () => {
    const [completion, after] = evaluateCode(`
      ${kind} { x, y: renamed, nested: { z = 3 }, absent = x, nil = 8, zero = 9 } =
        { x: 1, y: 2, nested: {}, nil: null, zero: 0 };
      var proof = x === 1 && renamed === 2 && z === 3 && absent === 1 && nil === null && zero === 0;
    `, nodeInitialExecutionContext);
    expect(isThrownValue(completion)).toBe(false);
    expect(after.value.scope.proof).toMatchObject({ value: true });
  });
}

test('declaration names are instantiated together while binding initialization remains ordered', () => {
  const [, after] = evaluateCode(`
    var before = hoisted;
    var { x: hoisted = 4 } = {};
    let forward = false, self = false;
    try { let { a = b, b = 2 } = {}; } catch (error) { forward = error instanceof ReferenceError; }
    try { const { x = x } = {}; } catch (error) { self = error instanceof ReferenceError; }
    let { a = 1, b = a } = {};
    const { c = b } = {};
    let immutable = false;
    try { c = 8; } catch (error) { immutable = error instanceof TypeError; }
    var proof = before === undefined && hoisted === 4 && forward && self && a === b && c === 1 && immutable;
  `, nodeInitialExecutionContext);
  expect(after.value.scope.proof).toMatchObject({ value: true });
});

test('computed keys, reads, defaults and later declarations run in source order exactly once', () => {
  const [, initial] = evaluateCode(`
    var log = '';
    function key() { log = log + 'key;'; return 'x'; }
    function fallback() { log = log + 'default;'; return 5; }
    function getter() { log = log + 'read;'; return undefined; }
    function rhs() { log = log + 'rhs;'; return source; }
  `, nodeInitialExecutionContext);
  const source = ESObject();
  source.propertyAccess = { write() { return undefined; }, read(name, context) {
    return name === 'x' ? invoke(context.value.scope.getter, [], context, source) : undefined;
  } };
  const [, after] = evaluateCode(`let { [key()]: x = fallback() } = rhs(), y = x + 1;
    var proof = log === 'rhs;key;read;default;' && x === 5 && y === 6;`, setVariablesInScope(initial, { source }));
  expect(after.value.scope.proof).toMatchObject({ value: true });
});

test('ordinary inherited properties participate in binding reads', () => {
  const [, after] = evaluateCode(`Object.prototype.inherited = 7;
    const { inherited, own } = { own: 3 };
    var proof = inherited === 7 && own === 3;`, nodeInitialExecutionContext);
  expect(after.value.scope.proof).toMatchObject({ value: true });
});

test.each(['null', 'undefined'])('even empty object patterns reject nullish input: %s', value => {
  const [, after] = evaluateCode(`var threw = false; try { const {} = ${value}; }
    catch (error) { threw = error instanceof TypeError; }`, nodeInitialExecutionContext);
  expect(after.value.scope.threw).toMatchObject({ value: true });
});

test('binding reads and nested nullish failures retain earlier writes and prevent later operations', () => {
  const [, after] = evaluateCode(`var a = 0, b = 0, later = false;
    try { var { first: a, nested: { b }, last = (later = true) } = { first: 2, nested: null }; }
    catch (error) { var caught = error instanceof TypeError; }
    var proof = a === 2 && b === 0 && !later && caught;`, nodeInitialExecutionContext);
  expect(after.value.scope.proof).toMatchObject({ value: true });
});

test('symbolic source/default/key choices preserve correlations without guessing unknown values', () => {
  const selected = ESBoolean(), payload = ESString();
  const initial = setVariablesInScope(nodeInitialExecutionContext, { selected, payload,
    source: selectValue(selected, ESObject({ x: payload }), ESObject({ x: Undefined })) });
  const [, after] = evaluateCode(`let { x = 'fallback' } = source;
    let { [selected ? 'left' : 'right']: y } = { left: true, right: false };
    var proof = y === selected && (selected ? x === payload : x === 'fallback');
    var unknown = x === 'other';`, initial);
  expect(after.value.scope.proof).toMatchObject({ value: true });
  expect(resolveBoolean(after.value.scope.unknown as TESBoolean, after.value.knowledge)).toBeUndefined();
});

test('symbolic nullish inputs retain successful and throwing leaves', () => {
  const selected = ESBoolean();
  const result = evaluateCode('const { x } = source; var proof = x === 4;',
    setVariablesInScope(nodeInitialExecutionContext, { source: selectValue(selected, ESObject({ x: ESNumber(4) }), ESNull) }));
  const outcomes = leaves(result);
  expect(outcomes).toHaveLength(2);
  for (const [value, after] of outcomes) {
    const valid = resolveBoolean(selected, after.value.knowledge);
    expect(isThrownValue(value)).toBe(!valid);
    if (valid) expect(after.value.scope.proof).toMatchObject({ value: true });
  }
});

test('object declarations in function bodies coexist with arguments shadowing and default parameters', () => {
  const [, after] = evaluateCode(`function f(input = { value: 2 }) { const { value: arguments } = input; return arguments; }
    function g(input) { const { value: arguments } = input; return arguments; }
    var proof = f() === 2 && g({ value: 3 }) === 3;`, nodeInitialExecutionContext);
  expect(after.value.scope.proof).toMatchObject({ value: true });
});

test.each([
  'let { ...rest } = {};', 'const { x: [first] } = { x: [] };',
  'function f({ x }) { return x; } f({ x: 1 });', 'let x; ({ x } = { x: 1 });',
  'let { x } = "text";', 'let { [unknown]: x } = {};'
])('remaining binding domains stop explicitly: %s', source => {
  expect(() => evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, { unknown: ESString() }))).toThrow();
});

test('repeated binding keys perform fresh shared reads in source order', () => {
  const [, initial] = evaluateCode('var reads = 0; function getter() { reads = reads + 1; return reads; }', nodeInitialExecutionContext);
  const source = ESObject();
  source.propertyAccess = { write() { return undefined; }, read(name, context) {
    return name === 'x' ? invoke(context.value.scope.getter, [], context, source) : undefined;
  } };
  const [, after] = evaluateCode('const { x: first, x: second } = source; var proof = first === 1 && second === 2 && reads === 2;',
    setVariablesInScope(initial, { source }));
  expect(after.value.scope.proof).toMatchObject({ value: true });
});

test.each(['function() {}', '() => 1', 'function named() {}'])(
  'function-name inference/metadata remains guarded for default %s', expression => {
    expect(() => evaluateCode(`const { alias: value = ${expression} } = {}; value.name;`, nodeInitialExecutionContext))
      .toThrow(/name/);
  }
);

test('empty patterns accept coercible primitives without observing properties', () => {
  const [completion, after] = evaluateCode('const {} = 3; let {} = false; var {} = "text"; var proof = true;', nodeInitialExecutionContext);
  expect(isThrownValue(completion)).toBe(false);
  expect(after.value.scope.proof).toMatchObject({ value: true });
});

test('native JavaScript independently confirms repeated getter reads, defaults and inherited binding values', () => {
  const observed = Function(`
    var log = '', reads = 0;
    var source = Object.create({ inherited: 9 });
    Object.defineProperty(source, 'x', { get: function() { reads++; log += 'read;'; return reads === 1 ? undefined : reads; } });
    function key() { log += 'key;'; return 'x'; }
    function fallback() { log += 'default;'; return 5; }
    const { [key()]: first = fallback(), x: second, inherited } = source;
    return { log, first, second, inherited };
  `)();
  expect(observed).toEqual({ log: 'key;read;default;read;', first: 5, second: 2, inherited: 9 });
});

test('a symbolic throwing property read stops only its branch before default and later keys', () => {
  const selected = ESBoolean();
  const [, initial] = evaluateCode(`var a = 0, fallback = false, later = false;
    function getter() { if (selected) throw 'read failure'; return undefined; }`,
    setVariablesInScope(nodeInitialExecutionContext, { selected }));
  const source = ESObject({ first: ESNumber(7) });
  source.propertyAccess = { write() { return undefined; }, read(name, context) {
    return name === 'x' ? invoke(context.value.scope.getter, [], context, source) : undefined;
  } };
  const result = evaluateCode(`var { first: a, x = (fallback = true), y = (later = true) } = source;`,
    setVariablesInScope(initial, { source }));
  const outcomes = leaves(result);
  expect(outcomes).toHaveLength(2);
  for (const [value, after] of outcomes) {
    const throws = resolveBoolean(selected, after.value.knowledge);
    expect(isThrownValue(value)).toBe(throws);
    expect(after.value.scope.a).toMatchObject({ value: 7 });
    expect(after.value.scope.fallback).toMatchObject({ value: !throws });
    expect(after.value.scope.later).toMatchObject({ value: !throws });
  }
});

test('successive global scripts detect conflicts in every declared object binding name', () => {
  const [, initial] = evaluateCode('const { x: existing } = { x: 1 };', nodeInitialExecutionContext);
  for (const declaration of ['var { x: existing } = {};', 'let { x: existing } = {};']) {
    const [value] = evaluateCode(declaration, initial);
    expect(isThrownValue(value)).toBe(true);
  }
});

test('nullish destructuring preserves an unknown diagnostic instead of claiming one native message', () => {
  const [, after] = evaluateCode(`var type = false, message;
    try { const { x } = null; } catch (error) {
      type = error instanceof TypeError; message = error.message === 'Cannot destructure undefined or null';
    }`, nodeInitialExecutionContext);
  expect(after.value.scope.type).toMatchObject({ value: true });
  expect(resolveBoolean(after.value.scope.message as TESBoolean, after.value.knowledge)).toBeUndefined();
});
