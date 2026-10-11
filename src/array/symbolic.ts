import { Any, ESNumber, TESNumber, Type, Undefined, WithProperties, isESNull } from "../types";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { CollectionRegion, Fact } from "../symbolic/model";
import { compareNumbers, exactIntegerEndpoint, numberBounds, selectValue, strictEquality } from "../symbolic";
import { UnsupportedAnalysisError } from "../execution-context/analysis-failure";
import { getProperties, ownPropertyPresence, isArrayIndex } from "../execution-context/Heap";
import { prototypeOf } from "../Object/prototype";
import { getObjectPrototype } from "../Object/prototype";
import { Array as ESArray, TArray } from "./Array";
import { getArrayPrototype, hasDefaultArrayPrototypeIndexedLookup } from "./prototype";

const maximumArrayLength = 0xffffffff;
const maxIndexedTerms = 256;
const maxIndexedLookupKeys = 256;
const maxIndexedGuardFacts = 128;

// The sequence identifies an immutable snapshot of primitive elements. Reads
// are memoized by absolute offset, so independent slices retain element identity.
export type SymbolicSequence = {
  id: object;
  element: TESNumber;
  reads: Map<number, TESNumber>;
  length?: TESNumber;
  indexedReads: Map<TESNumber, Map<number, TESNumber>>;
};

export type SymbolicArrayShape = {
  kind: "symbolic";
  sequence: SymbolicSequence;
  offset: number;
  minimumLength: number;
  maximumLength: number;
  length?: TESNumber;
};

export type SymbolicNumberArray = Type<"array"> & TArray<TESNumber> &
  WithProperties<{ length: TESNumber }> & { shape: SymbolicArrayShape };

export function symbolicNumberArray(options: {
  minimumLength?: number;
  maximumLength?: number;
  element: TESNumber;
}): SymbolicNumberArray {
  const minimumLength = options.minimumLength === undefined ? 0 : options.minimumLength;
  const maximumLength = options.maximumLength === undefined ? maximumArrayLength : options.maximumLength;
  if (!Number.isInteger(minimumLength) || !Number.isInteger(maximumLength) ||
      minimumLength < 0 || maximumLength > maximumArrayLength || minimumLength > maximumLength) {
    throw new RangeError("Symbolic array lengths require ordered nonnegative uint32 bounds");
  }
  return createView({
    kind: "symbolic",
    sequence: { id: {}, element: cloneTemplate(options.element), reads: new Map(),
      indexedReads: new Map() },
    offset: 0,
    minimumLength,
    maximumLength
  });
}

export function getSymbolicArrayShape(
  value: Any,
  context?: TExecutionContext
): SymbolicArrayShape | undefined {
  const shape = (value as TArray<any>).shape;
  if (!shape || shape.kind !== "symbolic") return undefined;
  if (context && context.value.heap && context.value.heap.has(value)) {
    throw new UnsupportedAnalysisError("Symbolic array writes are not yet supported");
  }
  if (context && shape.length &&
      getProperties(value as WithProperties, context).length !== shape.length) {
    throw new UnsupportedAnalysisError("Symbolic array length changed outside its snapshot");
  }
  return shape;
}

export function symbolicArrayRegion(value: Any, context?: TExecutionContext): CollectionRegion | undefined {
  const shape = getSymbolicArrayShape(value, context);
  return shape && {
    id: shape.sequence.id,
    start: shape.offset,
    end: shape.offset + shape.maximumLength
  };
}

export function symbolicActualArrayRegion(
  value: Any, context: TExecutionContext
): CollectionRegion | undefined {
  const shape = getSymbolicArrayShape(value, context);
  if (!shape || !shape.sequence.length) return undefined;
  if (compareNumbers(ESNumber(shape.offset), shape.sequence.length, "<=",
    context.value.knowledge || []).value !== true) return undefined;
  return { id: shape.sequence.id, start: shape.offset,
    end: { base: shape.sequence.length, offset: 0 } };
}

