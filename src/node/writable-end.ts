import { ESObject, TESObject } from "../Object";
import { ESBoolean } from "../boolean/ESBoolean";
import { bindNormal } from "../evaluate";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult } from "../execution-context/branches";
import { writeProperty } from "../execution-context/Heap";

export function createEmptyWritableState() {
  return ESObject({ constructed: ESBoolean(true), ending: ESBoolean(false), ended: ESBoolean(false),
    finalCalled: ESBoolean(false), finalPending: ESBoolean(false), prefinished: ESBoolean(false), finishPending: ESBoolean(false), finished: ESBoolean(false) });
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

/** The admitted empty writable final callback; transport status is not its error argument. */
export function completeEmptyWritableFinal(state: TESObject,
  emit: (context: TExecutionContext) => BranchResult,
  enqueue: (context: TExecutionContext) => BranchResult, context: TExecutionContext): BranchResult {
  const prefinished = writeProperty(state, "prefinished", ESBoolean(true), context);
  return bindNormal(emit(prefinished), (_ignored, emitted) =>
    enqueue(writeProperty(state, "finishPending", ESBoolean(true), emitted)));
}

/** Native finish does not repeat needFinish; writes precede listener dispatch. */
export function finishEmptyWritable(stream: TESObject, state: TESObject,
  emit: (context: TExecutionContext) => BranchResult, context: TExecutionContext): BranchResult {
  const dequeued = writeProperty(state, "finishPending", ESBoolean(false), context);
  const finished = writeProperty(state, "finished", ESBoolean(true), dequeued);
  return emit(writeProperty(stream, "writableFinished", ESBoolean(true), finished));
}
