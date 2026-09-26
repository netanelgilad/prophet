import {
  Any, TESNumber, isUndefined, isESNull,
  isESNumber, ESNumber, isESBoolean, isESString, Type, Undefined
} from "./types";
import { ESString, TESString } from "./string/String";
import { ESBoolean, coerceToBoolean } from "./boolean/ESBoolean";
import { TExecutionContext } from "./execution-context/ExecutionContext";
import { evaluate, bindNormal } from "./evaluate";
import { tuple } from "@deaven/tuple";
import { ESTree } from "cherow";
import { compareNumbers } from "./number/symbolic";
import { Knowledge, choiceOf, assume, selectValue, strictEquality, negate, resolveBoolean } from "./symbolic";
import { evaluateBranches, BranchResult } from "./execution-context/branches";

export type BinaryOperatorResolver = (
  left: Any, right: Any, context?: TExecutionContext
) => Any;
export type UnaryOperatorResolver = (
  arg: Any, context: TExecutionContext
) => [Any, TExecutionContext];
export type LogicalOperatorResolver = (
  left: ESTree.Expression, right: ESTree.Expression, context: TExecutionContext
) => BranchResult;

type Primitive = number | string | boolean | null | undefined;
type Concrete = { known: true; value: Primitive } | { known: false };

function concrete(value: Any): Concrete {
  if (isUndefined(value)) return { known: true, value: undefined };
  if (isESNull(value)) return { known: true, value: null };
  if ((isESNumber(value) && typeof value.value === "number") ||
      (isESBoolean(value) && typeof value.value === "boolean") ||
      (isESString(value) && typeof value.value === "string")) {
    return { known: true, value: (value as TESNumber | TESString).value as Primitive };
  }
  return { known: false };
}

function primitive(value: Primitive): Any {
  if (value === undefined) return Undefined;
  if (typeof value === "number") return ESNumber(value);
  if (typeof value === "string") return ESString(value);
  if (typeof value === "boolean") return ESBoolean(value);
  throw new Error("Unexpected null operator result");
}

// All binary operations use the same lifting over conditional values. No
// operation needs to understand how the program arrived at a branch result.
function liftBinary(
  left: Any, right: Any, knowledge: Knowledge,
  operation: (a: Any, b: Any, facts: Knowledge) => Any
): Any {
  const choice = choiceOf(left) || choiceOf(right);
  if (!choice) return operation(left, right, knowledge);
  const leftChoice = choiceOf(left);
  const known = resolveBoolean(choice.condition, knowledge);
  if (known !== undefined) {
    const value = known ? choice.consequent : choice.alternate;
    return liftBinary(leftChoice ? value : left, leftChoice ? right : value,
      assume(knowledge, choice.condition, known), operation);
  }
  const yes = liftBinary(leftChoice ? choice.consequent : left,
    leftChoice ? right : choice.consequent,
    assume(knowledge, choice.condition, true), operation);
  const no = liftBinary(leftChoice ? choice.alternate : left,
    leftChoice ? right : choice.alternate,
    assume(knowledge, choice.condition, false), operation);
  return selectValue(choice.condition, yes, no, knowledge);
}

function arithmetic(operator: "+" | "-" | "*" | "/" | "%"): BinaryOperatorResolver {
  return (left, right, context) => liftBinary(left, right,
    context && context.value.knowledge || [], (a, b) => {
      const primitiveKind = (value: Any) =>
        ["number", "string", "boolean", "null", "undefined"].includes((value as Type<string>).type);
      if (!primitiveKind(a) || !primitiveKind(b)) {
        throw new Error("Arithmetic object-to-primitive coercion is not yet supported");
      }
      const x = concrete(a), y = concrete(b);
      if (x.known && y.known) {
        // Host primitive operators implement the same JS floating-point and
        // coercion rules; interpreted objects/functions never execute here.
        const l: any = x.value, r: any = y.value;
        switch (operator) {
          case "+": return primitive(l + r);
          case "-": return ESNumber(l - r);
          case "*": return ESNumber(l * r);
          case "/": return ESNumber(l / r);
          case "%": return ESNumber(l % r);
        }
      }
      if (operator === "+" && (isESString(a) || isESString(b))) {
        return { ...ESString(), expression: { kind: "binary", operator, left: a, right: b } };
      }
      if (isESNumber(a) && isESNumber(b)) {
        return { ...ESNumber(), expression: { kind: "binary", operator, left: a, right: b } };
      }
      throw new Error("Symbolic arithmetic coercion for these operands is not yet supported");
    });
}

export const plus = arithmetic("+");
export const minus = arithmetic("-");

function numericComparison(operator: "<" | "<=" | ">" | ">="): BinaryOperatorResolver {
  return (left, right, context) => {
    const knowledge = context && context.value.knowledge || [];
    // Keep numeric choices intact so the order reasoner can use their facts
    // without eagerly expanding every recursive selection.
    if (isESNumber(left) && isESNumber(right)) return compareNumbers(left, right, operator, knowledge);
    return liftBinary(left, right, knowledge, (a, b, facts) => {
      if (isESNumber(a) && isESNumber(b)) return compareNumbers(a, b, operator, facts);
      const x = concrete(a), y = concrete(b);
      if (x.known && y.known) {
        const l: any = x.value, r: any = y.value;
        switch (operator) {
          case "<": return ESBoolean(l < r);
          case "<=": return ESBoolean(l <= r);
          case ">": return ESBoolean(l > r);
          case ">=": return ESBoolean(l >= r);
        }
      }
      throw new Error("Symbolic relational coercion for these operands is not yet supported");
    });
  };
}

