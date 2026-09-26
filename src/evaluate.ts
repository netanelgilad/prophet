import {
  isThrownValue,
  EvaluationResult,
  isReturnValue,
  ExpressionEvaluationResult,
  Undefined,
  Any
} from "./types";
import { ASTResolvers } from "./ASTResolvers";
import assert from "assert";
import {
  TExecutionContext,
  ExecutionContext
} from "./execution-context/ExecutionContext";
import { unsafeCast } from "@deaven/unsafe-cast.macro";
import { parseECMACompliant } from "./parseECMACompliant";
import { ESTree, parseScript } from "cherow";
import { isForkedCompletion } from "./execution-context/Completion";
import { mergeBranchResults, BranchResult } from "./execution-context/branches";

export class ASTEvaluationError extends Error {
  constructor(err: Error, public ast: ESTree.Node) {
    super(err.message);
    this.stack = err.stack;
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
    const budget = execContext && execContext.value.evaluationBudget;
    if (budget && --budget.remaining < 0) {
      throw new Error("Recursive summary proof exceeded its evaluation budget");
    }
    const resolver = ASTResolvers.get(ast.type);
    assert(resolver, `Can't resolve type of ast type ${ast.type}`);
    return unsafeCast<NodeEvaluationResult<T>>(
      resolver!(ast, execContext || ExecutionContext({}))
    );
  } catch (err) {
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
  return evaluate(parseScript(code), execContext);
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
  return transform(value, result[1]);
}

// Compose the next evaluation step only onto normal leaves. Its captured
// inputs must be immutable: the same continuation can run on several paths.
// Cleanup (scope/this restoration, finally) uses mapCompletions instead, since
// it must also visit returns and throws.
export function bindNormal(
  result: BranchResult,
  continuation: (value: Any, context: TExecutionContext) => BranchResult
): BranchResult {
  return mapCompletions(result, (value, context) =>
    isReturnValue(value) || isThrownValue(value) ? [value, context] : continuation(value, context));
}
