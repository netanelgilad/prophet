import { Any, isESNull, WithProperties } from '../types';
import { TArray } from './Array';
import { arrayBoundary, getArrayPrototype } from './prototype';
import { getObjectPrototype, prototypeOf } from '../Object/prototype';
import { getProperties, isArrayIndex, ownPropertyPresence } from '../execution-context/Heap';
import { TExecutionContext } from '../execution-context/ExecutionContext';
import { resolveBoolean } from '../symbolic';

// The legacy algorithms read their stored element layout directly. A hole can
// therefore only be treated as absent after checking current inherited state.
// Do not materialize prototype values: reverse/slice need full HasProperty/Get
// semantics, including conditional presence and effects, before that is sound.
export function assertNoInheritedArrayElements(
  array: TArray<any>, elements: Any[], context: TExecutionContext
): void {
  if (Object.keys(elements).length === elements.length) return;
  const receiver = array as TArray<any> & WithProperties;
  if (receiver.unknownProperties || receiver.unmodeledPrototype ||
      receiver.propertyAccess && receiver !== getArrayPrototype()) {
    arrayBoundary('sparse legacy methods require ordinary modeled prototype lookup');
  }
  let prototype = prototypeOf(receiver);
  const seen = new Set<Any>();
  while (!isESNull(prototype)) {
    if (seen.has(prototype) || prototype !== getArrayPrototype() && prototype !== getObjectPrototype()) {
      arrayBoundary('sparse legacy methods require the shared intrinsic prototype chain');
    }
    seen.add(prototype);
    const object = prototype as WithProperties;
    for (const name of Object.keys(getProperties(object, context))) {
      if (isArrayIndex(name) && Number(name) < elements.length &&
          !Object.prototype.hasOwnProperty.call(elements, name) &&
          resolveBoolean(ownPropertyPresence(object, name, context), context.value.knowledge) !== false) {
        arrayBoundary('inherited indexed elements in sparse reverse/join/slice');
      }
    }
    prototype = prototypeOf(prototype);
  }
}
