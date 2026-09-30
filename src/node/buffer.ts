import { withValue } from "../conversion/toString";
import { createHostFunction } from "../effects";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult } from "../execution-context/branches";
import { getProperties, writeProperty } from "../execution-context/Heap";
import { ESObject, TESObject } from "../Object";
import { getObjectPrototype } from "../Object/prototype";
import { ESString } from "../string/String";
import { choiceOf } from "../symbolic";
import { Any, ESNumber, isESNumber, isESString, isUndefined, Undefined } from "../types";

const lengths = new WeakMap<object, number>();
let bufferPrototype: TESObject | undefined;

function unsupported(detail: string): never {
  throw new Error(`Buffer analysis is not yet supported: ${detail}`);
}

// CanonicalNumericIndexString, not array-index parsing. Invalid numeric indices
// still bypass ordinary prototype lookup on integer-indexed exotic objects.
function numericIndex(name: string): number | undefined {
  if (name === "-0") return -0;
  const index = Number(name);
  return String(index) === name ? index : undefined;
}

function validIndex(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && !Object.is(index, -0) && index < length;
}

function uint8(value: number): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  return ((Math.trunc(value) % 256) + 256) % 256;
}

// Decode the current persistent heap, not an allocation-time copy. Choices in
// bytes use the same path knowledge as every other VM value.
function decode(value: TESObject, length: number, context: TExecutionContext): BranchResult {
  const step = (position: number, bytes: number[], current: TExecutionContext): BranchResult => {
    for (let index = position; index < length; index++) {
      const byte = getProperties(value, current)[String(index)];
      if (choiceOf(byte)) {
        const next = index + 1;
        return withValue(byte, current, (selected, branch) => {
          if (!isESNumber(selected) || typeof selected.value !== "number") return unsupported("open symbolic bytes");
          return step(next, bytes.concat([selected.value]), branch);
        });
      }
      if (!isESNumber(byte) || typeof byte.value !== "number") return unsupported("open symbolic bytes");
      bytes.push(byte.value);
    }
    return [ESString(Buffer.from(bytes).toString("utf8")), current];
  };
  return step(0, [], context);
}

function getBufferPrototype(): TESObject {
  if (bufferPrototype) return bufferPrototype;
  const toString = Object.assign(createHostFunction("Buffer.toString", (call, context) =>
    withValue(call.receiver, context, (receiver, branch) => {
      const length = lengths.get(receiver);
      if (length === undefined) return unsupported("toString borrowed by an unmodeled receiver");
      // Start/end coercions and their observable effects are a separate slice.
      return withValue(call.args[1] || Undefined, branch, (start, afterStart) =>
        withValue(call.args[2] || Undefined, afterStart, (end, afterEnd) => {
          if (!isUndefined(start) || !isUndefined(end)) return unsupported("toString start/end ranges and coercion");
          if (length === 0) return [ESString(""), afterEnd];
          return withValue(call.args[0] || Undefined, afterEnd, (encoding, afterEncoding) => {
            if (!isUndefined(encoding) && !(isESString(encoding) && typeof encoding.value === "string" &&
                ["utf8", "utf-8"].includes(encoding.value.toLowerCase()))) {
              return unsupported("toString encodings and encoding coercion");
            }
            return decode(receiver as TESObject, length, afterEncoding);
          });
        }));
    })), {
    nonConstructible: false, unmodeledConstruct: "Buffer toString construction is not yet supported",
    unknownProperties: "Buffer toString function API", modeledInheritedProperties: ["call"],
    unmodeledOwnPropertyInspection: "Buffer function descriptors",
    unmodeledPropertyReads: ["caller", "arguments"],
    unmodeledPropertyWrites: ["name", "length", "caller", "arguments"]
  });
  Object.assign(toString.properties, { name: ESString("toString"), length: ESNumber(3) });
  // Preserve the real chain for generic prototype reasoning, independently of
  // whether each prototype's methods/descriptors are exposed to user code.
  const typedArrayPrototype = Object.assign(ESObject(undefined, "unmodeled"), {
    prototype: getObjectPrototype(), modeledPrototype: true,
    unknownProperties: "TypedArray prototype API", unmodeledOwnPropertyInspection: "TypedArray descriptors"
  });
  const uint8ArrayPrototype = Object.assign(ESObject(undefined, "unmodeled"), {
    prototype: typedArrayPrototype, modeledPrototype: true,
    unknownProperties: "Uint8Array prototype API", unmodeledOwnPropertyInspection: "Uint8Array descriptors"
  });
  bufferPrototype = Object.assign(ESObject({ toString }, "unmodeled"), {
    prototype: uint8ArrayPrototype, modeledPrototype: true,
    unknownProperties: "Buffer and Uint8Array prototype API",
    unmodeledOwnPropertyInspection: "Buffer prototype descriptors"
  });
  return bufferPrototype;
}

/** Embedding input: fresh Buffer identity with copied, concrete unsigned bytes.
 * Buffer constructors, allocation/pooling and backing-store views remain gaps.
 * Mutations below affect only VM heap state, never the input or filesystem.
 */
export function createBufferValue(bytes: ReadonlyArray<number>): TESObject {
  if (!Array.isArray(bytes)) throw new Error("Buffer setup requires an array of bytes");
  const properties: { [name: string]: Any } = {};
  for (let index = 0; index < bytes.length; index++) {
    const byte = bytes[index];
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw new Error("Buffer setup requires dense unsigned bytes");
    properties[index] = ESNumber(byte);
  }
  const length = bytes.length;
  const value = Object.assign(ESObject(properties, "unmodeled"), {
    prototype: getBufferPrototype(), modeledPrototype: true, unknownProperties: "Buffer and Uint8Array API",
    modeledInheritedProperties: ["toString"],
    unmodeledOwnPropertyInspection: "Buffer integer-indexed descriptors and reflection",
    unmodeledPropertyWrites: ["length", "byteLength"],
    propertyAccess: {
      read(name: string, context: TExecutionContext): BranchResult | undefined {
        if (name === "length" || name === "byteLength") return [ESNumber(length), context];
        const index = numericIndex(name);
        return index === undefined ? undefined :
          [validIndex(index, length) ? getProperties(value, context)[name] : Undefined, context];
      },
      write(name: string, assigned: Any, context: TExecutionContext): BranchResult | undefined {
        const index = numericIndex(name);
        if (index === undefined) return undefined;
        // Typed array assignment converts before checking bounds. Do not ignore
        // a coercion (or its throw/effects) merely because the index is invalid.
        return withValue(assigned, context, (number, branch) => {
          if (!isESNumber(number) || typeof number.value !== "number") return unsupported("byte write coercion or open symbolic numbers");
          return [number, validIndex(index, length)
            ? writeProperty(value, name, ESNumber(uint8(number.value)), branch) : branch];
        });
      }
    }
  });
  lengths.set(value, length);
  return value;
}
