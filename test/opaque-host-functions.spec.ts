import { join } from 'path';
import { execFileSync } from 'child_process';
import { createCommonJSLoader, createFileSystemModel, fileSystemDirectory, evaluateCode,
  isExecutionBoundary, isForkedCompletion, nodeInitialExecutionContext } from '../src';
import { invoke } from '../src/ASTResolvers';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { effectPaths } from '../src/effects';
import { BranchResult } from '../src/execution-context/branches';
import { setVariablesInScope } from '../src/execution-context/ExecutionContext';
import { createConsoleModel } from '../src/node/console';
import { createOpaqueHostFunction } from '../src/node/opaque';
import { ESObject } from '../src/Object';
import { ESString } from '../src/string/String';
import { resolveBoolean } from '../src/symbolic';
import { assertPinnedNode, nodeModuleObservation, withModuleGraphFixture } from './commonjs/oracle';

function setup() {
  const opaque = createOpaqueHostFunction('test.opaque');
  const console = createConsoleModel(), receiver = ESObject(), argument = ESObject(), selected = ESBoolean();
  return { opaque, console, receiver, argument, selected, context: setVariablesInScope(nodeInitialExecutionContext,
    { opaque, receiver, argument, selected, console: console.module }) };
}
function leaves(result: BranchResult): BranchResult[] {
  const value = result[0];
  return isForkedCompletion(value) ? leaves(value.consequent).concat(leaves(value.alternate)) : [result];
}

test('a known function value and unused aliases do not execute its unknown implementation', () => {
  const { context } = setup();
  const [, after] = evaluateCode(`const saved = opaque; var proof = typeof saved === 'function' && saved === opaque &&
    saved.call === (function() {}).call && saved.call.length === 1 && saved.call.call === saved.call;`, context);
  expect(after.value.scope.proof).toMatchObject({ value: true });
  expect(after.value.effects).toBeUndefined();
});

test.each(['opaque(argument)', 'opaque.call(receiver, argument)', 'opaque.call.call(opaque, receiver, argument)'])(
  'calling a known opaque function records the reached call without fabricated completion: %s', call => {
    const { context, console, opaque, receiver, argument } = setup();
    const [boundary, after] = evaluateCode(`console.log('before'); try { ${call}; }
      catch (error) { console.log('caught'); } finally { console.log('finally'); } console.log('after');`, context);
    expect(isExecutionBoundary(boundary)).toBe(true);
    expect(boundary).toMatchObject({ kind: 'unsupported' });
    expect(console.inspectOutput(after)[0].chunks.map(chunk => chunk.value)).toEqual(['before\n']);
    const calls = effectPaths(after.value.effects)[0].events.filter(event => event.call.operation === 'test.opaque');
    expect(calls).toHaveLength(1);
    expect(calls[0].kind).toBe('call');
    expect(calls[0].call.target).toBe(opaque);
    expect(calls[0].call.args).toEqual([argument]);
    if (call.includes('.call')) expect(calls[0].call.receiver).toBe(receiver);
  }
);

test('direct embedding invocation also returns a typed stopped leaf', () => {
  const { context, opaque, receiver } = setup();
  const [boundary, after] = invoke(opaque, [ESString('/unread')], context, receiver);
  expect(isExecutionBoundary(boundary)).toBe(true);
  expect(effectPaths(after.value.effects)[0].events.map(event => event.kind)).toEqual(['call']);
});

test('a symbolic call stops only its branch while a noncalling sibling finishes', () => {
  const { context, console, selected } = setup();
  const outcomes = leaves(evaluateCode(`console.log('prefix'); if (selected) opaque(argument);
    else console.log('unused'); console.log('tail');`, context));
  expect(outcomes).toHaveLength(2);
  for (const [value, after] of outcomes) {
    const called = resolveBoolean(selected, after.value.knowledge);
    expect(isExecutionBoundary(value)).toBe(called);
    expect(console.inspectOutput(after)[0].chunks.map(chunk => chunk.value))
      .toEqual(called ? ['prefix\n'] : ['prefix\n', 'unused\n', 'tail\n']);
  }
});

