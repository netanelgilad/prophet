/// <reference types="node" />

import { ESString, TESString } from "./string/String";
import {
  WithProperties, isFunction, Any, Undefined, FunctionBinding, isThrownValue,
  isReturnValue, ReturnValue, ThrownValue, TESNumber, ESNumber, ESNull,
  isESNumber, isESString, isArray, isUndefined, isESNull, isESBoolean
} from "./types";
import { evaluate, evaluateThrowableIterator, evaluateStatements, mapCompletions, bindNormal } from "./evaluate";
import { BinaryOperatorResolvers, EffectfulBinaryOperatorResolvers, LogicalOperatorResolvers, UnaryOperatorResolvers, plus, minus } from "./operators";
import {
  TExecutionContext, setCurrentThisValue, enterEnvironment, setEnvironment,
  declareBinding, ExecutionContext
} from "./execution-context/ExecutionContext";
import { createFunction } from "./Function/Function";
import { unsafeCast } from "@deaven/unsafe-cast.macro";
import { ESObject } from "./Object";
import { createNewObjectFromConstructor } from "./Function/construct";
import { coerceToBoolean, ESBoolean } from "./boolean/ESBoolean";
import { tuple } from "@deaven/tuple";
import assert from "assert";
import { ESTree } from "cherow";
import { withAnalysisFailureContext } from "./execution-context/analysis-failure";
import { unimplemented } from "@deaven/unimplemented";
import { Array as ESArray, TArray } from "./array/Array";
import { choiceOf } from "./symbolic";
import { evaluateBranches, BranchResult } from "./execution-context/branches";
import { getProperties, getArrayElements, ownPropertyPresence, writeArrayElements,
  writeProperty, isArrayIndex } from "./execution-context/Heap";
import { getSymbolicArrayShape, readSymbolicIndex } from "./array/symbolic";
import { summarizeCall } from "./Function/summaries";
import { assignBinding, bindingReference, readBinding, hasBinding, initializeBinding } from "./execution-context/bindings";
import { initializeBindingPattern } from "./Function/binding-patterns";
import { instantiateDeclarations, globalDeclarationError, hasUseStrict, identifierName } from "./Function/instantiate";
import { evalFn, evaluateEval } from "./eval/eval";
import { isForkedCompletion } from "./execution-context/Completion";
import { prototypeOf, withoutPrototypeSetter } from "./Object/prototype";
import { copyDataProperties } from "./Object/enumeration";
import { toString, withValue } from "./conversion/toString";
import { concatenateStrings } from "./string/concat";

export type ASTResolver<TAST extends ESTree.Node> = (
  ast: TAST, context: TExecutionContext
) => BranchResult;

export const IdentifierResolver: ASTResolver<ESTree.Identifier> = (ast, context) =>
  readBinding(context, ast.name);

export const LiteralResolver: ASTResolver<ESTree.Literal> = (ast, context) => {
  if (typeof ast.value === "string") return tuple(ESString(ast.value), context);
  if (typeof ast.value === "number") return tuple(ESNumber(ast.value), context);
  if (typeof ast.value === "boolean") return tuple(ESBoolean(ast.value), context);
  if (ast.value === null) return tuple(ESNull, context);
  return unimplemented();
};

export const TemplateLiteralResolver: ASTResolver<ESTree.TemplateLiteral> = (ast, context) => {
  const text = (index: number): TESString => {
    const { cooked, raw } = ast.quasis[index].value;
    assert(typeof cooked === "string", "Untagged templates require valid cooked text");
    return ESString(templateText(raw, cooked as string));
  };
  const append = (prefix: TESString, value: TESString, tail: TESString, after: TExecutionContext): BranchResult =>
    withValue(prefix, after, (left, branch) =>
      withValue(value, branch, (right, leaf) => tuple(concatenateStrings(
        concatenateStrings(left as TESString, right as TESString), tail), leaf)));
  const build = (index: number, prefix: TESString, after: TExecutionContext): BranchResult => {
    let accumulated = prefix;
    let current = after;
    for (let position = index; position < ast.expressions.length; position++) {
      // Each expression's ToString must finish before evaluating the next
      // expression. Conversion can mutate captured bindings or throw on only
      // some paths, so retain an immutable prefix for normal continuations.
      const prior = accumulated;
      const following = position + 1;
      const tail = text(following);
      const resume = (value: Any, branch: TExecutionContext): BranchResult =>
        bindNormal(append(prior, value as TESString, tail, branch), (joined, leaf) =>
          build(following, joined as TESString, leaf));
      const evaluated = evaluate(ast.expressions[position], current);
      if (needsContinuation(evaluated[0])) {
        return bindNormal(evaluated, (value, branch) => bindNormal(toString(value, branch), resume));
      }
      const converted = toString(evaluated[0], evaluated[1]);
      if (needsContinuation(converted[0])) return bindNormal(converted, resume);
      // Concatenating already-converted strings has only normal completions.
      // Keep this ordinary path iterative for long, flat substitution lists.
      const joined = append(accumulated, converted[0] as TESString, tail, converted[1]);
      accumulated = joined[0] as TESString;
      current = joined[1];
    }
    return tuple(accumulated, current);
  };
  return build(0, text(0), context);
};

