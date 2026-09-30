import {
  TExecutionContext,
  ExecutionContext
} from "../execution-context/ExecutionContext";
import { Any, ThrownValue } from "../types";
import { evaluateCode, bindNormal } from "../evaluate";
import { TESString, ESString } from "../string/String";
import { unsafeCast } from "@deaven/unsafe-cast.macro";
import { ESInitialGlobal } from "../execution-context/ESInitialGlobal";
import { TESObject, ESObject } from "../Object";
import { createNewObjectFromConstructor } from "../Function/construct";
import { tuple } from "@deaven/tuple";
import { SyntaxErrorConstructor } from "../error/SyntaxError";
import { getProperties } from "../execution-context/Heap";

export const vm = {
  properties: {
    createContext: {
      parameters: [],
      function: {
        implementation: function*(
          _self: Any,
          args: Array<Any>,
          execContext: TExecutionContext
        ) {
          return [args[0], execContext];
        }
      }
    },
    runInContext: {
      parameters: [],
      function: {
        implementation: function*(
          _self: Any,
          args: Array<Any>,
          execContext: TExecutionContext
        ) {
          const evalExecContext = ExecutionContext({
            ...execContext.value,
            global: ESObject({
              ...ESInitialGlobal.properties,
              ...getProperties(unsafeCast<TESObject>(args[1]), execContext)
            }, "unmodeled")
          });
          try {
            return evaluateCode(
              unsafeCast<string>(unsafeCast<TESString>(args[0]).value),
              evalExecContext
            );
          } catch (err) {
            if (err instanceof SyntaxError) {
              return bindNormal(createNewObjectFromConstructor(
                SyntaxErrorConstructor,
                [ESString(err.stack)],
                evalExecContext
              ), (syntaxError, afterErrorExecContext) => tuple(ThrownValue(syntaxError), afterErrorExecContext));
            }
            throw err;
          }
        }
      }
    }
  }
};
