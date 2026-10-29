import { ESTree } from "cherow";
import { evaluate } from "../evaluate";
import { BranchResult } from "../execution-context/branches";
import { hasExecutionBoundary, isForkedCompletion } from "../execution-context/Completion";
import { UnsupportedAnalysisError } from "../execution-context/analysis-failure";
import {
  Binding, Environment, ExecutionContext, TExecutionContext, putBinding, resolveBinding
} from "../execution-context/ExecutionContext";
import { getSymbolicArrayShape, readSymbolicIndex, symbolicActualArrayRegion,
  symbolicArrayRegion, SymbolicNumberArray, SymbolicSequence } from "../array/symbolic";
import { compareNumbers, exactIntegerEndpoint, isFiniteNumber, Knowledge,
  numberBounds, strictEquality, choiceOf } from "../symbolic";
import { CollectionRegion, Fact } from "../symbolic/model";
import { Any, ESNumber, TESNumber, isESNumber, isReturnValue, isThrownValue,
  isBreakValue, isContinueValue } from "../types";

// This is a bounded abstract execution of an already reached ForStatement,
// not a shortcut for a named reducer. Every accepted result has a checked
// real base, arbitrary body/update transition, exact successor and exit.
type Direction = "lower" | "upper";
type Candidate = Direction | "member" | "finite" | "range";
export type Slot = { environment: Environment; name: string; binding: Binding };
const maximumCandidates = 5;
const maximumProofNodes = 96;
const maximumProofBudget = 2400;
const maximumCarrySlots = 8;
const maximumProofBindings = 256;
const maximumProofEnvironments = 32;
const maximumProofHeapEntries = 128;

function decline(): never { throw new UnsupportedAnalysisError("Unknown-length loop proof declined"); }

export function slot(context: TExecutionContext, name: string): Slot | undefined {
  const resolved = resolveBinding(context, name);
  return resolved && { ...resolved, name };
}

export function valueAt(context: TExecutionContext, target: Slot): Any | undefined {
  const record = context.value.environments.get(target.environment);
  const binding = record && record.get(target.name);
  return binding && binding.value;
}

export function replace(context: TExecutionContext, target: Slot, value: Any): TExecutionContext {
  const record = context.value.environments.get(target.environment);
  const binding = record && record.get(target.name);
  if (!binding) decline();
  return putBinding(context, target.environment, target.name,
    { ...binding, value, initialized: true });
}

export function normal(result: BranchResult): TExecutionContext | undefined {
  const value = result[0];
  return hasExecutionBoundary(value) || isForkedCompletion(value) ||
    isReturnValue(value) || isThrownValue(value) || isBreakValue(value) ||
    isContinueValue(value) ? undefined : result[1];
}

export function inspect(node: any, budget: { remaining: number }): boolean {
  if (!node || typeof node !== "object") return true;
  if (--budget.remaining < 0) return false;
  // Abrupt/nested control needs a larger proof tree. Decline before executing
  // its speculative path; the ordinary loop still handles it.
  if (["ForStatement", "WhileStatement", "DoWhileStatement", "ForInStatement",
    "ForOfStatement", "ReturnStatement", "ThrowStatement", "BreakStatement",
    "ContinueStatement", "CallExpression", "NewExpression", "FunctionExpression",
    "ArrowFunctionExpression"].includes(node.type)) return false;
  return Object.keys(node).every(key => {
    if (key === "loc" || key === "start" || key === "end") return true;
    const child = node[key];
    return Array.isArray(child) ? child.every(item => inspect(item, budget)) :
      child && typeof child === "object" ? inspect(child, budget) : true;
  });
}

export function guardedHeader(ast: ESTree.ForStatement):
  { indexName: string; arrayName: string } | undefined {
  const test = ast.test;
  if (!test || test.type !== "BinaryExpression" || test.operator !== "<" ||
      test.left.type !== "Identifier" || test.right.type !== "MemberExpression" ||
      test.right.computed || test.right.object.type !== "Identifier" ||
      test.right.property.type !== "Identifier" || test.right.property.name !== "length") return undefined;
  return { indexName: test.left.name, arrayName: test.right.object.name };
}

export function localEnvironments(context: TExecutionContext): Set<Environment> | undefined {
  const result = new Set<Environment>();
  for (let env: Environment | undefined = context.value.environment; env; env = env.parent) {
    if (result.size >= maximumProofEnvironments) return undefined;
    result.add(env);
    if (env.kind === "function") return result;
  }
  return undefined;
}

