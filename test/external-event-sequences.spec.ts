import { invoke } from '../src/ASTResolvers';
import { nodeInitialExecutionContext } from '../src';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { withValue } from '../src/conversion/toString';
import { createHostFunction, effectPaths } from '../src/effects';
import { bindNormal } from '../src/evaluate';
import { createExternalEvents } from '../src/external-events';
import { ExecutionContext } from '../src/execution-context/ExecutionContext';
import { UnsupportedAnalysisError } from '../src/execution-context/analysis-failure';
import { BranchResult, evaluateBranches } from '../src/execution-context/branches';
import { isExecutionBoundary, isForkedCompletion } from '../src/execution-context/Completion';
import { getArrayElements, getProperties, writeProperty } from '../src/execution-context/Heap';
import { createJobQueue } from '../src/jobs';
import { ESObject } from '../src/Object';
import { ESString } from '../src/string/String';
import { resolveBoolean } from '../src/symbolic';
import { ESNumber, isThrownValue, ThrownValue, Undefined } from '../src/types';

function leaves(result: BranchResult): BranchResult[] {
  return isForkedCompletion(result[0]) ? leaves(result[0].consequent).concat(leaves(result[0].alternate)) : [result];
}
function provider(name: string) {
  return ESObject({ receiver: ESObject(),
    eligible: createHostFunction(name + '.eligible', (_call, context) => [ESBoolean(true), context]),
    deliver: createHostFunction(name + '.deliver', (_call, context) => [Undefined, context]) });
}
function histories(result: BranchResult, names: string[]) {
  return leaves(result).reduce<string[][]>((all, [, context]) => all.concat(effectPaths(context.value.effects, context.value.knowledge).map(path =>
    path.events.filter(event => event.kind === 'call' && names.includes(event.call.operation)).map(event => event.call.operation))), []);
}

test('one-step arrival result distinguishes waiting, and two-event exploration retains every shorter history', () => {
  const events = createExternalEvents(), source = provider('event');
  const [, context] = events.register(source, nodeInitialExecutionContext);
  const [arrived] = events.step(context);
  expect(resolveBoolean(arrived as ReturnType<typeof ESBoolean>)).toBeUndefined();
  expect(histories(events.explore(context, 2), ['event.deliver']).map(path => path.length).sort()).toEqual([0, 1, 2]);
  expect(getProperties(events.state, context).active).toBe(Undefined);
});

test('inter-arrival jobs run before eligibility is rechecked and newly registered sources can arrive', () => {
  const events = createExternalEvents(), jobs = createJobQueue();
  const state = ESObject({ first: ESBoolean(true) });
  const first = provider('first'), second = provider('second');
  first.properties.eligible = createHostFunction('first.eligible', (_call, context) => [getProperties(state, context).first, context]);
  const switchSources = createHostFunction('job.switch', (_call, context) => events.register(second,
    writeProperty(state, 'first', ESBoolean(false), context)));
  first.properties.deliver = createHostFunction('first.deliver', (_call, context) => jobs.enqueue(switchSources, [], context));
  const [, context] = events.register(first, nodeInitialExecutionContext);
  const result = events.explore(context, 2, after => jobs.drain(after, 10));
  expect(histories(result, ['first.deliver', 'job.switch', 'second.deliver'])).toEqual(expect.arrayContaining([
    [], ['first.deliver', 'job.switch'], ['first.deliver', 'job.switch', 'second.deliver']
  ]));
  expect(histories(result, ['first.deliver']).every(path => path.length <= 1)).toBe(true);
  expect(histories(result, ['second.deliver']).every(path => path.length <= 1)).toBe(true);
  // The final arrived event still drains its queued work, even without another slot.
  const final = provider('final');
  final.properties.deliver = createHostFunction('final.deliver', (_call, current) => jobs.enqueue(
    createHostFunction('job.final', (_call, after) => [Undefined, after]), [], current));
  const isolated = createExternalEvents();
  const [, ready] = isolated.register(final, nodeInitialExecutionContext);
  expect(histories(isolated.explore(ready, 1, after => jobs.drain(after, 10)), ['final.deliver', 'job.final']))
    .toEqual(expect.arrayContaining([[], ['final.deliver', 'job.final']]));
});