function templateText(raw: string, cooked: string): string {
  // Cherow 1.5.4 leaves physical CR/CRLF in cooked template text. Normalize
  // those source line endings, while keeping escaped \\r and \\u000d intact.
  // Only this lexer edge case needs recooking; parsing has already validated
  // untagged escapes. Match complete escapes before physical line endings.
  if (!raw.includes("\r")) return cooked;
  const escapes: { [character: string]: string } = {
    b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "0": "\0"
  };
  return raw.replace(/\\(?:\r\n|[\r\n\u2028\u2029]|x[\da-fA-F]{2}|u(?:[\da-fA-F]{4}|\{[\da-fA-F]+\})|[\s\S])|\r\n?/g, token => {
    if (token[0] === "\r") return "\n";
    const escaped = token.slice(1);
    if (/^[\r\n\u2028\u2029]/.test(escaped)) return "";
    if (escaped[0] === "x") return String.fromCharCode(parseInt(escaped.slice(1), 16));
    if (escaped[0] === "u") return String.fromCodePoint(parseInt(
      escaped[1] === "{" ? escaped.slice(2, -1) : escaped.slice(1), 16));
    return Object.prototype.hasOwnProperty.call(escapes, escaped) ? escapes[escaped] : escaped;
  });
}

export function propertyName(key: Any): string {
  assert(
    (isESNumber(key) && typeof key.value === "number") ||
      (isESString(key) && typeof key.value === "string"),
    "Computed property access requires a concrete number or string"
  );
  return String(unsafeCast<TESNumber | TESString>(key).value);
}

// A reference is VM bookkeeping, not a JavaScript value. Consume it within
// each normal continuation rather than joining references with selectValue.
function withMemberReference(
  ast: ESTree.MemberExpression, context: TExecutionContext,
  continuation: (object: Any, name: string, context: TExecutionContext) => BranchResult
): BranchResult {
  return bindNormal(evaluate(ast.object, context), (object, afterObject) =>
    ast.computed
      ? bindNormal(evaluate(ast.property, afterObject), (key, afterKey) =>
        continuation(object, propertyName(key), afterKey))
      : continuation(object, unsafeCast<ESTree.Identifier>(ast.property).name, afterObject));
}

export const MemberExpressionResolver: ASTResolver<ESTree.MemberExpression> = (ast, context) =>
  withMemberReference(ast, context, readMember);

export function readMember(object: Any, name: string, context: TExecutionContext): BranchResult {
  const choice = choiceOf(object);
  if (choice) return evaluateBranches(choice.condition, context,
    branch => readMember(choice.consequent, name, branch),
    branch => readMember(choice.alternate, name, branch));
  if (context.value.validateRead) context.value.validateRead(object, name, context);
  if (isArrayIndex(name) && getSymbolicArrayShape(object, context)) {
    return tuple(readSymbolicIndex(object, Number(name), context)!, context);
  }
  const properties = getProperties(unsafeCast<WithProperties>(object), context);
  assert(properties, "Cannot read a property of null or undefined");
  if ((object as WithProperties).unmodeledPropertyReads &&
      (object as WithProperties).unmodeledPropertyReads!.includes(name)) {
    throw new Error(`Unmodeled property read '${name}'`);
  }
  const access = (object as WithProperties).propertyAccess;
  const exotic = access && access.read(name, context);
  if (exotic) return exotic;
  assertModeledProperty(object, name, properties);
  return evaluateBranches(ownPropertyPresence(object as WithProperties, name, context), context, branch => {
    const property = properties[name];
    // Legacy native methods use their method object as a stable identity.
    return isFunction(property) ? tuple({
      type: "function", id: property, properties: {}, function: property
    }, branch) : tuple(property, branch);
  }, branch => {
    if (isArray(object) && isArrayIndex(name) && getArrayElements(object as TArray<any>, branch) === undefined) {
      throw new Error("Indexed reads require known element positions or a symbolic dense array");
    }
    if (isArray(object) && name === "toString") {
      throw new Error("Default array string conversion is not yet supported");
    }
    const prototype = prototypeOf(object);
    return isESNull(prototype) ? tuple(Undefined, branch) : readMember(prototype, name, branch);
  });
}

