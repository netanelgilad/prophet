/// <reference types="node" />

import { ESString, TESString } from "./string/String";
import {
  WithProperties,
  isFunction,
  Any,
  Undefined,
  FunctionBinding,
  isThrownValue,
  isReturnValue,
  ReturnValue,
  EvaluationResult,
  ControlFlowResult,
  ThrownValue,
  TESNumber,
  ESNumber,
  ESNull,
  isESNumber,
  isESString,
  isArray,
  isUndefined,
  isESNull,
  isESBoolean
} from "./types";
import { evaluate, evaluateThrowableIterator, evaluateStatements, mapCompletions } from "./evaluate";
import {
  BinaryOperatorResolvers,
  LogicalOperatorResolvers,
  UnaryOperatorResolvers,
  plus,
  minus
} from "./operators";
import {
  TExecutionContext,
  setCurrentThisValue,
  setVariableInScope,
  ExecutionContext
} from "./execution-context/ExecutionContext";
import { createFunction } from "./Function/Function";
import { unsafeCast } from "@deaven/unsafe-cast.macro";
import { ESObject } from "./Object";
import { createNewObjectFromConstructor } from "./Function/construct";
import { coerceToBoolean, ESBoolean } from "./boolean/ESBoolean";
import { tuple } from "@deaven/tuple";
import assert from "assert";
import { ESTree } from "cherow";
import { unimplemented } from "@deaven/unimplemented";
import { Array as ESArray, TArray } from "./array/Array";
import { choiceOf } from "./symbolic";
import { evaluateBranches, BranchResult } from "./execution-context/branches";
import { getProperties, getArrayElements, writeArrayElements,
  writeProperty, isArrayIndex } from "./execution-context/Heap";
import { isForkedCompletion } from "./execution-context/Completion";

export type ASTResolver<TAST extends ESTree.Node, T extends Any> = (
  ast: TAST,
  prevContext: TExecutionContext
) => Iterator<
  [Any | ControlFlowResult, TExecutionContext],
  [T | ControlFlowResult, TExecutionContext],
  [Any | ControlFlowResult, TExecutionContext]
>;

export const noExecutionContextResolver = <
  TAST extends ESTree.Node,
  T extends Any
>(
  fn: (ast: TAST, execContext: TExecutionContext) => T
) =>
  function*(ast: TAST, execContext: TExecutionContext) {
    return tuple(fn(ast, execContext), execContext);
  };

export const statementResolver = <TStatement extends ESTree.Statement>(
  fn: (
    ast: TStatement,
    execContext: TExecutionContext
  ) => Generator<
    [Any, TExecutionContext],
    [EvaluationResult, TExecutionContext],
    [Any, TExecutionContext]
  >
) =>
  function*(ast: TStatement, execContext: TExecutionContext) {
    const resultIter = fn(ast, execContext);

    return evaluateThrowableIterator(resultIter);
  };

export const IdentifierResolver: ASTResolver<
  ESTree.Identifier,
  Any
> = noExecutionContextResolver((ast, execContext) => {
  const resolvedFromScope = execContext.value.scope[ast.name];
  return (
    resolvedFromScope ||
    getProperties(execContext.value.global, execContext)[ast.name] ||
    Undefined
  );
});

export const LiteralResolver: ASTResolver<
  ESTree.Literal,
  Any
> = noExecutionContextResolver(ast => {
  if (typeof ast.value === "string") {
    return ESString(ast.value);
  } else if (typeof ast.value === "number") {
    return ESNumber(ast.value);
  } else if (typeof ast.value === "boolean") {
    return ESBoolean(ast.value);
  } else if (ast.value === null) {
    return ESNull;
  }

  return unimplemented();
});

export const MemberExpressionResolver: ASTResolver<
  ESTree.MemberExpression,
  Any
> = function*(ast, execContext) {
  const [reference, context] = yield* memberReference(ast, execContext);
  return readMember(reference.object, reference.name, context);
};

