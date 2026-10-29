import {
  Any, ESNumber, TESNumber, TESBoolean, ValueIdentifier, WithValue,
  isESNumber, isESBoolean, isESString
} from "../types";
import { ESBoolean } from "../boolean/ESBoolean";
import { ESString } from "../string/String";
import * as Model from "./model";
import { exactIntegerDifference } from "./affine";
import { integerDomainEquality } from "./integer-domain";

export type Expression = Model.Expression;
export type Fact = Model.Fact;
export type Knowledge = Model.Knowledge;
export type NumberOperator = Model.NumberOperator;
export type OrderFact = Model.OrderFact;
export type SelectExpression = Model.SelectExpression;
export type TChoice = Model.TChoice;
export type CollectionRegion = Model.CollectionRegion;
export type CollectionEndpoint = Model.CollectionEndpoint;

type SymbolicValue = { type?: string } & WithValue<any>;
export type Bound = { value: number; inclusive: boolean };

function metadata(value: Any): SymbolicValue {
  return value as SymbolicValue;
}

export function expressionOf(value: Any): Expression | undefined {
  return metadata(value).expression;
}

export function choiceOf(value: Any): SelectExpression | undefined {
  const expression = expressionOf(value);
  return expression && expression.kind === "select" ? expression : undefined;
}

export function isChoice(value: Any): value is TChoice {
  return metadata(value).type === "choice";
}

function sameIdentity(left: Any, right: Any): boolean {
  return left === right || !!(metadata(left).id && metadata(left).id === metadata(right).id);
}

function sameValue(left: Any, right: Any): boolean {
  if (sameIdentity(left, right)) return true;
  const a = metadata(left);
  const b = metadata(right);
  if (a.type !== b.type || a.type === "choice") return false;
  if (a.type === "null" || a.type === "undefined") return true;
  return a.value !== undefined && b.value !== undefined &&
    (typeof a.value === "number" || typeof a.value === "string" || typeof a.value === "boolean") &&
    Object.is(a.value, b.value);
}

// Numeric order identifies +0 and -0, but conditional selection must not.
function sameNumber(left: TESNumber, right: TESNumber): boolean {
  return sameIdentity(left, right) ||
    (typeof left.value === "number" && typeof right.value === "number" && left.value === right.value);
}

function sameCondition(left: TESBoolean, right: TESBoolean): boolean {
  if (sameValue(left, right)) return true;
  const a = left.expression;
  const b = right.expression;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "compare" && b.kind === "compare") {
    return a.operator === b.operator && sameNumber(a.left, b.left) && sameNumber(a.right, b.right);
  }
  if (a.kind === "strict-equal" && b.kind === "strict-equal") {
    return (sameValue(a.left, b.left) && sameValue(a.right, b.right)) ||
      (sameValue(a.left, b.right) && sameValue(a.right, b.left));
  }
  if (a.kind === "not" && b.kind === "not") return sameCondition(a.operand, b.operand);
  if (a.kind === "truthy" && b.kind === "truthy") return sameValue(a.operand, b.operand);
  // Re-evaluating a Boolean expression creates fresh value identities. Its
  // condition and both alternatives still determine the same guarded result.
  if (a.kind === "select" && b.kind === "select" &&
      isESBoolean(a.consequent) && isESBoolean(b.consequent) &&
      isESBoolean(a.alternate) && isESBoolean(b.alternate)) {
    return sameCondition(a.condition, b.condition) &&
      sameCondition(a.consequent, b.consequent) && sameCondition(a.alternate, b.alternate);
  }
  return false;
}

function boundedSameCondition(left: TESBoolean, right: TESBoolean,
  budget: {remaining:number}, depth = 0): boolean {
  if (--budget.remaining < 0 || depth > 8) return false;
  if (sameValue(left,right)) return true;
  const a=left.expression,b=right.expression;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "not" && b.kind === "not") return boundedSameCondition(a.operand,b.operand,budget,depth+1);
  if (a.kind === "select" && b.kind === "select") return isESBoolean(a.consequent) && isESBoolean(a.alternate) && isESBoolean(b.consequent) && isESBoolean(b.alternate) &&
    boundedSameCondition(a.condition,b.condition,budget,depth+1) &&
    boundedSameCondition(a.consequent,b.consequent,budget,depth+1) &&
    boundedSameCondition(a.alternate,b.alternate,budget,depth+1);
  return sameCondition(left,right);
}

// Recognize Boolean decision trees that are exact complements. This retains
// disjunctive knowledge such as "a selected index is not the -1 alternative"
// without inventing which of its several remaining alternatives was selected.
function complementaryConditions(left: TESBoolean, right: TESBoolean,
  budget = { remaining: 64 }, depth = 0): boolean {
  if (--budget.remaining < 0 || depth > 8) return false;
  if (typeof left.value === "boolean" && typeof right.value === "boolean") return left.value !== right.value;
  const a=left.expression,b=right.expression;
  if (!a || !b) return false;
  if (a.kind === "not") return boundedSameCondition(a.operand,right,budget,depth+1);
  if (b.kind === "not") return boundedSameCondition(left,b.operand,budget,depth+1);
  if (a.kind !== "select" || b.kind !== "select" || !boundedSameCondition(a.condition,b.condition,budget,depth+1) ||
      !isESBoolean(a.consequent) || !isESBoolean(a.alternate) ||
      !isESBoolean(b.consequent) || !isESBoolean(b.alternate)) return false;
  return complementaryConditions(a.consequent,b.consequent,budget,depth+1) &&
    complementaryConditions(a.alternate,b.alternate,budget,depth+1);
}

function truthIn(condition: TESBoolean, knowledge: Knowledge): boolean | undefined {
  for (let index = knowledge.length - 1; index >= 0; index--) {
    const fact = knowledge[index];
    if (fact.kind === "truth" && sameCondition(fact.condition, condition)) return fact.truth;
    if (fact.kind === "truth" && knowledge.length <= 128 &&
        complementaryConditions(fact.condition,condition)) return !fact.truth;
  }
  return undefined;
}

// Endpoint checks cannot ask the general comparison solver: that solver
// instantiates quantified region facts and would allow the very fact being
// checked to justify its own region inclusion. Keep a separate bounded graph
// of only primitive numeric facts and literals. Unknown/over-cap means no
// derived region fact, never a false proof.
const maxEndpointFacts = 128;
const maxEndpointVisits = 128;
const maxAffineDepth = 8;

function endpointParts(endpoint: CollectionEndpoint): { base: TESNumber; offset: number } | undefined {
  if (typeof endpoint === "number") return Number.isSafeInteger(endpoint)
    ? { base: ESNumber(endpoint), offset: 0 } : undefined;
  return Number.isSafeInteger(endpoint.offset) ? endpoint : undefined;
}

