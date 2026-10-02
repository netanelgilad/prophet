import { Any, ESNumber, FunctionImplementation, isESNull, isESString, isUndefined, TESNumber, ThrownValue, Undefined } from "../types";
import { ESString, TESString } from "./String";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult } from "../execution-context/branches";
import { bindNormal } from "../evaluate";
import { isObjectValue, toString, withValue } from "../conversion/toString";
import { toNumber } from "../conversion/toNumber";
import { createError } from "../error/Error";
import { concatenateStrings } from "./concat";
import { readWellKnownSymbol, toPrimitiveSymbol } from "../Object/wellKnownSymbols";

function integer(value: TESNumber): TESNumber {
  if (typeof value.value !== "number") return {
    ...ESNumber(), expression: { kind: "unary", operator: "ToIntegerOrInfinity", operand: value }
  };
  return ESNumber(Number.isNaN(value.value) || value.value === 0 ? 0 : Math.trunc(value.value));
}

// Strings are immutable expression graphs. Flatten only concatenation nodes;
// an unknown leaf remains one value, never an assumed array of characters.
function parts(value: TESString): TESString[] {
  const expression = value.expression;
  if (expression && expression.kind === "binary" && expression.operator === "+" &&
      isESString(expression.left) && isESString(expression.right)) {
    return parts(expression.left).concat(parts(expression.right));
  }
  return [value];
}
function join(values: TESString[]): TESString {
  return values.reduce(concatenateStrings, ESString(""));
}
function knownEdge(values: TESString[], fromEnd: boolean): string {
  let result = "";
  for (const value of fromEnd ? values.slice().reverse() : values) {
    if (typeof value.value !== "string") break;
    result = fromEnd ? value.value + result : result + value.value;
  }
  return result;
}
function trim(values: TESString[], count: number, fromEnd: boolean): TESString[] {
  const result = fromEnd ? values.slice().reverse() : values.slice();
  while (count > 0 && result.length && typeof result[0].value === "string") {
    const text = result[0].value as string;
    if (text.length <= count) { result.shift(); count -= text.length; }
    else { result[0] = ESString(fromEnd ? text.slice(0, -count) : text.slice(count)); count = 0; }
  }
  return fromEnd ? result.reverse() : result;
}

function sliceString(value: TESString, start: TESNumber, end?: TESNumber): TESString {
  const from = start.value;
  const to = end ? end.value : Infinity;
  if (typeof value.value === "string" && typeof from === "number" && typeof to === "number") {
    return ESString(value.value.slice(from, to));
  }
  // These identities hold regardless of the unknown string's length.
  if (from === Infinity || to === -Infinity || (typeof from === "number" && typeof to === "number" &&
      ((from >= 0 && to >= 0 && from >= to) || (from < 0 && to < 0 && from >= to)))) return ESString("");
  if ((from === 0 || from === -Infinity) && to === Infinity) return value;
  if (typeof from === "number" && typeof to === "number") {
    const pieces = parts(value);
    const prefix = knownEdge(pieces, false), suffix = knownEdge(pieces, true);
    const begin = from === -Infinity ? 0 : from;
    if (begin >= 0 && to >= 0 && to <= prefix.length) return ESString(prefix.slice(begin, to));
    if (begin < 0 && begin >= -suffix.length && (to < 0 || to === Infinity)) {
      return ESString(suffix.slice(begin, to));
    }
    if (begin >= 0 && begin <= prefix.length && (to === Infinity || (to < 0 && -to <= suffix.length))) {
      return join(trim(trim(pieces, begin, false), to === Infinity ? 0 : -to, true));
    }
  }
  const result: TESString = { ...ESString(), expression: { kind: "string-slice", operand: value, start, end } };
  const length = result.properties.length;
  length.knowledge = (length.knowledge || []).concat({ kind: "order", left: length, right: value.properties.length, strict: false });
  // Every slice has at most this many UTF-16 units, including short inputs.
  let maximum: number | undefined;
  if (typeof from === "number" && typeof to === "number") {
    if (from >= 0 && to >= 0 && Number.isFinite(to)) maximum = Math.max(to - from, 0);
    if (from < 0 && Number.isFinite(from)) maximum = Math.max(to < 0 ? to - from : -from, 0);
  }
  if (maximum !== undefined) length.knowledge = length.knowledge.concat({ kind: "order", left: length, right: ESNumber(maximum), strict: false });
  return result;
}

function slice(self: Any, args: Any[], context: TExecutionContext): BranchResult {
  return withValue(self, context, (receiver, branch) => {
    if (isESNull(receiver) || isUndefined(receiver)) return [ThrownValue(createError("TypeError", ESString("String.prototype.slice called on null or undefined"))), branch];
    const convert = (ready: TExecutionContext): BranchResult => bindNormal(toString(receiver, ready), (string, afterString) =>
      withValue(string, afterString, (value, afterValue) => bindNormal(toNumber(args[0] || Undefined, afterValue), (start, afterStart) =>
        withValue(start, afterStart, (selectedStart, current) =>
          withValue(args[1] || Undefined, current, (end, afterEnd) => {
            if (isUndefined(end)) return [sliceString(value as TESString, integer(selectedStart as TESNumber)), afterEnd];
            return bindNormal(toNumber(end, afterEnd), (number, final) =>
              withValue(number, final, (selectedEnd, done) =>
                [sliceString(value as TESString, integer(selectedStart as TESNumber), integer(selectedEnd as TESNumber)), done]));
          })))));
    if (!isObjectValue(receiver)) return convert(branch);
    return bindNormal(readWellKnownSymbol(receiver, toPrimitiveSymbol, branch), (method, after) =>
      withValue(method, after, (selected, current) => {
        if (!isUndefined(selected) && !isESNull(selected)) {
          throw new Error("Symbol.toPrimitive string conversion is not yet supported");
        }
        return convert(current);
      }));
  });
}

export const stringSlice: FunctionImplementation = function*(self, args, context) {
  return slice(self, args, context);
};
