import { Any, ESNumber, TESNumber, Type, Undefined, WithProperties } from "../types";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { CollectionRegion, Fact } from "../symbolic/model";
import { compareNumbers, numberBounds, selectValue } from "../symbolic";
import { Array as ESArray, TArray } from "./Array";

const maximumArrayLength = 0xffffffff;

// The sequence identifies an immutable snapshot of primitive elements. Reads
// are memoized by absolute offset, so independent slices retain element identity.
export type SymbolicSequence = {
  id: object;
  element: TESNumber;
  reads: Map<number, TESNumber>;
};

export type SymbolicArrayShape = {
  kind: "symbolic";
  sequence: SymbolicSequence;
  offset: number;
  minimumLength: number;
  maximumLength: number;
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
    sequence: { id: {}, element: cloneTemplate(options.element), reads: new Map() },
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
    throw new Error("Symbolic array writes are not yet supported");
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

// Host undefined means this helper does not handle the array representation;
// language Undefined is the actual result of a read outside the array's length.
export function readSymbolicIndex(
  array: Any,
  index: number,
  context: TExecutionContext
): Any | undefined {
  const shape = getSymbolicArrayShape(array, context);
  if (!shape) return undefined;
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Symbolic array reads require nonnegative integer indices");
  }
  const length = (array as SymbolicNumberArray).properties.length;
  const knowledge = context.value.knowledge || [];
  const present = compareNumbers(ESNumber(index), length, "<", knowledge);
  if (present.value === false) return Undefined;
  const absoluteIndex = shape.offset + index;
  let element = shape.sequence.reads.get(absoluteIndex);
  if (!element) {
    element = cloneTemplate(shape.sequence.element);
    element.knowledge = (element.knowledge || []).concat({
      kind: "member",
      collection: { id: shape.sequence.id, start: absoluteIndex, end: absoluteIndex + 1 },
      element
    });
    shape.sequence.reads.set(absoluteIndex, element);
  }
  return present.value === true ? element : selectValue(present, element, Undefined, knowledge);
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