function numericFacts(values: TESNumber[], knowledge: Knowledge): {
  orders: OrderFact[]; integers: TESNumber[]
} | undefined {
  const facts: OrderFact[] = [];
  const integers: TESNumber[] = [];
  const seenFacts = new Set<Fact>();
  const seenValues = new Set<TESNumber>();
  const pending = values.slice();
  const add = (fact: Fact) => {
    if (seenFacts.has(fact)) return;
    seenFacts.add(fact);
    if (seenFacts.size > maxEndpointFacts) return;
    if (fact.kind === "order") {
      facts.push(fact);
      pending.push(fact.left, fact.right);
    } else if (fact.kind === "integer" || fact.kind === "finite" || fact.kind === "notNaN") {
      pending.push(fact.subject);
      if (fact.kind === "integer") integers.push(fact.subject);
    }
  };
  if (knowledge.length > maxEndpointFacts) return undefined;
  for (const fact of knowledge) {
    if (fact.kind === "order" || fact.kind === "integer" ||
        fact.kind === "finite" || fact.kind === "notNaN") add(fact);
  }
  while (pending.length && seenFacts.size <= maxEndpointFacts && seenValues.size <= maxEndpointVisits) {
    const current = pending.pop()!;
    if (seenValues.has(current)) continue;
    seenValues.add(current);
    if ((current.knowledge || []).length > maxEndpointFacts) return undefined;
    const expression = current.expression;
    if (expression && expression.kind === "binary" &&
        (expression.operator === "+" || expression.operator === "-") &&
        isESNumber(expression.left) && isESNumber(expression.right)) {
      pending.push(expression.left, expression.right);
    }
    (current.knowledge || []).forEach(fact => {
      if (fact.kind === "order" || fact.kind === "integer" ||
          fact.kind === "finite" || fact.kind === "notNaN") add(fact);
    });
  }
  return seenFacts.size > maxEndpointFacts || seenValues.size > maxEndpointVisits || pending.length ? undefined :
    { orders: facts, integers };
}

function directSafeBounds(value: TESNumber, facts: OrderFact[]):
  { lower: number; upper: number } | undefined {
  if (typeof value.value === "number") return Number.isSafeInteger(value.value)
    ? { lower: value.value, upper: value.value } : undefined;
  let lower = -Infinity, upper = Infinity;
  for (const fact of facts) {
    if (sameNumber(fact.right, value) && typeof fact.left.value === "number") {
      lower = Math.max(lower, fact.left.value);
    }
    if (sameNumber(fact.left, value) && typeof fact.right.value === "number") {
      upper = Math.min(upper, fact.right.value);
    }
  }
  return Number.isSafeInteger(lower) && Number.isSafeInteger(upper) && lower <= upper
    ? { lower, upper } : undefined;
}

function normalizeIntegerEndpoint(value: TESNumber, offset: number,
  facts: { orders: OrderFact[]; integers: TESNumber[] }, depth = 0):
  { base: TESNumber; offset: number } | undefined {
  if (depth > maxAffineDepth || !Number.isSafeInteger(offset)) return undefined;
  const expression = value.expression;
  if (expression && expression.kind === "binary" && depth < maxAffineDepth &&
      (expression.operator === "+" || expression.operator === "-") &&
      isESNumber(expression.left) && isESNumber(expression.right)) {
    const left = expression.left, right = expression.right;
    const rightLiteral = typeof right.value === "number" && Number.isSafeInteger(right.value);
    const leftLiteral = typeof left.value === "number" && Number.isSafeInteger(left.value);
    const variable = rightLiteral ? left : expression.operator === "+" && leftLiteral ? right : undefined;
    const constant = rightLiteral ? right.value! : leftLiteral ? left.value! : undefined;
    if (variable && constant !== undefined) {
      const delta = expression.operator === "-" ? -constant : constant;
      const operandBounds = directSafeBounds(variable, facts.orders);
      if (!operandBounds || !Number.isSafeInteger(operandBounds.lower + delta) ||
          !Number.isSafeInteger(operandBounds.upper + delta)) return undefined;
      const nextOffset = offset + delta;
      const normalized = normalizeIntegerEndpoint(variable, nextOffset, facts, depth + 1);
      if (!normalized) return undefined;
      // All operands and every intermediate result must be exact integers.
      const bounds = directSafeBounds(normalized.base, facts.orders);
      if (!bounds || !Number.isSafeInteger(bounds.lower + normalized.offset) ||
          !Number.isSafeInteger(bounds.upper + normalized.offset)) return undefined;
      return normalized;
    }
  }
  const integer = typeof value.value === "number" ? Number.isSafeInteger(value.value) :
    facts.integers.some(subject => sameNumber(subject, value));
  if (!integer) return undefined;
  if (offset !== 0) {
    const bounds = directSafeBounds(value, facts.orders);
    if (!bounds || !Number.isSafeInteger(bounds.lower + offset) ||
        !Number.isSafeInteger(bounds.upper + offset)) return undefined;
  }
  return { base: value, offset };
}

// Safe, bounded integer arithmetic only. This never treats a general binary
// Number expression as algebraically exact under IEEE-754 rounding.
export function exactIntegerEndpoint(value: TESNumber, knowledge: Knowledge = []):
  { base: TESNumber; offset: number } | undefined {
  const facts = numericFacts([value], knowledge);
  return facts && normalizeIntegerEndpoint(value, 0, facts);
}

function primitiveOrder(left: TESNumber, right: TESNumber, strict: boolean,
  facts: OrderFact[]): boolean {
  if (typeof left.value === "number" && typeof right.value === "number") {
    return strict ? left.value < right.value : left.value <= right.value;
  }
  const numbers: TESNumber[] = [left, right];
  const add = (number: TESNumber) => {
    if (!numbers.some(existing => sameNumber(existing, number))) numbers.push(number);
  };
  facts.forEach(fact => { add(fact.left); add(fact.right); });
  const queue = [{ number: left, strict: false }];
  const visited: Array<{ number: TESNumber; strict: boolean }> = [];
  while (queue.length && visited.length < maxEndpointVisits) {
    const current = queue.shift()!;
    if (visited.some(entry => sameNumber(entry.number, current.number) &&
      entry.strict === current.strict)) continue;
    visited.push(current);
    if (sameNumber(current.number, right) && (!strict || current.strict)) return true;
    for (const fact of facts) {
      if (sameNumber(fact.left, current.number)) {
        queue.push({ number: fact.right, strict: current.strict || fact.strict });
      }
    }
    if (typeof current.number.value === "number") {
      for (const number of numbers) {
        if (typeof number.value === "number" && current.number.value <= number.value) {
          queue.push({ number, strict: current.strict || current.number.value < number.value });
        }
      }
    }
  }
  return false;
}

export function proveEndpointOrder(left: CollectionEndpoint, right: CollectionEndpoint,
  strict: boolean, knowledge: Knowledge = []): boolean {
  const rawA = endpointParts(left), rawB = endpointParts(right);
  if (!rawA || !rawB) return false;
  // Existing concrete regions need no symbolic fact graph or its budget.
  if (typeof rawA.base.value === "number" && typeof rawB.base.value === "number") {
    const a = rawA.base.value + rawA.offset, b = rawB.base.value + rawB.offset;
    return Number.isSafeInteger(a) && Number.isSafeInteger(b) &&
      (strict ? a < b : a <= b);
  }
  const facts = numericFacts([rawA.base, rawB.base], knowledge);
  if (!facts) return false;
  const a = normalizeIntegerEndpoint(rawA.base, rawA.offset, facts);
  const b = normalizeIntegerEndpoint(rawB.base, rawB.offset, facts);
  if (!a || !b) return false;
  if (a.offset <= b.offset && primitiveOrder(a.base, b.base,
    strict && a.offset === b.offset, facts.orders)) return true;
  // Concrete bounds may settle a shifted endpoint without reasoning about a
  // general subtraction expression. Restrict this to direct literal bounds.
  const upper = facts.orders.filter(fact => sameNumber(fact.left, a.base) &&
    typeof fact.right.value === "number").map(fact => fact.right.value!);
  const lower = facts.orders.filter(fact => sameNumber(fact.right, b.base) &&
    typeof fact.left.value === "number").map(fact => fact.left.value!);
  if (typeof a.base.value === "number") upper.push(a.base.value);
  if (typeof b.base.value === "number") lower.push(b.base.value);
  if (!upper.length || !lower.length) return false;
  const high = Math.min(...upper) + a.offset;
  const low = Math.max(...lower) + b.offset;
  return Number.isSafeInteger(high) && Number.isSafeInteger(low) &&
    (strict ? high < low : high <= low);
}