for (const expression of ['opaque.name', 'opaque.length', 'opaque.prototype', 'opaque.missing', 'opaque.apply',
  'opaque.call.name', 'opaque.call.prototype', 'opaque.call.missing',
  'opaque.call.length = 9', 'opaque.call.call = function() {}', 'opaque.constructor', 'opaque.name = "invented"', 'opaque.call = function() {}', 'new opaque(argument)']) {
  test(`unmodeled function metadata or construction stops explicitly: ${expression}`, () => {
    const { context, console } = setup();
    const [value, after] = evaluateCode(`console.log('before'); try { ${expression}; }
      catch (error) { console.log('caught'); } console.log('after');`, context);
    expect(isExecutionBoundary(value)).toBe(true);
    expect(console.inspectOutput(after)[0].chunks.map(chunk => chunk.value)).toEqual(['before\n']);
    expect(effectPaths(after.value.effects)[0].events.some(event => event.call.operation === 'test.opaque')).toBe(false);
  });
}

for (const expression of ['Object.keys(opaque)', 'Object.prototype.hasOwnProperty.call(opaque, "name")',
  'opaque instanceof Function']) {
  test(`remaining shared reflection guards cannot fabricate metadata: ${expression}`, () => {
    const { context, console } = setup();
    const [boundary, stopped] = evaluateCode(`console.log('before'); try { ${expression}; } catch(error) { console.log('caught'); }`, context);
    expect(isExecutionBoundary(boundary)).toBe(true);
    expect(console.inspectOutput(stopped)[0].chunks.map(chunk => chunk.value)).toEqual(['before\n']);
  });
}

test('filesystem readdirSync export identity agrees with pinned Node without directory enumeration', () => {
  assertPinnedNode();
  const sources = { 'entry.cjs': `const fs = require('fs'); const saved = fs.readdirSync;
    module.exports = typeof saved === 'function' && saved === require('node:fs').readdirSync &&
      saved.call === (function() {}).call && saved !== fs.statSync;` };
  withModuleGraphFixture(sources, (files, directory) => {
    const entry = join(directory, 'entry.cjs');
    expect(nodeModuleObservation(entry)).toEqual({ kind: 'return', value: { type: 'boolean', value: true } });
    const fs = createFileSystemModel({ root: fileSystemDirectory({}) });
    const [value, after] = createCommonJSLoader(files, { builtins: { fs: fs.module } }).load(entry, nodeInitialExecutionContext);
    expect(value).toMatchObject({ value: true });
    expect(after.value.effects).toBeUndefined();
    const [listing, called] = invoke(fs.module.properties.readdirSync, [ESString('/')], after);
    expect(listing).toMatchObject({ type: 'array', properties: { length: { value: 0 } } });
    expect(effectPaths(called.value.effects)[0].events.map(event => [event.kind, event.call.operation]))
      .toEqual([['call', 'fs.readdirSync'], ['return', 'fs.readdirSync']]);
    expect(fs.inspectRoot(called)).toBe(fs.inspectRoot(after));
  });
});

test('native metadata control proves construction cannot be replaced by nonconstructibility', () => {
  assertPinnedNode();
  const observed = JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath, ['-e', `
    const fs = require('node:fs'), fn = fs.readdirSync, qs = require('querystring');
    // The empty target runs, not readdirSync. Reflect only uses fn as newTarget.
    const object = Reflect.construct(function() {}, [], fn);
    console.log(JSON.stringify({ name: fn.name, length: fn.length, prototype: Object.hasOwn(fn, 'prototype'),
      constructed: Object.getPrototypeOf(object) === fn.prototype,
      querystringObject: typeof qs === 'object' && qs !== null && qs === require('node:querystring') }));
  `], { encoding: 'utf8', timeout: 10000, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } }));
  expect(observed).toEqual({ name: 'readdirSync', length: 2, prototype: true, constructed: true, querystringObject: true });
});
