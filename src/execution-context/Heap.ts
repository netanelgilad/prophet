import { Any, WithProperties, ESNumber, TESBoolean, isArray } from "../types";
import { ESBoolean } from "../boolean/ESBoolean";
import { TArray } from "../array/Array";
import { ExecutionContext, TExecutionContext } from "./ExecutionContext";
import assert from "assert";
import { PropertyKeys, appendPropertyKey, isArrayIndex } from "./PropertyKeys";
import { markUnsupportedBoundaryObject, unsupportedPropertyError, UnsupportedAnalysisError } from "./analysis-failure";
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

// This operation is for complete ordinary array storage whose layout became
// conditional at a join. The caller validates array semantics and length.
export function writeJoinedArrayProperty(
  value: TArray<any> & WithProperties, name: string, assigned: Any, length: Any,
  context: TExecutionContext
): TExecutionContext {
  const prior = context.value.heap!.get(value)!;
  const limit = 4096;
  let work = 0;
  const count = (): void => {
    if (++work > limit) throw new UnsupportedAnalysisError("Joined array storage exceeds the supported work limit");
  };
  // Count before Object.keys, spreads, or recursive key-order copies. Indexed
  // ranges are never enumerated: a large sparse length costs only stored keys.
  for (const key in prior.properties) if (Object.prototype.hasOwnProperty.call(prior.properties, key)) count();
  for (const key in prior.presence) if (Object.prototype.hasOwnProperty.call(prior.presence, key)) count();
  const order = getPropertyKeys(value, context);
  const active = new Set<PropertyKeys>();
  const checkOrder = (current: PropertyKeys, depth: number): void => {
    count();
    if (depth > 32 || active.has(current)) throw new UnsupportedAnalysisError("Joined array key order exceeds the supported work limit");
    if (current.kind === 'keys') { for (let i = 0; i < current.keys.length; i++) count(); return; }
    active.add(current); checkOrder(current.consequent, depth + 1); checkOrder(current.alternate, depth + 1); active.delete(current);
  };
  checkOrder(order, 0);
  const truncates = name === 'length';
  const newLength = (length as ReturnType<typeof ESNumber>).value!;
  const retained = (key: string): boolean => !truncates || !isArrayIndex(key) || Number(key) < newLength;
  const properties: { [key: string]: Any } = Object.create(null);
  const presence: { [key: string]: TESBoolean } = Object.create(null);
  Object.keys(prior.properties).forEach(key => { if (retained(key)) properties[key] = prior.properties[key]; });
  Object.keys(prior.presence || {}).forEach(key => { if (retained(key)) presence[key] = prior.presence![key]; });
  properties.length = length;
  presence.length = ESBoolean(true);
  if (!truncates) { properties[name] = assigned; presence[name] = ESBoolean(true); }
  const updateOrder = (current: PropertyKeys): PropertyKeys => current.kind === 'choice' ? {
    ...current, consequent: updateOrder(current.consequent), alternate: updateOrder(current.alternate)
  } : { kind: 'keys', keys: current.keys.filter(retained) };
  const keyOrder = truncates ? updateOrder(order) : appendPropertyKey(order, name);
  return writeEntry(value, { properties, presence, keyOrder }, context);
}
