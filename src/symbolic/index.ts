import {
  Any, ESNumber, TESNumber, TESBoolean, ValueIdentifier, WithValue,
  isESNumber, isESBoolean, isESString
} from "../types";
import { ESBoolean } from "../boolean/ESBoolean";
import { ESString } from "../string/String";
import * as Model from "./model";

export type Expression = Model.Expression;
export type Fact = Model.Fact;
export type Knowledge = Model.Knowledge;
export type NumberOperator = Model.NumberOperator;
export type OrderFact = Model.OrderFact;
export type SelectExpression = Model.SelectExpression;
export type TChoice = Model.TChoice;
export type CollectionRegion = Model.CollectionRegion;

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
  if (sameIdentity(left, right)) return true;
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
  return false;
}

function truthIn(condition: TESBoolean, knowledge: Knowledge): boolean | undefined {
  for (let index = knowledge.length - 1; index >= 0; index--) {
    const fact = knowledge[index];
    if (fact.kind === "truth" && sameCondition(fact.condition, condition)) return fact.truth;
  }
  return undefined;
}

function regionContains(outer: CollectionRegion, inner: CollectionRegion): boolean {
  return outer.id === inner.id && inner.start >= outer.start &&
    (outer.end === undefined || (inner.end !== undefined && inner.end <= outer.end));
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
    } else if (fact.kind === "member") addValue(fact.element);
    else if (fact.kind === "every-element-order") addValue(fact.bound);
  };
  values.forEach(addValue);
  knowledge.forEach(addFact);
  // A universal guarantee alone says nothing about whether its collection is
  // empty. Instantiate it only for an actual member of the same snapshot.
  const members = result.filter((fact): fact is Extract<Fact, { kind: "member" }> => fact.kind === "member");
  const universal = result.filter((fact): fact is Extract<Fact, { kind: "every-element-order" }> => fact.kind === "every-element-order");
  universal.forEach(fact => members.forEach(member => {
    if (regionContains(fact.collection, member.collection)) {
      result.push({
        kind: "order",
        left: fact.direction === "lower" ? fact.bound : member.element,
        right: fact.direction === "lower" ? member.element : fact.bound,
        strict: false
      });
    }
  }));
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
  const edges = facts.filter((fact): fact is OrderFact => fact.kind === "order");
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
    if (left.collection.id !== right.collection.id || left.collection.start !== right.collection.start ||
        left.collection.end !== right.collection.end) return false;
    if (left.kind === "member" && right.kind === "member") return sameNumber(left.element, right.element);
    if (left.kind === "every-element-order" && right.kind === "every-element-order") {
      return left.direction === right.direction && sameNumber(left.bound, right.bound);
    }
  }
  return false;
}

export function assume(knowledge: Knowledge, condition: TESBoolean, truth: boolean): Knowledge {
  let facts: Knowledge = knowledge.concat({ kind: "truth", condition, truth });
  const expression = condition.expression;
  if (!expression) return facts;
  if (expression.kind === "not") return assume(facts, expression.operand, !truth);
  if (expression.kind === "select" && isESBoolean(expression.consequent) && isESBoolean(expression.alternate)) {
    const guard = resolveBoolean(expression.condition, facts);
    const alternatives: Knowledge[] = [];
    for (const selected of [true, false]) {
      if (guard !== undefined && guard !== selected) continue;
      const branch = selected ? expression.consequent : expression.alternate;
      const branchFacts = assume(facts, expression.condition, selected);
      // Test feasibility before assuming the requested result. Otherwise that
      // new truth fact would conceal an already established contradiction.
      const value = resolveBoolean(branch, branchFacts);
      if (value !== undefined && value !== truth) continue;
      alternatives.push(assume(branchFacts, branch, truth));
    }
    if (!alternatives.length) return facts;
    // A compound condition can be satisfied along several paths. Only facts
    // shared by every feasible alternative survive, including for && and ||.
    const shared = alternatives[0].filter(fact =>
      !facts.some(existing => sameFact(existing, fact)) &&
      alternatives.every(branch => branch.some(existing => sameFact(existing, fact)))
    );
    return facts.concat(shared);
  }
  if (expression.kind === "compare") {
    const reversed = expression.operator === ">" || expression.operator === ">=";
    const left = reversed ? expression.right : expression.left;
    const right = reversed ? expression.left : expression.right;
    const strict = expression.operator === "<" || expression.operator === ">";
    if (truth) return facts.concat({ kind: "order", left, right, strict });
    // JavaScript's false relational comparisons may also mean NaN.
    if (notNaN(left, facts) && notNaN(right, facts)) {
      return facts.concat({ kind: "order", left: right, right: left, strict: !strict });
    }
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
  if (sameNumber(left, right)) return operator === "<" ? false : notNaN(left, knowledge) ? true : undefined;
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

export function compareNumbers(left: TESNumber, right: TESNumber, operator: NumberOperator, knowledge: Knowledge = []): TESBoolean {
  const result = ESBoolean(resolveComparison(left, right, operator, knowledge));
  if (result.value === undefined) result.expression = { kind: "compare", left, right, operator };
  return result;
}

export function resolveBoolean(condition: TESBoolean, knowledge: Knowledge = []): boolean | undefined {
  if (typeof condition.value === "boolean") return condition.value;
  const remembered = truthIn(condition, knowledge);
  if (remembered !== undefined) return remembered;
  const expression = condition.expression;
  if (!expression) return undefined;
  switch (expression.kind) {
    case "compare": return resolveComparison(expression.left, expression.right, expression.operator, knowledge);
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
    if (sameNumber(left, right)) return notNaN(left, knowledge) ? true : undefined;
    if (hasOrder(left, right, true, knowledge) || hasOrder(right, left, true, knowledge)) return false;
    if (hasOrder(left, right, false, knowledge) && hasOrder(right, left, false, knowledge)) return true;
    return undefined;
  }
  if (isESBoolean(left) && isESBoolean(right)) {
    const first = resolveBoolean(left, knowledge);
    const second = resolveBoolean(right, knowledge);
    if (first !== undefined && second !== undefined) return first === second;
    if (sameCondition(left, right)) return true;
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
  if (result.value === undefined) result.expression = { kind: "strict-equal", left, right };
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
  const expression: SelectExpression = { kind: "select", condition, consequent, alternate };
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