function* memberReference(
  ast: ESTree.MemberExpression, execContext: TExecutionContext
): Generator<BranchResult, [{ object: Any; name: string }, TExecutionContext], BranchResult> {
  const [objectType, newExecContext] = yield evaluate(ast.object, execContext);
  let propertyName: string;
  let afterPropertyExecContext = newExecContext;
  if (ast.computed) {
    const [key, afterKeyExecContext] = yield evaluate(
      ast.property,
      newExecContext
    );
    assert(
      (isESNumber(key) && typeof key.value === "number") ||
        (isESString(key) && typeof key.value === "string"),
      "Computed property access requires a concrete number or string"
    );
    propertyName = String(unsafeCast<TESNumber | TESString>(key).value);
    afterPropertyExecContext = afterKeyExecContext;
  } else {
    propertyName = unsafeCast<ESTree.Identifier>(ast.property).name;
  }
  return tuple({ object: objectType, name: propertyName }, afterPropertyExecContext);
}

function readMember(object: Any, name: string, context: TExecutionContext): BranchResult {
  const choice = choiceOf(object);
  if (choice) {
    return evaluateBranches(choice.condition, context,
      branch => readMember(choice.consequent, name, branch),
      branch => readMember(choice.alternate, name, branch));
  }
  const properties = getProperties(unsafeCast<WithProperties>(object), context);
  assert(properties, "Cannot read a property of null or undefined");
  const property = Object.prototype.hasOwnProperty.call(properties, name)
    ? properties[name] : Undefined;
  // A property read doesn't bind `this`. Only a direct member call supplies a
  // receiver. Legacy native methods use their method object as a stable ID.
  if (isFunction(property)) return tuple({
    type: "function", id: property, properties: {}, function: property
  }, context);
  return tuple(property, context);
}

export const CallExpressionResolver: ASTResolver<
  ESTree.CallExpression,
  Any
> = function*(ast, execContext) {
  let calleeType: Any;
  let newExecContext: TExecutionContext;
  let receiver: Any | undefined;
  if (ast.callee.type === "MemberExpression") {
    const [reference, context] = yield* memberReference(ast.callee, execContext);
    receiver = reference.object;
    [calleeType, newExecContext] = readMember(reference.object, reference.name, context);
  } else {
    [calleeType, newExecContext] = yield evaluate(ast.callee, execContext);
  }

  let currExecContext = newExecContext;
  let argsTypes: Any[] = [];

  for (const argAST of ast.arguments) {
    const [argType, newExecContext] = yield evaluate(argAST, currExecContext);
    argsTypes = [...argsTypes, argType];
    currExecContext = newExecContext;
  }

  return invoke(calleeType, argsTypes, currExecContext, receiver);
};

function invoke(callee: Any, args: Any[], context: TExecutionContext, receiver?: Any): BranchResult {
  const receiverChoice = receiver && choiceOf(receiver);
  if (receiverChoice) return evaluateBranches(receiverChoice.condition, context,
    branch => invoke(callee, args, branch, receiverChoice.consequent),
    branch => invoke(callee, args, branch, receiverChoice.alternate));
  const choice = choiceOf(callee);
  if (choice) return evaluateBranches(choice.condition, context,
    branch => invoke(choice.consequent, args, branch, receiver),
    branch => invoke(choice.alternate, args, branch, receiver));
  const binding = unsafeCast<FunctionBinding>(callee);
  assert(binding.function, "Value is not callable");
  const self = receiver || context.value.global;
  const result = evaluateThrowableIterator(binding.function.implementation(
    self, args, setCurrentThisValue(context, self)));
  if (isForkedCompletion(result[0])) {
    throw new Error("A symbolic call that throws on only some paths is not yet supported");
  }
  return tuple(result[0], setCurrentThisValue(result[1], context.value.thisValue));
}

export const BinaryExpressionResolver: ASTResolver<
  ESTree.BinaryExpression,
  any | TESString
