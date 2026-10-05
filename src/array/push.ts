import { Any, ESNumber, isArray, isESNull, isESNumber, isUndefined, ThrownValue } from '../types';
import { getArrayElements, getProperties, writeArrayElements } from '../execution-context/Heap';
import { TExecutionContext } from '../execution-context/ExecutionContext';
import { BranchResult } from '../execution-context/branches';
import { withValue } from '../conversion/toString';
import { createError } from '../error/Error';
import { ESString } from '../string/String';
import { arrayBoundary, getArrayPrototype } from './prototype';
import { ArrayValue } from './Array';

/** Bounded ordinary-array push. No old element is read/coerced: holes remain
 * holes, appended values retain identity, and earlier heap snapshots survive. */
export function push(receiver: Any, args: Any[], context: TExecutionContext): BranchResult {
  return withValue(receiver, context, (value, branch) => {
    if (isESNull(value) || isUndefined(value)) return [ThrownValue(createError('TypeError', ESString())), branch];
    if (!isArray(value)) return arrayBoundary('generic non-array push receivers and length coercion');
    if (value === getArrayPrototype()) return arrayBoundary('Array.prototype mutation');
    const array = value as ArrayValue;
    if (array.propertyAccess || array.unknownProperties || array.unmodeledPrototype ||
      array.unmodeledOwnPropertyInspection || array.unmodeledPropertyReads && array.unmodeledPropertyReads.length ||
      array.prototype !== getArrayPrototype() ||
      array.unmodeledPropertyWrites && array.unmodeledPropertyWrites.length) {
      return arrayBoundary('exotic/accessor array push receivers');
    }
    const elements = getArrayElements(array, branch), length = getProperties(array, branch).length;
    if (!elements || !isESNumber(length) || typeof length.value !== 'number' || length.value !== elements.length) {
      return arrayBoundary('push requires a known current array length and element structure');
    }
    if (elements.length + args.length > 0xffffffff) return arrayBoundary('push overflow and partial maximum-length writes');
    if (!args.length) return [ESNumber(elements.length), branch];
    return [ESNumber(elements.length + args.length), writeArrayElements(array, elements.concat(args), branch)];
  });
}
