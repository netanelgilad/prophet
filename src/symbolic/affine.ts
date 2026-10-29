import { TESNumber, isESNumber } from "../types";
import { Knowledge } from "./model";

// Comparison-only bounded integer polynomials. Never rewrite Number values:
// equality of +0 and -0 must not erase their observable reciprocal distinction.
// Every operand/intermediate interval must be safe before algebraic cancellation.
type Form = { terms: Map<string, number>; lower: number; upper: number };
const MAX_VISITS = 128;
const MAX_DEPTH = 24;
const MAX_TERMS = 64;
const MAX_DEGREE = 4;
const MAX_WORK = 512;

export function exactIntegerDifference(left: TESNumber, right: TESNumber,
  knowledge: Knowledge = []): number | undefined {
  let visits = 0, work = 0;
  const active = new Set<TESNumber>();
  // IDs are local to this comparison and keyed by actual VM identity, never
  // descriptions/bounds. Sorted ID lists are unambiguous commutative monomials.
  const atoms = new Map<object, number>();
  const add = (terms: Map<string, number>, key: string, coefficient: number): boolean => {
    if (++work > MAX_WORK || !Number.isSafeInteger(coefficient)) return false;
    const next = (terms.get(key) || 0) + coefficient;
    if (!Number.isSafeInteger(next)) return false;
    if (next === 0) terms.delete(key);
    else {
      if (!terms.has(key) && terms.size >= MAX_TERMS) return false;
      terms.set(key, next);
    }
    return true;
  };
  const normalize = (value: TESNumber, depth: number): Form | undefined => {
    if (++visits > MAX_VISITS || depth > MAX_DEPTH || active.has(value)) return undefined;
    if (typeof value.value === "number") return Number.isSafeInteger(value.value)
      ? { terms: new Map(value.value === 0 ? [] : [["", value.value]]), lower: value.value, upper: value.value } : undefined;
    active.add(value);
    try {
      const expression = value.expression;
      if (expression && expression.kind === "binary" &&
          (expression.operator === "+" || expression.operator === "-" || expression.operator === "*") &&
          isESNumber(expression.left) && isESNumber(expression.right)) {
        const a = normalize(expression.left, depth + 1), b = normalize(expression.right, depth + 1);
        if (!a || !b) return undefined;
        const multiply = expression.operator === "*";
        const sign = expression.operator === "+" ? 1 : -1;
        const endpoints = multiply ? [a.lower*b.lower, a.lower*b.upper, a.upper*b.lower, a.upper*b.upper] :
          [a.lower + (sign === 1 ? b.lower : -b.upper), a.upper + (sign === 1 ? b.upper : -b.lower)];
        if (!endpoints.every(Number.isSafeInteger)) return undefined;
        const lower = Math.min(...endpoints), upper = Math.max(...endpoints);
        const terms = new Map<string, number>();
        if (multiply) {
          // Bound Cartesian-product work before entering it or creating keys.
          if (a.terms.size * b.terms.size > MAX_WORK - work) return undefined;
          for (const [aKey, aCoefficient] of a.terms) for (const [bKey, bCoefficient] of b.terms) {
            const aIds = aKey ? aKey.split(",") : [], bIds = bKey ? bKey.split(",") : [];
            if (aIds.length + bIds.length > MAX_DEGREE) return undefined;
            const ids = aIds.concat(bIds);
            const key = ids.sort((x, y) => Number(x) - Number(y)).join(",");
            if (!add(terms, key, aCoefficient * bCoefficient)) return undefined;
          }
        } else {
          if (a.terms.size + b.terms.size > MAX_WORK - work) return undefined;
          for (const [key, coefficient] of a.terms) if (!add(terms, key, coefficient)) return undefined;
          for (const [key, coefficient] of b.terms) if (!add(terms, key, sign * coefficient)) return undefined;
        }
        return { terms, lower, upper };
      }
      if (expression && expression.kind === "unary" && expression.operator === "-" && isESNumber(expression.operand)) {
        const form = normalize(expression.operand, depth + 1);
        if (!form || form.terms.size > MAX_WORK - work) return undefined;
        work += form.terms.size;
        return { terms: new Map(Array.from(form.terms, ([key, coefficient]) => [key, -coefficient])),
          lower: -form.upper, upper: -form.lower };
      }
      // Unsupported expressions are opaque atoms only with independent integer
      // and direct bounds facts. Never recurse into the comparison/bounds solver.
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
      // Include open endpoints conservatively; no inferred/transitive bounds.
      if (!Number.isSafeInteger(lower) || !Number.isSafeInteger(upper) || lower > upper) return undefined;
      const identity = value.id || value;
      if (!atoms.has(identity)) atoms.set(identity, atoms.size);
      return { terms: new Map([[String(atoms.get(identity)), 1]]), lower, upper };
    } finally { active.delete(value); }
  };
  const a = normalize(left, 0), b = normalize(right, 0);
  if (!a || !b) return undefined;
  for (const [key, coefficient] of a.terms) if (key !== "" && b.terms.get(key) !== coefficient) return undefined;
  for (const [key, coefficient] of b.terms) if (key !== "" && a.terms.get(key) !== coefficient) return undefined;
  const difference = (a.terms.get("") || 0) - (b.terms.get("") || 0);
  return Number.isSafeInteger(difference) ? difference : undefined;
}
