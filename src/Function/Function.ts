import {
  Any, Undefined, ESNumber, FunctionImplementation, FunctionBinding, WithProperties, isReturnValue, isThrownValue, isUndefined, isESNull, isESString
} from "../types";
import {
  TExecutionContext, ExecutionContext, enterEnvironment, setEnvironment,
  setCurrentThisValue
} from "../execution-context/ExecutionContext";
import { bindNormal, evaluateStatements, mapCompletions } from "../evaluate";
import { ESObject } from "../Object";
import { tuple } from "@deaven/tuple";
import { parseECMACompliant } from "../parseECMACompliant";
import { ESTree } from "cherow";
import { registerDefinition } from "./definition";
import { hasUseStrict } from "./instantiate";
import { initializeParameters, instantiateFunctionBody } from "./parameters";
import { isObjectValue } from "../conversion/toString";

export function ESFunction(implementation: FunctionImplementation) {
  const result = {
    type: "function",
    properties: { prototype: ESObject(undefined, "unmodeled") },
    function: { implementation }
  };
  Object.assign(result.properties.prototype.properties, { constructor: result });
  return result;
}

export function ESBuiltinFunction(implementation: FunctionImplementation) {
  const result = ESFunction(implementation);
  delete (result.properties as WithProperties["properties"]).prototype;
  return Object.assign(result, { nonConstructible: true });
}

export function isESFunction(arg: any): arg is FunctionBinding {
  return arg.type === "function";
}

export const FunctionConstructor = ESFunction(function*(
  _self: Any, args: Any[], execContext: TExecutionContext
) {
  if (!args.length || args.some(arg => !isESString(arg) || typeof arg.value !== "string")) {
    throw new Error("Function constructor requires concrete string arguments and a body; other argument forms are not yet supported");
  }
  const strings = args.map(arg => (arg as { value: string }).value);
  const body = strings[strings.length - 1];
  const parameters = strings.slice(0, -1).join(",");
  const parse = (params: string, statements: string): ESTree.FunctionExpression => {
    const parsed = parseECMACompliant(`(function anonymous(${params}\n) {\n${statements}\n})`);
    const statement = parsed.body[0];
    if (parsed.body.length !== 1 || statement.type !== "ExpressionStatement" ||
        statement.expression.type !== "FunctionExpression") {
      throw new Error("Function constructor source must remain within its parsed function wrapper");
    }
    return statement.expression;
  };
  // Parse the two grammar boundaries independently first. A comment or closing
  // token in one argument must not consume the other grammar's delimiters.
  parse(parameters, "");
  parse("", body);
  const definition = parse(parameters, body);
  let global = execContext.value.environment;
  while (global.parent) global = global.parent;
  // Generated source has no known lexical file. Reconstructing the engine's
  // caller/eval stack for location-sensitive host APIs is a separate boundary.
  const creationContext = ExecutionContext({ ...execContext.value, environment: global,
    strict: false, sourceFile: undefined });
  return tuple(createFunction(definition.body.body, definition.params, creationContext), execContext);
});

export function createFunction(
  statements: ESTree.Statement[], params: Array<ESTree.Pattern>, creationContext: TExecutionContext,
  kind: { async?: boolean; generator?: boolean; arrow?: boolean } = {}
) {
  // These kinds change invocation even when their bodies contain no await or
  // yield. Until modeled, never silently create an ordinary synchronous call.
  if (kind.async && kind.generator) throw new Error("Async generator functions are not yet supported");
  if (kind.async) throw new Error("Async functions are not yet supported");
  if (kind.generator) throw new Error("Generator functions are not yet supported");
  const environment = creationContext.value.environment;
  const lexicalThis = creationContext.value.thisValue;
  const sourceFile = creationContext.value.sourceFile;
  const strict = !!creationContext.value.strict || hasUseStrict(statements);
  // Capture the environment identity, not its values or the caller's names.
  // Each call gets a fresh record; surviving closures keep that record alive in
  // the persistent store carried by the returned execution context.
  const result = ESFunction(function*(
    self: Any, args: Array<Any>, execContext: TExecutionContext
  ) {
    const callerEnvironment = execContext.value.environment;
    let activation = enterEnvironment(execContext, "function", environment);
    activation = ExecutionContext({ ...activation.value, strict, sourceFile });
    let thisValue = kind.arrow ? lexicalThis : self;
    if (!kind.arrow && !strict) {
      if (isUndefined(self) || isESNull(self)) thisValue = creationContext.value.global;
      else if (!isObjectValue(self)) throw new Error("Sloppy receiver boxing is not yet supported");
    }
    activation = setCurrentThisValue(activation, thisValue);
    const execution = bindNormal(initializeParameters(params, args, activation, !!kind.arrow, statements),
      (_value, initialized) => evaluateStatements(statements, instantiateFunctionBody(statements, params, initialized)));
    return mapCompletions(execution, (completion, context) => tuple(
      isReturnValue(completion) ? completion.value : isThrownValue(completion) ? completion : Undefined,
      ExecutionContext({
        ...setEnvironment(context, callerEnvironment).value, strict: execContext.value.strict,
        sourceFile: execContext.value.sourceFile
      })
    ));
  });
  const firstOptional = params.findIndex(parameter =>
    parameter.type === "AssignmentPattern" || parameter.type === "RestElement");
  Object.assign(result.properties, { length: ESNumber(firstOptional < 0 ? params.length : firstOptional) });
  Object.assign(result, {
    unmodeledPropertyReads: ["name", "caller", "arguments"],
    unmodeledPropertyWrites: ["name", "length", "caller", "arguments"]
  });
  if (kind.arrow) {
    // Arrows have neither [[Construct]] nor an own prototype. Their lexical
    // receiver is independent of calls through .call or a property reference.
    delete (result.properties as WithProperties["properties"]).prototype;
    Object.assign(result, { nonConstructible: true });
  }
  registerDefinition(result, { statements, params, environment });
  return result;
}