function withArguments(
  expressions: ESTree.Node[], context: TExecutionContext,
  continuation: (args: Any[], context: TExecutionContext) => BranchResult,
  index = 0, args: Any[] = []
): BranchResult {
  let current = context;
  let values = args;
  for (let position = index; position < expressions.length; position++) {
    const result = evaluate(expressions[position], current);
    if (needsContinuation(result[0])) {
      const prior = values;
      const next = position + 1;
      return bindNormal(result, (value, after) =>
        withArguments(expressions, after, continuation, next, prior.concat([value])));
    }
    values = values.concat([result[0]]);
    current = result[1];
  }
  return withAnalysisFailureContext(current, () => continuation(values, current));
}

function needsContinuation(value: Any): boolean {
  return isForkedCompletion(value) || isThrownValue(value) || isReturnValue(value);
}

export const CallExpressionResolver: ASTResolver<ESTree.CallExpression> = (ast, context) => {
  const call = (callee: Any, afterCallee: TExecutionContext, receiver?: Any) =>
    withArguments(ast.arguments, afterCallee, (args, afterArgs) => invoke(callee, args, afterArgs, receiver,
      ast.callee.type === "Identifier" && ast.callee.name === "eval"));
  if (ast.callee.type === "MemberExpression") {
    return withMemberReference(ast.callee, context, (receiver, name, afterReference) =>
      bindNormal(readMember(receiver, name, afterReference), (callee, afterRead) => call(callee, afterRead, receiver)));
  }
  return bindNormal(evaluate(ast.callee, context), (callee, after) => call(callee, after));
};

export function invoke(callee: Any, args: Any[], context: TExecutionContext, receiver?: Any, directEval = false): BranchResult {
  const receiverChoice = receiver && choiceOf(receiver);
  if (receiverChoice) return evaluateBranches(receiverChoice.condition, context,
    branch => invoke(callee, args, branch, receiverChoice.consequent, directEval),
    branch => invoke(callee, args, branch, receiverChoice.alternate, directEval));
  const choice = choiceOf(callee);
  if (choice) return evaluateBranches(choice.condition, context,
    branch => invoke(choice.consequent, args, branch, receiver, directEval),
    branch => invoke(choice.alternate, args, branch, receiver, directEval));
  const binding = unsafeCast<FunctionBinding>(callee);
  assert(binding.function, "Value is not callable");
  if (context.value.interceptCall) {
    const intercepted = context.value.interceptCall(callee, args, context, receiver);
    if (intercepted) return intercepted;
  } else {
    const summarized = summarizeCall(callee, args, context);
    if (summarized) return summarized;
  }
  const self = receiver === undefined ? Undefined : receiver;
  const result = callee === evalFn ? evaluateEval(args, context, directEval) :
    evaluateThrowableIterator(binding.function.implementation(self, args, setCurrentThisValue(context, self)));
  return mapCompletions(result, (value, after) => tuple(value, setCurrentThisValue(after, context.value.thisValue)));
}

export const BinaryExpressionResolver: ASTResolver<ESTree.BinaryExpression> = (ast, context) =>
  bindNormal(evaluate(ast.left, context), (left, afterLeft) =>
    bindNormal(evaluate(ast.right, afterLeft), (right, afterRight) => {
      const effectful = EffectfulBinaryOperatorResolvers.get(ast.operator);
      if (effectful) return effectful(left, right, afterRight);
      const resolver = BinaryOperatorResolvers.get(ast.operator);
      assert(resolver, `Binary operator resolver for ${ast.operator} hasn't been implemented yet`);
      return tuple(resolver!(left, right, afterRight), afterRight);
    }));