function unsupported(message: string): never {
  throw new UnsupportedAnalysisError("Symbolic indexed read: " + message);
}

// The shortcut represents an immutable dense own data element. A custom
// receiver/prototype or a declared partial indexed lookup is not this model.
export function assertSymbolicIndexedLookup(
  array: Any, name: string | undefined, context: TExecutionContext
): void {
  getSymbolicArrayShape(array, context);
  const receiver = array as WithProperties;
  const properties = getProperties(receiver, context);
  const hasIndexedOwn = () => {
    if (name !== undefined) return Object.prototype.hasOwnProperty.call(properties, name);
    let visited = 0;
    for (const key in properties) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) continue;
      if (++visited > maxIndexedLookupKeys || isArrayIndex(key)) return true;
    }
    return false;
  };
  if (receiver.propertyAccess || receiver.unknownProperties || receiver.unmodeledPrototype ||
      receiver.prototype !== getArrayPrototype() ||
      (receiver.unmodeledPropertyReads || []).length > maxIndexedLookupKeys ||
      (receiver.unmodeledPropertyReads || []).some(read =>
        name === undefined ? isArrayIndex(read) : read === name) ||
      hasIndexedOwn()) {
    unsupported("receiver has an unverified indexed lookup");
  }
}

function noInheritedIndex(array: Any, name: string | undefined,
  context: TExecutionContext): boolean {
  let prototype = prototypeOf(array);
  const seen = new Set<Any>();
  while (!isESNull(prototype)) {
    if (seen.has(prototype) || prototype !== getArrayPrototype() &&
        prototype !== getObjectPrototype()) return false;
    seen.add(prototype);
    const object = prototype as WithProperties;
    if (object.propertyAccess && !hasDefaultArrayPrototypeIndexedLookup(prototype) ||
        object.unknownProperties || object.unmodeledPrototype ||
        (object.unmodeledPropertyReads || []).length > maxIndexedLookupKeys ||
        (object.unmodeledPropertyReads || []).some(read =>
          name === undefined ? isArrayIndex(read) : read === name)) return false;
    const properties = getProperties(object, context);
    if (name !== undefined) {
      if (Object.prototype.hasOwnProperty.call(properties, name) &&
          ownPropertyPresence(object, name, context).value !== false) return false;
    } else {
      let visited = 0;
      for (const key in properties) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) continue;
        if (++visited > maxIndexedLookupKeys) return false;
        if (isArrayIndex(key) && ownPropertyPresence(object, key, context).value !== false) return false;
      }
    }
    prototype = prototypeOf(prototype);
  }
  return true;
}

export function symbolicIndexPresence(array: Any, index: number,
  context: TExecutionContext): boolean | undefined {
  const length = (array as SymbolicNumberArray).properties.length;
  return compareNumbers(ESNumber(index), length, "<", context.value.knowledge || []).value;
}

// Host undefined means this helper does not handle the array representation;
// language Undefined is the actual result of a read outside the array's length.
export function readSymbolicIndex(
  array: Any,
  index: number | TESNumber,
  context: TExecutionContext
): Any | undefined {
  const shape = getSymbolicArrayShape(array, context);
  if (!shape) return undefined;
  if (typeof index !== "number") return readIndexedTerm(array, index, context);
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Symbolic array reads require nonnegative integer indices");
  }
  assertSymbolicIndexedLookup(array, String(index), context);
  const length = (array as SymbolicNumberArray).properties.length;
  const knowledge = context.value.knowledge || [];
  const present = compareNumbers(ESNumber(index), length, "<", knowledge);
  if (present.value !== true && !noInheritedIndex(array, String(index), context)) {
    unsupported("possible inherited indexed lookup");
  }
  if (present.value === false) return Undefined;
  const absoluteIndex = shape.offset + index;
  let element = shape.sequence.reads.get(absoluteIndex);
  if (!element) {
    element = cloneTemplate(shape.sequence.element);
    element.expression = { kind: "indexed-element", sequence: shape.sequence.id,
      index: ESNumber(absoluteIndex), offset: 0 };
    element.knowledge = (element.knowledge || []).concat({
      kind: "member",
      collection: { id: shape.sequence.id, start: absoluteIndex, end: absoluteIndex + 1 },
      element
    });
    shape.sequence.reads.set(absoluteIndex, element);
  }
  return present.value === true ? element : selectValue(present, element, Undefined, knowledge);
}

