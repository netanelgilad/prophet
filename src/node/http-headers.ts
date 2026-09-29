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
import { Any, ESNull, ThrownValue, isArray, isUndefined } from "../types";

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
            if (["content-length", "transfer-encoding", "connection", "keep-alive", "trailer", "expect",
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
