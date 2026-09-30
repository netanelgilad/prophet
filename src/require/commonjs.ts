import { dirname, isAbsolute, normalize } from "path";
import { ESTree } from "cherow";
import { createFunction, ESFunction } from "../Function/Function";
import { ESObject } from "../Object";
import { ESString } from "../string/String";
import { isThrownValue, WithProperties, FunctionBinding } from "../types";
import { Environment, ExecutionContext, TExecutionContext } from "../execution-context/ExecutionContext";
import { getProperties } from "../execution-context/Heap";
import { bindingError } from "../execution-context/bindings";
import { BranchResult } from "../execution-context/branches";
import { evaluateThrowableIterator, mapCompletions } from "../evaluate";
import { parseECMACompliant } from "../parseECMACompliant";

function parseWrapper(source: string): ESTree.FunctionExpression {
  // A hashbang is valid only at the original start of source. In particular,
  // BOM + hashbang is invalid in the pinned Node runtime. Keep line terminators
  // so directives/comments retain layout after removing the hashbang itself.
  const body = source.replace(/^#![^\r\n\u2028\u2029]*/, "").replace(/^\uFEFF/, "");
  const program = parseECMACompliant(
    `(function(exports, require, module, __filename, __dirname) {\n${body}\n})`
  );
  const statement = program.body[0];
  // Source is a function body, never a way to inject statements outside the
  // wrapper. A source text that closes it early must not silently be accepted.
  if (program.body.length !== 1 || !statement || statement.type !== "ExpressionStatement" ||
      statement.expression.type !== "FunctionExpression") {
    throw new SyntaxError("Invalid CommonJS module body");
  }
  return statement.expression;
}

/**
 * Execute explicitly supplied CommonJS source in its own lexical scope.
 * Normal completion yields the original module object's current exports;
 * thrown/forked completions retain their path state. This is the execution
 * layer, not file/package resolution or a require cache.
 */
export function evaluateCommonJS(
  source: string, filename: string, caller: TExecutionContext
): BranchResult {
  const exported = ESObject();
  const module: WithProperties = {
    ...ESObject({ exports: exported }), unknownProperties: "CommonJS module metadata"
  };
  const require: FunctionBinding = {
    ...ESFunction(function*() {
      throw new Error("CommonJS require loading is not yet supported");
    }),
    properties: {},
    unknownProperties: "CommonJS require API"
  };
  return executeCommonJS(source, filename, caller, module, require);
}

// The loader supplies the module record and its scoped require so that the
// same record can enter the cache before any source executes (including cycles).
export function executeCommonJS(
  source: string, filename: string, caller: TExecutionContext,
  module: WithProperties, require: FunctionBinding, detectModuleSyntax = false
): BranchResult {
  if (!isAbsolute(filename)) throw new Error("CommonJS execution requires an absolute filename");
  let wrapper: ESTree.FunctionExpression;
  try {
    wrapper = parseWrapper(source);
  } catch (error) {
    if (error.name !== "SyntaxError") throw error;
    if (detectModuleSyntax) {
      throw new Error("CommonJS syntax detection after wrapper parsing fails is not yet supported");
    }
    return [bindingError("SyntaxError", error.message), caller];
  }
  const exported = getProperties(module, caller).exports;
  const path = normalize(filename);
  const args = [exported, require, module, ESString(path), ESString(dirname(path))];

  // Each module sees the modeled global object, but none of its caller's
  // lexical bindings (even if the supplied caller is at a script root).
  const environment: Environment = {
    kind: "global",
    unmodeledGlobalDeclarations: "Global var/function declarations from CommonJS eval are not yet supported"
  };
  const environments = new Map(caller.value.environments);
  environments.set(environment, new Map());
  const prepared = ExecutionContext({ ...caller.value, environments });
  const creation = ExecutionContext({ ...prepared.value, environment, strict: false, sourceFile: path });
  const fn = createFunction(wrapper.body.body, wrapper.params, creation);
  const result = evaluateThrowableIterator(fn.function.implementation(exported, args,
    ExecutionContext({ ...prepared.value, thisValue: exported })));
  return mapCompletions(result, (completion, after) => [
    isThrownValue(completion) ? completion : getProperties(module, after).exports,
    ExecutionContext({ ...after.value, environment: caller.value.environment,
      strict: caller.value.strict, thisValue: caller.value.thisValue,
      sourceFile: caller.value.sourceFile })
  ]);
}
