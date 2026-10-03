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
