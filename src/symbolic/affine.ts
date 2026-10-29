import { TESNumber, isESNumber } from "../types";
import { Knowledge } from "./model";

// This domain proves Number comparisons only. It never replaces an evaluated
// Number with an algebraic expression: +0 and -0 remain observably different.
// Every operand and intermediate must be a safe integer across its entire
// interval; bounds on just the final expression cannot justify cancellation.
type Form = { terms: Map<object, number>; constant: number; lower: number; upper: number };
const MAX_VISITS = 128;
const MAX_DEPTH = 24;

export function exactIntegerDifference(left: TESNumber, right: TESNumber,
  knowledge: Knowledge = []): number | undefined {
  let visits = 0;
  const active = new Set<TESNumber>();
  const normalize = (value: TESNumber, depth: number): Form | undefined => {
    if (++visits > MAX_VISITS || depth > MAX_DEPTH || active.has(value)) return undefined;
    if (typeof value.value === "number") return Number.isSafeInteger(value.value)
      ? { terms: new Map(), constant: value.value, lower: value.value, upper: value.value } : undefined;
    active.add(value);
    try {
      const expression = value.expression;
      if (expression && expression.kind === "binary" &&
          (expression.operator === "+" || expression.operator === "-") &&
          isESNumber(expression.left) && isESNumber(expression.right)) {
        const a = normalize(expression.left, depth + 1), b = normalize(expression.right, depth + 1);
        if (!a || !b) return undefined;
        const sign = expression.operator === "+" ? 1 : -1;
        const lower = a.lower + (sign === 1 ? b.lower : -b.upper);
        const upper = a.upper + (sign === 1 ? b.upper : -b.lower);
        if (!Number.isSafeInteger(lower) || !Number.isSafeInteger(upper)) return undefined;
        const constant = a.constant + sign * b.constant;
        if (!Number.isSafeInteger(constant)) return undefined;
        const terms = new Map(a.terms);
        for (const [key, coefficient] of b.terms) {
          const next = (terms.get(key) || 0) + sign * coefficient;
          if (!Number.isSafeInteger(next)) return undefined;
          if (next === 0) terms.delete(key); else terms.set(key, next);
        }
        return { terms, constant, lower, upper };
      }
      if (expression && expression.kind === "unary" && expression.operator === "-" && isESNumber(expression.operand)) {
        const form = normalize(expression.operand, depth + 1);
        return form && { terms: new Map(Array.from(form.terms, ([key, coefficient]) => [key, -coefficient])),
          constant: -form.constant, lower: -form.upper, upper: -form.lower };
      }
      // Unsupported expressions remain opaque atoms, but only if independently
      // declared integer with safe bounds; no assumption of mathematical reals.
      if (knowledge.length + (value.knowledge || []).length > 256) return undefined;
      const facts = knowledge.concat(value.knowledge || []);
      const same = (other: TESNumber) => other === value || !!value.id && other.id === value.id;
      if (!facts.some(fact => fact.kind === "integer" &&
          (fact.subject === value || !!value.id && fact.subject.id === value.id))) return undefined;
      let lower = -Infinity, upper = Infinity;
      for (const fact of facts) {
        if (fact.kind !== "order") continue;
        if (same(fact.right) && typeof fact.left.value === "number") lower = Math.max(lower, fact.left.value);
        if (same(fact.left) && typeof fact.right.value === "number") upper = Math.min(upper, fact.right.value);
      }
      // Open endpoints are included conservatively; no recursive general
      // solver calls, transitive fact walks, or self-justifying bounds.
      if (!Number.isSafeInteger(lower) || !Number.isSafeInteger(upper) || lower > upper) return undefined;
      return { terms: new Map([[value.id || value, 1]]), constant: 0, lower, upper };
    } finally { active.delete(value); }
  };
  const a = normalize(left, 0), b = normalize(right, 0);
  if (!a || !b || a.terms.size !== b.terms.size) return undefined;
  for (const [key, coefficient] of a.terms) if (b.terms.get(key) !== coefficient) return undefined;
  const difference = a.constant - b.constant;
  return Number.isSafeInteger(difference) ? difference : undefined;
}