export const ProgramResolver: ASTResolver<ESTree.Program> = (ast, context) => {
  const statements = unsafeCast<ESTree.Statement[]>(ast.body);
  const initial = setCurrentThisValue(ExecutionContext({
    ...context.value, stderr: "", uncaught: undefined, strict: hasUseStrict(statements)
  }), context.value.global);
  const error = globalDeclarationError(statements, initial);
  const result: BranchResult = error ? tuple(error, initial) :
    evaluateStatements(statements, instantiateDeclarations(statements, initial, true));
  // The first tuple item exposes normal, thrown, or forked completion. Legacy
  // diagnostics remain available for an unconditional throw, and on each leaf
  // of a mixed outcome; the merged context cannot claim a single error.
  return mapCompletions(result, (completion, after) => {
    if (!isThrownValue(completion)) return tuple(Undefined, after);
    const thrown = completion.value;
    const message = isUndefined(thrown) ? "undefined" : isESNull(thrown) ? "null" :
      (isESNumber(thrown) || isESString(thrown) || isESBoolean(thrown)) &&
      thrown.value !== undefined ? String(thrown.value) : "Uncaught symbolic or object value";
    return tuple(completion, ExecutionContext({ ...after.value, stderr: message, uncaught: thrown }));
  });
};

export const BlockStatementResolver: ASTResolver<ESTree.BlockStatement> = (ast, context) => {
  const local = instantiateDeclarations(ast.body, enterEnvironment(context, "block"), false);
  return mapCompletions(evaluateStatements(ast.body, local), (value, after) =>
    tuple(value, setEnvironment(after, context.value.environment)));
};

export const AssignmentExpressionResolver: ASTResolver<ESTree.AssignmentExpression> = (ast, context) => {
  assert(ast.operator === "=", "Compound assignment is not yet supported");
  if (ast.left.type === "MemberExpression") {
    return withMemberReference(ast.left, context, (object, name, afterReference) =>
      bindNormal(evaluate(ast.right, afterReference), (value, afterRight) => assignMember(object, name, value, afterRight)));
  }
  assert(ast.left.type === "Identifier", "Destructured assignment is not yet supported");
  const name = (ast.left as ESTree.Identifier).name;
  const reference = bindingReference(context, name);
  return bindNormal(evaluate(ast.right, context), (value, after) => assignBinding(after, name, value, reference));
};

function assignMember(object: Any, name: string, assigned: Any, context: TExecutionContext): BranchResult {
  const choice = choiceOf(object);
  if (choice) return evaluateBranches(choice.condition, context,
    branch => assignMember(choice.consequent, name, assigned, branch),
    branch => assignMember(choice.alternate, name, assigned, branch));
  const unmodeledWrites = (object as WithProperties).unmodeledPropertyWrites;
  if (unmodeledWrites && unmodeledWrites.includes(name)) {
    throw new Error(`Unmodeled host property write '${name}'`);
  }
  const access = (object as WithProperties).propertyAccess;
  const exotic = access && access.write(name, assigned, context);
  if (exotic) return exotic;
  assertModeledProperty(object, name, getProperties(unsafeCast<WithProperties>(object), context));
  assert(!(isESNumber(object) || isESString(object) || isESBoolean(object)),
    "Property assignment on primitive values is not yet supported");
  assert(!getSymbolicArrayShape(object, context), "Writes to symbolic array snapshots are not yet supported");
  if (isArray(object) && (name === "length" || isArrayIndex(name))) {
    const array = unsafeCast<TArray<Any>>(object);
    const current = getArrayElements(array, context);
    assert(current, "Array assignment requires known element structure");
    const elements = current!.slice();
    if (name === "length") {
      assert(isESNumber(assigned) && typeof assigned.value === "number" &&
        Number.isInteger(assigned.value) && assigned.value >= 0 && assigned.value < 0x100000000,
        "Array length requires a concrete valid length");
      elements.length = unsafeCast<number>(unsafeCast<TESNumber>(assigned).value);
    } else elements[Number(name)] = assigned;
    return tuple(assigned, writeArrayElements(array, elements, context));
  }
  if (name === "__proto__") return withoutPrototypeSetter(object, context,
    after => tuple(assigned, writeProperty(unsafeCast<WithProperties>(object), name, assigned, after)));
  return tuple(assigned, writeProperty(unsafeCast<WithProperties>(object), name, assigned, context));
}

