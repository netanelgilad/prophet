import { Any, TESBoolean } from "../types";
import { TExecutionContext } from "./ExecutionContext";

export type CompletionBranch = [Any, TExecutionContext];

// A return on one path must not stop evaluation of the other path. Statement
// sequences carry both completions until their remaining statements run.
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
