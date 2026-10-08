import { Any, ESNumber, isArray, isESNull, isESNumber, isReturnValue, isThrownValue, isUndefined, ThrownValue, Undefined, WithProperties } from '../types';
import { getArrayElements, getProperties, ownPropertyPresence } from '../execution-context/Heap';
import { TExecutionContext } from '../execution-context/ExecutionContext';
import { BranchResult, evaluateBranches, mergeBranchResults } from '../execution-context/branches';
import { CompletionBranch, isExecutionBoundary, isForkedCompletion } from '../execution-context/Completion';
import { withValue } from '../conversion/toString';
import { hasProperty, getObjectPrototype, prototypeOf } from '../Object/prototype';
import { createError } from '../error/Error';
import { ESString } from '../string/String';
import { resolveBoolean } from '../symbolic';
import { arrayBoundary, getArrayPrototype } from './prototype';
import { invoke, readMember } from '../ASTResolvers';
import { bindNormal } from '../evaluate';
import { ArrayValue } from './Array';

// Bounded ordinary-array forEach following
// https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.prototype.foreach.
// The receiver length is captured once from current heap state, then each
// visited index re-reads current presence/value after prior callbacks, in
// increasing order, invoking with (value, index, receiver) and the supplied
// thisArg. Callback return values are ignored; guest throws stop later visits
// and preserve earlier effects. Conditional presence, values, receivers and
// callbacks branch through the shared completion machinery, so supported
// siblings survive typed unsupported or budget stops on another path.
//
// Only the operations this algorithm actually performs are guarded. forEach
// consults neither constructor/species/spreadability nor result allocation,
// so unlike concat there are no such guards here; justifying each boundary
// against a reached lookup keeps dense ordinary iteration free of unrelated
// stops. forEach performs no direct writes either, so callback writes are
// checked by the shared write operations when they execute, not up front.
//
// Host visit work is capped before the loop: at most 1024 captured indices
// run per path. Appends beyond the captured length are never visited,
// so callback-added growth cannot extend host work. Exceeding the cap is a
// typed unsupported analysis boundary, never a language throw, and preserves
// all input state. The cap bounds per-path host work, not total symbolic
// fork growth or allocation failure.
const maximumForEachElements = 1024;

export function forEach(receiver: Any, args: Any[], context: TExecutionContext): BranchResult {
  return withValue(receiver, context, (value, branch) => {
    if (isESNull(value) || isUndefined(value)) return [ThrownValue(createError('TypeError', ESString())), branch];
    if (!isArray(value)) return arrayBoundary('generic non-array forEach receivers and length coercion');
    const array = value as ArrayValue;
    if (array === getArrayPrototype()) return arrayBoundary('Array.prototype forEach receivers');
    if (array.propertyAccess || array.unknownProperties || array.unmodeledPrototype ||
      array.unmodeledOwnPropertyInspection ||
      (array.unmodeledPropertyReads && array.unmodeledPropertyReads.length) ||
      array.prototype !== getArrayPrototype()) {
      return arrayBoundary('exotic/accessor/custom-prototype forEach receivers');
    }
    const elements = getArrayElements(array, branch), length = getProperties(array, branch).length;
    if (!elements || !isESNumber(length) || typeof length.value !== 'number' || length.value !== elements.length) {
      return arrayBoundary('forEach requires a known current array length and element structure');
    }
    const count: number = length.value;
    const callback = args[0] || Undefined;
    return withValue(callback, branch, (fn, afterCallable) => {
      // Callability is checked even for empty/holey arrays, after the
      // receiver/length reads the specification orders first.
      if (!(fn as { function?: object }).function) return [ThrownValue(createError('TypeError', ESString())), afterCallable];
      if (count > maximumForEachElements) {
        return arrayBoundary('forEach exceeds the supported element limit');
      }
      const thisArg = args.length > 1 ? args[1] : Undefined;
      return visitInOrder(array, fn, thisArg, 0, count, afterCallable);
    });
  });
}

