import { ESNumber, TESNumber } from "../types";
import { Fact, Knowledge, isFiniteNumber, notNaN, numberBounds } from "./index";

export type ArithmeticOperator = "+" | "-" | "*" | "/" | "%";

// An interval is an enclosure, not an enumeration of possible values. In
// particular [0, 0] includes both signs of zero and must not become ESNumber(0).
type Interval = { lower: number; upper: number };

function finiteInterval(value: TESNumber, knowledge: Knowledge): Interval | undefined {
  const bounds = numberBounds(value, knowledge);
  const finite = isFiniteNumber(value, knowledge);
  const lower = Math.max(bounds.lower ? bounds.lower.value : -Infinity,
    finite ? -Number.MAX_VALUE : -Infinity);
  const upper = Math.min(bounds.upper ? bounds.upper.value : Infinity,
    finite ? Number.MAX_VALUE : Infinity);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) return undefined;
  // Two order bounds themselves exclude NaN and infinity; a separate finite
  // fact is unnecessary. Open endpoints are deliberately included below.
  return { lower, upper };
}

function operation(operator: ArithmeticOperator, left: number, right: number): number {
  switch (operator) {
    case "+": return left + right;
    case "-": return left - right;
    case "*": return left * right;
    case "/": return left / right;
    case "%": return left % right;
  }
}

export function arithmeticNumber(
  operator: ArithmeticOperator, left: TESNumber, right: TESNumber, knowledge: Knowledge = []
): TESNumber {
  const result: TESNumber = {
    ...ESNumber(), expression: { kind: "binary", operator, left, right }
  };
  // Remainder needs a separate transfer rule: its extrema need not occur at
  // the corners of the operand intervals.
  if (operator === "%") return result;
  const a = finiteInterval(left, knowledge);
  const b = finiteInterval(right, knowledge);
  if (!a || !b) return result;
  if (operator === "/" && b.lower <= 0 && b.upper >= 0) return result;

  // For finite operands these operations are monotone on sign-stable pieces.
  // The four corners enclose all pieces (division excludes zero above). Host
  // arithmetic applies JavaScript's rounding, overflow and underflow rules.
  // Rounded endpoints are CLOSED: a strict input bound can round to equality.
  // Do not extend this to infinite operands: 0 * Infinity can occur inside an
  // interval even when all four corners happen to be non-NaN.
  const corners = [
    operation(operator, a.lower, b.lower), operation(operator, a.lower, b.upper),
    operation(operator, a.upper, b.lower), operation(operator, a.upper, b.upper)
  ];
  if (corners.some(Number.isNaN)) return result;
  const lower = Math.min(...corners), upper = Math.max(...corners);
  result.knowledge = [
    { kind: Number.isFinite(lower) && Number.isFinite(upper) ? "finite" : "notNaN", subject: result },
    { kind: "order", left: ESNumber(lower), right: result, strict: false },
    { kind: "order", left: result, right: ESNumber(upper), strict: false }
  ];
  return result;
}

export function negateNumber(operand: TESNumber, knowledge: Knowledge = []): TESNumber {
  const result: TESNumber = { ...ESNumber(), expression: { kind: "unary", operator: "-", operand } };
  const facts: Fact[] = [];
  if (isFiniteNumber(operand, knowledge)) facts.push({ kind: "finite", subject: result });
  else if (notNaN(operand, knowledge)) facts.push({ kind: "notNaN", subject: result });
  const bounds = numberBounds(operand, knowledge);
  // Negation is exact, so unlike binary arithmetic it preserves strictness.
  if (bounds.upper) facts.push({ kind: "order", left: ESNumber(-bounds.upper.value), right: result, strict: !bounds.upper.inclusive });
  if (bounds.lower) facts.push({ kind: "order", left: result, right: ESNumber(-bounds.lower.value), strict: !bounds.lower.inclusive });
  result.knowledge = facts;
  return result;
}
