import { Any, ESNumber, isArray, isESNull, isESNumber, isReturnValue, isThrownValue, isUndefined, ThrownValue, Undefined, WithProperties } from '../types';
import { getArrayElements, getProperties, ownPropertyPresence } from '../execution-context/Heap';
import { TExecutionContext } from '../execution-context/ExecutionContext';
import { BranchResult, evaluateBranches, mergeBranchResults } from '../execution-context/branches';
import { CompletionBranch, isExecutionBoundary, isForkedCompletion } from '../execution-context/Completion';
import { captureExecutionBoundary } from '../execution-context/analysis-failure';
import { withValue } from '../conversion/toString';
import { hasProperty, getObjectPrototype, prototypeOf } from '../Object/prototype';
import { getFunctionPrototype } from '../Function/prototype';
import { hasInstanceSymbol } from '../Object/wellKnownSymbols';
import { createError } from '../error/Error';
import { ESString } from '../string/String';
import { resolveBoolean } from '../symbolic';
import { arrayBoundary, getArrayConstructor, getArrayPrototype, hasDefaultArrayPrototypeIndexedLookup } from './prototype';
import { invoke, readMember } from '../ASTResolvers';
import { bindNormal } from '../evaluate';
import { Array as ESArray, ArrayValue } from './Array';

// Array.prototype.map on bounded ordinary arrays. Capture length before the
// callback check and species creation; each visit observes current presence and
// value. Callback effects, throws and typed stops use shared VM completions.
// Custom species/generic ToLength remain explicit boundaries, not ignored hooks.
const maximumMapElements = 1024;

export function map(receiver: Any, args: Any[], context: TExecutionContext): BranchResult {
  return withValue(receiver, context, (value, branch) => {
    if (isESNull(value) || isUndefined(value)) return [ThrownValue(createError('TypeError', ESString())), branch];
    if (!isArray(value)) return arrayBoundary('generic non-array map receivers and length coercion');
    const array = value as ArrayValue;
    if (array === getArrayPrototype()) return arrayBoundary('Array.prototype map receivers');
    if (array.propertyAccess || array.unknownProperties || array.unmodeledPrototype ||
      array.unmodeledOwnPropertyInspection ||
      (array.unmodeledPropertyReads && array.unmodeledPropertyReads.length) ||
      array.prototype !== getArrayPrototype()) {
      return arrayBoundary('exotic/accessor/custom-prototype map receivers');
    }
    const elements = getArrayElements(array, branch), length = getProperties(array, branch).length;
    if (!elements || !isESNumber(length) || typeof length.value !== 'number' || length.value !== elements.length) {
      return arrayBoundary('map requires a known current array length and element structure');
    }
    const count: number = length.value;
    return withValue(args[0] || Undefined, branch, (callback, afterCallable) => {
      if (!(callback as { function?: object }).function) return [ThrownValue(createError('TypeError', ESString())), afterCallable];
      // Bound work before result allocation or any index scan. This is an
      // analysis limit, not a language exception or inferred allocation failure.
      if (count > maximumMapElements) return arrayBoundary('map exceeds the supported element limit');
      assertDefaultSpecies(array, afterCallable);
      return visitInOrder(array, callback, args.length > 1 ? args[1] : Undefined,
        0, count, ESArray<Any>(new Array(count)), afterCallable);
    });
  });
}

function assertDefaultSpecies(array: ArrayValue, context: TExecutionContext): void {
  const arrayPrototype = getArrayPrototype(), constructor = getArrayConstructor();
  const inheritedConstructor: Any = getProperties(arrayPrototype, context).constructor;
  if (resolveBoolean(ownPropertyPresence(array, 'constructor', context), context.value.knowledge) !== false ||
    !hasDefaultArrayPrototypeIndexedLookup(arrayPrototype) || arrayPrototype.unknownProperties ||
    arrayPrototype.unmodeledPrototype ||
    (arrayPrototype.unmodeledPropertyReads && arrayPrototype.unmodeledPropertyReads.includes('constructor')) ||
    inheritedConstructor !== constructor) {
    return arrayBoundary('custom or unresolved constructor/species in map receivers');
  }
  // The intrinsic constructor's species lookup follows its Function/Object
  // prototype chain. Public symbols are deferred; only the unrelated known
  // @@hasInstance slot can be ignored. Unknown slots stop conservatively.
  if (prototypeOf(constructor) !== getFunctionPrototype() ||
    prototypeOf(getFunctionPrototype()) !== getObjectPrototype() ||
    !isESNull(prototypeOf(getObjectPrototype()))) {
    return arrayBoundary('custom constructor prototype/species in map receivers');
  }
  for (const link of [constructor, getFunctionPrototype(), getObjectPrototype()]) {
    const model = link as WithProperties;
    if (model.unknownProperties || model.unmodeledPrototype ||
      (model.wellKnownSymbols && Array.from(model.wellKnownSymbols.keys()).some(key => key !== hasInstanceSymbol))) {
      return arrayBoundary('unresolved constructor species state in map receivers');
    }
  }
}

