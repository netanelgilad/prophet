import { TESBoolean } from "../types";

// Property creation order can differ across paths even when the final values
// and set of property names are identical. A union of names loses that fact.
export type PropertyKeys =
  | { kind: "keys"; keys: ReadonlyArray<string> }
  | { kind: "choice"; condition: TESBoolean; consequent: PropertyKeys; alternate: PropertyKeys };

export function isArrayIndex(name: string): boolean {
  const index = Number(name);
  return Number.isInteger(index) && index >= 0 && index < 0xffffffff && String(index) === name;
}

export function appendPropertyKey(order: PropertyKeys, name: string): PropertyKeys {
  if (order.kind === "choice") return {
    ...order, consequent: appendPropertyKey(order.consequent, name), alternate: appendPropertyKey(order.alternate, name)
  };
  if (order.keys.includes(name)) return order;
  const keys = order.keys.concat(name);
  return { kind: "keys", keys: keys.filter(isArrayIndex).sort((a, b) => Number(a) - Number(b))
    .concat(keys.filter(key => !isArrayIndex(key))) };
}

export function mergePropertyKeys(condition: TESBoolean, consequent: PropertyKeys, alternate: PropertyKeys): PropertyKeys {
  if (consequent === alternate || (consequent.kind === "keys" && alternate.kind === "keys" &&
      consequent.keys.length === alternate.keys.length && consequent.keys.every((key, index) => key === alternate.keys[index]))) {
    return consequent;
  }
  return { kind: "choice", condition, consequent, alternate };
}