function regionContains(outer: CollectionRegion, inner: CollectionRegion,
  knowledge: Knowledge): boolean {
  if (outer.id !== inner.id) return false;
  if ("index" in outer) return "index" in inner &&
    proveEndpointOrder(outer.index, inner.index, false, knowledge) &&
    proveEndpointOrder(inner.index, outer.index, false, knowledge);
  if ("index" in inner) return proveEndpointOrder(outer.start, inner.index, false, knowledge) &&
    (outer.end === undefined || proveEndpointOrder(inner.index, outer.end, true, knowledge));
  return proveEndpointOrder(outer.start, inner.start, false, knowledge) &&
    (outer.end === undefined || (inner.end !== undefined &&
      proveEndpointOrder(inner.end, outer.end, false, knowledge)));
}

function sameEndpoint(left: CollectionEndpoint, right: CollectionEndpoint): boolean {
  return typeof left === "number" || typeof right === "number"
    ? typeof left === "number" && typeof right === "number" && left === right
    : left.offset === right.offset && sameNumber(left.base, right.base);
}

function sameRegion(left: CollectionRegion, right: CollectionRegion): boolean {
  if (left.id !== right.id) return false;
  if ("index" in left || "index" in right) return "index" in left &&
    "index" in right && sameEndpoint(left.index, right.index);
  return sameEndpoint(left.start, right.start) &&
    (left.end === undefined || right.end === undefined
      ? left.end === right.end : sameEndpoint(left.end, right.end));
}

function indexedElement(value: TESNumber): Extract<Expression, { kind: "indexed-element" }> | undefined {
  const expression = value.expression;
  return expression && expression.kind === "indexed-element" ? expression : undefined;
}

function sameIndexedPosition(left: TESNumber, right: TESNumber, knowledge: Knowledge): boolean {
  const a = indexedElement(left), b = indexedElement(right);
  return !!a && !!b && a.sequence === b.sequence &&
    proveEndpointOrder({ base: a.index, offset: a.offset },
      { base: b.index, offset: b.offset }, false, knowledge) &&
    proveEndpointOrder({ base: b.index, offset: b.offset },
      { base: a.index, offset: a.offset }, false, knowledge);
}

// Facts refer to value identities and may form a graph (including their subject).
// Traverse each object once, without expanding conditional alternatives.
function collectFacts(values: Any[], knowledge: Knowledge): Fact[] {
  const result: Fact[] = [];
  const seenValues = new Set<Any>();
  const seenFacts = new Set<Fact>();
  const addValue = (value: Any) => {
    if (seenValues.has(value)) return;
    seenValues.add(value);
    (metadata(value).knowledge || []).forEach(addFact);
    if (isESNumber(value)) {
      const indexed = indexedElement(value);
      if (indexed) addValue(indexed.index);
    }
  };
  const addEndpoint = (endpoint: CollectionEndpoint) => {
    if (typeof endpoint !== "number") addValue(endpoint.base);
  };
  const addRegion = (region: CollectionRegion) => {
    if ("index" in region) addEndpoint(region.index);
    else {
      addEndpoint(region.start);
      if (region.end !== undefined) addEndpoint(region.end);
    }
  };
  const addFact = (fact: Fact) => {
    if (seenFacts.has(fact)) return;
    seenFacts.add(fact);
    result.push(fact);
    if (fact.kind === "order") {
      addValue(fact.left);
      addValue(fact.right);
    } else if (fact.kind === "finite" || fact.kind === "notNaN" || fact.kind === "integer") {
      addValue(fact.subject);
    } else if (fact.kind === "member") {
      addValue(fact.element);
      addRegion(fact.collection);
    } else if (fact.kind === "every-element-order") {
      addValue(fact.bound);
      addRegion(fact.collection);
    }
  };
  values.forEach(addValue);
  knowledge.forEach(addFact);
  // A universal guarantee alone says nothing about whether its collection is
  // empty. Instantiate it only for an actual member of the same snapshot.
  const members = result.filter((fact): fact is Extract<Fact, { kind: "member" }> => fact.kind === "member");
  const universal = result.filter((fact): fact is Extract<Fact, { kind: "every-element-order" }> => fact.kind === "every-element-order");
  // Capping only the new symbolic-endpoint cross product preserves the
  // existing concrete-region behavior while keeping arbitrary-index queries
  // independent of the array's length range.
  let symbolicPairs = 0;
  for (const fact of universal) for (const member of members) {
    const symbolic = "index" in fact.collection || "index" in member.collection ||
      ("start" in fact.collection && (typeof fact.collection.start !== "number" ||
        fact.collection.end !== undefined && typeof fact.collection.end !== "number")) ||
      ("start" in member.collection && (typeof member.collection.start !== "number" ||
        member.collection.end !== undefined && typeof member.collection.end !== "number"));
    if (symbolic && ++symbolicPairs > maxEndpointFacts) return result;
    if (regionContains(fact.collection, member.collection, result)) {
      result.push({
        kind: "order",
        left: fact.direction === "lower" ? fact.bound : member.element,
        right: fact.direction === "lower" ? member.element : fact.bound,
        strict: false
      });
    }
  }
  return result;
}

function knownNotNaN(number: TESNumber, facts: Knowledge): boolean {
  if (typeof number.value === "number") return !Number.isNaN(number.value);
  return facts.some(fact =>
    ((fact.kind === "finite" || fact.kind === "notNaN" || fact.kind === "integer") && sameNumber(fact.subject, number)) ||
    (fact.kind === "order" && (sameNumber(fact.left, number) || sameNumber(fact.right, number)))
  );
}

export function notNaN(number: TESNumber, knowledge: Knowledge = []): boolean {
  return knownNotNaN(number, collectFacts([number], knowledge));
}

export function isFiniteNumber(number: TESNumber, knowledge: Knowledge = []): boolean {
  return typeof number.value === "number" ? Number.isFinite(number.value) :
    collectFacts([number], knowledge).some(fact =>
      (fact.kind === "finite" || fact.kind === "integer") && sameNumber(fact.subject, number));
}