function assertModeledProperty(object: Any, name: string, properties: { [name: string]: Any }): void {
  const reason = (object as WithProperties).unknownProperties;
  const inherited = (object as WithProperties).modeledInheritedProperties || [];
  if (reason && !inherited.includes(name) && !Object.prototype.hasOwnProperty.call(properties, name)) {
    throw new Error(`Unmodeled host property '${name}': ${reason}`);
  }
}

export const ReturnStatementResolver: ASTResolver<ESTree.ReturnStatement> = (ast, context) =>
  ast.argument === null ? tuple(ReturnValue(Undefined), context) :
    bindNormal(evaluate(ast.argument, context), (value, after) => tuple(ReturnValue(value), after));

export const ThisExpressionResolver: ASTResolver<ESTree.ThisExpression> = (_ast, context) =>
  tuple(context.value.thisValue, context);

export const ObjectExpressionResolver: ASTResolver<ESTree.ObjectExpression> = (ast, context) => {
  const target = ESObject();
  const build = (index: number, current: TExecutionContext): BranchResult => {
    let after = current;
    for (let position = index; position < ast.properties.length; position++) {
      const property = ast.properties[position];
      const next = position + 1;
      if (property.type === "SpreadElement") {
        return bindNormal(evaluate(property.argument, after), (source, afterSource) =>
          bindNormal(copyDataProperties(target, source, afterSource), (_unused, afterCopy) => build(next, afterCopy)));
      }
      assert(property.type === "Property" && property.kind === "init", "Object literal accessors are not yet supported");
      const entry = property as ESTree.Property;
      let name: string;
      if (entry.computed) {
        const key = evaluate(entry.key, after);
        if (needsContinuation(key[0])) return bindNormal(key, (value, afterKey) => {
          const selectedName = propertyName(value);
          return bindNormal(evaluate(entry.value!, afterKey), (item, afterValue) =>
            build(next, writeProperty(target, selectedName, item, afterValue)));
        });
        name = propertyName(key[0]);
        after = key[1];
      } else name = entry.key.type === "Identifier" ? entry.key.name : String((entry.key as ESTree.Literal).value);
      assert(entry.computed || entry.method || entry.shorthand || name !== "__proto__",
        "Object literal prototype setters are not yet supported");
      const value = evaluate(entry.value!, after);
      if (needsContinuation(value[0])) return bindNormal(value, (item, afterValue) =>
        build(next, writeProperty(target, name, item, afterValue)));
      after = writeProperty(target, name, value[0], value[1]);
    }
    return tuple(target, after);
  };
  return build(0, context);
};

export const ArrayExpressionResolver: ASTResolver<ESTree.ArrayExpression> = (ast, context) => {
  const build = (index: number, elements: Any[], current: TExecutionContext): BranchResult => {
    let accumulated = elements;
    let after = current;
    for (let position = index; position < ast.elements.length; position++) {
      const element = ast.elements[position];
      if (element === null) {
        const sparse = accumulated.slice();
        sparse.length++;
        accumulated = sparse;
        continue;
      }
      const result = evaluate(element, after);
      if (needsContinuation(result[0])) {
        const prior = accumulated;
        const next = position + 1;
        return bindNormal(result, (value, nextContext) => build(next, prior.concat([value]), nextContext));
      }
      accumulated = accumulated.concat([result[0]]);
      after = result[1];
    }
    return tuple(ESArray(accumulated, "elements"), after);
  };
  return build(0, [], context);
};

export const ConditionalExpressionResolver: ASTResolver<ESTree.ConditionalExpression> = (ast, context) =>
  bindNormal(evaluate(ast.test, context), (test, afterTest) =>
    evaluateBranches(coerceToBoolean(test, afterTest.value.knowledge), afterTest,
      branch => evaluate(ast.consequent, branch), branch => evaluate(ast.alternate, branch)));

