import { ESTree } from "cherow";
import { evaluate, mapCompletions, bindNormal } from "../evaluate";
import { mergeBranchResults, BranchResult, evaluateBranches } from "../execution-context/branches";
import { ExecutionBoundary, ForkedCompletion, isExecutionBoundary, isForkedCompletion } from "../execution-context/Completion";
import {
  UnsupportedAnalysisError, ExecutionBudgetError, analysisFailureContext
} from "../execution-context/analysis-failure";
import {
  TExecutionContext, ExecutionContext, enterEnvironment, setEnvironment, declareBinding
} from "../execution-context/ExecutionContext";
import { assignBinding, bindingReference, declareVar } from "../execution-context/bindings";
import { ownPropertyPresence } from "../execution-context/Heap";
import { withEnumerableOwnProperties } from "../Object/enumeration";
import { getObjectPrototype } from "../Object/prototype";
import { ESBoolean } from "../boolean/ESBoolean";
import { ESString } from "../string/String";
import { withMemberReference, assignMember } from "../ASTResolvers";
import {
  Any, TESBoolean, Undefined, WithProperties, isESNull, isUndefined,
  isReturnValue, isThrownValue, isBreakValue, isContinueValue, isESString
} from "../types";
import { tuple } from "@deaven/tuple";

// Bounded ordinary ForInStatement following the ECMA ForIn/OfHeadEvaluation
// (EnumerateObjectProperties) and ForInOfBodyEvaluation algorithms (unlabeled
// break/continue only):
// https://tc39.es/ecma262/multipage/ecmascript-language-statements-and-declarations.html#sec-for-in-and-for-of-statements
//
// The head expression runs once. Nullish heads complete with no iterations;
// strings contribute their UTF-16 indices; other primitives contribute none.
// The key list is a snapshot of the enumerable string keys of the object and
// its prototype chain, own keys before inherited, first occurrence winning
// (shadowed inherited keys are skipped), integer indices before insertion
// order inside each holder (the PropertyKeys model already orders so). Only
// the complete enumerable-data own-property domain enumerates; unmodeled
// descriptors or unknown keys stop as typed boundaries, never empty sets.
// The VM's Object.prototype contributes no enumerable keys natively, so the
// walk ends at it; objects with no internal link end the chain too.
//
// Visits follow the pinned native mutation semantics: the snapshot fixes
// which keys can be visited, so keys added during iteration are never
// visited; before each visit the key's presence is re-resolved along the
// current chain, so a key deleted before its visit is skipped while an
// inherited key revealed by deleting a shadowing own key is visited, and a
// deleted-then-readded key is visited (all pinned against Node 24.21.0).
//
// let/const heads get a fresh binding per iteration in its own environment,
// so closures capture distinct cells (pinned); var heads share one hoisted
// binding; identifier and member-expression heads assign through the shared
// binding/member machinery. Host work is bounded like the ForStatement
// driver: a per-path body-entry budget and a shared step cap, each retaining
// the actual unfinished context as a typed budget boundary. Statement
// completion values keep the residual (loops complete with Undefined); full
// eval-value semantics remain out of scope under LANG-003.
const maximumForInIterations = 1024;
const maximumForInSteps = 8192;

function budgetBoundary(message: string): ExecutionBoundary {
  return { type: "ExecutionBoundary", kind: "budget", message, frames: [], pendingStatements: [] };
}

type Phase = "bind" | "body";

type Frontier =
  | { kind: "fork"; condition: TESBoolean; base: TExecutionContext; consequent: Frontier; alternate: Frontier }
  | { kind: "active"; phase: Phase; head: Any; keys: ReadonlyArray<string>; index: number; context: TExecutionContext }
  | { kind: "done"; result: BranchResult };

