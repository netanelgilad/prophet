import { Any, ESNumber, TESNumber, Type, WithProperties } from "../types";
import { SymbolicArrayShape } from "./symbolic";
import { getArrayPrototype } from "./prototype";

// Shape describes the sequence, not whether its elements are known values.
export type ArrayShape =
  | { kind: "elements" }
  | { kind: "segments" }
  | { kind: "unknown" }
  | SymbolicArrayShape;

export type TArray<T> = {
  value?: Array<T> | Array<TArray<T>>;
  shape: ArrayShape;
};

export type ArrayValue<T = Any> = Type<"array"> & TArray<T> & WithProperties<{ length: TESNumber }>;

export function Array<T>(
  value?: Array<T> | Array<TArray<T>>,
  shapeKind?: "elements" | "segments",
  prototype: Any = getArrayPrototype()
): ArrayValue<T> {
  const shape: ArrayShape = {
    kind: value === undefined ? "unknown" : shapeKind || "elements"
  };
  const elements: { [index: number]: T | TArray<T> } = {};
  if (shape.kind === "elements" && value) {
    value.forEach((element: T | TArray<T>, index: number) => {
      elements[index] = element;
    });
  }

  return {
    type: "array",
    properties: Object.assign(elements, { length: calculateLength(value, shape) }),
    prototype, modeledPrototype: true,
    ownPropertyModel: "unmodeled",
    value,
    shape
  };
}

function calculateLength(
  value: Array<any> | undefined,
  shape: ArrayShape
): TESNumber {
  const summary = summarizeLength(value, shape);
  if (summary.minimum > 0xffffffff) {
    throw new RangeError("Invalid array length");
  }
  if (summary.exact) return ESNumber(summary.minimum);
  const length = ESNumber();
  length.knowledge = [
    { kind: "finite", subject: length },
    { kind: "integer", subject: length },
    { kind: "order", left: ESNumber(summary.minimum), right: length, strict: false },
    { kind: "order", left: length, right: ESNumber(0xffffffff), strict: false }
  ];
  return length;
}

function summarizeLength(
  value: Array<any> | undefined,
  shape: ArrayShape
): { minimum: number; exact: boolean } {
  if (shape.kind === "symbolic") {
    return { minimum: shape.minimumLength, exact: shape.minimumLength === shape.maximumLength };
  }
  if (shape.kind === "unknown" || value === undefined) {
    return { minimum: 0, exact: false };
  }
  if (shape.kind === "elements") {
    return { minimum: value.length, exact: true };
  }
  let minimumLength = 0;
  let exact = true;
  for (const part of value as Array<TArray<any>>) {
    const summary = summarizeLength(part.value, part.shape);
    minimumLength += summary.minimum;
    exact = exact && summary.exact;
  }
  return { minimum: minimumLength, exact };
}
