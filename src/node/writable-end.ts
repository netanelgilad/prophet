import { ESObject, TESObject } from "../Object";
import { ESBoolean } from "../boolean/ESBoolean";
import { bindNormal } from "../evaluate";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult } from "../execution-context/branches";
import { writeProperty } from "../execution-context/Heap";

export function createEmptyWritableState() {
  return ESObject({ constructed: ESBoolean(true), ending: ESBoolean(false), ended: ESBoolean(false),
    finalCalled: ESBoolean(false), finalPending: ESBoolean(false), prefinished: ESBoolean(false), finished: ESBoolean(false) });
}

/** First empty, constructed, uncorked writable end with a pending finalizer.
 * The caller must establish the live pristine stream domain before entry.
 * A finalizer returning normally retains pending work; it has not called back.
 */
export function endEmptyWritable(stream: TESObject, state: TESObject,
  finalize: (context: TExecutionContext) => BranchResult, context: TExecutionContext): BranchResult {
  const ending = writeProperty(state, "ending", ESBoolean(true), context);
  const unavailable = writeProperty(stream, "writable", ESBoolean(false), ending);
  const publicEnded = writeProperty(stream, "writableEnded", ESBoolean(true), unavailable);
  const called = writeProperty(state, "finalCalled", ESBoolean(true), publicEnded);
  const pending = writeProperty(state, "finalPending", ESBoolean(true), called);
  return bindNormal(finalize(pending), (_ignored, submitted) =>
    [stream, writeProperty(state, "ended", ESBoolean(true), submitted)]);
}
