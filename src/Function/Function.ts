import { TESString } from "../string/String";
import {
  Any, Undefined, ESNumber, FunctionImplementation, FunctionBinding, WithProperties, isReturnValue, isThrownValue, isUndefined, isESNull
} from "../types";
import {
  TExecutionContext, ExecutionContext, enterEnvironment, setEnvironment,
  declareBinding, putBinding, setCurrentThisValue
} from "../execution-context/ExecutionContext";
import { evaluateStatements, mapCompletions } from "../evaluate";
import { unsafeCast } from "@deaven/unsafe-cast.macro";
import { ESObject } from "../Object";
import { tuple } from "@deaven/tuple";
import { parseECMACompliant } from "../parseECMACompliant";
import { ESTree } from "cherow";
import { registerDefinition } from "./definition";
import { hasUseStrict, identifierName, instantiateDeclarations } from "./instantiate";
import { isObjectValue } from "../conversion/toString";

export function ESFunction(implementation: FunctionImplementation) {
  const result = {
    type: "function",
    properties: { prototype: ESObject() },
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
  const blockStatement = ((parseECMACompliant(
    `() => {${unsafeCast<TESString>(args[0]).value as string}}`
  ).body[0] as ESTree.ExpressionStatement).expression as ESTree.ArrowFunctionExpression)
    .body as ESTree.BlockStatement;
  let global = execContext.value.environment;
  while (global.parent) global = global.parent;
  const creationContext = ExecutionContext({ ...execContext.value, environment: global, strict: false });
  return tuple(createFunction(blockStatement.body, [], creationContext), execContext);
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
  const strict = !!creationContext.value.strict || hasUseStrict(statements);
  // Capture the environment identity, not its values or the caller's names.
  // Each call gets a fresh record; surviving closures keep that record alive in
  // the persistent store carried by the returned execution context.
  const result = ESFunction(function*(
    self: Any, args: Array<Any>, execContext: TExecutionContext
  ) {
    const callerEnvironment = execContext.value.environment;
    let activation = enterEnvironment(execContext, "function", environment);
    activation = ExecutionContext({ ...activation.value, strict });
    let thisValue = kind.arrow ? lexicalThis : self;
    if (!kind.arrow && !strict) {
      if (isUndefined(self) || isESNull(self)) thisValue = creationContext.value.global;
      else if (!isObjectValue(self)) throw new Error("Sloppy receiver boxing is not yet supported");
    }
    activation = setCurrentThisValue(activation, thisValue);
    params.forEach((parameter, index) => {
      activation = declareBinding(activation, identifierName(parameter), "parameter", true,
        args[index] === undefined ? Undefined : args[index]);
    });
    if (!kind.arrow && !params.some(parameter => identifierName(parameter) === "arguments")) {
      activation = putBinding(activation, activation.value.environment, "arguments", {
        kind: "var", mutable: true, initialized: true, value: Undefined,
        unmodeled: "Implicit arguments objects are not yet supported"
      });
    }
    activation = instantiateDeclarations(statements, activation, true);
    return mapCompletions(evaluateStatements(statements, activation), (completion, context) => tuple(
      isReturnValue(completion) ? completion.value : isThrownValue(completion) ? completion : Undefined,
      ExecutionContext({
        ...setEnvironment(context, callerEnvironment).value, strict: execContext.value.strict
      })
    ));
  });
  if (kind.arrow) {
    // Arrows have neither [[Construct]] nor an own prototype. Their lexical
    // receiver is independent of calls through .call or a property reference.
    delete (result.properties as WithProperties["properties"]).prototype;
    const firstOptional = params.findIndex(parameter =>
      parameter.type === "AssignmentPattern" || parameter.type === "RestElement");
    Object.assign(result.properties, { length: ESNumber(firstOptional < 0 ? params.length : firstOptional) });
    Object.assign(result, {
      nonConstructible: true,
      unmodeledPropertyReads: ["name", "caller", "arguments"],
      unmodeledPropertyWrites: ["name", "length", "caller", "arguments"]
    });
  }
  registerDefinition(result, { statements, params, environment });
  return result;
}