export function numberBounds(number: TESNumber, knowledge: Knowledge = []): { lower?: Bound; upper?: Bound } {
  if (typeof number.value === "number" && !Number.isNaN(number.value)) {
    return { lower: { value: number.value, inclusive: true }, upper: { value: number.value, inclusive: true } };
  }
  let lower: Bound | undefined;
  let upper: Bound | undefined;
  const facts = collectFacts([number], knowledge);
  facts.forEach(fact => {
    if (fact.kind !== "order") return;
    if (sameNumber(fact.right, number) && typeof fact.left.value === "number" && !Number.isNaN(fact.left.value)) {
      const candidate = { value: fact.left.value, inclusive: !fact.strict };
      if (!lower || candidate.value > lower.value || (candidate.value === lower.value && !candidate.inclusive)) lower = candidate;
    }
    if (sameNumber(fact.left, number) && typeof fact.right.value === "number" && !Number.isNaN(fact.right.value)) {
      const candidate = { value: fact.right.value, inclusive: !fact.strict };
      if (!upper || candidate.value < upper.value || (candidate.value === upper.value && !candidate.inclusive)) upper = candidate;
    }
  });
  if (facts.some(fact => fact.kind === "integer" && sameNumber(fact.subject, number))) {
    if (lower && Number.isFinite(lower.value)) {
      const rounded = lower.inclusive ? Math.ceil(lower.value) : Math.floor(lower.value) + 1;
      // At large magnitudes adding one can round back to the same double.
      if (rounded > lower.value || lower.inclusive) lower = { value: rounded, inclusive: true };
    }
    if (upper && Number.isFinite(upper.value)) {
      const rounded = upper.inclusive ? Math.floor(upper.value) : Math.ceil(upper.value) - 1;
      if (rounded < upper.value || upper.inclusive) upper = { value: rounded, inclusive: true };
    }
  }
  return { lower, upper };
}

function hasOrder(left: TESNumber, right: TESNumber, strict: boolean, knowledge: Knowledge): boolean {
  const facts = collectFacts([left, right], knowledge);
  const originalEdges = facts.filter((fact): fact is OrderFact => fact.kind === "order");
  // An established <= edge excludes NaN. A known inequality between the same
  // endpoints therefore strengthens it to <, including for transitive paths.
  // Bound only this refinement; oversized facts retain the existing graph.
  const equalities:Array<{left:Any;right:Any;truth:boolean}>=[];
  if (facts.length<=256) for (const fact of facts) {
    if (fact.kind === "truth" && fact.condition.expression &&
        fact.condition.expression.kind === "strict-equal") {
      const equality=fact.condition.expression;
      equalities.push({left:equality.left,right:equality.right,truth:fact.truth});
    }
  }
  // Only explicit equality facts participate in this refinement. Scanning
  // arbitrary Boolean trees through truthIn for every order edge duplicates
  // unrelated structural reasoning throughout the transitive-order solver.
  const edges = equalities.length ? originalEdges.map(edge => {
    if (edge.strict) return edge;
    for (let i=equalities.length-1;i>=0;i--) {
      const equality=equalities[i];
      if (sameValue(equality.left,edge.left) && sameValue(equality.right,edge.right) ||
          sameValue(equality.right,edge.left) && sameValue(equality.left,edge.right))
        return equality.truth ? edge : {...edge,strict:true};
    }
    return edge;
  }) : originalEdges;
  const numbers: TESNumber[] = [];
  const add = (number: TESNumber) => {
    if (!numbers.some(existing => sameNumber(existing, number))) numbers.push(number);
  };
  add(left);
  add(right);
  edges.forEach(edge => { add(edge.left); add(edge.right); });
  const queue = [{ number: left, strict: false }];
  const visited: Array<{ number: TESNumber; strict: boolean }> = [];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.some(entry => sameNumber(entry.number, current.number) && entry.strict === current.strict)) continue;
    visited.push(current);
    if (sameNumber(current.number, right) && (!strict || current.strict) && knownNotNaN(current.number, facts)) return true;
    edges.forEach(edge => {
      if (sameNumber(edge.left, current.number)) queue.push({ number: edge.right, strict: current.strict || edge.strict });
    });
    // Literal numbers provide the remaining order edges; ranges use the same
    // graph as relationships between symbolic numbers.
    if (typeof current.number.value === "number") {
      numbers.forEach(number => {
        if (typeof number.value === "number" && current.number.value! <= number.value) {
          queue.push({ number, strict: current.strict || current.number.value! < number.value });
        }
      });
    }
  }
  return false;
}

function sameFact(left: Fact, right: Fact): boolean {
  if (left === right) return true;
  if (left.kind !== right.kind) return false;
  if (left.kind === "truth" && right.kind === "truth") {
    return left.truth === right.truth && sameCondition(left.condition, right.condition);
  }
  if (left.kind === "order" && right.kind === "order") {
    return left.strict === right.strict && sameNumber(left.left, right.left) &&
      sameNumber(left.right, right.right);
  }
  if ("subject" in left && "subject" in right) return sameNumber(left.subject, right.subject);
  if ("collection" in left && "collection" in right) {
    if (!sameRegion(left.collection, right.collection)) return false;
    if (left.kind === "member" && right.kind === "member") return sameNumber(left.element, right.element);
    if (left.kind === "every-element-order" && right.kind === "every-element-order") {
      return left.direction === right.direction && sameNumber(left.bound, right.bound);
    }
  }
  return false;
}

function withSharedFacts(facts: Knowledge, alternatives: Knowledge[]): Knowledge {
  if (!alternatives.length) return facts;
  // A condition may be satisfied in several ways. Only facts established in
  // every feasible alternative can be used outside that alternative.
  return facts.concat(alternatives[0].filter(fact =>
    !facts.some(existing => sameFact(existing, fact)) &&
    alternatives.every(branch => branch.some(existing => sameFact(existing, fact)))
  ));
}

// P005: bounded syntactic leaves of a nested conditional selection. Paths
// hold the guard choices from the flattened root to each leaf. Returns
// undefined when the selection exceeds the explicit exploration bound, in
// which case callers keep current behavior (unknown) under SYM-004. These
// constants bound one flattening only (the leaf cap is deliberately small:
// P005 needs three leaves and the at-cap control uses four); the helpers
// below additionally refuse reentrant new exploration (see
// selectionMembershipDepth) and apply solely to non-choice leaves/candidates,
// so they do not bound the pre-existing solver's general costs, which remain
// SYM-004.
const maxSelectionLeaves = 4;
const maxSelectionDepth = 16;
const maxSelectionPriors = 8;

// Reentrancy guard for the new leaf exploration. assume/strictEquality used
// while flattening may themselves reach choice-valued equality guards;
// nested entries keep pre-existing behavior instead of starting further new
// exploration.
let selectionMembershipDepth = 0;

function selectionLeaves(value: Any, path: Array<{ condition: TESBoolean; truth: boolean }> = [], depth = 0):
  Array<{ leaf: Any; path: Array<{ condition: TESBoolean; truth: boolean }> }> | undefined {
  const choice = choiceOf(value);
  if (!choice) return [{ leaf: value, path }];
  if (depth >= maxSelectionDepth) return undefined;
  const consequent = selectionLeaves(choice.consequent, [...path, { condition: choice.condition, truth: true }], depth + 1);
  if (!consequent) return undefined;
  const alternate = selectionLeaves(choice.alternate, [...path, { condition: choice.condition, truth: false }], depth + 1);
  if (!alternate) return undefined;
  const leaves = [...consequent, ...alternate];
  return leaves.length > maxSelectionLeaves ? undefined : leaves;
}