export const FunctionExpressionResolver: ASTResolver<ESTree.FunctionExpression> = (ast, context) => {
  if (!ast.id) return tuple(createFunction(ast.body.body, ast.params, context, ast), context);
  const name = identifierName(ast.id);
  let local = declareBinding(enterEnvironment(context, "named-function"), name, "name");
  const fn = createFunction(ast.body.body, ast.params, local, ast);
  local = initializeBinding(local, name, fn);
  return tuple(fn, setEnvironment(local, context.value.environment));
};

export const ArrowFunctionExpressionResolver: ASTResolver<ESTree.ArrowFunctionExpression> = (ast, context) => {
  // An expression body is an implicit return, never a directive prologue.
  // Its expression retains the original source location for evaluation errors.
  const statements: ESTree.Statement[] = ast.body.type === "BlockStatement"
    ? ast.body.body : [{ type: "ReturnStatement", argument: ast.body, loc: ast.body.loc }];
  return tuple(createFunction(statements, ast.params, context, { ...ast, arrow: true }), context);
};

export const ExpressionStatementResolver: ASTResolver<ESTree.ExpressionStatement> = (ast, context) =>
  bindNormal(evaluate(ast.expression, context), (_value, after) => tuple(Undefined, after));

export const VariableDeclarationResolver: ASTResolver<ESTree.VariableDeclaration> = (ast, context) => {
  const declare = (index: number, current: TExecutionContext): BranchResult => {
    let after = current;
    for (let position = index; position < ast.declarations.length; position++) {
      const declaration = ast.declarations[position];
      if (declaration.id.type !== "Identifier") {
        if (!declaration.init) throw new Error("Binding patterns require an initializer");
        const next = position + 1;
        return bindNormal(evaluate(declaration.init, after), (value, afterValue) =>
          bindNormal(initializeBindingPattern(declaration.id, value, ast.kind, afterValue),
            (_ignored, afterBinding) => declare(next, afterBinding)));
      }
      const name = identifierName(declaration.id);
      if (!declaration.init) {
        if (ast.kind !== "var") after = initializeBinding(after, name, Undefined);
        continue;
      }
      const reference = bindingReference(after, name);
      const result = evaluate(declaration.init, after);
      const next = position + 1;
      if (needsContinuation(result[0])) return bindNormal(result, (value, nextContext) => ast.kind === "var"
        ? bindNormal(assignBinding(nextContext, name, value, reference), (_assigned, afterAssignment) => declare(next, afterAssignment))
        : declare(next, initializeBinding(nextContext, name, value)));
      if (ast.kind === "var") {
        const assigned = assignBinding(result[1], name, result[0], reference);
        if (needsContinuation(assigned[0])) return bindNormal(assigned, (_value, afterAssignment) => declare(next, afterAssignment));
        after = assigned[1];
      } else after = initializeBinding(result[1], name, result[0]);
    }
    return tuple(Undefined, after);
  };
  return declare(0, context);
};

export const FunctionDeclarationResolver: ASTResolver<ESTree.FunctionDeclaration> = (_ast, context) =>
  // Function declarations were initialized when their scope was entered.
  tuple(Undefined, context);

export const IfStatementResolver: ASTResolver<ESTree.IfStatement> = (ast, context) =>
  bindNormal(evaluate(ast.test, context), (test, afterTest) =>
    evaluateBranches(coerceToBoolean(test, afterTest.value.knowledge), afterTest,
      branch => evaluate(ast.consequent, branch),
      branch => ast.alternate ? evaluate(ast.alternate, branch) : tuple(Undefined, branch)));

export const EmptyStatementResolver: ASTResolver<ESTree.EmptyStatement> = (_ast, context) => tuple(Undefined, context);

export const NewExpressionResolver: ASTResolver<ESTree.NewExpression> = (ast, context) =>
  bindNormal(evaluate(ast.callee, context), (callee, afterCallee) =>
    withArguments(ast.arguments, afterCallee, (args, afterArgs) => createNewObjectFromConstructor(callee, args, afterArgs)));

export const LogicalExpressionResolver: ASTResolver<ESTree.LogicalExpression> = (ast, context) => {
  const resolver = LogicalOperatorResolvers.get(ast.operator);
  assert(resolver, `Logical operator for ${ast.operator} has not been implemented yet`);
  return resolver!(ast.left, ast.right, context);
};

