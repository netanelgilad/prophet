import { Any, WithProperties, ESNumber, TESBoolean, isArray } from "../types";
import { ESBoolean } from "../boolean/ESBoolean";
import { TArray } from "../array/Array";
import { ExecutionContext, TExecutionContext } from "./ExecutionContext";
import assert from "assert";
import { PropertyKeys, appendPropertyKey, isArrayIndex } from "./PropertyKeys";
import { markUnsupportedBoundaryObject, unsupportedPropertyError } from "./analysis-failure";
export { isArrayIndex } from "./PropertyKeys";

export type HeapEntry = {
  properties: { [name: string]: Any };
  // A property created on only one path is not an own undefined property on
  // the other path: lookup must still reach its prototype there.
  presence?: { [name: string]: TESBoolean };
  keyOrder?: PropertyKeys;
  // Undefined on an array means its element structure is no longer known.
  elements?: Any[];
};

export type Heap = Map<object, HeapEntry>;

// A closed intrinsic can have known standard own names whose values are not
// implemented yet. Keep that knowledge private, separate from guest properties
// and mutable heap presence. A current own replacement can implement such a name.
// Lazy initialization permits intrinsic registration during module cycles.
var partialIntrinsics: WeakMap<object, { label: string; deferred: ReadonlySet<string> }> | undefined;
export function markPartialIntrinsic<T extends WithProperties>(
  value: T, label: string, deferred: ReadonlyArray<string>
): T {
  if (!partialIntrinsics) partialIntrinsics = new WeakMap();
  partialIntrinsics.set(value, { label, deferred: new Set(deferred) });
  return markUnsupportedBoundaryObject(value);
}

// Call only on an absent-own branch. Testing before the presence split would
// discard the usable side of a conditional replacement. Low-level heap presence
// describes modeled storage, not completeness of an intrinsic's JS surface.
export function assertModeledOwnAbsence(value: WithProperties, name: string): void {
  const partial = partialIntrinsics && partialIntrinsics.get(value);
  if (partial && partial.deferred.has(name)) {
    throw unsupportedPropertyError(value, `${partial.label}.${name} is not yet supported`);
  }
}

export function getProperties(value: WithProperties, context: TExecutionContext): { [name: string]: Any } {
  const entry = context.value.heap && context.value.heap.get(value);
  return entry ? entry.properties : value.properties;
}

export function ownPropertyPresence(value: WithProperties, name: string, context: TExecutionContext): TESBoolean {
  const entry = context.value.heap && context.value.heap.get(value);
  if (entry && entry.presence && Object.prototype.hasOwnProperty.call(entry.presence, name)) return entry.presence[name];
  return ESBoolean(Object.prototype.hasOwnProperty.call(getProperties(value, context), name));
}

export function getPropertyKeys(value: WithProperties, context: TExecutionContext): PropertyKeys {
  const entry = context.value.heap && context.value.heap.get(value);
  return entry && entry.keyOrder || { kind: "keys", keys: Object.keys(getProperties(value, context)) };
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

// Host-side removal mirroring writeProperty's entry bookkeeping: properties,
// presence and every key-order branch drop the name together.
export function removeProperty(
  value: WithProperties,
  name: string,
  context: TExecutionContext
): TExecutionContext {
  const properties = getProperties(value, context);
  const prior = context.value.heap && context.value.heap.get(value);
  const nextProperties = { ...properties };
  delete nextProperties[name];
  const nextPresence: { [name: string]: TESBoolean } = { ...(prior && prior.presence) };
  delete nextPresence[name];
  const filterOrder = (order: PropertyKeys): PropertyKeys => {
    if (order.kind === "choice") {
      return { ...order, consequent: filterOrder(order.consequent), alternate: filterOrder(order.alternate) };
    }
    return { kind: "keys", keys: order.keys.filter(key => key !== name) };
  };
  return writeEntry(value, {
    properties: nextProperties,
    presence: nextPresence,
    keyOrder: filterOrder(getPropertyKeys(value, context)),
    elements: isArray(value)
      ? getArrayElements(value as WithProperties & TArray<any>, context)
      : undefined
  }, context);
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
    keyOrder: appendPropertyKey(getPropertyKeys(value, context), name),
    elements: isArray(value)
      ? getArrayElements(value as WithProperties & TArray<any>, context)
      : undefined
  }, context);
}