// P005: an outer selection branch stays feasible when at least one of its
// syntactic sub-leaves contradicts no assumed equality about the same outer
// selection (the current assumption plus prior strict-equal truth facts).
// Unknown leaf equalities stay feasible; only a known disagreement discards
// a leaf. Discarding needs every sub-leaf contradicted, so incomplete lists,
// fresh values, NaN leaves and maybe-NaN unknowns keep their branch.
// Narrowed inference: non-choice leaves/candidates only, bounded priors, and
// no reentrant new exploration (reentrant entries keep the branch).
function branchHasFeasibleLeaf(
  value: Any,
  branchFacts: Knowledge,
  assumptions: Array<{ candidate: Any; truth: boolean }>
): boolean {
  if (selectionMembershipDepth > 0) return true;
  if (assumptions.length > maxSelectionPriors) return true;
  if (assumptions.some(({ candidate }) => choiceOf(candidate))) return true;
  const leaves = selectionLeaves(value);
  if (!leaves || leaves.some(({ leaf }) => choiceOf(leaf))) return true;
  selectionMembershipDepth++;
  try {
    return leaves.some(({ leaf, path }) => {
      let subFacts = branchFacts;
      for (const step of path) subFacts = assume(subFacts, step.condition, step.truth);
      return assumptions.every(({ candidate, truth }) => {
        const equality = strictEquality(leaf, candidate, subFacts);
        const resolved = resolveBoolean(equality, subFacts);
        return resolved === undefined || resolved === truth;
      });
    });
  } finally {
    selectionMembershipDepth--;
  }
}

// P005: prior-aware resolution of `selected === candidate` where selected is
// a nested selection. Leaves contradicting a prior strict-equal assumption
// about the same selection are discarded; a definite answer needs every
// remaining leaf to agree through known strict equality. Unknown leaves,
// incomplete coverage, NaN and maybe-NaN inputs yield unknown. Returns
// undefined both when unknown and when this narrowed inference gives up, in
// which case callers use the pre-existing expansion.
function tryResolveChoiceEquality(selected: Any, candidate: Any, knowledge: Knowledge): boolean | undefined {
  if (selectionMembershipDepth > 0) return undefined;
  if (choiceOf(candidate)) return undefined;
  const leaves = selectionLeaves(selected);
  if (!leaves || leaves.some(({ leaf }) => choiceOf(leaf))) return undefined;
  const priors: Array<{ candidate: Any; truth: boolean }> = [];
  for (const fact of knowledge) {
    if (fact.kind !== "truth" || !fact.condition.expression ||
        fact.condition.expression.kind !== "strict-equal") continue;
    const prior = fact.condition.expression;
    if (priors.length >= maxSelectionPriors) return undefined;
    if (sameIdentity(prior.left, selected)) {
      if (choiceOf(prior.right)) return undefined;
      priors.push({ candidate: prior.right, truth: fact.truth });
    } else if (sameIdentity(prior.right, selected)) {
      if (choiceOf(prior.left)) return undefined;
      priors.push({ candidate: prior.left, truth: fact.truth });
    }
  }
  selectionMembershipDepth++;
  try {
    const results: boolean[] = [];
    for (const { leaf, path } of leaves) {
      let subFacts = knowledge;
      for (const step of path) subFacts = assume(subFacts, step.condition, step.truth);
      let contradicted = false;
      for (const { candidate: priorCandidate, truth: priorTruth } of priors) {
        const priorEquality = strictEquality(leaf, priorCandidate, subFacts);
        const priorResolved = resolveBoolean(priorEquality, subFacts);
        if (priorResolved !== undefined && priorResolved !== priorTruth) {
          contradicted = true;
          break;
        }
      }
      if (contradicted) continue;
      const equality = strictEquality(leaf, candidate, subFacts);
      const resolved = resolveBoolean(equality, subFacts);
      if (resolved === undefined) return undefined;
      results.push(resolved);
    }
    if (!results.length) return undefined;
    if (results.every(result => result)) return true;
    if (results.every(result => !result)) return false;
    return undefined;
  } finally {
    selectionMembershipDepth--;
  }
}

// Constructing facts uses the direct reasoner. Starting a new disjunctive
// query from inside that construction recursively spends work on assumptions
// instead of the caller's proof; ordinary queries may refine afterward.
let assumptionDepth=0;
export function assume(knowledge: Knowledge, condition: TESBoolean, truth: boolean): Knowledge {
  assumptionDepth++;
  try {return assumeDirect(knowledge,condition,truth);} finally {assumptionDepth--;}
}
function assumeDirect(knowledge: Knowledge, condition: TESBoolean, truth: boolean): Knowledge {
  let facts: Knowledge = knowledge.concat({ kind: "truth", condition, truth });
  const expression = condition.expression;
  if (!expression) return facts;
  if (expression.kind === "not") return assume(facts, expression.operand, !truth);
  if (expression.kind === "select" && isESBoolean(expression.consequent) && isESBoolean(expression.alternate)) {
    const guard = resolveBoolean(expression.condition, knowledge);
    const alternatives: Knowledge[] = [];
    for (const selected of [true, false]) {
      if (guard !== undefined && guard !== selected) continue;
      const branch = selected ? expression.consequent : expression.alternate;
      const branchFacts = assume(knowledge, expression.condition, selected);
      // Test feasibility before assuming the requested result. Otherwise that
      // new truth fact would conceal an already established contradiction.
      const value = resolveBoolean(branch, branchFacts);
      if (value !== undefined && value !== truth) continue;
      alternatives.push(assume(branchFacts, branch, truth));
    }
    return withSharedFacts(facts, alternatives);
  }
  if (expression.kind === "strict-equal") {
    const { left, right } = expression;
    const selected = choiceOf(left) ? left : choiceOf(right) ? right : undefined;
    if (selected) {
      const choice = choiceOf(selected)!;
      const guard = resolveBoolean(choice.condition, knowledge);
      const candidate = selected === left ? right : left;
      const assumptions: Array<{ candidate: Any; truth: boolean }> = [{ candidate, truth }];
      // Bounded prior collection: stop growing at the cap and conservatively
      // give up the new inference for this assumption when over cap.
      let priorsCapped = false;
      for (const fact of knowledge) {
        if (assumptions.length > maxSelectionPriors) { priorsCapped = true; break; }
        if (fact.kind !== "truth" || !fact.condition.expression ||
            fact.condition.expression.kind !== "strict-equal") continue;
        const prior = fact.condition.expression;
        if (sameIdentity(prior.left, selected)) assumptions.push({ candidate: prior.right, truth: fact.truth });
        else if (sameIdentity(prior.right, selected)) assumptions.push({ candidate: prior.left, truth: fact.truth });
        if (assumptions.length > maxSelectionPriors) { priorsCapped = true; break; }
      }

      const alternatives: Knowledge[] = [];
      for (const branch of [true, false]) {
        if (guard !== undefined && guard !== branch) continue;
        // Use knowledge from before this assumption: remembering the desired
        // result first can hide a contradiction in an aliased comparison.
        const branchFacts = assume(knowledge, choice.condition, branch);
        const value = branch ? choice.consequent : choice.alternate;
        const equality = strictEquality(selected === left ? value : left,
          selected === right ? value : right, branchFacts);
        const resolved = resolveBoolean(equality, branchFacts);
        if (resolved !== undefined && resolved !== truth) continue;
        // Refute branches whose every sub-leaf contradicts the current or a
        // prior equality about this same selection. Unknown leaves stay
        // feasible; only known disagreements discard. Over-cap prior
        // collection gives up this refinement and keeps the branch.
        if (!priorsCapped && !branchHasFeasibleLeaf(value, branchFacts, assumptions)) continue;
        alternatives.push(assume(branchFacts, equality, truth));
      }
      facts = withSharedFacts(facts, alternatives);
    }
  }
  if (expression.kind === "compare") {
    const reversed = expression.operator === ">" || expression.operator === ">=";
    const left = reversed ? expression.right : expression.left;
    const right = reversed ? expression.left : expression.right;
    const strict = expression.operator === "<" || expression.operator === ">";
    if (truth) facts = facts.concat({ kind: "order", left, right, strict });
    // JavaScript's false relational comparisons may also mean NaN.
    else if (notNaN(left, facts) && notNaN(right, facts)) {
      facts = facts.concat({ kind: "order", left: right, right: left, strict: !strict });
    }
    return expression.refinement ? assume(facts, expression.refinement, truth) : facts;
  }
  if (expression.kind === "strict-equal" && truth && isESNumber(expression.left) && isESNumber(expression.right)) {
    facts = facts.concat(
      { kind: "order", left: expression.left, right: expression.right, strict: false },
      { kind: "order", left: expression.right, right: expression.left, strict: false }
    );
  }
  if (expression.kind === "strict-equal" && !truth && isESNumber(expression.left) && isESNumber(expression.right)) {
    const subject = typeof expression.left.value === "number" ? expression.right : expression.left;
    const literal = subject === expression.left ? expression.right : expression.left;
    if (typeof literal.value === "number" && !Number.isNaN(literal.value)) {
      const limits = numberBounds(subject, facts);
      if (limits.lower && limits.lower.value >= literal.value) {
        facts = facts.concat({ kind: "order", left: literal, right: subject, strict: true });
      }
      if (limits.upper && limits.upper.value <= literal.value) {
        facts = facts.concat({ kind: "order", left: subject, right: literal, strict: true });
      }
    }
  }
  return facts;
}