function cloneSnapshotAliases(context: TExecutionContext, array: SymbolicNumberArray):
  { context: TExecutionContext; array: SymbolicNumberArray } {
  const source = array.shape.sequence;
  const sequence: SymbolicSequence = { ...source, reads: new Map(source.reads),
    indexedReads: new Map(Array.from(source.indexedReads, ([index, offsets]) =>
      [index, new Map(offsets)])) };
  const clones = new Map<Any, SymbolicNumberArray>();
  const clone = (value: Any): Any => {
    const shape = getSymbolicArrayShape(value, context);
    if (!shape || shape.sequence !== source) return value;
    if (clones.has(value)) return clones.get(value)!;
    const copied = { ...value, shape: { ...shape, sequence },
      properties: { ...(value as SymbolicNumberArray).properties } } as SymbolicNumberArray;
    clones.set(value, copied);
    return copied;
  };
  const environments = new Map(context.value.environments);
  let inspectedBindings = 0;
  environments.forEach((record, environment) => {
    let changed: Map<string, Binding> | undefined;
    record.forEach((binding, name) => {
      if (++inspectedBindings > maximumProofBindings) decline();
      const copied = clone(binding.value);
      if (copied !== binding.value) {
        if (!changed) changed = new Map(record);
        changed.set(name, { ...binding, value: copied });
      }
    });
    if (changed) environments.set(environment, changed);
  });
  return { context: ExecutionContext({ ...context.value, environments,
    heap: new Map(context.value.heap || []),
    evaluationBudget: { remaining: maximumProofBudget } }),
    array: clone(array) as SymbolicNumberArray };
}

export function proofContext(reached: TExecutionContext, array: SymbolicNumberArray):
  { context: TExecutionContext; array: SymbolicNumberArray } | undefined {
  const locals = localEnvironments(reached);
  if (!locals) return undefined;
  if (reached.value.environments.size > maximumProofEnvironments) decline();
  if ((reached.value.heap || new Map()).size > maximumProofHeapEntries) decline();
  const copied = cloneSnapshotAliases(reached, array);
  const baseline = copied.context.value.effects;
  const context = ExecutionContext({ ...copied.context.value,
    validateBinding: (environment: Environment, _name: string) => {
      if (reached.value.environments.has(environment) && !locals.has(environment)) decline();
    },
    validateRead: (object: Any, name: string, current: TExecutionContext) => {
      const shape = getSymbolicArrayShape(object, current);
      if (!shape || shape.sequence !== copied.array.shape.sequence ||
          name !== "length" && name !== "<symbolic-index>" && !/^(0|[1-9][0-9]*)$/.test(name)) decline();
    },
    interceptCall: () => decline()
  });
  // The baseline is checked after each speculative phase, never published.
  if (context.value.effects !== baseline) decline();
  return { context, array: copied.array };
}

export function pure(before: TExecutionContext, after: TExecutionContext): boolean {
  if (after.value.effects !== before.value.effects) return false;
  const original = before.value.heap || new Map();
  const current = after.value.heap || new Map();
  if (original.size !== current.size) return false;
  for (const [object, entry] of original) if (current.get(object) !== entry) return false;
  return true;
}

function unchangedExcept(before: TExecutionContext, after: TExecutionContext,
  allowed: Set<Environment>, index: Slot, carried: Slot): boolean {
  let inspectedBindings = 0;
  for (const [environment, record] of before.value.environments) {
    const current = after.value.environments.get(environment);
    if (!current || current.size !== record.size) return false;
    for (const [name, binding] of record) {
      if (++inspectedBindings > maximumProofBindings) return false;
      const now = current.get(name);
      if (!now) return false;
      if (now.value !== binding.value || now.initialized !== binding.initialized ||
          now.kind !== binding.kind || now.mutable !== binding.mutable) {
        if (!allowed.has(environment) || !(environment === index.environment && name === index.name) &&
            !(environment === carried.environment && name === carried.name)) return false;
      }
    }
  }
  return true;
}

function choiceMembers(value: TESNumber, old: TESNumber, picked: TESNumber,
  knowledge: Knowledge, depth = 0): boolean {
  if (depth > 8) return false;
  const choice = choiceOf(value);
  if (!choice) return strictEquality(value, old, knowledge).value === true ||
    strictEquality(value, picked, knowledge).value === true;
  const yes = [...knowledge, { kind: "truth" as "truth", condition: choice.condition, truth: true }];
  const no = [...knowledge, { kind: "truth" as "truth", condition: choice.condition, truth: false }];
  return isESNumber(choice.consequent) && isESNumber(choice.alternate) &&
    choiceMembers(choice.consequent, old, picked, yes, depth + 1) &&
    choiceMembers(choice.alternate, old, picked, no, depth + 1);
}