// Re-resolve whether a snapshot key is still present along the chain: the
// first current holder wins, exactly the shadowing walk the snapshot used.
function presenceInChain(head: Any, key: string, context: TExecutionContext): BranchResult {
  if (isUndefined(head) || isESNull(head)) return tuple(ESBoolean(false), context);
  if (isESString(head)) {
    if (typeof head.value !== "string") throw new UnsupportedAnalysisError(
      "For-in presence checks on an unknown string are not yet supported");
    const index = Number(key);
    return tuple(ESBoolean(Number.isInteger(index) && index >= 0 && index < head.value.length), context);
  }
  const object = head as WithProperties;
  return evaluateBranches(ownPropertyPresence(object, key, context), context,
    present => tuple(ESBoolean(true), present),
    absent => {
      const prototype = object.prototype;
      if (prototype === undefined || isESNull(prototype) || prototype === getObjectPrototype()) {
        return tuple(ESBoolean(false), absent);
      }
      return presenceInChain(prototype, key, absent);
    });
}

// Snapshot the chain's enumerable string keys, own before inherited, first
// occurrence winning. The continuation receives the deduplicated key list.
function withChainKeys(head: Any, context: TExecutionContext,
  continuation: (keys: ReadonlyArray<string>, context: TExecutionContext) => BranchResult): BranchResult {
  const walk = (current: Any, seen: ReadonlyArray<string>, walkContext: TExecutionContext): BranchResult => {
    if (isUndefined(current) || isESNull(current)) return continuation(seen, walkContext);
    if ((current as WithProperties) === getObjectPrototype()) return continuation(seen, walkContext);
    return withEnumerableOwnProperties(current, walkContext, (object, keys, after) => {
      const merged = seen.concat(keys.filter(key => !seen.includes(key)));
      const prototype = (object as WithProperties).prototype;
      if (prototype === undefined || isESNull(prototype)) return continuation(merged, after);
      return walk(prototype, merged, after);
    });
  };
  return walk(head, [], context);
}