function resolveComparison(left: TESNumber, right: TESNumber, operator: NumberOperator, knowledge: Knowledge): boolean | undefined {
  const remembered = truthIn({ ...ESBoolean(), expression: { kind: "compare", left, right, operator } }, knowledge);
  if (remembered !== undefined) return remembered;
  if (operator === ">" || operator === ">=") return resolveComparison(right, left, operator === ">" ? "<" : "<=", knowledge);
  if ((typeof left.value === "number" && Number.isNaN(left.value)) || (typeof right.value === "number" && Number.isNaN(right.value))) return false;
  if (typeof left.value === "number" && typeof right.value === "number") return operator === "<" ? left.value < right.value : left.value <= right.value;
  if (left.expression && left.expression.kind === "binary" ||
      right.expression && right.expression.kind === "binary") {
    const a = exactIntegerEndpoint(left, knowledge), b = exactIntegerEndpoint(right, knowledge);
    if (a && b && sameNumber(a.base, b.base)) {
      return operator === "<" ? a.offset < b.offset : a.offset <= b.offset;
    }
  }
  const affineDifference = exactIntegerDifference(left, right, knowledge);
  if (affineDifference !== undefined) return operator === "<" ? affineDifference < 0 : affineDifference <= 0;
  if (sameNumber(left, right)) return operator === "<" ? false : notNaN(left, knowledge) ? true : undefined;
  if (sameIndexedPosition(left, right, knowledge)) {
    return operator === "<" ? false :
      notNaN(left, knowledge) && notNaN(right, knowledge) ? true : undefined;
  }
  // Resolve from accumulated order facts before opening choices, to keep
  // recursive selections a shared graph rather than an exponential tree.
  if (hasOrder(left, right, operator === "<", knowledge)) return true;
  if (hasOrder(right, left, operator === "<=", knowledge)) return false;
  const selected = choiceOf(left) ? left : choiceOf(right) ? right : undefined;
  if (!selected) return undefined;
  const choice = choiceOf(selected)!;
  const condition = resolveBoolean(choice.condition, knowledge);
  const branch = (truth: boolean): boolean | undefined => {
    const value = (truth ? choice.consequent : choice.alternate) as TESNumber;
    let facts = assume(knowledge, choice.condition, truth);
    if (notNaN(value, facts)) facts = facts.concat(
      { kind: "order", left: selected, right: value, strict: false },
      { kind: "order", left: value, right: selected, strict: false }
    );
    return resolveComparison(selected === left ? value : left, selected === right ? value : right, operator, facts);
  };
  if (condition !== undefined) return branch(condition);
  const consequent = branch(true);
  const alternate = branch(false);
  return consequent === alternate ? consequent : undefined;
}

// Retain the guards of comparisons over explicit finite choice trees.
// An opaque compare(select(...), ...) loses those guards when later assumed.
// Numeric leaves may remain symbolic: their ordinary relation stays unknown
// unless the shared reasoner proves it. This is dispatch, never interval sampling.
function finiteChoiceRelation(left: Any, right: Any,
  operator: NumberOperator | "===", knowledge: Knowledge): TESBoolean | undefined {
  let inspected = 0;
  const active = new Set<Any>();
  // Guard expressions are part of the work too: a small value-choice spine
  // can carry recursively shared symbolic comparisons with a huge expansion.
  // Bound the complete expression traversal before any relation is evaluated.
  const check = (value: Any, depth: number, numeric = operator !== "==="): boolean => {
    if (++inspected > 64 || depth > 8 || active.has(value)) return false;
    if (numeric && !isESNumber(value)) return false;
    const expression=expressionOf(value);
    if (!expression) return true;
    active.add(value);
    let valid:boolean;
    switch(expression.kind) {
      case "select": valid=check(expression.condition,depth+1,false) &&
        check(expression.consequent,depth+1,numeric) && check(expression.alternate,depth+1,numeric);break;
      case "compare":
        valid=check(expression.left,depth+1,false) && check(expression.right,depth+1,false) &&
          (!expression.refinement || check(expression.refinement,depth+1,false));break;
      case "strict-equal": case "binary":
        valid=check(expression.left,depth+1,false) && check(expression.right,depth+1,false);break;
      case "not": case "typeof": case "truthy": case "unary":
        valid=check(expression.operand,depth+1,false);break;
      case "indexed-element": valid=check(expression.index,depth+1,false);break;
      case "string-slice": valid=check(expression.operand,depth+1,false) &&
        check(expression.start,depth+1,false) && (!expression.end || check(expression.end,depth+1,false));break;
      default: valid=false;
    }
    active.delete(value);
    return valid;
  };
  if (knowledge.length > 256 || !check(left,0) || !check(right,0)) return undefined;
  let work = 0;
  const visit = (a: Any, b: Any, facts: Knowledge): TESBoolean | undefined => {
    if (++work > 256 || facts.length > 512) return undefined;
    const ca = choiceOf(a), cb = choiceOf(b), choice = ca || cb;
    if (!choice) {
      if (operator === "===") {
        const result=ESBoolean(resolveEquality(a,b,facts));
        if (result.value === undefined) result.expression={kind:"strict-equal",left:a,right:b};
        return result;
      }
      const leftNumber=a as TESNumber, rightNumber=b as TESNumber;
      const result=ESBoolean(resolveComparison(leftNumber,rightNumber,operator,facts));
      if (result.value === undefined) result.expression={kind:"compare",left:leftNumber,right:rightNumber,operator};
      return result;
    }
    const branch = (truth: boolean): TESBoolean | undefined => visit(
      ca ? (truth?choice.consequent:choice.alternate) as TESNumber : a,
      ca ? b : (truth?choice.consequent:choice.alternate) as TESNumber,
      assume(facts,choice.condition,truth));
    const known=resolveBoolean(choice.condition,facts);
    if (known !== undefined) return branch(known);
    const yes=branch(true), no=branch(false);
    if (!yes || !no) return undefined;
    return selectValue(choice.condition,yes,no,facts) as TESBoolean;
  };
  return visit(left,right,knowledge);
}

