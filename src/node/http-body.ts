import { Any, ESNumber, ESNull, isESNull, isESNumber, isESBoolean, isESString, isUndefined, ThrownValue } from "../types";
import { Array as ESArray } from "../array/Array";
import { ESObject, TESObject } from "../Object";
import { ESString, TESString } from "../string/String";
import { createError } from "../error/Error";
import { getProperties } from "../execution-context/Heap";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult } from "../execution-context/branches";
import { withValue } from "../conversion/toString";
import { choiceOf } from "../symbolic";
import { isBufferValue, withBufferBytes } from "./buffer";

export function withHTTPChunk(value: Any, context: TExecutionContext,
  continuation: (chunk: Any, context: TExecutionContext) => BranchResult): BranchResult {
  return withValue(value, context, (chunk, branch) => {
    if (isESString(chunk) || isBufferValue(chunk)) return continuation(chunk, branch);
    if (!isESNull(chunk) && !isUndefined(chunk) && !isESNumber(chunk) && !isESBoolean(chunk)) {
      throw new Error("HTTP chunk object/function diagnostics are not yet supported");
    }
    const error = createError("TypeError", isESNull(chunk)
      ? ESString("May not write null values to stream") : ESString());
    error.properties.code = ESString(isESNull(chunk) ? "ERR_STREAM_NULL_VALUES" : "ERR_INVALID_ARG_TYPE");
    Object.assign(error, {
      unmodeledPropertyReads: ["stack", "toString", "constructor"],
      unmodeledPropertyWrites: ["stack", "toString", "constructor"],
      unmodeledOwnPropertyInspection: "Node coded error descriptors"
    });
    return [ThrownValue(error), branch];
  });
}

// Immutable queue nodes contain values/references only. The response's tail is
// a persistent heap field. Buffer mutations remain visible until consumption.
export function appendHTTPChunk(previous: Any, chunk: Any): TESObject {
  return ESObject({ previous, chunk });
}

export function consumeHTTPBody(tail: Any, context: TExecutionContext,
  continuation: (text: TESString, bytes: Any, context: TExecutionContext) => BranchResult): BranchResult {
  const consume = (chunks: Any[], position: number, bytes: number[] | undefined,
    current: TExecutionContext): BranchResult => {
    let collected = bytes;
    for (let index = position; index < chunks.length; index++) {
      const chunk = chunks[index];
      if (isESString(chunk)) {
        // Each string is encoded separately: adjacent lone surrogates in
        // different writes must not combine into a new Unicode character.
        collected = collected && typeof chunk.value === "string"
          ? collected.concat(Array.from(Buffer.from(chunk.value, "utf8"))) : undefined;
      } else {
        const next = index + 1;
        const prefix = collected;
        return withBufferBytes(chunk, current, (part, branch) =>
          consume(chunks, next, prefix && prefix.concat(part), branch));
      }
    }
    // Decode only after assembly, so a multibyte sequence split over Buffer
    // writes is preserved. Open strings retain unknown bytes AND unknown text.
    return continuation(collected === undefined ? ESString() : ESString(Buffer.from(collected).toString("utf8")),
      collected === undefined ? ESArray() : ESArray(collected.map(byte => ESNumber(byte))), current);
  };
  const collect = (currentTail: Any, reverse: Any[], current: TExecutionContext): BranchResult => {
    let link = currentTail;
    const chunks = reverse.slice();
    while (!isESNull(link)) {
      if (choiceOf(link)) return withValue(link, current, (selected, branch) => collect(selected, chunks, branch));
      const node = getProperties(link as TESObject, current);
      chunks.push(node.chunk);
      link = node.previous;
    }
    return consume(chunks.reverse(), 0, [], current);
  };
  return collect(tail || ESNull, [], context);
}