> = function*(ast, execContext) {
  const [leftType, leftExecContext] = yield evaluate(ast.left, execContext);
  const [rightType, rightExecContext] = yield evaluate(
    ast.right,
    leftExecContext
  );
  const binaryOperatorResolver = BinaryOperatorResolvers.get(ast.operator);
  assert(
    binaryOperatorResolver,
    `Binary operator resolver for ${ast.operator} hasn't been implemented yet`
  );
  return tuple(binaryOperatorResolver!(leftType, rightType, rightExecContext), rightExecContext);
};

// export const FileResolver: ASTResolver<File, Any> = (ast, execContext) => {
//   return ProgramResolver(ast.program, execContext);
// };

export const ProgramResolver: ASTResolver<ESTree.Program, Any> = function*(
  ast,
  execContext
) {
  const programFunction = createFunction(
    unsafeCast<ESTree.Statement[]>(ast.body),
    [],
    true
  );
  const programIter = programFunction.function.implementation(
    execContext.value.global,
    [],
    setCurrentThisValue(ExecutionContext({
      ...execContext.value, stderr: "", uncaught: undefined
    }), execContext.value.global)
  );

  const currentEvaluationResult = evaluateThrowableIterator(programIter);

  if (isForkedCompletion(currentEvaluationResult[0])) {
    throw new Error("A program that throws on only some symbolic paths is not yet supported");
  }

  if (isThrownValue(currentEvaluationResult[0])) {
    const thrown = currentEvaluationResult[0].value;
    const message = isUndefined(thrown) ? "undefined" : isESNull(thrown) ? "null" :
      (isESNumber(thrown) || isESString(thrown) || isESBoolean(thrown)) &&
      thrown.value !== undefined ? String(thrown.value) : "Uncaught symbolic or object value";
    return tuple(
      Undefined,
      ExecutionContext({
        ...currentEvaluationResult[1].value,
        stderr: message,
        uncaught: thrown
      })
    );
  }

  return tuple(Undefined, currentEvaluationResult[1]);
};

export const BlockStatementResolver = statementResolver<ESTree.BlockStatement>(
  function*(ast, execContext) {
    return evaluateStatements(ast.body, execContext);
  }
);

export const AssignmentExpressionResolver: ASTResolver<
  ESTree.AssignmentExpression,
  Any
> = function*(ast, execContext) {
  assert(ast.operator === "=", "Compound assignment is not yet supported");
  if (ast.left.type === "MemberExpression") {
    const [objectType, afterLeftExecContext] = yield evaluate(
      ast.left.object,
      execContext
    );
    let propertyName = unsafeCast<ESTree.Identifier>(ast.left.property).name;
    let afterPropertyExecContext = afterLeftExecContext;
    if (ast.left.computed) {
      const [key, afterKeyExecContext] = yield evaluate(
        ast.left.property,
        afterLeftExecContext
      );
      assert(
        (isESNumber(key) && typeof key.value === "number") ||
          (isESString(key) && typeof key.value === "string"),
        "Computed property assignment requires a concrete number or string"
      );
      propertyName = String(unsafeCast<TESNumber | TESString>(key).value);
      afterPropertyExecContext = afterKeyExecContext;
    }
    const [rightType, afterRightExecContext] = yield evaluate(
      ast.right,
      afterPropertyExecContext
    );
    return assignMember(objectType, propertyName, rightType, afterRightExecContext);
  } else {
    const [rightType, afterRightExecContext] = yield evaluate(
      ast.right,
      execContext
    );
    return tuple(
      rightType,
      setVariableInScope(
        afterRightExecContext,
        unsafeCast<ESTree.Identifier>(ast.left).name,
        rightType
      )
    );
  }
};

