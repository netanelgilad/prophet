import { isESNumber, TESNumber } from "../types";
import { Knowledge } from "./model";

// A bounded finite domain derived from direct facts, not sampled witnesses.
// Decline large domains/fact sets before allocating or enumerating them.
export function integerDomainEquality(left: TESNumber, right: TESNumber,
  knowledge: Knowledge): boolean | undefined {
  const value = typeof left.value === "number" ? right : left;
  const literal = value === left ? right : left;
  if (typeof value.value === "number" || typeof literal.value !== "number" ||
      !Number.isFinite(literal.value)) return undefined;
  const own = value.knowledge || [];
  if (knowledge.length + own.length > 256) return undefined;
  const facts = knowledge.concat(own);
  const same = (other: TESNumber) => other === value || !!value.id && other.id === value.id;
  if (!facts.some(f => f.kind === "integer" && same(f.subject))) return undefined;
  let low = -Infinity, high = Infinity;
  const excluded = new Set<number>();
  for (const fact of facts) {
    if (fact.kind === "order") {
      if (same(fact.right) && typeof fact.left.value === "number") {
        const n = fact.left.value;
        low = Math.max(low, fact.strict ? Math.floor(n) + 1 : Math.ceil(n));
      }
      if (same(fact.left) && typeof fact.right.value === "number") {
        const n = fact.right.value;
        high = Math.min(high, fact.strict ? Math.ceil(n) - 1 : Math.floor(n));
      }
    } else if (fact.kind === "truth") {
      const e = fact.condition.expression;
      if (!e || e.kind !== "strict-equal" || !isESNumber(e.left) || !isESNumber(e.right)) continue;
      const n = same(e.left) ? e.right.value : same(e.right) ? e.left.value : undefined;
      if (typeof n !== "number") continue;
      if (fact.truth) { low = Math.max(low,n); high = Math.min(high,n); }
      else excluded.add(n);
    }
  }
  if (!Number.isSafeInteger(low) || !Number.isSafeInteger(high) || low > high || high-low > 63) return undefined;
  let matches = 0, differs = 0;
  for (let offset = 0; offset <= high-low; offset++) {
    const n = low + offset;
    if (excluded.has(n)) continue;
    if (n === literal.value) matches++; else differs++;
  }
  // Inconsistent facts are never used to establish a vacuous proof.
  if (!matches && !differs) return undefined;
  return matches === 0 ? false : differs === 0 ? true : undefined;
}
