import { ESTree } from "cherow";
import { Any, TESBoolean } from "../types";
import { TExecutionContext } from "./ExecutionContext";

export type CompletionBranch = [Any, TExecutionContext];

// A return or throw on one path must not stop the other path. Expressions and
// statement sequences carry their continuations onto normal leaves only;
// catch/finally and function boundaries transform all relevant leaves.
export type ForkedCompletion = {
  type: "ForkedCompletion";
  // With partial leaves the tuple context is only the common checkpoint.
  state?: "partial";
  condition: TESBoolean;
  base: TExecutionContext;
  consequent: CompletionBranch;
  alternate: CompletionBranch;
};

export function isForkedCompletion(value: any): value is ForkedCompletion {
  return value && value.type === "ForkedCompletion";
}

// A stopped execution is neither a guest value nor a guest exception. Frames
// retain entered AST operations, not executable/resumable host continuations.
export type ExecutionBoundary = {
  type: "ExecutionBoundary";
  kind: "unsupported" | "budget";
  message: string;
  frames: Array<{ node: ESTree.Node; sourceFile?: string }>;
  pendingStatements: Array<{ statements: ESTree.Statement[]; sourceFile?: string }>;
};

export function isExecutionBoundary(value: any): value is ExecutionBoundary {
  return value && value.type === "ExecutionBoundary";
}

export function hasExecutionBoundary(value: Any): boolean {
  return isExecutionBoundary(value) || (isForkedCompletion(value) &&
    (hasExecutionBoundary(value.consequent[0]) || hasExecutionBoundary(value.alternate[0])));
}

export function executionBoundaries(value: Any): ExecutionBoundary[] {
  if (isExecutionBoundary(value)) return [value];
  return isForkedCompletion(value) ? executionBoundaries(value.consequent[0]).concat(executionBoundaries(value.alternate[0])) : [];
}

export function retainPendingStatements(
  result: CompletionBranch, statements: ESTree.Statement[], sourceFile?: string
): CompletionBranch {
  if (!statements.length) return result;
  const value = result[0];
  if (isExecutionBoundary(value)) return [{ ...value,
    pendingStatements: value.pendingStatements.concat([{ statements, sourceFile }]) }, result[1]];
  if (isForkedCompletion(value)) return [{ ...value,
    consequent: retainPendingStatements(value.consequent, statements, sourceFile),
    alternate: retainPendingStatements(value.alternate, statements, sourceFile) }, result[1]];
  return result;
}