function assignMember(
  object: Any, name: string, assigned: Any, context: TExecutionContext
): BranchResult {
  const choice = choiceOf(object);
  if (choice) {
    return evaluateBranches(choice.condition, context,
      branch => assignMember(choice.consequent, name, assigned, branch),
      branch => assignMember(choice.alternate, name, assigned, branch));
  }
  assert(!(isESNumber(object) || isESString(object) || isESBoolean(object)),
    "Property assignment on primitive values is not yet supported");
  if (isArray(object) && (name === "length" || isArrayIndex(name))) {
    const array = unsafeCast<TArray<Any>>(object);
    const current = getArrayElements(array, context);
    assert(current, "Array assignment requires known element structure");
    const elements = current!.slice();
    if (name === "length") {
      assert(isESNumber(assigned) && typeof assigned.value === "number" &&
        Number.isInteger(assigned.value) && assigned.value >= 0 &&
        assigned.value < 0x100000000, "Array length requires a concrete valid length");
      elements.length = unsafeCast<number>(unsafeCast<TESNumber>(assigned).value);
    } else {
      elements[Number(name)] = assigned;
    }
    return tuple(assigned, writeArrayElements(array, elements, context));
  }
  return tuple(assigned, writeProperty(unsafeCast<WithProperties>(object), name, assigned, context));
}

export const ReturnStatementResolver = statementResolver<
  ESTree.ReturnStatement
>(function*(statement, execContext) {
  if (statement.argument === null) {
    return tuple(ReturnValue(Undefined), execContext);
  }
  const [argType, afterArgExecContext] = yield evaluate(
    statement.argument,
    execContext
  );
  return tuple(ReturnValue(argType), afterArgExecContext);
});

export const ThisExpressionResolver: ASTResolver<
  ESTree.ThisExpression,
  Any
> = function*(_ast, execContext) {
  return tuple(execContext.value.thisValue, execContext);
};

export const ObjectExpressionResolver: ASTResolver<
  ESTree.ObjectExpression,
  Any
> = function*(ast, execContext) {
  let obj = {};
  let currExecContext = execContext;
  for (const property of ast.properties) {
    let propValueType;
    if (property.type === "Property") {
      if (property.shorthand) {
        [propValueType, currExecContext] = yield evaluate(
          property.key,
          currExecContext
        );
      } else {
        [propValueType, currExecContext] = yield evaluate(
          unsafeCast<ESTree.Node>(property.value),
          currExecContext
        );
      }
    }

    obj = {
      ...obj,
      [unsafeCast<ESTree.Identifier>(unsafeCast<ESTree.Property>(property).key)
        .name]: propValueType
    };
  }

  return tuple(ESObject(obj), currExecContext);
};

export const ArrayExpressionResolver: ASTResolver<
  ESTree.ArrayExpression,
  Any
> = function*(ast, execContext) {
  const elements: Any[] = [];
  let currentContext = execContext;
  for (const element of ast.elements) {
    if (element === null) {
      // Preserve a hole rather than manufacturing an element value.
      elements.length++;
    } else {
      const [value, nextContext] = yield evaluate(element, currentContext);
      elements.push(value);
      currentContext = nextContext;
    }
  }
  return tuple(ESArray(elements, "elements"), currentContext);
};

export const ConditionalExpressionResolver: ASTResolver<
  ESTree.ConditionalExpression,
  Any
> = function*(ast, execContext) {
  const [test, afterTestContext] = yield evaluate(ast.test, execContext);
  const condition = coerceToBoolean(test, afterTestContext.value.knowledge);
  return evaluateBranches(condition, afterTestContext,
    branch => evaluate(ast.consequent, branch),
    branch => evaluate(ast.alternate, branch));
};

export const FunctionExpressionResolver: ASTResolver<
  ESTree.FunctionExpression,
  FunctionBinding
> = function*(ast, execContext) {
  const functionType = createFunction(ast.body.body, ast.params);

  return tuple(
    functionType,
    ast.id
      ? setVariableInScope(
          execContext,
          unsafeCast<ESTree.Identifier>(ast.id).name,
          functionType
        )
      : execContext
  );
};

