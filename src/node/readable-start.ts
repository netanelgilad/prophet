import { ESObject, TESObject } from "../Object";
import { ESBoolean } from "../boolean/ESBoolean";
import { bindNormal } from "../evaluate";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult } from "../execution-context/branches";
import { writeProperty } from "../execution-context/Heap";
import { ESNull, ESNumber } from "../types";

export function createFreshReadableState() {
  return ESObject({ constructed: ESBoolean(true), length: ESNumber(0), highWaterMark: ESNumber(65536),
    reading: ESBoolean(false), sync: ESBoolean(true), needReadable: ESBoolean(false), ended: ESBoolean(false),
    endEmitted: ESBoolean(false), flowing: ESNull, paused: ESBoolean(false), emittedReadable: ESBoolean(false),
    readableListening: ESBoolean(false), resumeScheduled: ESBoolean(false), readingMore: ESBoolean(false) });
}

/** Fresh constructed empty read(0), after the caller validates the stream domain.
 * The transport starter retains asynchronous input; it supplies no synchronous
 * bytes/EOF or callback. No readable event or shared job is scheduled here.
 */
export function startEmptyReadable(state: TESObject, start: (context: TExecutionContext) => BranchResult,
  context: TExecutionContext): BranchResult {
  const reading = writeProperty(state, "reading", ESBoolean(true), context);
  const sync = writeProperty(state, "sync", ESBoolean(true), reading);
  const needed = writeProperty(state, "needReadable", ESBoolean(true), sync);
  return bindNormal(start(needed), (_ignored, pending) =>
    [ESNull, writeProperty(state, "sync", ESBoolean(false), pending)]);
}