export function compareNumbers(left: TESNumber, right: TESNumber, operator: NumberOperator, knowledge: Knowledge = []): TESBoolean {
  const result = ESBoolean(resolveComparison(left, right, operator, knowledge));
  if (result.value === undefined) {
    const finite = choiceOf(left) || choiceOf(right) ? finiteChoiceRelation(left,right,operator,knowledge) : undefined;
    if (finite && finite.value !== undefined) return finite;
    // Preserve the original relation as well as its equivalent guard tree.
    // Assumptions about either representation must retain aggregate order facts.
    result.expression = finite ? { kind: "compare", left, right, operator, refinement: finite } :
      { kind: "compare", left, right, operator };
  }
  return result;
}

function resolveBooleanDirect(condition: TESBoolean, knowledge: Knowledge): boolean | undefined {
  if (typeof condition.value === "boolean") return condition.value;
  const remembered = truthIn(condition, knowledge);
  if (remembered !== undefined) return remembered;
  const expression = condition.expression;
  if (!expression) return undefined;
  switch (expression.kind) {
    case "compare": {
      const direct = resolveComparison(expression.left, expression.right, expression.operator, knowledge);
      return direct === undefined && expression.refinement ? resolveBoolean(expression.refinement, knowledge) : direct;
    }
    case "strict-equal": return resolveEquality(expression.left, expression.right, knowledge);
    case "not": {
      const value = resolveBoolean(expression.operand, knowledge);
      return value === undefined ? undefined : !value;
    }
    case "select": {
      const value = resolveBoolean(expression.condition, knowledge);
      const branch = (truth: boolean) => resolveBoolean(
        (truth ? expression.consequent : expression.alternate) as TESBoolean,
        assume(knowledge, expression.condition, truth)
      );
      if (value !== undefined) return branch(value);
      const consequent = branch(true);
      const alternate = branch(false);
      return consequent === alternate ? consequent : undefined;
    }
    default: return undefined;
  }
}

// A remembered Boolean selection is a disjunction of guarded paths. Shared
// facts alone lose that relation. Prove a query on every feasible leaf of one
// bounded remembered selection; unknown leaves never count as a proof.
let priorSelectionDepth = 0;
// Share the extra-inference budget across one complete Boolean resolution,
// including all recursively visited alternatives and operands.
let booleanResolutionDepth = 0;
let remainingPriorWork = 128;
function resolveFromSelectionPrior(query: TESBoolean, knowledge: Knowledge): boolean | undefined {
  if (priorSelectionDepth || assumptionDepth || knowledge.length > 128 || remainingPriorWork<=0) return undefined;
  const priors = knowledge.filter((f): f is Extract<Fact,{kind:"truth"}> =>
    f.kind === "truth" && !!f.condition.expression && f.condition.expression.kind === "select");
  if (!priors.length || priors.length > 4) return undefined;
  let work=0;
  priorSelectionDepth++;
  try {
    for (const prior of priors) {
      const base=knowledge.filter(f=>f.kind !== "truth" ||
        !boundedSameCondition(f.condition,prior.condition,{remaining:64}));
      const answers: Array<boolean | undefined>=[];
      let declined=false;
      const visit=(value: TESBoolean,facts:Knowledge,depth:number): void => {
        if (declined) return;
        if (++work>128 || --remainingPriorWork<0 || depth>8 || facts.length>512) {declined=true;return;}
        const expression=value.expression;
        if (expression && expression.kind === "select") {
          if (!isESBoolean(expression.consequent) || !isESBoolean(expression.alternate)) {declined=true;return;}
          // A guard can itself be a selected Boolean. Retain each of its
          // alternatives here rather than intersecting their facts via assume;
          // the prior's implication may depend on exactly that disjunction.
          const splitGuard=(guard:TESBoolean,branchFacts:Knowledge,guardDepth:number,
            next:(truth:boolean,ready:Knowledge)=>void):void=>{
            if (declined) return;
            if (++work>128 || --remainingPriorWork<0 || guardDepth>8 || branchFacts.length>512) {declined=true;return;}
            const known=resolveBooleanDirect(guard,branchFacts);
            const selected=guard.expression && guard.expression.kind === "compare" && guard.expression.refinement ?
              guard.expression.refinement.expression : guard.expression;
            if (selected && selected.kind === "select" &&
                isESBoolean(selected.consequent) && isESBoolean(selected.alternate)) {
              // A known result does not identify the selected alternative.
              // Enumerate its compatible paths before continuing the prior.
              splitGuard(selected.condition,branchFacts,guardDepth+1,(truth,ready)=>
                splitGuard((truth?selected.consequent:selected.alternate) as TESBoolean,ready,guardDepth+1,
                  (result,leaf)=>{
                    if(known===undefined || result===known) {
                      // The enumerated selector and leaf already establish this
                      // Boolean result. Re-assuming the whole selection repeats
                      // its disjunction expansion and shared-fact intersections.
                      next(result,leaf.concat({kind:"truth",condition:guard,truth:result}));
                    }
                  }));
              return;
            }
            if (known !== undefined) {next(known,assume(branchFacts,guard,known));return;}
            for (const truth of [true,false]) next(truth,assume(branchFacts,guard,truth));
          };
          splitGuard(expression.condition,facts,depth+1,(truth,ready)=>
            visit((truth?expression.consequent:expression.alternate) as TESBoolean,ready,depth+1));
          return;
        }
        const leaf=resolveBooleanDirect(value,facts);
        if (leaf !== undefined && leaf !== prior.truth) return;
        const answer=resolveBooleanDirect(query,assume(facts,value,prior.truth));
        // One unresolved or disagreeing compatible leaf disqualifies this
        // prior. Continuing its other paths cannot turn it into a proof.
        if (answer === undefined || answers.length && answer !== answers[0]) {
          declined=true;
          return;
        }
        answers.push(answer);
      };
      visit(prior.condition,base,0);
      if (!declined && answers.length && answers[0] !== undefined &&
          answers.every(value=>value === answers[0])) return answers[0];
      if (work>128) return undefined;
    }
  } finally { priorSelectionDepth--; }
  return undefined;
}

export function resolveBoolean(condition: TESBoolean, knowledge: Knowledge = []): boolean | undefined {
  if (booleanResolutionDepth++===0) remainingPriorWork=128;
  try {
    const direct=resolveBooleanDirect(condition,knowledge);
    return direct === undefined ? resolveFromSelectionPrior(condition,knowledge) : direct;
  } finally {booleanResolutionDepth--; }
}

export function negate(condition: TESBoolean, knowledge: Knowledge = []): TESBoolean {
  const resolved = resolveBoolean(condition, knowledge);
  if (resolved !== undefined) return ESBoolean(!resolved);
  if (condition.expression && condition.expression.kind === "not") return condition.expression.operand;
  return { ...ESBoolean(), expression: { kind: "not", operand: condition } };
}