export const lessThan = numericComparison("<");
export const lessThanOrEqual = numericComparison("<=");
export const greaterThan = numericComparison(">");
export const greaterThanOrEqual = numericComparison(">=");

export function exactEquality(left: Any, right: Any, context?: TExecutionContext) {
  return strictEquality(left, right, context && context.value.knowledge || []);
}

export function notExactEquality(left: Any, right: Any, context?: TExecutionContext) {
  return negate(exactEquality(left, right, context), context && context.value.knowledge || []);
}

export const equal: BinaryOperatorResolver = (left, right, context) =>
  liftBinary(left, right, context && context.value.knowledge || [], (a, b, knowledge) => {
    const x = concrete(a), y = concrete(b);
    if (x.known && y.known) return ESBoolean(x.value == y.value);
    if ((a as Type<string>).type === (b as Type<string>).type) {
      return strictEquality(a, b, knowledge);
    }
    throw new Error("Symbolic loose-equality coercion is not yet supported");
  });

export const notEqual: BinaryOperatorResolver = (left, right, context) =>
  negate(equal(left, right, context) as ReturnType<typeof ESBoolean>,
    context && context.value.knowledge || []);

export const logicalAnd: LogicalOperatorResolver = (left, right, context) =>
  bindNormal(evaluate(left, context), (value, afterLeft) =>
    evaluateBranches(coerceToBoolean(value, afterLeft.value.knowledge), afterLeft,
      branch => evaluate(right, branch), branch => tuple(value, branch)));

export const logicalOr: LogicalOperatorResolver = (left, right, context) =>
  bindNormal(evaluate(left, context), (value, afterLeft) =>
    evaluateBranches(coerceToBoolean(value, afterLeft.value.knowledge), afterLeft,
      branch => tuple(value, branch), branch => evaluate(right, branch)));

export const not: UnaryOperatorResolver = (arg, context) =>
  tuple(negate(coerceToBoolean(arg, context.value.knowledge), context.value.knowledge), context);

function typeofValue(arg: Any, knowledge: Knowledge): Any {
  const choice = choiceOf(arg);
  if (choice) {
    const known = resolveBoolean(choice.condition, knowledge);
    if (known !== undefined) return typeofValue(
      known ? choice.consequent : choice.alternate,
      assume(knowledge, choice.condition, known));
    return selectValue(choice.condition,
      typeofValue(choice.consequent, assume(knowledge, choice.condition, true)),
      typeofValue(choice.alternate, assume(knowledge, choice.condition, false)), knowledge);
  }
  const kind = (arg as Type<string>).type;
  return ESString(kind === "null" || kind === "array" ? "object" : kind);
}

export const typeOf: UnaryOperatorResolver = (arg, context) =>
  tuple(typeofValue(arg, context.value.knowledge || []), context);

function unaryNumeric(arg: Any, operator: "+" | "-", knowledge: Knowledge): Any {
  const choice = choiceOf(arg);
  if (choice) {
    const known = resolveBoolean(choice.condition, knowledge);
    if (known !== undefined) return unaryNumeric(
      known ? choice.consequent : choice.alternate, operator,
      assume(knowledge, choice.condition, known));
    return selectValue(choice.condition,
      unaryNumeric(choice.consequent, operator, assume(knowledge, choice.condition, true)),
      unaryNumeric(choice.alternate, operator, assume(knowledge, choice.condition, false)), knowledge);
  }
  const value = concrete(arg);
  if (value.known) return ESNumber(operator === "+" ? +(value.value as any) : -(value.value as any));
  if (isESNumber(arg)) return {
    ...ESNumber(), expression: { kind: "unary", operator, operand: arg }
  };
  throw new Error("Symbolic numeric coercion is not yet supported");
}

export const unaryMinus: UnaryOperatorResolver = (arg, context) =>
  tuple(unaryNumeric(arg, "-", context.value.knowledge || []), context);
export const unaryVoid: UnaryOperatorResolver = (_, context) => tuple(Undefined, context);

export const BinaryOperatorResolvers = new Map<string, BinaryOperatorResolver>([
  [">", greaterThan], ["<", lessThan], ["<=", lessThanOrEqual], [">=", greaterThanOrEqual],
  ["+", plus], ["-", minus], ["*", arithmetic("*")], ["/", arithmetic("/")], ["%", arithmetic("%")],
  ["===", exactEquality], ["!==", notExactEquality], ["!=", notEqual], ["==", equal]
]);

export const LogicalOperatorResolvers = new Map<string, LogicalOperatorResolver>([
  ["&&", logicalAnd], ["||", logicalOr]
]);

export const UnaryOperatorResolvers = new Map<string, UnaryOperatorResolver>([
  ["!", not], ["-", unaryMinus],
  ["+", (arg, context) => tuple(unaryNumeric(arg, "+", context.value.knowledge || []), context)],
  ["typeof", typeOf], ["void", unaryVoid]
]);