function visitInOrder(array: ArrayValue, callback: Any, thisArg: Any, index: number,
  count: number, output: ArrayValue, context: TExecutionContext): BranchResult {
  let current = context, result = output;
  for (let next = index; next < count; next++) {
    const step = visitOne(array, callback, thisArg, next, result, current);
    if (isForkedCompletion(step[0])) {
      return mergeBranchResults(step[0].condition, step[0].base,
        continueVisits(array, callback, thisArg, next + 1, count, step[0].consequent),
        continueVisits(array, callback, thisArg, next + 1, count, step[0].alternate));
    }
    if (isExecutionBoundary(step[0]) || isThrownValue(step[0]) || isReturnValue(step[0])) return step;
    if (!isArray(step[0])) {
      // A conditional HasProperty creates different sparse results. Select each
      // result before later writes so joined sparse layouts cannot erase holes.
      return withValue(step[0], step[1], (selected, branch) =>
        visitInOrder(array, callback, thisArg, next + 1, count, selected as ArrayValue, branch));
    }
    result = step[0] as ArrayValue;
    current = step[1];
  }
  return [result, current];
}

function continueVisits(array: ArrayValue, callback: Any, thisArg: Any, next: number,
  count: number, branch: CompletionBranch): BranchResult {
  if (isForkedCompletion(branch[0])) {
    return mergeBranchResults(branch[0].condition, branch[0].base,
      continueVisits(array, callback, thisArg, next, count, branch[0].consequent),
      continueVisits(array, callback, thisArg, next, count, branch[0].alternate));
  }
  if (isExecutionBoundary(branch[0]) || isThrownValue(branch[0]) || isReturnValue(branch[0])) return branch;
  return withValue(branch[0], branch[1], (output, context) =>
    visitInOrder(array, callback, thisArg, next, count, output as ArrayValue, context));
}

function visitOne(array: ArrayValue, callback: Any, thisArg: Any, index: number,
  output: ArrayValue, context: TExecutionContext): BranchResult {
  return captureExecutionBoundary(context, () => {
    const elements = getArrayElements(array, context), length = getProperties(array, context).length;
    if (!elements || !isESNumber(length) || typeof length.value !== 'number') {
      return arrayBoundary('map requires a known current array length and element structure');
    }
    const name = String(index);
    if (resolveBoolean(ownPropertyPresence(array, name, context), context.value.knowledge) !== true) {
      assertCleanInheritedIndex(name);
    }
    return evaluateBranches(hasProperty(array, name, context), context,
      present => bindNormal(readMember(array, name, present), (element, afterRead) =>
        bindNormal(invoke(callback, [element, ESNumber(index), array], afterRead, thisArg), (mapped, afterCall) => {
          // No custom species can expose the result during iteration. Allocate
          // persistent sparse snapshots privately; only the final array escapes.
          // Own element creation bypasses inherited setters as CreateDataProperty
          // requires, and never mutates shared host storage between branches.
          const next = (output.value as Any[]).slice();
          next[index] = mapped;
          return [ESArray(next), afterCall];
        })),
      absent => [output, absent] as BranchResult);
  });
}

function assertCleanInheritedIndex(name: string): void {
  if (prototypeOf(getArrayPrototype()) !== getObjectPrototype() ||
    !isESNull(prototypeOf(getObjectPrototype())) ||
    !hasDefaultArrayPrototypeIndexedLookup(getArrayPrototype()) || getObjectPrototype().propertyAccess) {
    return arrayBoundary('custom prototype or inherited index hook in map receivers');
  }
  for (const link of [getArrayPrototype(), getObjectPrototype()]) {
    const model = link as WithProperties;
    if (model.unknownProperties || model.unmodeledPrototype ||
      (model.unmodeledPropertyReads && model.unmodeledPropertyReads.includes(name))) {
      return arrayBoundary('unresolved inherited index state in map receivers');
    }
  }
}
