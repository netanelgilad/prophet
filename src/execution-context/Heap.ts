import { Any, WithProperties, ESNumber, TESBoolean, isArray } from "../types";
import { ESBoolean } from "../boolean/ESBoolean";
import { TArray } from "../array/Array";
import { ExecutionContext, TExecutionContext } from "./ExecutionContext";
import assert from "assert";

export type HeapEntry = {
  properties: { [name: string]: Any };
  // A property created on only one path is not an own undefined property on
  // the other path: lookup must still reach its prototype there.
  presence?: { [name: string]: TESBoolean };
  // Undefined on an array means its element structure is no longer known.
  elements?: Any[];
};

export type Heap = Map<object, HeapEntry>;

export function getProperties(value: WithProperties, context: TExecutionContext): { [name: string]: Any } {
  const entry = context.value.heap && context.value.heap.get(value);
  return entry ? entry.properties : value.properties;
}

export function ownPropertyPresence(value: WithProperties, name: string, context: TExecutionContext): TESBoolean {
  const entry = context.value.heap && context.value.heap.get(value);
  if (entry && entry.presence && Object.prototype.hasOwnProperty.call(entry.presence, name)) return entry.presence[name];
  return ESBoolean(Object.prototype.hasOwnProperty.call(getProperties(value, context), name));
}

export function getArrayElements(
  value: TArray<any>,
  context: TExecutionContext
): Any[] | undefined {
  const entry = context.value.heap && context.value.heap.get(value);
  if (entry) return entry.elements;
  return value.shape.kind === "elements" ? value.value as Any[] : undefined;
}

function writeEntry(
  value: object,
  entry: HeapEntry,
  context: TExecutionContext
): TExecutionContext {
  const heap = new Map<object, HeapEntry>(context.value.heap || []);
  heap.set(value, entry);
  return ExecutionContext({ ...context.value, heap });
}

export function isArrayIndex(name: string): boolean {
  const index = Number(name);
  return Number.isInteger(index) && index >= 0 && index < 0xffffffff &&
    String(index) === name;
}

export function writeArrayElements(
  value: TArray<any>,
  elements: Any[],
  context: TExecutionContext
): TExecutionContext {
  const properties = { ...getProperties(value as TArray<any> & WithProperties, context) };
  Object.keys(properties).forEach(name => {
    if (isArrayIndex(name)) delete properties[name];
  });
  elements.forEach((element, index) => { properties[index] = element; });
  properties.length = ESNumber(elements.length);
  const prior = context.value.heap && context.value.heap.get(value);
  const presence: { [name: string]: TESBoolean } = { ...(prior && prior.presence) };
  Object.keys(presence).forEach(name => { if (isArrayIndex(name) || name === "length") delete presence[name]; });
  return writeEntry(value, { properties, presence, elements: elements.slice() }, context);
}

export function writeProperty(
  value: WithProperties,
  name: string,
  assigned: Any,
  context: TExecutionContext
): TExecutionContext {
  const properties = getProperties(value, context);
  assert(properties, "Cannot assign a property of null or undefined");
  const prior = context.value.heap && context.value.heap.get(value);
  return writeEntry(value, {
    properties: { ...properties, [name]: assigned },
    presence: { ...(prior && prior.presence), [name]: ESBoolean(true) },
    elements: isArray(value)
      ? getArrayElements(value as WithProperties & TArray<any>, context)
      : undefined
  }, context);
}