test.each(['throw', 'unsupported'])('a %s delivery retains stopped state and never delivers the next event', kind => {
  const events = createExternalEvents(), source = provider('stop'), sibling = provider('sibling');
  source.properties.deliver = createHostFunction('stop.deliver', (_call, context) => {
    if (kind === 'unsupported') throw new UnsupportedAnalysisError('provider boundary');
    return [ThrownValue(ESString('failure')), context];
  });
  const [, first] = events.register(source, nodeInitialExecutionContext);
  const [, ready] = events.register(sibling, first);
  const result = events.explore(ready, 2);
  const stopped = leaves(result).filter(([value]) => isExecutionBoundary(value) || isThrownValue(value));
  expect(stopped.length).toBeGreaterThan(0);
  for (const outcome of stopped) {
    expect(getProperties(events.state, outcome[1]).active).toBe(kind === 'unsupported' ? source : Undefined);
    if (kind === 'unsupported') expect(events.explore(outcome[1], 0)[0]).toMatchObject({ type: 'ExecutionBoundary', kind: 'unsupported' });
    for (const history of histories(outcome, ['stop.deliver', 'sibling.deliver'])) expect(history[history.length - 1]).toBe('stop.deliver');
  }
  expect(histories(result, ['stop.deliver', 'sibling.deliver'])).toEqual(expect.arrayContaining([[], ['sibling.deliver', 'sibling.deliver']]));
});

test.each(['throw', 'unsupported'])('a %s job between arrivals stops only its branch and retains its queue', kind => {
  const events = createExternalEvents(), jobs = createJobQueue(), source = provider('event');
  source.properties.deliver = createHostFunction('event.deliver', (_call, context) => {
    const stop = createHostFunction('job.stop', (_call, after) => {
      if (kind === 'unsupported') throw new UnsupportedAnalysisError('job boundary');
      return [ThrownValue(ESString('job failure')), after];
    });
    return bindNormal(jobs.enqueue(stop, [], context), (_value, after) => jobs.enqueue(
      createHostFunction('job.tail', (_call, current) => [Undefined, current]), [], after));
  });
  const [, ready] = events.register(source, nodeInitialExecutionContext);
  const result = events.explore(ready, 2, after => jobs.drain(after, 10));
  const stopped = leaves(result).find(([value]) => isExecutionBoundary(value) || isThrownValue(value))!;
  expect(stopped).toBeDefined();
  expect(histories(stopped, ['event.deliver', 'job.stop', 'job.tail'])).toEqual([['event.deliver', 'job.stop']]);
  expect(getProperties(events.state, stopped[1]).active).toBe(Undefined);
  expect(getProperties(jobs.state, stopped[1]).active === Undefined).toBe(kind === 'throw');
  expect(getArrayElements(getProperties(jobs.state, stopped[1]).pending as any, stopped[1])).toHaveLength(1);
  expect(histories(result, ['event.deliver'])).toEqual(expect.arrayContaining([[]]));
});

test('an after-event hook may fork, stop, or register a source on its normal leaf', () => {
  const events = createExternalEvents(), first = provider('first'), added = provider('added');
  const count = ESObject({ calls: ESNumber(0) });
  first.properties.eligible = createHostFunction('first.eligible', (_call, context) =>
    withValue(getProperties(count, context).calls, context, (value, after) => [ESBoolean((value as ReturnType<typeof ESNumber>).value === 0), after]));
  first.properties.deliver = createHostFunction('first.deliver', (_call, context) => [Undefined, writeProperty(count, 'calls', ESNumber(1), context)]);
  const [, ready] = events.register(first, nodeInitialExecutionContext);
  const fork = createHostFunction('after.fork', (_call, context) => {
    const selected = ESBoolean();
    return evaluateBranches(selected, context, () => { throw new UnsupportedAnalysisError('after boundary'); },
      (after: typeof context) => events.register(added, after));
  });
  const result = events.explore(ready, 2, after => invoke(fork, [], after));
  expect(leaves(result).some(([value]) => isExecutionBoundary(value))).toBe(true);
  expect(histories(result, ['first.deliver', 'added.deliver'])).toEqual(expect.arrayContaining([[], ['first.deliver'], ['first.deliver', 'added.deliver']]));
});

test('event evaluation budget exhaustion is a classified frontier with waiting still present', () => {
  const events = createExternalEvents(), source = provider('event');
  const [, context] = events.register(source, nodeInitialExecutionContext);
  const exhausted = ExecutionContext({ ...context.value, evaluationBudget: { remaining: 0 } });
  const result = events.explore(exhausted, 2);
  expect(leaves(result).some(([value]) => isExecutionBoundary(value) && value.kind === 'budget')).toBe(true);
  expect(leaves(result).some(([value]) => value === Undefined)).toBe(true);
  expect(histories(result, ['event.deliver']).every(path => path.length === 0)).toBe(true);
});