export function evaluateForInStatement(ast: ESTree.ForInStatement, context: TExecutionContext): BranchResult {
  const outer = context.value.environment;
  const savedLoopBudget = context.value.loopBudget;
  let sharedSteps = 0;

  // Only single identifier declarations, plain identifiers and member
  // expressions may head the loop; anything else stops before any effect.
  const declaration = ast.left.type === "VariableDeclaration" ? ast.left : undefined;
  let declarationName: string | undefined;
  if (declaration) {
    if (declaration.declarations.length !== 1 || declaration.declarations[0].id.type !== "Identifier" ||
        declaration.declarations[0].init) {
      throw new UnsupportedAnalysisError("For-in declarations require exactly one identifier without an initializer");
    }
    declarationName = declaration.declarations[0].id.name;
  } else if (ast.left.type !== "Identifier" && ast.left.type !== "MemberExpression") {
    throw new UnsupportedAnalysisError("For-in binding patterns are not yet supported");
  }
  const lexical = declaration && declaration.kind !== "var";

  // Lexical heads run the head expression and every iteration inside a loop
  // declarative environment; each iteration then gets its own sibling with
  // the key prebound, so closures capture distinct cells.
  const loopStart = lexical ? enterEnvironment(context, "block") : context;
  // Lazily hoist a var head into scope the first time it is assigned, mirroring
  // how the shared declaration resolver treats plain var declarations.
  const assignableVar = (current: TExecutionContext, name: string): TExecutionContext =>
    declareVar(current, name);

  const bindKey = (key: string, current: TExecutionContext): BranchResult => {
    if (declaration && declaration.kind === "var") {
      const withDeclaration = assignableVar(current, declarationName!);
      const reference = bindingReference(withDeclaration, declarationName!);
      return bindNormal(assignBinding(withDeclaration, declarationName!, ESString(key), reference),
        (value, after) => tuple(value, after));
    }
    if (declaration) {
      let iteration = enterEnvironment(current, "block");
      iteration = declareBinding(iteration, declarationName!, declaration.kind, true, ESString(key));
      return tuple(ESString(key), iteration);
    }
    if (ast.left.type === "Identifier") {
      const name = (ast.left as ESTree.Identifier).name;
      const reference = bindingReference(current, name);
      return assignBinding(current, name, ESString(key), reference);
    }
    return withMemberReference(ast.left as ESTree.MemberExpression, current,
      (object, name, afterReference) => assignMember(object, name, ESString(key), afterReference));
  };

  const isDoneValue = (value: Any): boolean =>
    isExecutionBoundary(value) || isThrownValue(value) || isReturnValue(value) ||
    isBreakValue(value) || isContinueValue(value);

  const expand = (evaluated: BranchResult, leaf: Extract<Frontier, { kind: "active" }>): Frontier => {
    const value = evaluated[0];
    if (isForkedCompletion(value)) {
      const forked = value as ForkedCompletion;
      return { kind: "fork", condition: forked.condition, base: forked.base,
        consequent: expand(forked.consequent, leaf), alternate: expand(forked.alternate, leaf) };
    }
    if (leaf.phase === "body") {
      if (isBreakValue(value)) {
        return { kind: "done", result: tuple(Undefined, setEnvironment(evaluated[1], outer)) };
      }
      // Continue advances straight to the next key; only return, throw and
      // stops finish the loop from the body.
      if (isContinueValue(value)) {
        return nextKey({ ...leaf, index: leaf.index + 1, context: evaluated[1] });
      }
    }
    if (isDoneValue(value)) return { kind: "done", result: evaluated };
    if (leaf.phase === "bind") {
      const remaining = evaluated[1].value.loopBudget ? evaluated[1].value.loopBudget.remaining : maximumForInIterations;
      if (remaining <= 0) {
        return { kind: "done", result: tuple(
          budgetBoundary("For-in loop exceeded its per-path iteration budget"), evaluated[1]) };
      }
      const budgeted = ExecutionContext({ ...evaluated[1].value, loopBudget: { remaining: remaining - 1 } });
      return { kind: "active", phase: "body", head: leaf.head, keys: leaf.keys, index: leaf.index, context: budgeted };
    }
    // A normally completed body advances to the next key; re-seeking from the
    // same index would revisit the current key forever.
    return leaf.phase === "body"
      ? nextKey({ ...leaf, index: leaf.index + 1, context: evaluated[1] })
      : nextKey({ ...leaf, context: evaluated[1] });
  };

  // Advance to the next still-present snapshot key, skipping keys deleted
  // before their visit; the loop finishes when the snapshot is exhausted.
  const nextKey = (leaf: Extract<Frontier, { kind: "active" }>): Frontier => {
    const seek = (index: number, current: TExecutionContext): Frontier => {
      if (index >= leaf.keys.length) {
        return { kind: "done", result: tuple(Undefined, setEnvironment(current, outer)) };
      }
      const key = leaf.keys[index];
      let presence: BranchResult;
      try {
        presence = presenceInChain(leaf.head, key, current);
      } catch (error) {
        if (!(error instanceof UnsupportedAnalysisError) && !(error instanceof ExecutionBudgetError)) throw error;
        const checkpoint = analysisFailureContext(error) || current;
        const boundary: ExecutionBoundary = { type: "ExecutionBoundary",
          kind: error.kind, message: error.message, frames: [], pendingStatements: [] };
        return { kind: "done", result: tuple(boundary, checkpoint) };
      }
      const value = presence[0];
      if (isForkedCompletion(value)) {
        const forked = value as ForkedCompletion;
        return { kind: "fork", condition: forked.condition, base: forked.base,
          consequent: seekFrom(forked.consequent, index), alternate: seekFrom(forked.alternate, index) };
      }
      if (isExecutionBoundary(value) || isThrownValue(value) || isReturnValue(value)) {
        return { kind: "done", result: presence };
      }
      const decided = (value as TESBoolean).value;
      if (decided !== true) return seek(index + 1, presence[1]);
      return { kind: "active", phase: "bind", head: leaf.head, keys: leaf.keys, index, context: presence[1] };
    };
    const seekFrom = (node: BranchResult, index: number): Frontier => {
      const value = node[0];
      if (isForkedCompletion(value)) {
        return { kind: "fork", condition: value.condition, base: value.base,
          consequent: seekFrom(value.consequent, index), alternate: seekFrom(value.alternate, index) };
      }
      if (isExecutionBoundary(value) || isThrownValue(value) || isReturnValue(value)) {
        return { kind: "done", result: node };
      }
      const decided = (value as TESBoolean).value;
      if (decided !== true) return seek(index + 1, node[1]);
      return { kind: "active", phase: "bind", head: leaf.head, keys: leaf.keys, index, context: node[1] };
    };
    return seek(leaf.index, leaf.context);
  };

  const evaluatePhase = (leaf: Extract<Frontier, { kind: "active" }>): BranchResult => {
    if (leaf.phase === "bind") return bindKey(leaf.keys[leaf.index], leaf.context);
    return evaluate(ast.body, leaf.context);
  };

  const stopAllActives = (frontier: Frontier): Frontier => {
    if (frontier.kind === "done") return frontier;
    if (frontier.kind === "active") {
      return { kind: "done", result: tuple(
        budgetBoundary("For-in loop exceeded its shared evaluation step budget"), frontier.context) };
    }
    return { kind: "fork", condition: frontier.condition, base: frontier.base,
      consequent: stopAllActives(frontier.consequent), alternate: stopAllActives(frontier.alternate) };
  };

  const advanceOne = (frontier: Frontier): [Frontier, boolean] => {
    sharedSteps++;
    if (frontier.kind === "done") return [frontier, false];
    if (frontier.kind === "active") {
      return [expand(evaluatePhase(frontier), frontier), true];
    }
    const [consequent, advancedConsequent] = advanceOne(frontier.consequent);
    if (advancedConsequent) {
      return [{ kind: "fork", condition: frontier.condition, base: frontier.base,
        consequent, alternate: frontier.alternate }, true];
    }
    const [alternate, advancedAlternate] = advanceOne(frontier.alternate);
    return [{ kind: "fork", condition: frontier.condition, base: frontier.base,
      consequent, alternate }, advancedAlternate];
  };

  const collapse = (frontier: Frontier): BranchResult => {
    if (frontier.kind === "done") return frontier.result;
    if (frontier.kind === "fork") {
      return mergeBranchResults(frontier.condition, frontier.base,
        collapse(frontier.consequent), collapse(frontier.alternate));
    }
    throw new Error("For-in frontier still holds an active leaf after its budgets were exhausted");
  };

  const restoreLoopBudget = (node: BranchResult): BranchResult => {
    const restore = (current: TExecutionContext): TExecutionContext => {
      if (savedLoopBudget === undefined) {
        if (current.value.loopBudget === undefined) return current;
        const value = { ...current.value };
        delete value.loopBudget;
        return ExecutionContext(value);
      }
      return ExecutionContext({ ...current.value, loopBudget: savedLoopBudget });
    };
    const value = node[0];
    if (isForkedCompletion(value)) {
      return [{ ...value, consequent: restoreLoopBudget(value.consequent),
        alternate: restoreLoopBudget(value.alternate) }, restore(node[1])];
    }
    return [value, restore(node[1])];
  };

  // The head runs once; its value drives the snapshot. Symbolic heads and
  // unmodelable chains stop as typed boundaries from the shared helpers.
  const start: BranchResult = bindNormal(evaluate(ast.right, loopStart), (head, afterHead) =>
    withChainKeys(head, afterHead, (keys, afterKeys) => {
      const entered = ExecutionContext({ ...afterKeys.value, loopBudget: { remaining: maximumForInIterations } });
      let frontier: Frontier = nextKey({ kind: "active", phase: "bind", head, keys, index: 0, context: entered });
      for (;;) {
        if (sharedSteps >= maximumForInSteps) {
          frontier = stopAllActives(frontier);
          break;
        }
        const [next, advanced] = advanceOne(frontier);
        frontier = next;
        if (!advanced) break;
      }
      return collapse(frontier);
    }));

  return mapCompletions(restoreLoopBudget(start), (value, after) =>
    tuple(value, setEnvironment(after, outer)));
}
