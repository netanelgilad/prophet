import { Any, ESNumber, isArray, isESNull, isESNumber, isUndefined, ThrownValue, WithProperties } from '../types';
import { getArrayElements, getProperties, ownPropertyPresence, writeArrayElements } from '../execution-context/Heap';
import { TExecutionContext } from '../execution-context/ExecutionContext';
import { BranchResult } from '../execution-context/branches';
import { withValue } from '../conversion/toString';
import { createError } from '../error/Error';
import { ESString } from '../string/String';
import { resolveBoolean } from '../symbolic';
import { getObjectPrototype, prototypeOf } from '../Object/prototype';
import { arrayBoundary, getArrayPrototype, hasDefaultArrayPrototypeIndexedLookup, hasDefaultArrayPrototypeIndexedWrite } from './prototype';
import { ArrayValue } from './Array';

// Bounded dense ordinary-array unshift. After proving all reached Get/Set
// operations are ordinary and cannot throw or call guest code, a persistent
// snapshot update is equivalent to descending indexed shifts then argument
// writes then the length Set. No constructor/species/spreadability lookup occurs.
// Sparse sources require DeletePropertyOrThrow and remain an explicit boundary.
const maximumUnshiftElements = 1024;

export function unshift(receiver: Any, args: Any[], context: TExecutionContext): BranchResult {
  return withValue(receiver, context, (value, branch) => {
    if (isESNull(value) || isUndefined(value)) return [ThrownValue(createError('TypeError', ESString())), branch];
    if (!isArray(value)) return arrayBoundary('generic non-array unshift receivers and length coercion');
    const array = value as ArrayValue;
    if (array === getArrayPrototype()) return arrayBoundary('Array.prototype unshift mutation');
    if (array.propertyAccess || array.unknownProperties || array.unmodeledPrototype ||
      array.unmodeledOwnPropertyInspection ||
      (array.unmodeledPropertyReads && array.unmodeledPropertyReads.length) ||
      (array.unmodeledPropertyWrites && array.unmodeledPropertyWrites.length) ||
      array.prototype !== getArrayPrototype()) {
      return arrayBoundary('exotic/accessor/custom-descriptor unshift receivers');
    }
    const elements = getArrayElements(array, branch), length = getProperties(array, branch).length;
    if (!elements || !isESNumber(length) || typeof length.value !== 'number' || length.value !== elements.length) {
      return arrayBoundary('unshift requires a known current array length and element structure');
    }
    const count = length.value, finalCount = count + args.length;
    // Limits precede indexed inspection, copying and any state writes. Maximum
    // array-length partial failures are not approximated as successful writes.
    if (finalCount > 0xffffffff) return arrayBoundary('unshift overflow and partial maximum-length writes');
    if (finalCount > maximumUnshiftElements) return arrayBoundary('unshift exceeds the supported element limit');
    for (let index = 0; index < count; index++) {
      if (!Object.prototype.hasOwnProperty.call(elements, index) ||
        resolveBoolean(ownPropertyPresence(array, String(index), branch), branch.value.knowledge) !== true) {
        return arrayBoundary('sparse or conditional-presence unshift receivers');
      }
    }
    // Even zero arguments performs a length Set. The receiver checks above
    // establish its ordinary writable own length; no index/prototype lookup
    // is reached in that case. Retain the dense-domain restriction explicitly.
    if (!args.length) return [ESNumber(count), branch];
    assertOrdinaryNewDestinations(count, finalCount);
    return [ESNumber(finalCount), writeArrayElements(array, args.concat(elements), branch)];
  });
}

function assertOrdinaryNewDestinations(first: number, end: number): void {
  const arrayPrototype = getArrayPrototype(), objectPrototype = getObjectPrototype();
  if (prototypeOf(arrayPrototype) !== objectPrototype || !isESNull(prototypeOf(objectPrototype)) ||
    !hasDefaultArrayPrototypeIndexedLookup(arrayPrototype) ||
    !hasDefaultArrayPrototypeIndexedWrite(arrayPrototype) || objectPrototype.propertyAccess) {
    return arrayBoundary('custom inherited destination hooks in unshift receivers');
  }
  // Existing dense own indices hide inherited descriptors. Newly created target
  // indices do not: prove the shared prototype chain has no unresolved setters,
  // read-only fields or unknown properties there before any descending move.
  // Ordinary inherited data values are allowed; Set creates a new own property.
  for (const link of [arrayPrototype, objectPrototype]) {
    const model = link as WithProperties;
    if (model.unknownProperties || model.unmodeledPrototype) {
      return arrayBoundary('unresolved inherited destination state in unshift receivers');
    }
    for (let index = first; index < end; index++) {
      const name = String(index);
      if ((model.unmodeledPropertyWrites && model.unmodeledPropertyWrites.includes(name)) ||
        (model.unmodeledPropertyReads && model.unmodeledPropertyReads.includes(name))) {
        return arrayBoundary('unresolved inherited destination descriptor in unshift receivers');
      }
    }
  }
}
