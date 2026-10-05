import { BranchResult } from "./branches";
import { TExecutionContext } from "./ExecutionContext";

// Analysis failures are host errors, not JavaScript throw completions. Retain
// the innermost known execution checkpoint without changing error identity or
// allowing interpreted catch/finally to consume an engine failure.
//
// A checkpoint is ONE partial frontier. If exploration stops inside a branch,
// previously visited siblings and unvisited continuations are not reconstructed
// here. Consumers must never describe this as a joined all-path final state.
const checkpoints = new WeakMap<object, TExecutionContext>();

function isReference(value: unknown): value is object {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

export function analysisFailureContext(error: unknown): TExecutionContext | undefined {
  return isReference(error) ? checkpoints.get(error) : undefined;
}

export function retainAnalysisFailureContext(
  error: unknown, context: TExecutionContext | undefined
): void {
  if (context && isReference(error) && !checkpoints.has(error)) checkpoints.set(error, context);
}

export function withAnalysisFailureContext<T>(context: TExecutionContext, run: () => T): T {
  try {
    return run();
  } catch (error) {
    retainAnalysisFailureContext(error, context);
    throw error;
  }
}

// Classification is explicit. Native Error/TypeError/assertion failures and
// unconverted legacy guards remain failures; message matching is never used.
export class UnsupportedAnalysisError extends Error {
  readonly kind = "unsupported";
}
export class ExecutionBudgetError extends Error {
  readonly kind = "budget";
}

export function captureExecutionBoundary(context: TExecutionContext, run: () => BranchResult): BranchResult {
  try { return run(); } catch (error) {
    if (!(error instanceof UnsupportedAnalysisError) && !(error instanceof ExecutionBudgetError)) throw error;
    const checkpoint = analysisFailureContext(error) || context;
    // Models may reuse one error instance. Its checkpoint belongs to this
    // occurrence and must not leak into a later branch's invocation.
    checkpoints.delete(error);
    return [{ type: "ExecutionBoundary", kind: error.kind, message: error.message, frames: [], pendingStatements: [] }, checkpoint];
  }
}

// Opt individual partial models into classified shared property guards without
// exposing native Error objects or implementation classification in VM values.
const boundaryObjects = new WeakSet<object>();
export function markUnsupportedBoundaryObject<T extends object>(object: T): T {
  boundaryObjects.add(object);
  return object;
}
export function unsupportedPropertyError(object: object, message: string): Error {
  return boundaryObjects.has(object) ? new UnsupportedAnalysisError(message) : new Error(message);
}
