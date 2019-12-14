import { ESFunction } from "../Function/Function";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { Any, Undefined, FunctionImplementation } from "../types";
import { tuple } from "@deaven/tuple";
import { TESString } from "../string/String";
import { unsafeCast } from "@deaven/unsafe-cast.macro";
import { evaluate } from "../evaluate";
import { parseECMACompliant } from "../parseECMACompliant";

export const evalFn = ESFunction(<FunctionImplementation<Any, Any[]>>(
  function*(_self, args, execContext: TExecutionContext) {
    const source = unsafeCast<string>(unsafeCast<TESString>(args[0]).value);
    const parsedSource = parseECMACompliant(source);
    const statements = parsedSource.body;

    let currentEvaluationResult: [Any, TExecutionContext] = tuple(
      Undefined,
      execContext
    );
    for (const statement of statements.slice(0, statements.length - 1)) {
      currentEvaluationResult = yield evaluate(
        statement,
        currentEvaluationResult[1]
      );
    }

    const lastStatement = statements[statements.length - 1];

    if (lastStatement.type === "ExpressionStatement") {
      return evaluate(lastStatement.expression, currentEvaluationResult[1]);
    }

    return evaluate(lastStatement, currentEvaluationResult[1]);
  }
));
