import { nodeInitialExecutionContext } from '../src';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { createHostFunction, effectPaths } from '../src/effects';
import { createExternalEvents } from '../src/external-events';
import { analysisFailureContext } from '../src/execution-context/analysis-failure';
import { evaluateBranches } from '../src/execution-context/branches';
import { getArrayElements, getProperties, writeProperty } from '../src/execution-context/Heap';
import { ESObject } from '../src/Object';
import { ESString } from '../src/string/String';
import { resolveBoolean } from '../src/symbolic';
import { ESNumber, ThrownValue, Undefined } from '../src/types';

function source(eligible = ESBoolean(true)) {
  const receiver = ESObject({ count: ESNumber(0) });
  return ESObject({ receiver,
    eligible: createHostFunction('source.eligible', (_call, context) => [eligible, context]),
    deliver: createHostFunction('source.deliver', (call, context) =>
      [Undefined, writeProperty(call.receiver as typeof receiver, 'count', ESNumber(1), context)]) });
}

test('a runtime source is persistent, receiver-based, and does not imply an arrival', () => {
  const events = createExternalEvents(), provider = source();
  const [, registered] = events.register(provider, nodeInitialExecutionContext);
  expect(getArrayElements(getProperties(events.state, nodeInitialExecutionContext).sources as any, nodeInitialExecutionContext)).toEqual([]);
  const [, current] = events.explore(registered, 1);
  expect(getProperties(events.state, current).active).toBe(Undefined);
  expect(effectPaths(current.value.effects).map(path => path.events.filter(event => event.kind === 'call' &&
    event.call.operation === 'source.deliver').length).sort()).toEqual([0, 1]);
  expect(getProperties(provider.properties.receiver as any, registered).count).toMatchObject({ value: 0 });
});

test('conditional registration and eligibility preserve their independent guards', () => {
  const events = createExternalEvents(), exists = ESBoolean(), eligible = ESBoolean(), provider = source(eligible);
  const [, registered] = evaluateBranches(exists, nodeInitialExecutionContext,
    current => events.register(provider, current), current => [Undefined, current]);
  const [, current] = events.explore(registered, 1);
  for (const path of effectPaths(current.value.effects)) {
    if (path.events.some(event => event.kind === 'call' && event.call.operation === 'source.deliver')) {
      expect(resolveBoolean(exists, path.knowledge)).toBe(true);
      expect(resolveBoolean(eligible, path.knowledge)).toBe(true);
    }
  }
});

test('unsupported delivery retains its active resource, and active reentry rejects', () => {
  const events = createExternalEvents(), provider = source();
  provider.properties.deliver = createHostFunction('source.unsupported', (_call, _context) => {
    throw Error('unsupported provider transition');
  });
  const [, registered] = events.register(provider, nodeInitialExecutionContext);
  let failure: any;
  try { events.explore(registered, 1); } catch (error) { failure = error; }
  expect(failure.message).toMatch(/unsupported provider/);
  const checkpoint = analysisFailureContext(failure)!;
  expect(getProperties(events.state, checkpoint).active).toBe(provider);
  expect(() => events.explore(checkpoint, 1)).toThrow(/active/);
});

test('language throws clear active delivery and never execute another source', () => {
  const events = createExternalEvents(), provider = source();
  provider.properties.deliver = createHostFunction('source.throw', (_call, context) => [ThrownValue(ESString('failure')), context]);
  const [, first] = events.register(provider, nodeInitialExecutionContext);
  const [, registered] = events.register(source(), first);
  const [, current] = events.explore(registered, 1);
  expect(getProperties(events.state, current).active).toBe(Undefined);
  for (const path of effectPaths(current.value.effects)) {
    expect(path.events.filter(event => event.kind === 'call' && ['source.throw', 'source.deliver'].includes(event.call.operation)).length).toBeLessThanOrEqual(1);
  }
});

test('invalid eligibility cannot be coerced into source availability', () => {
  const events = createExternalEvents(), provider = source();
  provider.properties.eligible = createHostFunction('source.invalid', (_call, context) => [ESString('yes'), context]);
  const [, registered] = events.register(provider, nodeInitialExecutionContext);
  expect(() => events.explore(registered, 1)).toThrow(/Boolean/);
});

test('an ineligible provider remains registered without delivery', () => {
  const events = createExternalEvents(), provider = source(ESBoolean(false));
  const [, registered] = events.register(provider, nodeInitialExecutionContext);
  const [, current] = events.explore(registered, 1);
  expect(effectPaths(current.value.effects).every(path => !path.events.some(event => event.call.operation === 'source.deliver'))).toBe(true);
  expect(getArrayElements(getProperties(events.state, current).sources as any, current)).toEqual([provider]);
});
