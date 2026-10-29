import { ESBuiltinFunction } from "../Function/Function";
import { ESString, TESString } from "./String";
import { Any, ESNumber, isESNull, isUndefined, ThrownValue, Undefined, WithProperties } from "../types";
import { isObjectValue, toString, withValue } from "../conversion/toString";
import { bindNormal } from "../evaluate";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { ExecutionBudgetError, markUnsupportedBoundaryObject, UnsupportedAnalysisError } from "../execution-context/analysis-failure";
import { prototypeOf } from "../Object/prototype";
import { toPrimitiveSymbol } from "../Object/wellKnownSymbols";
import { createError } from "../error/Error";
import { invoke, readMember } from "../ASTResolvers";
import { assertModeledOwnAbsence, getProperties, ownPropertyPresence } from "../execution-context/Heap";

function unsupported(detail: string): never {
  throw new UnsupportedAnalysisError("decodeURI " + detail + " is not yet supported");
}

// Scoped typed admission: shared symbol lookup still has legacy-error paths.
// Establish current inherited absence before using ordinary string-hint conversion.
function primitiveHook(input: Any, context: TExecutionContext, seen: Any[] = []): BranchResult {
  return withValue(input, context, (value, branch) => {
    if (seen.length >= 256) throw new ExecutionBudgetError("decodeURI symbol lookup exceeds 256 prototype objects");
    if (seen.includes(value)) return unsupported("cyclic symbol lookup");
    const object = value as WithProperties;
    if (object.wellKnownSymbols && object.wellKnownSymbols.has(toPrimitiveSymbol)) {
      return [object.wellKnownSymbols.get(toPrimitiveSymbol)!, branch];
    }
    if (object.unknownProperties) return unsupported("symbol lookup on partial objects");
    if (object.unmodeledPrototype) return unsupported("unmodeled symbol lookup prototype");
    const prototype = prototypeOf(value);
    if (isESNull(prototype)) return [Undefined, branch];
    if (!isObjectValue(prototype)) return unsupported("invalid symbol lookup prototype");
    return primitiveHook(prototype, branch, seen.concat([value]));
  });
}

// Admit only the lookup actually reached. An own ordinary method can shadow an
// incomplete parent; valueOf is inspected only after toString fails to produce
// a primitive. Check current heap presence independently on each branch.
function admitMethod(input: Any, name: string, context: TExecutionContext, seen: Any[] = []): BranchResult {
  return withValue(input, context, (value, branch) => {
    if (seen.length >= 256) throw new ExecutionBudgetError("decodeURI ordinary lookup exceeds 256 prototype objects");
    if (seen.includes(value)) return unsupported("cyclic ordinary lookup");
    const object = value as WithProperties;
    if (object.propertyAccess || (object.unmodeledPropertyReads && object.unmodeledPropertyReads.includes(name))) {
      return unsupported("exotic or unmodeled ordinary method lookup");
    }
    const properties = getProperties(object, branch);
    if (!properties) return unsupported("invalid ordinary lookup object");
    if (object.unknownProperties && !(object.modeledInheritedProperties || []).includes(name) &&
        !Object.prototype.hasOwnProperty.call(properties, name)) return unsupported("ordinary lookup on partial objects");
    return evaluateBranches(ownPropertyPresence(object, name, branch), branch,
      own => [Undefined, own], absent => {
        assertModeledOwnAbsence(object, name);
        if (object.unmodeledPrototype) return unsupported("unmodeled ordinary lookup prototype");
        const prototype = prototypeOf(value);
        if (isESNull(prototype)) return [Undefined, absent];
        if (!isObjectValue(prototype)) return unsupported("invalid ordinary lookup prototype");
        return admitMethod(prototype, name, absent, seen.concat([value]));
      });
  });
}

function ordinaryConvert(input: Any, context: TExecutionContext, index = 0): BranchResult {
  if (index === 2) return [ThrownValue(createError("TypeError", ESString("Cannot convert object to primitive value"))), context];
  const name = index === 0 ? "toString" : "valueOf";
  return bindNormal(admitMethod(input, name, context), (_admitted, ready) =>
    bindNormal(readMember(input, name, ready), (method, afterRead) => withValue(method, afterRead, (callee, branch) => {
      if (!(callee as {function?: object}).function) return ordinaryConvert(input, branch, index + 1);
      return bindNormal(invoke(callee, [], branch, input), (result, afterCall) => withValue(result, afterCall, (value, after) =>
        isObjectValue(value) ? ordinaryConvert(input, after, index + 1) : toString(value, after)));
    })));
}

