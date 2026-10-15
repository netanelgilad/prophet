import { Any, isArray, isESNull, isESNumber, Undefined, WithProperties } from '../types';
import { getArrayElements, getProperties } from '../execution-context/Heap';
import { TExecutionContext } from '../execution-context/ExecutionContext';
import { getObjectPrototype, prototypeOf } from '../Object/prototype';
import { ArrayValue, TArray } from './Array';
import { arrayBoundary, getArrayPrototype } from './prototype';
import { assertNoInheritedArrayElements } from './inherited-elements';

// Bounded ordinary-array call/new spread arguments, following
// https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-argument-lists
// (the iterator protocol of spread elements). Iteration is proven to be the
// intrinsic %Array.prototype.values% protocol on an ordinary array whose
// intrinsic prototype chain carries no symbol state, so the answer is the
// current elements in index order. Holes yield undefined only after proving
// no inherited indexed elements exist within range. Custom @@iterator hooks
// (own or on Array.prototype), exotic/accessor arrays, non-array iterables
// (strings, Maps, Sets, generators), unknown lengths and layouts above the
// element budget stop as typed boundaries rather than guessing; native
// TypeErrors for non-iterables are not fabricated.
const maximumSpreadElements = 1024;

export function ordinarySpreadElements(value: Any, context: TExecutionContext): Any[] {
  if (!isArray(value) || value === getArrayPrototype()) {
    return arrayBoundary('spread requires an ordinary array argument, not other iterables');
  }
  const array = value as ArrayValue;
  if (array.propertyAccess || array.unknownProperties || array.unmodeledPrototype ||
    array.unmodeledOwnPropertyInspection ||
    (array.unmodeledPropertyReads && array.unmodeledPropertyReads.length) ||
    array.prototype !== getArrayPrototype() ||
    (array.unmodeledPropertyWrites && array.unmodeledPropertyWrites.length) ||
    (array.wellKnownSymbols && array.wellKnownSymbols.size)) {
    return arrayBoundary('exotic/accessor/custom-iterator array spread operands');
  }
  // A guest write to Array.prototype[Symbol.iterator] (or any symbol slot on
  // the intrinsic links) would redirect iteration; prove the chain carries no
  // symbol state and no custom links before answering from current elements.
  if (prototypeOf(getArrayPrototype()) !== getObjectPrototype() ||
    !isESNull(prototypeOf(getObjectPrototype()))) {
    return arrayBoundary('custom prototype chain in spread operands');
  }
  for (const link of [getArrayPrototype(), getObjectPrototype()]) {
    const model = link as WithProperties;
    if ((model.wellKnownSymbols && model.wellKnownSymbols.size) ||
      model.unknownProperties || model.unmodeledPrototype) {
      return arrayBoundary('unresolved inherited symbol state in spread operands');
    }
  }
  const elements = getArrayElements(array, context), length = getProperties(array, context).length;
  if (!elements || !isESNumber(length) || typeof length.value !== 'number' || length.value !== elements.length) {
    return arrayBoundary('spread requires a known current array length and element structure');
  }
  if (elements.length > maximumSpreadElements) {
    return arrayBoundary('spread exceeds the supported element limit');
  }
  if (Object.keys(elements).length === elements.length) return elements.slice();
  // Holes read through the verified intrinsic chain; with no inherited
  // indexed elements they yield undefined, preserving the native argument.
  assertNoInheritedArrayElements(array as TArray<Any>, elements, context);
  const spread: Any[] = [];
  for (let index = 0; index < elements.length; index++) {
    spread.push(index in elements ? elements[index] : Undefined);
  }
  return spread;
}