export const ExpressionStatementResolver = statementResolver<
  ESTree.ExpressionStatement
>(function*(statement, execContext) {
  const result = yield evaluate(statement.expression, execContext);
  return tuple(Undefined, result[1]);
});

export const VariableDeclarationResolver = statementResolver<
  ESTree.VariableDeclaration
>(function*(statement, execContext) {
  let currExecContext = execContext;
  for (const declaration of statement.declarations) {
    if (declaration.init) {
      const initResult = yield evaluate(declaration.init, currExecContext);
      currExecContext = setVariableInScope(
        initResult[1],
        unsafeCast<ESTree.Identifier>(declaration.id).name,
        initResult[0]
      );
    } else {
      currExecContext = setVariableInScope(
        currExecContext,
        unsafeCast<ESTree.Identifier>(declaration.id).name,
        Undefined
      );
    }
  }
  return tuple(Undefined, currExecContext);
});

export const FunctionDeclarationResolver = statementResolver<
  ESTree.FunctionDeclaration
>(function*(statement, execContext) {
  return tuple(
    Undefined,
    setVariableInScope(
      execContext,
      unsafeCast<ESTree.Identifier>(statement.id).name,
      createFunction(statement.body.body, statement.params)
    )
  );
});

export const IfStatementResolver = statementResolver<ESTree.IfStatement>(
  function*(statement, prevContext) {
    const [testType, afterTestExecContext] = yield evaluate(
      statement.test,
      prevContext
    );
    const testTypeAsBoolean = coerceToBoolean(testType, afterTestExecContext.value.knowledge);
    return evaluateBranches(testTypeAsBoolean, afterTestExecContext,
      branch => evaluate(statement.consequent, branch),
      branch => statement.alternate
        ? evaluate(statement.alternate, branch)
        : tuple(Undefined, branch));
  }
);

export const EmptyStatementResolver = statementResolver<ESTree.EmptyStatement>(
  function*(_, execContext) {
    return tuple(Undefined, execContext);
  }
);

export const NewExpressionResolver: ASTResolver<
  ESTree.NewExpression,
  Any
> = function*(expression, execContext) {
  let [calleeType, newExecContext] = yield evaluate(
    expression.callee,
    execContext
  );

  let currExecContext = newExecContext;
  let argsTypes: Any[] = [];

  for (const argAST of expression.arguments) {
    const [argType, newExecContext] = yield evaluate(argAST, currExecContext);
    argsTypes = [...argsTypes, argType];
    currExecContext = newExecContext;
  }

  return yield* createNewObjectFromConstructor(
    unsafeCast<FunctionBinding>(calleeType),
    argsTypes,
    currExecContext
  );
};

export const LogicalExpressionResolver: ASTResolver<
  ESTree.LogicalExpression,
  Any
> = function*(expression, execContext) {
  const logicalOperatorResolver = LogicalOperatorResolvers.get(
    expression.operator
  );
  assert(
    logicalOperatorResolver,
    `Logical operator for ${expression.operator} has not been implemented yet`
  );
  return yield* logicalOperatorResolver!(
    expression.left,
    expression.right,
    execContext
  );
};

export const TryStatementResolver = statementResolver<ESTree.TryStatement>(
  function*(statement, execContext) {
    const handled = mapCompletions(evaluate(statement.block, execContext), (value, context) => {
      if (!isThrownValue(value) || !statement.handler) return tuple(value, context);
      const handler = statement.handler;
      assert(!handler.param || handler.param.type === "Identifier",
        "Destructured catch bindings are not yet supported");
      const name = handler.param && unsafeCast<ESTree.Identifier>(handler.param).name;
      const before = context.value.scope;
      const caught = evaluate(handler.body, name
        ? setVariableInScope(context, name, value.value) : context);
      return mapCompletions(caught, (result, after) => {
        if (!name) return tuple(result, after);
        const scope = { ...after.value.scope };
        if (Object.prototype.hasOwnProperty.call(before, name)) scope[name] = before[name];
        else delete scope[name];
        return tuple(result, ExecutionContext({ ...after.value, scope }));
      });
    });
    if (!statement.finalizer) return handled;
    return mapCompletions(handled, (prior, context) =>
      mapCompletions(evaluate(statement.finalizer!, context), (final, after) =>
        tuple(isReturnValue(final) || isThrownValue(final) ? final : prior, after)));
  }
);