function freshCarry(candidates: Candidate[], shape: SymbolicNumberArray,
  index: TESNumber, bounds: { lower: number; upper: number } | undefined): TESNumber {
  const carry = ESNumber();
  const prefix: CollectionRegion = { id: shape.shape.sequence.id, start: 0,
    end: { base: index, offset: 0 } };
  const facts: Fact[] = [];
  if (candidates.includes("finite")) facts.push({ kind: "finite", subject: carry });
  if (candidates.includes("range") && bounds) facts.push(
    { kind: "order", left: ESNumber(bounds.lower), right: carry, strict: false },
    { kind: "order", left: carry, right: ESNumber(bounds.upper), strict: false });
  if (candidates.includes("member")) facts.push({ kind: "member", collection: prefix, element: carry });
  for (const direction of ["lower", "upper"] as Direction[]) if (candidates.includes(direction)) {
    facts.push({ kind: "every-element-order", collection: prefix, bound: carry, direction });
  }
  carry.knowledge = facts;
  return carry;
}

function nextCandidates(candidates: Candidate[], result: TESNumber,
  old: TESNumber, picked: TESNumber, context: TExecutionContext,
  bounds: { lower: number; upper: number } | undefined): Candidate[] {
  const knowledge = context.value.knowledge || [];
  return candidates.filter(candidate => {
    if (candidate === "finite") return isFiniteNumber(result, knowledge);
    if (candidate === "range") return !!bounds &&
      compareNumbers(ESNumber(bounds.lower), result, "<=", knowledge).value === true &&
      compareNumbers(result, ESNumber(bounds.upper), "<=", knowledge).value === true;
    if (candidate === "member") return choiceMembers(result, old, picked, knowledge);
    return compareNumbers(result, old, candidate === "lower" ? "<=" : ">=", knowledge).value === true &&
      compareNumbers(result, picked, candidate === "lower" ? "<=" : ">=", knowledge).value === true;
  });
}

