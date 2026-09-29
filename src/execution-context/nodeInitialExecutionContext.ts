import { ExecutionContext } from "./ExecutionContext";
import { prompt } from "../window/prompt";
import { requireFunction } from "../require/require";
import { ESInitialGlobal } from "./ESInitialGlobal";
import { ESObject } from "../Object";

export const nodeInitialExecutionContext = ExecutionContext({
  global: ESObject({
    ...ESInitialGlobal.properties,
    prompt: {
      parameters: [],
      function: {
        implementation: prompt
      }
    }
  }, "unmodeled"),
  scope: {
    require: requireFunction
  }
});