function convert(input: Any, context: TExecutionContext): BranchResult {
  return withValue(input, context, (value, branch) => {
    if (!["undefined", "null", "number", "boolean", "string", "object"].includes((value as { type: string }).type)) {
      return unsupported("array/function or exotic operand conversion");
    }
    if (!isObjectValue(value)) return toString(value, branch);
    return bindNormal(primitiveHook(value, branch), (method, after) => withValue(method, after, (hook, ready) => {
      if (!isUndefined(hook) && !isESNull(hook)) return unsupported("custom Symbol.toPrimitive conversion");
      return ordinaryConvert(value, ready);
    }));
  });
}

// A malformed encoding is a guest URIError. The decoder returns undefined for
// that case, avoiding host exceptions or replacement characters. Raw UTF-16
// units (even lone surrogates) are copied; only percent-encoded bytes use UTF-8.
function decode(text: string): string | undefined {
  const hex = (code: number): number => code >= 48 && code <= 57 ? code - 48 :
    code >= 65 && code <= 70 ? code - 55 : code >= 97 && code <= 102 ? code - 87 : -1;
  const byte = (position: number): number => {
    if (position + 2 >= text.length || text.charCodeAt(position) !== 37) return -1;
    const high = hex(text.charCodeAt(position + 1)), low = hex(text.charCodeAt(position + 2));
    return high < 0 || low < 0 ? -1 : high * 16 + low;
  };
  const output: string[] = [];
  for (let position = 0; position < text.length;) {
    if (text.charCodeAt(position) !== 37) { output.push(text[position++]); continue; }
    const first = byte(position);
    if (first < 0) return undefined;
    if (first < 128) {
      const character = String.fromCharCode(first);
      output.push(";/?:@&=+$,#".includes(character) ? text.slice(position, position + 3) : character);
      position += 3;
      continue;
    }
    const width = first >= 194 && first <= 223 ? 2 : first >= 224 && first <= 239 ? 3 :
      first >= 240 && first <= 244 ? 4 : 0;
    if (!width) return undefined;
    let scalar = first % (1 << (7 - width));
    for (let offset = 1; offset < width; offset++) {
      const continuation = byte(position + offset * 3);
      if (continuation < 128 || continuation > 191) return undefined;
      scalar = scalar * 64 + continuation - 128;
    }
    if (scalar < (width === 2 ? 128 : width === 3 ? 2048 : 65536) || scalar > 0x10ffff ||
        (scalar >= 0xd800 && scalar <= 0xdfff)) return undefined;
    if (scalar <= 0xffff) output.push(String.fromCharCode(scalar));
    else {
      const pair = scalar - 0x10000;
      output.push(String.fromCharCode(0xd800 + Math.floor(pair / 1024), 0xdc00 + pair % 1024));
    }
    position += width * 3;
  }
  return output.join("");
}

export const decodeURIGlobal = markUnsupportedBoundaryObject(Object.assign(ESBuiltinFunction(function*(_self, args, context) {
  return bindNormal(convert(args.length ? args[0] : Undefined, context), (converted, after) =>
    withValue(converted, after, (value, ready) => {
      const text = (value as TESString).value;
      if (typeof text !== "string") return unsupported("open symbolic or legacy chunk input");
      // Conversion happens first. Cap before any scan or output allocation;
      // decoder work and output storage are linear in the admitted input.
      if (text.length > 65536) throw new ExecutionBudgetError("decodeURI input exceeds 65536 UTF-16 units");
      const decoded = decode(text);
      return [decoded === undefined ? ThrownValue(createError("URIError", ESString("URI malformed"))) : ESString(decoded), ready];
    }));
}), {
  properties: { name: ESString("decodeURI"), length: ESNumber(1) },
  unknownProperties: "decodeURI metadata",
  modeledInheritedProperties: ["call", "prototype"],
  unmodeledOwnPropertyInspection: "decodeURI descriptors",
  unmodeledPropertyReads: ["caller", "arguments"],
  unmodeledPropertyWrites: ["name", "length", "call", "prototype", "caller", "arguments"]
}));