function readIndexedTerm(array: Any, index: TESNumber, context: TExecutionContext): TESNumber {
  const shape = getSymbolicArrayShape(array, context)!;
  const knowledge = context.value.knowledge || [];
  if (knowledge.length > maxIndexedGuardFacts ||
      (index.knowledge || []).length > maxIndexedGuardFacts) {
    unsupported("indexed read guard fact budget exhausted");
  }
  assertSymbolicIndexedLookup(array, undefined, context);
  if (!noInheritedIndex(array, undefined, context)) {
    unsupported("symbolic key may reach an inherited indexed lookup");
  }
  if (!exactIntegerEndpoint(index, knowledge) ||
      compareNumbers(index, ESNumber(0), ">=", knowledge).value !== true ||
      compareNumbers(index, ESNumber(0xffffffff), "<", knowledge).value !== true) {
    unsupported("index must be a proved nonnegative uint32 array index");
  }
  const length = (array as SymbolicNumberArray).properties.length;
  if (compareNumbers(index, length, "<", knowledge).value !== true) {
    unsupported("index presence in the actual view length is unproved");
  }
  let offsets = shape.sequence.indexedReads.get(index);
  if (offsets && offsets.has(shape.offset)) return offsets.get(shape.offset)!;
  if (shape.sequence.indexedReads.size >= maxIndexedTerms && !offsets ||
      offsets && offsets.size >= maxIndexedTerms) {
    unsupported("indexed read term budget exhausted");
  }
  const bounds = numberBounds(index, index.knowledge || []);
  let element: TESNumber;
  let sharedConcreteElement = false;
  // Two concrete possibilities are a bounded ordinary selection. This is
  // never used for the arbitrary uint32-range path.
  if (bounds.lower && bounds.upper && bounds.lower.inclusive && bounds.upper.inclusive &&
      bounds.upper.value === bounds.lower.value + 1 &&
      shape.minimumLength > bounds.upper.value) {
    const lower = bounds.lower.value, upper = bounds.upper.value;
    const first = readSymbolicIndex(array, lower, context) as TESNumber;
    const second = readSymbolicIndex(array, upper, context) as TESNumber;
    const condition = strictEquality(index, ESNumber(lower), knowledge);
    // A resolved selection can return a cached concrete element. Its facts
    // belong to its concrete position, so never append this key's membership
    // to that shared object.
    if (condition.value !== undefined) {
      return condition.value ? first : second;
    }
    element = selectValue(condition, first, second, knowledge) as TESNumber;
    sharedConcreteElement = element === first || element === second;
  } else {
    element = cloneTemplate(shape.sequence.element);
    element.expression = { kind: "indexed-element", sequence: shape.sequence.id,
      index, offset: shape.offset };
  }
  if (!sharedConcreteElement) {
    element.knowledge = (element.knowledge || []).concat({
      kind: "member", collection: { id: shape.sequence.id,
        index: { base: index, offset: shape.offset } }, element
    });
  }
  if (!offsets) {
    offsets = new Map();
    shape.sequence.indexedReads.set(index, offsets);
  }
  offsets.set(shape.offset, element);
  return element;
}