export function trySummarizeUnknownLengthLoop(
  ast: ESTree.ForStatement, reached: TExecutionContext,
  copyIterationEnvironment: (current: TExecutionContext) => BranchResult
): TExecutionContext | undefined {
  const header = guardedHeader(ast);
  if (!header || !ast.update || !inspect(ast.body, { remaining: maximumProofNodes }) ||
      !inspect(ast.update, { remaining: maximumProofNodes })) return undefined;
  try {
    const arraySlot = slot(reached, header.arrayName), indexSlot = slot(reached, header.indexName);
    if (!arraySlot || !indexSlot || !isESNumber(indexSlot.binding.value) ||
        indexSlot.binding.value.value !== 1) return undefined;
    const originalArray = arraySlot.binding.value;
    const shape = getSymbolicArrayShape(originalArray, reached);
    if (!shape || shape.offset !== 0 || shape.minimumLength < 1 ||
        shape.minimumLength === shape.maximumLength) return undefined;
    const array = originalArray as SymbolicNumberArray;
    // The real initializer must already have performed this read. Looking up
    // its cached identity avoids creating an element in the caller on a
    // declined proof attempt.
    const first = shape.sequence.reads.get(0);
    if (!isESNumber(first) || !isFiniteNumber(shape.sequence.element)) return undefined;
    const locals = localEnvironments(reached);
    if (!locals) return undefined;
    const candidates: Slot[] = [];
    for (const environment of locals) {
      const record = reached.value.environments.get(environment);
      if (!record) continue;
      for (const [name, binding] of record) {
        if (binding.mutable && binding.value === first &&
            !(environment === indexSlot.environment && name === indexSlot.name)) {
          candidates.push({ environment, name, binding });
        }
      }
    }
    if (!candidates.length || candidates.length > maximumCarrySlots) return undefined;
    const length = array.properties.length;
    const elementBounds = numberBounds(shape.sequence.element);
    const bounds = elementBounds.lower && elementBounds.upper &&
      Number.isFinite(elementBounds.lower.value) && Number.isFinite(elementBounds.upper.value)
      ? { lower: elementBounds.lower.value, upper: elementBounds.upper.value } : undefined;
    candidateLoop: for (const carried of candidates) {
      let retained: Candidate[] = ["member", "finite", "lower", "upper"];
      if (bounds) retained.push("range");
      if (retained.length > maximumCandidates) return undefined;
      for (let pass = 0; pass <= maximumCandidates; pass++) {
        const privateState = proofContext(reached, array);
        if (!privateState) return undefined;
        let proof = privateState.context;
        const privateArray = privateState.array;
        const k = ESNumber();
        k.knowledge = [
          { kind: "integer", subject: k }, { kind: "finite", subject: k },
          { kind: "order", left: ESNumber(1), right: k, strict: false },
          { kind: "order", left: k, right: ESNumber(0xfffffffe), strict: false }
        ];
        const carry = freshCarry(retained, privateArray, k, bounds);
        proof = replace(replace(proof, indexSlot, k), carried, carry);
        proof = ExecutionContext({ ...proof.value, knowledge: (proof.value.knowledge || []).concat(
          { kind: "order", left: k, right: length, strict: true }) });
        const test = evaluate(ast.test!, proof);
        const tested = normal(test);
        if (!tested || (test[0] as any).value !== true || !pure(proof, tested)) return undefined;
        const picked = readSymbolicIndex(privateArray, k, tested);
        if (!isESNumber(picked)) return undefined;
        const body = evaluate(ast.body, tested);
        const afterBody = normal(body);
        if (!afterBody || !pure(proof, afterBody)) return undefined;
        const copied = copyIterationEnvironment(afterBody);
        const afterCopy = normal(copied);
        if (!afterCopy || !pure(proof, afterCopy)) return undefined;
        const update = evaluate(ast.update!, afterCopy);
        const afterUpdate = normal(update);
        if (!afterUpdate || !pure(proof, afterUpdate)) return undefined;
        const copiedIndex = slot(afterCopy, header.indexName);
        if (!copiedIndex || !unchangedExcept(afterCopy, afterUpdate,
          new Set([...locals, afterCopy.value.environment]), copiedIndex, carried)) continue candidateLoop;
        const nextIndex = slot(afterUpdate, header.indexName);
        if (!nextIndex || !isESNumber(nextIndex.binding.value)) return undefined;
        const successor = exactIntegerEndpoint(nextIndex.binding.value, afterUpdate.value.knowledge || []);
        if (!successor || successor.base !== k || successor.offset !== 1) return undefined;
        const next = valueAt(afterUpdate, carried);
        if (!isESNumber(next) || !unchangedExcept(proof, afterUpdate, locals, indexSlot, carried))
          continue candidateLoop;
        const reduced = nextCandidates(retained, next, carry, picked, afterUpdate, bounds);
        if (reduced.length === retained.length) {
          const exitState = proofContext(reached, array);
          if (!exitState) return undefined;
          const exitHead = replace(exitState.context, indexSlot, length);
          const exitTest = evaluate(ast.test!, exitHead);
          const afterExit = normal(exitTest);
          if (!afterExit || (exitTest[0] as any).value !== false || !pure(exitHead, afterExit)) return undefined;
          // A verified identity transition changes only the index. Keep the
          // actual initialized value, including all its exact read identity.
          if (next === carry) return replace(reached, indexSlot, length);
          const result = ESNumber();
          const facts: Fact[] = [];
          if (retained.includes("finite")) facts.push({ kind: "finite", subject: result });
          if (retained.includes("range") && bounds) facts.push(
            { kind: "order", left: ESNumber(bounds.lower), right: result, strict: false },
            { kind: "order", left: result, right: ESNumber(bounds.upper), strict: false });
          if (retained.includes("member")) facts.push({ kind: "member",
            collection: symbolicArrayRegion(array)!, element: result });
          const actual = symbolicActualArrayRegion(array, reached);
          if (!actual) return undefined;
          for (const direction of ["lower", "upper"] as Direction[]) if (retained.includes(direction)) {
            facts.push({ kind: "every-element-order", collection: actual, bound: result, direction });
          }
          result.knowledge = facts;
          // Publish only the proved current binding values. The real reached
          // heap, effects, prior output and caller evaluation budget survive.
          return replace(replace(reached, indexSlot, length), carried, result);
        }
        retained = reduced;
      }
    }
  } catch (_error) {
    // The private attempt is disposable. Ordinary execution from the reached
    // context still reports its actual guest error, effect or boundary.
  }
  return undefined;
}
