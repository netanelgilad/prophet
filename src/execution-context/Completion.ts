import { Any, TESBoolean } from "../types";
import { TExecutionContext } from "./ExecutionContext";

export type CompletionBranch = [Any, TExecutionContext];

// A return or throw on one path must not stop the other path. Expressions and
// statement sequences carry their continuations onto normal leaves only;
// catch/finally and function boundaries transform all relevant leaves.
export type ForkedCompletion = {
  type: "ForkedCompletion";
  condition: TESBoolean;
  base: TExecutionContext;
  consequent: CompletionBranch;
  alternate: CompletionBranch;
};

export function isForkedCompletion(value: any): value is ForkedCompletion {
  return value && value.type === "ForkedCompletion";
}
