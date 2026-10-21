import { readMember } from "../ASTResolvers";
import { isObjectValue, toString, withValue } from "../conversion/toString";
import { createError } from "../error/Error";
import { bindNormal } from "../evaluate";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { getProperties, ownPropertyPresence, writeProperty } from "../execution-context/Heap";
import { ESObject } from "../Object";
import { withEnumerableOwnProperties } from "../Object/enumeration";
import { ESString, TESString } from "../string/String";
import { Any, ESNull, ThrownValue, WithProperties, isArray, isUndefined } from "../types";

function unsupported(detail: string): never {
  throw new Error(`HTTP header analysis is not yet supported: ${detail}`);
}

export function headerError(code: string, message: string, context: TExecutionContext): BranchResult {
  const error = createError("TypeError", ESString(message));
  error.properties.code = ESString(code);
  return [ThrownValue(error), context];
}

// Node's default strict header validation permits HTAB, visible ASCII and
// Latin-1, excluding DEL. No parser leniency or custom server options assumed.
export function invalidHeaderText(text: string): boolean {
  return /[^\t\x20-\x7e\x80-\xff]/.test(text);
}

export function withHeaderText(value: Any, context: TExecutionContext,
  continuation: (text: string, context: TExecutionContext) => BranchResult): BranchResult {
  return withValue(value, context, (input, branch) => {
    // Node can coerce objects repeatedly during validation and serialization.
    // One ordinary ToString would erase those extra effects and conversions.
    if (isObjectValue(input)) return unsupported("effectful object/array header conversion");
    return bindNormal(toString(input, branch), (converted, after) =>
      withValue(converted, after, (text, leaf) => {
        if (typeof (text as TESString).value !== "string") return unsupported("open symbolic header text");
        return continuation((text as TESString).value as string, leaf);
      }));
  });
}

// This projection contains only the application's explicit serialized fields.
// It excludes automatic Date, connection and framing fields, and has no live
// relationship to the supplied input object after serialization.
export function serializeResponseHeaders(input: Any, context: TExecutionContext): BranchResult {
  return withValue(input, context, (value, selected) => {
    if (isArray(value)) return unsupported("raw array header forms");
    return withEnumerableOwnProperties(value, selected, (source, keys, branch) => {
      const result = Object.assign(ESObject(Object.create(null)), { prototype: ESNull });
      const copy = (index: number, current: TExecutionContext): BranchResult => {
        if (index === keys.length) return [result, current];
        const key = keys[index];
        return evaluateBranches(ownPropertyPresence(source, key, current), current,
          present => bindNormal(readMember(source, key, present), (value, afterRead) => {
            if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(key)) {
              return headerError("ERR_INVALID_HTTP_TOKEN", `Header name must be a valid HTTP token ["${key}"]`, afterRead);
            }
            const name = key.toLowerCase();
            // Content-Length is an ordinary explicit serialized field: pinned
            // Node 24.21.0 stores and would send the application's value
            // verbatim, with no writeHead-time validation; its enforcement
            // coupling lives in the socket transport the projection excludes.
            if (["transfer-encoding", "connection", "keep-alive", "trailer", "expect",
              "content-disposition"].includes(name)) return unsupported(`transport-sensitive header '${name}'`);
            if (Object.prototype.hasOwnProperty.call(getProperties(result, afterRead), name)) {
              return unsupported("duplicate case-insensitive header names");
            }
            return withValue(value, afterRead, (resolved, afterValue) => {
              if (isUndefined(resolved)) return headerError("ERR_HTTP_INVALID_HEADER_VALUE",
                `Invalid value "undefined" for header "${key}"`, afterValue);
              return withHeaderText(resolved, afterValue, (text, afterText) => {
                if (invalidHeaderText(text)) return headerError("ERR_INVALID_CHAR",
                  `Invalid character in header content ["${key}"]`, afterText);
                return copy(index + 1, writeProperty(result, name, ESString(text), afterText));
              });
            });
          }), absent => copy(index + 1, absent));
      };
      return copy(0, branch);
    });
  });
}

// Merge setHeader-stored raw values into a writeHead serialization: the
// argument's fields win per lowercase name, and stored-only names serialize
// through the same validation stance as explicit fields, including the
// transport-sensitive exclusions and scalar conversion.
export function mergeStoredHeaders(stored: Any, serialized: WithProperties, context: TExecutionContext): BranchResult {
  return withValue(stored, context, (storedValue, selected) =>
    withEnumerableOwnProperties(storedValue, selected, (source, keys, branch) => {
      const merge = (index: number, current: TExecutionContext): BranchResult => {
        if (index === keys.length) return [serialized, current];
        const name = keys[index];
        return evaluateBranches(ownPropertyPresence(serialized, name, current), current,
          present => merge(index + 1, present),
          absent => bindNormal(readMember(source, name, absent), (raw, afterRead) => {
            if (["transfer-encoding", "connection", "keep-alive", "trailer", "expect",
              "content-disposition"].includes(name)) return unsupported(`transport-sensitive header '${name}'`);
            return withValue(raw, afterRead, (resolved, afterValue) =>
              withHeaderText(resolved, afterValue, (text, afterText) => {
                if (invalidHeaderText(text)) return headerError("ERR_INVALID_CHAR",
                  `Invalid character in header content ["${name}"]`, afterText);
                return merge(index + 1, writeProperty(serialized, name, ESString(text), afterText));
              }));
          }));
      };
      return merge(0, branch);
    }));
}

// writeHead argument fields merge into the setHeader store raw, but only
// once a setHeader call created that store (pinned against Node 24.21.0: a
// writeHead before any setHeader leaves getHeaders empty). The argument
// wins per lowercased name. Non-object arguments carry no fields.
export function overlayRawHeaders(stored: WithProperties, input: Any, context: TExecutionContext,
  set: (key: string, value: Any, context: TExecutionContext) => BranchResult): BranchResult {
  return withValue(input, context, (value, selected) => {
    if (!isObjectValue(value)) return [stored, selected];
    return withEnumerableOwnProperties(value, selected, (source, keys, branch) => {
      const overlay = (index: number, current: TExecutionContext): BranchResult => {
        if (index === keys.length) return [stored, current];
        const key = keys[index];
        return evaluateBranches(ownPropertyPresence(source, key, current), current,
          present => bindNormal(readMember(source, key, present), (raw, afterRead) =>
            bindNormal(set(key, raw, afterRead), (_value, afterSet) => overlay(index + 1, afterSet))),
          absent => overlay(index + 1, absent));
      };
      return overlay(0, branch);
    });
  });
}
