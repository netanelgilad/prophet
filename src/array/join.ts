import { tuple } from "@deaven/tuple";
import { Any } from "../types";
import { TArray } from "./Array";
import { ESString } from "../string/String";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { getArrayElements } from "../execution-context/Heap";
import { assertNoInheritedArrayElements } from './inherited-elements';

export function* join(
  self: TArray<any>,
  args: Any[],
  execContext: TExecutionContext
) {
  const separator = args[0] === undefined || (args[0] as any).type === "undefined"
    ? ","
    : primitiveText(args[0]);
  return tuple(ESString(joinText(self, separator, execContext, new Set())), execContext);
}

function joinText(
  array: TArray<any>,
  separator: string | undefined,
  context: TExecutionContext,
  active: Set<object>
): string | undefined {
  // Like JavaScript's join, a cyclic nested array contributes an empty string.
  if (active.has(array)) return "";
  const elements = getArrayElements(array, context);
  if (elements === undefined) return undefined;
  assertNoInheritedArrayElements(array, elements, context);
  active.add(array);
  const parts: string[] = [];
  let unknown = separator === undefined;
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index] as any;
    let text: string | undefined;
    if (element === undefined || element.type === "undefined" || element.type === "null") {
      text = "";
    } else if (element.type === "array") {
      text = joinText(element, ",", context, active);
    } else {
      text = primitiveText(element);
    }
    if (text === undefined) unknown = true;
    parts.push(text === undefined ? "" : text);
  }
  active.delete(array);
  return unknown ? undefined : parts.join(separator);
}

function primitiveText(value: Any): string | undefined {
  const primitive = value as { type?: string; value?: unknown };
  switch (primitive.type) {
    case "undefined": return "undefined";
    case "null": return "null";
    case "number":
    case "boolean":
      return primitive.value === undefined ? undefined : String(primitive.value);
    case "string":
      return typeof primitive.value === "string" ? primitive.value : undefined;
    default:
      throw new Error("Array.join does not support object-to-primitive conversion");
  }
}