function resolveEquality(left: Any, right: Any, knowledge: Knowledge): boolean | undefined {
  const remembered = truthIn({ ...ESBoolean(), expression: { kind: "strict-equal", left, right } }, knowledge);
  if (remembered !== undefined) return remembered;
  const a = metadata(left);
  const b = metadata(right);
  if ((isESNumber(left) && typeof left.value === "number" && Number.isNaN(left.value)) ||
      (isESNumber(right) && typeof right.value === "number" && Number.isNaN(right.value))) return false;
  // A mixed choice may contain NaN even though its internal tag is "choice".
  if (sameIdentity(left, right) && !isESNumber(left) && !isChoice(left)) return true;
  const selected = choiceOf(left) ? left : choiceOf(right) ? right : undefined;
  if (selected) {
    // Prior-aware leaf resolution first; on unknown/giveup use the
    // pre-existing per-guard expansion below.
    const candidate = selected === left ? right : left;
    const leafResult = tryResolveChoiceEquality(selected, candidate, knowledge);
    if (leafResult !== undefined) return leafResult;
    const choice = choiceOf(selected)!;
    const condition = resolveBoolean(choice.condition, knowledge);
    const branch = (truth: boolean) => resolveEquality(
      selected === left ? (truth ? choice.consequent : choice.alternate) : left,
      selected === right ? (truth ? choice.consequent : choice.alternate) : right,
      assume(knowledge, choice.condition, truth)
    );
    if (condition !== undefined) return branch(condition);
    const consequent = branch(true);
    const alternate = branch(false);
    return consequent === alternate ? consequent : undefined;
  }
  if (a.type !== b.type) return false;
  if (isESNumber(left) && isESNumber(right)) {
    if (typeof left.value === "number" && typeof right.value === "number") return left.value === right.value;
    const finiteDomain = integerDomainEquality(left, right, knowledge);
    if (finiteDomain !== undefined) return finiteDomain;
    const affineDifference = exactIntegerDifference(left, right, knowledge);
    if (affineDifference !== undefined) return affineDifference === 0;
    if (sameNumber(left, right)) return notNaN(left, knowledge) ? true : undefined;
    if (sameIndexedPosition(left, right, knowledge)) {
      return notNaN(left, knowledge) && notNaN(right, knowledge) ? true : undefined;
    }
    if (hasOrder(left, right, true, knowledge) || hasOrder(right, left, true, knowledge)) return false;
    if (hasOrder(left, right, false, knowledge) && hasOrder(right, left, false, knowledge)) return true;
    return undefined;
  }
  if (isESBoolean(left) && isESBoolean(right)) {
    const first = resolveBoolean(left, knowledge);
    const second = resolveBoolean(right, knowledge);
    if (first !== undefined && second !== undefined) return first === second;
    if (boundedSameCondition(left,right,{remaining:64})) return true;
    const firstRefinement = left.expression && left.expression.kind === "compare" ? left.expression.refinement : undefined;
    const secondRefinement = right.expression && right.expression.kind === "compare" ? right.expression.refinement : undefined;
    if (firstRefinement || secondRefinement) return resolveEquality(firstRefinement || left, secondRefinement || right, knowledge);
    return undefined;
  }
  if (a.type === "null" || a.type === "undefined") return true;
  if (isESString(left) && isESString(right)) {
    return typeof left.value === "string" && typeof right.value === "string" ? left.value === right.value : undefined;
  }
  if (a.type === "object" || a.type === "array" || a.type === "function") return false;
  return undefined;
}

export function strictEquality(left: Any, right: Any, knowledge: Knowledge = []): TESBoolean {
  const result = ESBoolean(resolveEquality(left, right, knowledge));
  if (result.value === undefined) {
    if (choiceOf(left) || choiceOf(right)) {
      const finite = finiteChoiceRelation(left,right,"===",knowledge);
      if (finite) return finite;
    }
    result.expression = { kind: "strict-equal", left, right };
  }
  return result;
}

function joinedBound(first: Bound | undefined, second: Bound | undefined, lower: boolean): Bound | undefined {
  if (!first || !second) return undefined;
  if (first.value === second.value) return { value: first.value, inclusive: first.inclusive || second.inclusive };
  return (first.value < second.value) === lower ? first : second;
}

function numberSelection(result: TESNumber, condition: TESBoolean, consequent: TESNumber, alternate: TESNumber, knowledge: Knowledge): void {
  const trueFacts = assume(knowledge, condition, true);
  const falseFacts = assume(knowledge, condition, false);
  const facts: Fact[] = [];
  if (isFiniteNumber(consequent, trueFacts) && isFiniteNumber(alternate, falseFacts)) facts.push({ kind: "finite", subject: result });
  if (notNaN(consequent, trueFacts) && notNaN(alternate, falseFacts)) facts.push({ kind: "notNaN", subject: result });
  const a = numberBounds(consequent, trueFacts);
  const b = numberBounds(alternate, falseFacts);
  const lower = joinedBound(a.lower, b.lower, true);
  const upper = joinedBound(a.upper, b.upper, false);
  if (lower) facts.push({ kind: "order", left: ESNumber(lower.value), right: result, strict: !lower.inclusive });
  if (upper) facts.push({ kind: "order", left: result, right: ESNumber(upper.value), strict: !upper.inclusive });
  [consequent, alternate].forEach(candidate => {
    if (resolveComparison(consequent, candidate, "<=", trueFacts) === true && resolveComparison(alternate, candidate, "<=", falseFacts) === true) {
      facts.push({ kind: "order", left: result, right: candidate, strict: false });
    }
    if (resolveComparison(candidate, consequent, "<=", trueFacts) === true && resolveComparison(candidate, alternate, "<=", falseFacts) === true) {
      facts.push({ kind: "order", left: candidate, right: result, strict: false });
    }
  });
  result.knowledge = facts;
}

export function selectValue(condition: TESBoolean, consequent: Any, alternate: Any, knowledge: Knowledge = []): Any {
  const resolved = resolveBoolean(condition, knowledge);
  if (resolved !== undefined) return resolved ? consequent : alternate;
  if (sameValue(consequent, alternate)) return consequent;
  // Use an equivalent compact guard in joined values, while numberSelection
  // below still receives the original relation for aggregate order inference.
  const guard = condition.expression && condition.expression.kind === "compare" && condition.expression.refinement ?
    condition.expression.refinement : condition;
  const expression: SelectExpression = { kind: "select", condition: guard, consequent, alternate };
  if (isESNumber(consequent) && isESNumber(alternate)) {
    const result: TESNumber = { ...ESNumber(), expression };
    numberSelection(result, condition, consequent, alternate, knowledge);
    return result;
  }
  if (isESBoolean(consequent) && isESBoolean(alternate)) {
    const result = { ...ESBoolean(), expression };
    const value = resolveBoolean(result, knowledge);
    return value === undefined ? result : ESBoolean(value);
  }
  if (isESString(consequent) && isESString(alternate)) return { ...ESString(), expression };
  return { type: "choice", id: ValueIdentifier(), expression } as TChoice;
}

// Compatibility entry point; numbers use the same selection expression as
// every other value. Numeric consequences are supplied by the order domain.
export function selectNumber(condition: TESBoolean, consequent: TESNumber, alternate: TESNumber, knowledge: Knowledge = []): TESNumber {
  return selectValue(condition, consequent, alternate, knowledge) as TESNumber;
}

export function randomNumber(): TESNumber {
  const result = ESNumber();
  result.knowledge = [
    { kind: "finite", subject: result },
    { kind: "order", left: ESNumber(0), right: result, strict: false },
    { kind: "order", left: result, right: ESNumber(1), strict: true }
  ];
  return result;
}