export const TryStatementResolver: ASTResolver<ESTree.TryStatement> = (ast, context) => {
  const handled = mapCompletions(evaluate(ast.block, context), (value, afterTry) => {
    if (!isThrownValue(value) || !ast.handler) return tuple(value, afterTry);
    const handler = ast.handler;
    assert(!handler.param || handler.param.type === "Identifier", "Destructured catch bindings are not yet supported");
    let local = enterEnvironment(afterTry, "block");
    if (handler.param) local = declareBinding(local, identifierName(handler.param), "catch", true, value.value);
    return mapCompletions(evaluate(handler.body, local), (caught, afterCatch) =>
      tuple(caught, setEnvironment(afterCatch, afterTry.value.environment)));
  });
  if (!ast.finalizer) return handled;
  return mapCompletions(handled, (prior, afterTry) =>
    mapCompletions(evaluate(ast.finalizer!, afterTry), (final, afterFinally) =>
      tuple(isReturnValue(final) || isThrownValue(final) ? final : prior, afterFinally)));
};

export const ThrowStatementResolver: ASTResolver<ESTree.ThrowStatement> = (ast, context) =>
  bindNormal(evaluate(ast.argument, context), (value, after) => tuple(ThrownValue(value), after));

export const DoWhileStatementResolver: ASTResolver<ESTree.DoWhileStatement> = () => {
  throw new Error("Do-while evaluation is not yet supported");
};

export const UpdateExpressionResolver: ASTResolver<ESTree.UpdateExpression> = (ast, context) => {
  if (ast.argument.type !== "Identifier") return unimplemented();
  const name = ast.argument.name;
  const reference = bindingReference(context, name);
  return bindNormal(evaluate(ast.argument, context), (value, afterRead) => {
    assert(isESNumber(value), "Update of non-numeric values is not yet supported");
    const updated = (ast.operator === "++" ? plus : minus)(value, ESNumber(1), afterRead);
    return bindNormal(assignBinding(afterRead, name, updated, reference), (_assigned, afterWrite) =>
      tuple(ast.prefix ? updated : value, afterWrite));
  });
};

export const UnaryExpressionResolver: ASTResolver<ESTree.UnaryExpression> = (ast, context) => {
  if (ast.operator === "typeof" && ast.argument.type === "Identifier") {
    return evaluateBranches(hasBinding(context, ast.argument.name), context,
      branch => bindNormal(evaluate(ast.argument, branch), (argument, after) =>
        UnaryOperatorResolvers.get("typeof")!(argument, after)),
      branch => tuple(ESString("undefined"), branch));
  }
  return bindNormal(evaluate(ast.argument, context), (value, after) => {
    const resolver = UnaryOperatorResolvers.get(ast.operator);
    assert(resolver, `Unary operator resolver for ${ast.operator} hasn't been implemented yet`);
    return resolver!(value, after);
  });
};

export const ASTResolvers = new Map<string, ASTResolver<any>>([
  ["Literal", LiteralResolver], ["Identifier", IdentifierResolver],
  ["TemplateLiteral", TemplateLiteralResolver],
  ["MemberExpression", MemberExpressionResolver], ["CallExpression", CallExpressionResolver],
  ["BinaryExpression", BinaryExpressionResolver], ["Program", ProgramResolver],
  ["AssignmentExpression", AssignmentExpressionResolver], ["ReturnStatement", ReturnStatementResolver],
  ["ThisExpression", ThisExpressionResolver], ["ObjectExpression", ObjectExpressionResolver],
  ["ArrayExpression", ArrayExpressionResolver], ["ConditionalExpression", ConditionalExpressionResolver],
  ["FunctionExpression", FunctionExpressionResolver], ["ExpressionStatement", ExpressionStatementResolver],
  ["ArrowFunctionExpression", ArrowFunctionExpressionResolver],
  ["VariableDeclaration", VariableDeclarationResolver], ["FunctionDeclaration", FunctionDeclarationResolver],
  ["IfStatement", IfStatementResolver], ["EmptyStatement", EmptyStatementResolver],
  ["BlockStatement", BlockStatementResolver], ["NewExpression", NewExpressionResolver],
  ["LogicalExpression", LogicalExpressionResolver], ["TryStatement", TryStatementResolver],
  ["ThrowStatement", ThrowStatementResolver], ["DoWhileStatement", DoWhileStatementResolver],
  ["UpdateExpression", UpdateExpressionResolver], ["UnaryExpression", UnaryExpressionResolver]
]);