function visitInOrder(array: ArrayValue, callback: Any, thisArg: Any, index: number, count: number, context: TExecutionContext): BranchResult {
  // Normal visits advance imperatively so host stack depth stays flat across
  // the whole captured range; only genuine forks consume host recursion, one
  // level per forked visit. Callbacks that fork on every visit can still grow
  // the completion tree without bound, which stays a residual branch-volume
  // limitation rather than a per-visit implementation cost.
  let current = context;
  for (let next = index; next < count; next++) {
    const step = visitOne(array, callback, thisArg, next, current);
    if (isForkedCompletion(step[0])) {
      return mergeBranchResults(step[0].condition, step[0].base,
        continueVisits(array, callback, thisArg, next + 1, count, step[0].consequent),
        continueVisits(array, callback, thisArg, next + 1, count, step[0].alternate));
    }
    if (isExecutionBoundary(step[0]) || isThrownValue(step[0]) || isReturnValue(step[0])) return step;
    current = step[1];
  }
  return [Undefined, current];
}

// A forked path continues visiting only on its normal leaves. Throwing,
// returning and stopped leaves keep their completions with remaining visits
// unexecuted, preserving the exact stop position per path.
function continueVisits(array: ArrayValue, callback: Any, thisArg: Any, next: number, count: number, branch: CompletionBranch): BranchResult {
  if (isForkedCompletion(branch[0])) {
    return mergeBranchResults(branch[0].condition, branch[0].base,
      continueVisits(array, callback, thisArg, next, count, branch[0].consequent),
      continueVisits(array, callback, thisArg, next, count, branch[0].alternate));
  }
  if (isExecutionBoundary(branch[0]) || isThrownValue(branch[0]) || isReturnValue(branch[0])) return branch;
  return visitInOrder(array, callback, thisArg, next, count, branch[1]);
}

function visitOne(array: ArrayValue, callback: Any, thisArg: Any, index: number, context: TExecutionContext): BranchResult {
  // Callbacks run arbitrary interpreted code between visits, so the layout is
  // re-established on current state rather than proven once. A conditional
  // length change can join paths with different element structures and lose
  // the layout the shared indexed read below relies on; stopping honestly
  // there preserves earlier effects instead of risking an unclassified read.
  // Coherent growth (push/index writes keep length and elements in step)
  // passes freely; only indices below the captured length are ever visited.
  const elements = getArrayElements(array, context), length = getProperties(array, context).length;
  if (!elements || !isESNumber(length) || typeof length.value !== 'number') {
    return arrayBoundary('forEach requires a known current array length and element structure');
  }
  const name = String(index);
  // HasProperty consults the prototype chain only for absent own indices, so
  // the intrinsic lookup chain is proven clean exactly then. Dense visits
  // never touch it; unknown inherited state stops honestly at the reached
  // lookup instead of guessing absence or content.
  if (resolveBoolean(ownPropertyPresence(array, name, context), context.value.knowledge) !== true) {
    assertCleanInheritedIndex(name);
  }
  return evaluateBranches(hasProperty(array, name, context), context,
    present => bindNormal(readMember(array, name, present), (element, afterRead) =>
      invoke(callback, [element, ESNumber(index), array], afterRead, thisArg)),
    absent => [Undefined, absent] as BranchResult);
}

// Only the index lookup chain this algorithm can actually reach is proven:
// the shared Array-to-Object-to-null links with no hidden symbol slots,
// unknown fields, unmodeled prototypes or unmodeled reads of this index.
// Ordinary inherited values then flow through the shared HasProperty/Get
// operations above; anything else stops before a guess.
function assertCleanInheritedIndex(name: string): void {
  if (prototypeOf(getArrayPrototype()) !== getObjectPrototype() ||
    !isESNull(prototypeOf(getObjectPrototype()))) {
    return arrayBoundary('custom prototype forEach receivers');
  }
  for (const link of [getArrayPrototype(), getObjectPrototype()]) {
    const model = link as WithProperties;
    if ((model.wellKnownSymbols && model.wellKnownSymbols.size) ||
      model.unknownProperties || model.unmodeledPrototype ||
      (model.unmodeledPropertyReads && model.unmodeledPropertyReads.includes(name))) {
      return arrayBoundary('unresolved inherited index state in forEach receivers');
    }
  }
}
