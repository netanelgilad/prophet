import { Any, ESNull, ESNumber } from "../types";
import { ESObject } from "../Object";
import { ESBoolean } from "../boolean/ESBoolean";
import { ESString } from "../string/String";
import { Array as ESArray } from "../array/Array";

// JSON is data, never JavaScript source. Build fresh VM identities on each
// initialization; subsequent requires use the ordinary module cache and heap.
export function parseJSONModule(source: string): Any {
  return fromJSON(JSON.parse(source.replace(/^\uFEFF/, "")));
}

function fromJSON(value: any): Any {
  if (value === null) return ESNull;
  if (typeof value === "boolean") return ESBoolean(value);
  if (typeof value === "number") return ESNumber(value);
  if (typeof value === "string") return ESString(value);
  if (Array.isArray(value)) return ESArray(value.map(fromJSON));
  // __proto__ is an ordinary own data key in JSON. Assigning it to a host {}
  // would invoke a setter and lose the represented property.
  const properties: { [name: string]: Any } = Object.create(null);
  Object.keys(value).forEach(name => { properties[name] = fromJSON(value[name]); });
  return ESObject(properties);
}
