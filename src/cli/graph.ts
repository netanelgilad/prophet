import { functionDefinition } from "../Function/definition";

export type EncodedValue = null | boolean | number | string |
  { ref: string } |
  { primitive: "undefined" | "NaN" | "Infinity" | "-Infinity" | "-0" };

type DataEntries = Array<[string, EncodedValue]>;
type NodeMetadata = { id: string; definition?: EncodedValue };

export type GraphNode = NodeMetadata & (
  | { kind: "record" | "execution-context"; entries: DataEntries }
  | { kind: "array"; length: number; entries: DataEntries }
  | { kind: "map"; entries: Array<[EncodedValue, EncodedValue]> }
  | { kind: "opaque-function"; name: string; entries: DataEntries }
);

export type EncodedGraph = {
  roots: { [name: string]: EncodedValue };
  nodes: GraphNode[];
};

const stateFields = ["global", "thisValue", "environment", "environments", "heap",
  "knowledge", "effects", "strict", "sourceFile", "uncaught"];

// This is an inspection graph, not executable source or a resumable snapshot.
// Host function closures remain explicitly opaque. Context compatibility views
// and temporary proof hooks are not part of the serialized execution state.
export function encodeGraph(roots: { [name: string]: unknown }): EncodedGraph {
  const identities = new Map<object, string>();
  const nodes: GraphNode[] = [];

  const descriptors = (value: object): PropertyDescriptorMap => {
    if (Object.getOwnPropertySymbols(value).length) {
      throw new Error("Graph serialization does not support symbol property keys");
    }
    return Object.getOwnPropertyDescriptors(value);
  };

  const dataValue = (descriptor: PropertyDescriptor, name: string): unknown => {
    if (!("value" in descriptor)) {
      throw new Error(`Graph serialization does not support accessor property '${name}'`);
    }
    return descriptor.value;
  };

  const entries = (properties: PropertyDescriptorMap, names = Object.keys(properties)): DataEntries =>
    names.filter(name => Object.prototype.hasOwnProperty.call(properties, name) && properties[name].enumerable)
      .map(name => [name, encode(dataValue(properties[name], name))] as [string, EncodedValue]);

  const plain = (value: object): boolean => {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  };

  const encode = (value: unknown): EncodedValue => {
    if (value === null) return null;
    if (typeof value === "string" || typeof value === "boolean") return value;
    if (value === undefined) return { primitive: "undefined" };
    if (typeof value === "number") {
      if (Number.isNaN(value)) return { primitive: "NaN" };
      if (value === Infinity) return { primitive: "Infinity" };
      if (value === -Infinity) return { primitive: "-Infinity" };
      if (Object.is(value, -0)) return { primitive: "-0" };
      return value;
    }
    if (typeof value !== "object" && typeof value !== "function") {
      throw new Error(`Graph serialization does not support ${typeof value} values`);
    }
    // TypeScript 3.3 does not retain unknown's null exclusion across the typeof
    // narrowing above; the runtime guards establish this reference boundary.
    const object = value as object;
    const known = identities.get(object);
    if (known !== undefined) return { ref: known };
    const id = `n${nodes.length}`;
    identities.set(object, id);

    // Reserve the identity before walking descendants, including metadata.
    const node: GraphNode = { id, kind: "record", entries: [] };
    nodes.push(node);
    const properties = descriptors(object);

    if (typeof value === "function") {
      const name = properties.name ? dataValue(properties.name, "name") : "";
      if (typeof name !== "string") throw new Error("Graph function name must be a string");
      Object.assign(node, { kind: "opaque-function", name, entries: entries(properties) });
    } else if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new Error("Graph serialization does not support this array prototype");
      }
      Object.assign(node, { kind: "array", length: dataValue(properties.length, "length"), entries: entries(properties) });
    } else if (value instanceof Map) {
      if (Object.getPrototypeOf(value) !== Map.prototype) {
        throw new Error("Graph serialization does not support this map prototype");
      }
      if (Object.keys(properties).some(name => properties[name].enumerable)) {
        throw new Error("Graph serialization does not support additional map properties");
      }
      const encoded: Array<[EncodedValue, EncodedValue]> = [];
      Object.assign(node, { kind: "map", entries: encoded });
      Map.prototype.forEach.call(value, (entry: unknown, key: unknown) => encoded.push([encode(key), encode(entry)]));
    } else {
      if (!plain(object)) throw new Error("Graph serialization does not support this object prototype");
      const type = properties.type && dataValue(properties.type, "type");
      if (type === "ExecutionContext") {
        const state = properties.value && dataValue(properties.value, "value");
        if (!state || typeof state !== "object" || !plain(state as object)) {
          throw new Error("Graph execution context requires a plain state record");
        }
        Object.assign(node, { kind: "execution-context", entries: entries(descriptors(state as object), stateFields) });
      } else {
        node.entries = entries(properties);
      }
    }

    const definition = functionDefinition(object);
    if (definition) node.definition = encode(definition);
    return { ref: id };
  };

  if (!plain(roots)) throw new Error("Graph roots require a plain record");
  const rootEntries = entries(descriptors(roots));
  const encodedRoots: { [name: string]: EncodedValue } = Object.create(null);
  rootEntries.forEach(([name, value]) => { encodedRoots[name] = value; });
  return { roots: encodedRoots, nodes };
}
