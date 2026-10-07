import { Any, ESNumber, isArray, isESNull, isESNumber, isUndefined, ThrownValue, WithProperties } from '../types';
import { getArrayElements, getProperties, ownPropertyPresence } from '../execution-context/Heap';
import { TExecutionContext } from '../execution-context/ExecutionContext';
import { BranchResult } from '../execution-context/branches';
import { isObjectValue, withValue } from '../conversion/toString';
import { createError } from '../error/Error';
import { ESString } from '../string/String';
import { resolveBoolean } from '../symbolic';
import { arrayBoundary, getArrayConstructor, getArrayPrototype } from './prototype';
import { getObjectPrototype, prototypeOf } from '../Object/prototype';
import { getFunctionPrototype } from '../Function/prototype';
import { Array as ESArray, ArrayValue } from './Array';
import { assertNoInheritedArrayElements } from './inherited-elements';

// Bounded ordinary-array concat following
// https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.prototype.concat.
// The receiver and every argument are read from current heap state, never from
// initial snapshots. Spreadable arrays contribute their own present indices and
// keep holes absent; every other item appends by reference, preserving symbolic
// values and aliases. Inputs are never mutated and the result is always fresh.
// Observable constructor/species/spread state is supported only for the proven
// ordinary intrinsic case: custom shadows, internal symbol slots, inherited
// indexed properties, partial host objects, custom access hooks and prototype
// changes stop explicitly instead of being silently ignored.
//
// Copying runs as a synchronous host loop outside the VM evaluation budget, so
// one explicit element limit bounds every operand scan and the cumulative
// result before any copying work. Exceeding it is a typed unsupported analysis
// boundary, never a language throw, and preserves all input state.
const maximumConcatElements = 1024;
export function concat(receiver: Any, args: Any[], context: TExecutionContext): BranchResult {
  return withValue(receiver, context, (value, branch) => {
    if (isESNull(value) || isUndefined(value)) return [ThrownValue(createError('TypeError', ESString())), branch];
    if (!isArray(value)) return arrayBoundary('generic non-array concat receivers and length coercion');
    return concatOperands([value].concat(args), 0, [], branch);
  });
}

function concatOperands(operands: Any[], position: number, combined: Any[], context: TExecutionContext): BranchResult {
  if (position === operands.length) return [ESArray(combined, 'elements'), context];
  // Conditional operands split here, so each path extends its own copy; sharing
  // one host array would leak one sibling's elements into the other. Holes
  // survive the copy and keep their absent-versus-undefined distinction.
  return withValue(operands[position], context, (item, branch) =>
    concatOperands(operands, position + 1, appendOperand(item, combined.slice(), branch), branch));
}

// HasProperty in the specification observes the prototype chain, so a hole can
// only stay a hole after the current inherited state is proven absent. The
// shared legacy guard establishes exactly that without materializing values.
function ordinaryElements(array: ArrayValue, context: TExecutionContext): Any[] {
  if (array === getArrayPrototype()) return arrayBoundary('Array.prototype concat operands');
  if (array.propertyAccess || array.unknownProperties || array.unmodeledPrototype ||
    array.unmodeledOwnPropertyInspection ||
    (array.unmodeledPropertyReads && array.unmodeledPropertyReads.length) ||
    array.prototype !== getArrayPrototype() ||
    (array.unmodeledPropertyWrites && array.unmodeledPropertyWrites.length) ||
    (array.wellKnownSymbols && array.wellKnownSymbols.size)) {
    return arrayBoundary('exotic/accessor/custom-spread array concat operands');
  }
  if (resolveBoolean(ownPropertyPresence(array, 'constructor', context), context.value.knowledge) !== false ||
    getProperties(getArrayPrototype(), context).constructor !== getArrayConstructor() ||
    (getArrayConstructor().wellKnownSymbols && getArrayConstructor().wellKnownSymbols!.size)) {
    return arrayBoundary('custom constructor/species array concat operands');
  }
  const elements = getArrayElements(array, context), length = getProperties(array, context).length;
  if (!elements || !isESNumber(length) || typeof length.value !== 'number' || length.value !== elements.length) {
    return arrayBoundary('concat requires a known current array length and element structure');
  }
  assertNoInheritedArrayElements(array, elements, context);
  return elements;
}

// IsConcatSpreadable observes @@isConcatSpreadable through the prototype chain.
// Public symbol keys remain unsupported, so an ordinary chain without internal
// slots cannot carry the flag; anything else stops before spreading or appending.
function assertNoSpreadableFlag(value: Any, context: TExecutionContext): void {
  let current: Any = value;
  const seen = new Set<Any>();
  while (true) {
    if (seen.has(current)) return arrayBoundary('cyclic concat operand prototypes');
    seen.add(current);
    const model = current as WithProperties;
    if ((model.wellKnownSymbols && model.wellKnownSymbols.size) ||
      model.propertyAccess || model.unknownProperties || model.unmodeledPrototype) {
      return arrayBoundary('custom spread/species effects in concat operands');
    }
    const prototype = prototypeOf(current);
    if (isESNull(prototype)) return;
    if (prototype !== getObjectPrototype() && prototype !== getArrayPrototype() && prototype !== getFunctionPrototype()) {
      return arrayBoundary('custom prototype concat operands');
    }
    current = prototype;
  }
}

function appendOperand(item: Any, combined: Any[], context: TExecutionContext): Any[] {
  if (isArray(item)) {
    const elements = ordinaryElements(item as ArrayValue, context);
    if (combined.length + elements.length > 0xffffffff) {
      return arrayBoundary('concat overflow and partial maximum-length writes');
    }
    if (elements.length > maximumConcatElements ||
      combined.length + elements.length > maximumConcatElements) {
      return arrayBoundary('concat exceeds the supported element limit');
    }
    const base = combined.length;
    for (let index = 0; index < elements.length; index++) {
      if (Object.prototype.hasOwnProperty.call(elements, index)) combined[base + index] = elements[index];
    }
    combined.length = base + elements.length;
    return combined;
  }
  if (isObjectValue(item)) assertNoSpreadableFlag(item, context);
  if (combined.length + 1 > 0xffffffff) return arrayBoundary('concat overflow and partial maximum-length writes');
  if (combined.length + 1 > maximumConcatElements) {
    return arrayBoundary('concat exceeds the supported element limit');
  }
  combined.push(item);
  return combined;
}
