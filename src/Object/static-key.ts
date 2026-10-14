import { ESTree } from "cherow";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { UnsupportedAnalysisError, withAnalysisFailureContext } from "../execution-context/analysis-failure";

// Static keys bypass expression evaluation in both object construction and
// binding initialization. Check their restored syntax marker at the reached
// step. In imperative object builds, context must be AFTER prior properties.
export function staticPropertyName(key: ESTree.Node, context: TExecutionContext): string {
  return withAnalysisFailureContext(context, () => {
    if (Object.prototype.hasOwnProperty.call(key, "bigint")) {
      throw new UnsupportedAnalysisError("BigInt static property keys are not yet supported");
    }
    return key.type === "Identifier" ? String((key as ESTree.Identifier).name) :
      String((key as ESTree.Literal).value);
  });
}
