import { tuple } from '@deaven/tuple';
import { ESBuiltinFunction, ESFunction } from '../Function/Function';
import { getObjectPrototype } from '../Object/prototype';
import { markUnsupportedBoundaryObject, UnsupportedAnalysisError } from '../execution-context/analysis-failure';
import { Any, ESNumber, FunctionBinding, isArray } from '../types';
import { ESString } from '../string/String';
import { Array as ESArray, ArrayValue, TArray } from './Array';
import { push } from './push';
import { reverse } from './reverse';
import { join } from './join';
import { slice } from './slice';

let prototype: ArrayValue | undefined;
let constructor: FunctionBinding | undefined;

export function arrayBoundary(detail: string): never {
  throw new UnsupportedAnalysisError('Array analysis is not yet supported: ' + detail);
}

// Complete standard method names for this intrinsic surface. Missing supported
// methods are not ordinary undefined properties; Symbol APIs remain guarded by
// the shared Symbol boundary. Arbitrary absent string properties stay absent.
const deferred = ['at', 'concat', 'copyWithin', 'entries', 'every', 'fill', 'filter',
  'find', 'findIndex', 'findLast', 'findLastIndex', 'flat', 'flatMap', 'forEach',
  'includes', 'indexOf', 'keys', 'lastIndexOf', 'map', 'pop', 'reduce', 'reduceRight',
  'shift', 'some', 'sort', 'splice', 'toLocaleString', 'toReversed', 'toSorted',
  'toSpliced', 'toString', 'unshift', 'values', 'with', '__proto__'];

function method(name: string, length: number, implementation: Parameters<typeof ESBuiltinFunction>[0]) {
  const fn = markUnsupportedBoundaryObject(ESBuiltinFunction(implementation));
  Object.assign(fn.properties, { name: ESString(name), length: ESNumber(length) });
  return Object.assign(fn, { unknownProperties: 'Array method metadata',
    modeledInheritedProperties: ['call', 'constructor', 'prototype'],
    unmodeledOwnPropertyInspection: 'Array method descriptors',
    unmodeledPropertyWrites: ['name', 'length', 'caller', 'arguments'],
    unmodeledPropertyReads: ['caller', 'arguments'] });
}

export function getArrayPrototype(): ArrayValue {
  if (prototype) return prototype;
  // Array.prototype itself is an empty array exotic. Passing its actual parent
  // avoids recursively requesting this singleton from the ordinary array helper.
  prototype = markUnsupportedBoundaryObject(ESArray([], 'elements', getObjectPrototype()));
  Object.assign(prototype, { unmodeledPropertyReads: deferred,
    unmodeledOwnPropertyInspection: 'Array.prototype descriptors',
    propertyAccess: { read() { return undefined; }, write() { return arrayBoundary('Array.prototype mutation'); } } });
  Object.assign(prototype.properties, {
    push: method('push', 1, function*(self, args, context) { return push(self, args, context); }),
    reverse: method('reverse', 0, function*(self, args, context) {
      if (self === prototype) return arrayBoundary('Array.prototype mutation');
      if (!isArray(self)) return arrayBoundary('generic non-array reverse receivers');
      return yield* reverse(self as TArray<Any>, args, context);
    }),
    join: method('join', 1, function*(self, args, context) {
      if (!isArray(self)) return arrayBoundary('generic non-array join receivers');
      return yield* join(self as TArray<Any>, args, context);
    }),
    slice: method('slice', 2, function*(self, args, context) {
      if (!isArray(self)) return arrayBoundary('generic non-array slice receivers');
      return yield* slice(self as TArray<Any>, args, context);
    })
  });
  // Both lazy getters publish identities before following the constructor link.
  Object.assign(prototype.properties, { constructor: getArrayConstructor() });
  return prototype;
}

export function getArrayConstructor(): FunctionBinding {
  if (constructor) return constructor;
  constructor = markUnsupportedBoundaryObject(ESFunction(function*(_self: Any, args, context) {
    if (args.length) return arrayBoundary('Array constructor overloads other than zero arguments');
    return tuple(ESArray([]), context);
  }));
  Object.assign(constructor, {
    unmodeledPropertyReads: ['from', 'fromAsync', 'isArray', 'of', 'caller', 'arguments'],
    unmodeledPropertyWrites: ['prototype', 'length', 'name', 'caller', 'arguments', 'from', 'fromAsync', 'isArray', 'of'],
    unmodeledOwnPropertyInspection: 'Array constructor descriptors'
  });
  Object.assign(constructor.properties, { prototype: getArrayPrototype(), name: ESString('Array'), length: ESNumber(1) });
  return constructor;
}
