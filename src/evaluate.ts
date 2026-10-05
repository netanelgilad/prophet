import {
  isThrownValue,
  EvaluationResult,
  isReturnValue,
  ExpressionEvaluationResult,
  Undefined,
  Any
} from "./types";
import { ASTResolvers } from "./ASTResolvers";
import {
  TExecutionContext,
  ExecutionContext
} from "./execution-context/ExecutionContext";
import { unsafeCast } from "@deaven/unsafe-cast.macro";
import { parseECMACompliant } from "./parseECMACompliant";
import { ESTree } from "cherow";
import { hasExecutionBoundary, isExecutionBoundary, isForkedCompletion, retainPendingStatements } from "./execution-context/Completion";
import { mergeBranchResults, BranchResult } from "./execution-context/branches";
import { analysisFailureContext, retainAnalysisFailureContext,
  captureExecutionBoundary, ExecutionBudgetError, UnsupportedAnalysisError, withAnalysisFailureContext } from "./execution-context/analysis-failure";

export class ASTEvaluationError extends Error {
  constructor(err: Error, public ast: ESTree.Node) {
    super(err.message);
    this.stack = err.stack;
    retainAnalysisFailureContext(this, analysisFailureContext(err));
  }
}

export class CodeEvaluationError extends ASTEvaluationError {
  constructor(astError: ASTEvaluationError, public code: string) {
    super(astError, astError.ast);
    this.stack = astError.stack;
  }
}

export type NodeEvaluationResult<
  T extends ESTree.Node
> = T extends ESTree.Expression
  ? [ExpressionEvaluationResult, TExecutionContext]
  : [EvaluationResult, TExecutionContext];

export function evaluate<T extends ESTree.Node>(
  ast: T,
  execContext: TExecutionContext
): NodeEvaluationResult<T> {
  try {
    const result = captureExecutionBoundary(execContext, () => {
      const budget = execContext && execContext.value.evaluationBudget;
      if (budget && --budget.remaining < 0) {
        throw new ExecutionBudgetError("Execution exceeded its evaluation budget");
      }
      const resolver = ASTResolvers.get(ast.type);
      if (!resolver) throw new UnsupportedAnalysisError(`Can't resolve type of ast type ${ast.type}`);
      return resolver(ast, execContext || ExecutionContext({}));
    });
    const annotate = (branch: BranchResult): BranchResult => {
      const value = branch[0];
      if (isExecutionBoundary(value)) return [{ ...value, frames: value.frames.concat([
        { node: ast, sourceFile: execContext && execContext.value.sourceFile }
      ]) }, branch[1]];
      if (isForkedCompletion(value)) return [{ ...value, consequent: annotate(value.consequent), alternate: annotate(value.alternate) }, branch[1]];
      return branch;
    };
    return unsafeCast<NodeEvaluationResult<T>>(hasExecutionBoundary(result[0]) ? annotate(result) : result);
  } catch (err) {
    retainAnalysisFailureContext(err, execContext);
    if (
      err instanceof ASTEvaluationError ||
      err instanceof CodeEvaluationError
    ) {
      throw err;
    }
    throw new ASTEvaluationError(err, ast);
  }
}

export function evaluateCode(code: string, execContext: TExecutionContext) {
  try {
    return evaluate(parseECMACompliant(code), execContext);
  } catch (err) {
    retainAnalysisFailureContext(err, execContext);
    if (err instanceof CodeEvaluationError) {
      throw err;
    } else if (err instanceof ASTEvaluationError) {
      throw new CodeEvaluationError(err, code);
    }
    throw err;
  }
}

export function evaluateCodeAsExpression(
  code: string,
  execContext: TExecutionContext
) {
  return evaluate(parseECMACompliant(code), execContext);
}

export function evaluateThrowableIterator<
  T extends Iterator<
    [EvaluationResult, TExecutionContext],
    [EvaluationResult, TExecutionContext],
    [EvaluationResult, TExecutionContext]
  >
>(itr: T) {
  let currentEvaluationResult = itr.next();
  // Native implementations may return a completion tree. A suspended host
  // generator cannot be cloned to resume two paths; such implementations must
  // compose child evaluations with bindNormal instead of yielding a fork.
  const assertResumable = () => {
    if (!currentEvaluationResult.done && isForkedCompletion(currentEvaluationResult.value[0])) {
      throw new Error("Native generator continuations must use bindNormal for symbolic completions");
    }
  };
  assertResumable();
  while (
    !isExecutionBoundary(currentEvaluationResult.value[0]) &&
    !isThrownValue(currentEvaluationResult.value[0]) &&
    !isReturnValue(currentEvaluationResult.value[0]) &&
    !isForkedCompletion(currentEvaluationResult.value[0]) &&
    !currentEvaluationResult.done
  ) {
    currentEvaluationResult = itr.next(currentEvaluationResult.value);
    assertResumable();
  }

  return currentEvaluationResult.value;
}

export function evaluateStatements(
  statements: ESTree.Statement[], context: TExecutionContext
): BranchResult {
  const resume = (result: BranchResult, next: number): BranchResult => {
    const value = result[0];
    if (isForkedCompletion(value)) {
      return mergeBranchResults(value.condition, value.base,
        resume(value.consequent, next), resume(value.alternate, next));
    }
    if (isExecutionBoundary(value)) {
      return retainPendingStatements(result, statements.slice(next), context.value.sourceFile);
    }
    if (isReturnValue(value) || isThrownValue(value)) return result;
    if (next === statements.length) return [Undefined, result[1]];
    return resume(evaluate(statements[next], result[1]), next + 1);
  };
  return resume([Undefined, context], 0);
}

export function mapCompletions(
  result: BranchResult,
  transform: (value: Any, context: TExecutionContext) => BranchResult
): BranchResult {
  const value = result[0];
  if (isForkedCompletion(value)) {
    return mergeBranchResults(value.condition, value.base,
      mapCompletions(value.consequent, transform),
      mapCompletions(value.alternate, transform));
  }
  if (isExecutionBoundary(value)) return result;
  return captureExecutionBoundary(result[1], () => withAnalysisFailureContext(result[1], () => transform(value, result[1])));
}

// Compose the next evaluation step only onto normal leaves. Its captured
// inputs must be immutable: the same continuation can run on several paths.
// Cleanup (scope/this restoration, finally) uses mapCompletions instead, since
// it must also visit returns and throws. Stopped execution never runs cleanup.
export function bindNormal(
  result: BranchResult,
  continuation: (value: Any, context: TExecutionContext) => BranchResult
): BranchResult {
  return mapCompletions(result, (value, context) =>
    isReturnValue(value) || isThrownValue(value) ? [value, context] : continuation(value, context));
}