export const ThrowStatementResolver = statementResolver<ESTree.ThrowStatement>(
  function*(statement, execContext) {
    const [argType, afterArgExecContext] = yield evaluate(
      statement.argument,
      execContext
    );
    return tuple(ThrownValue(argType), afterArgExecContext);
  }
);

export const DoWhileStatementResolver = statementResolver<
  ESTree.DoWhileStatement
>(function*() {
  throw new Error("Do-while evaluation is not yet supported");
});

export const UpdateExpressionResolver: ASTResolver<
  ESTree.UpdateExpression,
  TESNumber
> = function*(expression, execContext) {
  if (expression.argument.type === "Identifier") {
    const [argType, afterArgExecContext] = yield evaluate(
      expression.argument,
      execContext
    );

    let argTypeAfterUpdate: TESNumber;
    assert(isESNumber(argType), "Update of non-numeric values is not yet supported");
    argTypeAfterUpdate = unsafeCast<TESNumber>(
      (expression.operator === "++" ? plus : minus)(argType, ESNumber(1), afterArgExecContext)
    );

    const afterUpdateExecContext = setVariableInScope(
      afterArgExecContext,
      expression.argument.name,
      argTypeAfterUpdate
    );

    return tuple(expression.prefix ? argTypeAfterUpdate : argType, afterUpdateExecContext);
  }

  return unimplemented();
};

export const UnaryExpressionResolver: ASTResolver<
  ESTree.UnaryExpression,
  Any
> = function*(expression, execContext) {
  const [argType, afterArgExecContext] = yield evaluate(
    expression.argument,
    execContext
  );
  const unaryOperatorResolver = UnaryOperatorResolvers.get(expression.operator);
  assert(
    unaryOperatorResolver,
    `Unary operator resolver for ${expression.operator} hasn't been implemented yet`
  );
  return unaryOperatorResolver!(argType, afterArgExecContext);
};

export const ASTResolvers = new Map<string, ASTResolver<any, any>>([
  ["Literal", LiteralResolver],
  ["Identifier", IdentifierResolver],
  ["MemberExpression", MemberExpressionResolver],
  ["CallExpression", CallExpressionResolver],
  ["BinaryExpression", BinaryExpressionResolver],
  ["Program", ProgramResolver],
  ["AssignmentExpression", AssignmentExpressionResolver],
  ["ReturnStatement", ReturnStatementResolver],
  ["ThisExpression", ThisExpressionResolver],
  ["ObjectExpression", ObjectExpressionResolver],
  ["ArrayExpression", ArrayExpressionResolver],
  ["ConditionalExpression", ConditionalExpressionResolver],
  ["FunctionExpression", FunctionExpressionResolver],
  ["ExpressionStatement", ExpressionStatementResolver],
  ["VariableDeclaration", VariableDeclarationResolver],
  ["FunctionDeclaration", FunctionDeclarationResolver],
  ["IfStatement", IfStatementResolver],
  ["EmptyStatement", EmptyStatementResolver],
  ["BlockStatement", BlockStatementResolver],
  ["NewExpression", NewExpressionResolver],
  ["LogicalExpression", LogicalExpressionResolver],
  ["TryStatement", TryStatementResolver],
  ["ThrowStatement", ThrowStatementResolver],
  ["DoWhileStatement", DoWhileStatementResolver],
  ["UpdateExpression", UpdateExpressionResolver],
  ["UnaryExpression", UnaryExpressionResolver]
]);