export function sliceSymbolicArray(
  array: Any,
  start: number,
  context: TExecutionContext
): SymbolicNumberArray {
  const shape = getSymbolicArrayShape(array, context);
  if (!shape) throw new Error("Expected a symbolic dense array");
  const normalizedStart = Number.isNaN(start) ? 0 : Math.trunc(start);
  if (normalizedStart < 0) {
    throw new Error("Symbolic Array.slice requires a nonnegative start");
  }
  const parentLength = (array as SymbolicNumberArray).properties.length;
  const bounds = refinedLengthBounds(shape, parentLength, context);
  const skip = Math.min(normalizedStart, bounds.maximumLength);
  const child = createView({
    kind: "symbolic",
    sequence: shape.sequence,
    offset: shape.offset + skip,
    minimumLength: Math.max(0, bounds.minimumLength - skip),
    maximumLength: Math.max(0, bounds.maximumLength - skip)
  });
  if (skip === 0) {
    child.properties.length = parentLength;
    child.shape.length = parentLength;
    return child;
  }
  const childLength = child.properties.length;
  childLength.knowledge = (childLength.knowledge || []).concat({
    kind: "order", left: childLength, right: parentLength,
    strict: skip > 0 && bounds.minimumLength > skip
  });
  if (childLength.value === undefined && bounds.minimumLength >= skip) {
    childLength.expression = {
      kind: "binary", operator: "-", left: parentLength, right: ESNumber(skip)
    };
  }
  return child;
}

function createView(shape: SymbolicArrayShape): SymbolicNumberArray {
  const array = ESArray<TESNumber>();
  const length = boundedLength(shape.minimumLength, shape.maximumLength);
  shape.length = length;
  if (shape.offset === 0 && !shape.sequence.length) shape.sequence.length = length;
  return {
    ...array,
    type: "array",
    shape,
    properties: { ...array.properties, length }
  };
}

function boundedLength(minimum: number, maximum: number): TESNumber {
  if (minimum === maximum) return ESNumber(minimum);
  const length = ESNumber();
  length.knowledge = [
    { kind: "finite", subject: length },
    { kind: "integer", subject: length },
    { kind: "order", left: ESNumber(minimum), right: length, strict: false },
    { kind: "order", left: length, right: ESNumber(maximum), strict: false }
  ];
  return length;
}

function refinedLengthBounds(
  shape: SymbolicArrayShape,
  length: TESNumber,
  context: TExecutionContext
): { minimumLength: number; maximumLength: number } {
  let minimumLength = shape.minimumLength;
  let maximumLength = shape.maximumLength;
  const bounds = numberBounds(length, context.value.knowledge || []);
  if (bounds.lower) {
    minimumLength = Math.max(minimumLength,
      bounds.lower.inclusive ? Math.ceil(bounds.lower.value) : Math.floor(bounds.lower.value) + 1);
  }
  if (bounds.upper) {
    maximumLength = Math.min(maximumLength,
      bounds.upper.inclusive ? Math.floor(bounds.upper.value) : Math.ceil(bounds.upper.value) - 1);
  }
  return { minimumLength, maximumLength };
}

function cloneTemplate(template: TESNumber): TESNumber {
  if (template.type !== "number" || template.expression || Object.keys(template.properties).length) {
    throw new Error("Symbolic array elements require a plain numeric template");
  }
  const result = ESNumber(template.value);
  result.knowledge = (template.knowledge || []).map((fact): Fact => {
    if ((fact.kind === "finite" || fact.kind === "notNaN" || fact.kind === "integer") &&
        fact.subject === template) {
      return { kind: fact.kind, subject: result };
    }
    if (fact.kind === "order") {
      const leftIsTemplate = fact.left === template;
      const rightIsTemplate = fact.right === template;
      const bound = leftIsTemplate ? fact.right : fact.left;
      if (leftIsTemplate !== rightIsTemplate && typeof bound.value === "number" &&
          !Number.isNaN(bound.value) && !bound.expression && !Object.keys(bound.properties).length) {
        return {
          kind: "order", strict: fact.strict,
          left: leftIsTemplate ? result : ESNumber(bound.value),
          right: rightIsTemplate ? result : ESNumber(bound.value)
        };
      }
    }
    throw new Error("Symbolic array element templates require only local numeric facts and literal bounds");
  });
  return result;
}
