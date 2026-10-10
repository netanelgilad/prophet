import { ESTree } from "cherow";
import { evaluate, mapCompletions, bindNormal } from "../evaluate";
import { mergeBranchResults, assumeInContext, BranchResult } from "../execution-context/branches";
import { ExecutionBoundary, ForkedCompletion, isExecutionBoundary, isForkedCompletion } from "../execution-context/Completion";
import {
  UnsupportedAnalysisError, ExecutionBudgetError, analysisFailureContext
} from "../execution-context/analysis-failure";
import {
  TExecutionContext, ExecutionContext, enterEnvironment, setEnvironment,
  declareBinding
} from "../execution-context/ExecutionContext";
import { readBinding } from "../execution-context/bindings";
import { boundNames } from "../Function/binding-patterns";
import { coerceToBoolean } from "../boolean/ESBoolean";
import { resolveBoolean } from "../symbolic";
import {
  Any, TESBoolean, Undefined, isReturnValue, isThrownValue, isBreakValue, isContinueValue
} from "../types";
import { tuple } from "@deaven/tuple";

// Bounded ordinary ForStatement following the ECMA ForStatement evaluation,
// ForBodyEvaluation, CreatePerIterationEnvironment and LoopContinues
// algorithms (unlabeled break/continue only):
// https://tc39.es/ecma262/multipage/ecmascript-language-statements-and-declarations.html#sec-for-statement-runtime-semantics-evaluation
//
// Initialization runs once; the test guards each body; the update runs after
// a normal body or an applicable continue, never after break/return/throw.
// An omitted test is true. Nested loops consume their own unlabeled jumps:
// the driver converts its own break leaves to normal completion and never
// leaks jump completions to the caller. Statement completion values keep the
// existing residual (loops complete with Undefined); full eval-value semantics
// remain out of scope under LANG-003.
//
// Per-iteration environments follow CreatePerIterationEnvironment: let-bound
// names are copied into a fresh sibling environment before the first test and
// before each update, so initialization, body and update closures observe
// exactly their own cells. const names are not copied; var names keep their
// existing hoisted identity. TDZ reads throw through the shared bindings.
//
// Ordinary iterations advance through an explicit host loop over a frontier
// tree, never through a recursive call per iteration: only genuine forks
// consume host recursion, one level per fork nesting (mirroring the shared
// bounded forEach traversal). Host work is bounded two ways. Each active path
// carries its own remaining ordinary-body-entry count in persistent context
// state, so sibling paths do not consume each other's iterations. A shared
// step counter per loop evaluation additionally caps total advances, so
// adversarial fork-per-iteration shapes cannot evade the per-path limit by
// multiplying paths. Reaching either cap retains the actual unfinished
// context as a typed budget boundary beside completed siblings; a cap never
// implies termination.
const maximumForIterations = 1024;
const maximumForSteps = 4096;

function budgetBoundary(message: string): ExecutionBoundary {
  return { type: "ExecutionBoundary", kind: "budget", message, frames: [], pendingStatements: [] };
}

type Phase = "init" | "copy0" | "test" | "body" | "copy" | "update";

type Frontier =
  | { kind: "fork"; condition: TESBoolean; base: TExecutionContext; consequent: Frontier; alternate: Frontier }
  | { kind: "active"; phase: Phase; context: TExecutionContext }
  | { kind: "done"; result: BranchResult };

// Only the declaration patterns with shared binding support may initialize a
// loop scope. Anything else stops explicitly before any binding or effect,
// reusing the supported object patterns without adding new destructuring.
function assertSupportedLoopPattern(declaration: ESTree.VariableDeclaration): void {
  const check = (pattern: ESTree.Pattern): void => {
    if (pattern.type === "Identifier") return;
    if (pattern.type === "AssignmentPattern") return check(pattern.left);
    if (pattern.type === "ObjectPattern") {
      for (const property of pattern.properties) {
        if (property.type !== "Property") {
          throw new UnsupportedAnalysisError("For loop object binding rest properties are not yet supported");
        }
        check(property.value as ESTree.Pattern);
      }
      return;
    }
    throw new UnsupportedAnalysisError("For loop array and rest binding patterns are not yet supported");
  };
  declaration.declarations.forEach(candidate => check(candidate.id));
}

export function evaluateForStatement(ast: ESTree.ForStatement, context: TExecutionContext): BranchResult {
  const outer = context.value.environment;
  const savedLoopBudget = context.value.loopBudget;
  let sharedSteps = 0;

  const declaration = ast.init && ast.init.type === "VariableDeclaration" ? ast.init : undefined;
  const lexical = declaration && declaration.kind !== "var" ? declaration : undefined;
  if (lexical) assertSupportedLoopPattern(lexical);
  const perIterationLets: string[] = [];
  if (lexical && lexical.kind === "let") {
    for (const candidate of lexical.declarations) {
      for (const name of boundNames(candidate.id)) perIterationLets.push(name);
    }
  }

  let initial = context;
  if (lexical) {
    let loop = enterEnvironment(context, "block");
    for (const candidate of lexical.declarations) {
      for (const name of boundNames(candidate.id)) {
        loop = declareBinding(loop, name, lexical.kind);
      }
    }
    initial = loop;
  }

  // Copy the current iteration bindings into a fresh sibling environment, as
  // CreatePerIterationEnvironment does. The update then runs in the new cells
  // while body closures keep the old ones. TDZ and conditional-initialization
  // reads flow through the shared binding read, so they throw or fork exactly
  // like any other read instead of inventing values.
  const copyIterationEnvironment = (current: TExecutionContext): BranchResult => {
    if (!perIterationLets.length) return tuple(Undefined, current);
    const readAll = (index: number, values: Any[], started: TExecutionContext): BranchResult => {
      if (index === perIterationLets.length) {
        let next = enterEnvironment(started, "block", outer);
        perIterationLets.forEach((name: string, position: number) => {
          next = declareBinding(next, name, "let", true, values[position]);
        });
        return tuple(Undefined, next);
      }
      return bindNormal(readBinding(started, perIterationLets[index]), (value, after) =>
        readAll(index + 1, values.concat([value]), after));
    };
    return readAll(0, [], current);
  };

  // Branch a single test value, deferring the merge like statement sequences
  // do: each side keeps its enriched path knowledge while it runs, and the
  // recorded condition/base join the completed sides when the tree collapses.
  const branchTest = (testValue: Any, base: TExecutionContext): Frontier => {
    const condition = coerceToBoolean(testValue, base.value.knowledge);
    const decide = (known: boolean | undefined): Frontier => {
      if (known !== undefined) {
        const branch = assumeInContext(base, condition, known);
        return known
          ? { kind: "active", phase: "body", context: branch }
          : { kind: "done", result: tuple(Undefined, setEnvironment(branch, outer)) };
      }
      const yesContext = assumeInContext(base, condition, true);
      const noContext = assumeInContext(base, condition, false);
      return { kind: "fork", condition, base,
        consequent: { kind: "active", phase: "body", context: yesContext },
        alternate: { kind: "done", result: tuple(Undefined, setEnvironment(noContext, outer)) } };
    };
    // Boolean coercion of the values this driver handles is pure; the guard
    // below only preserves a classified stop if a future operand can produce
    // one, retaining the reached branch context rather than the loop entry.
    try {
      return decide(resolveBoolean(condition, base.value.knowledge || []));
    } catch (error) {
      if (!(error instanceof UnsupportedAnalysisError) && !(error instanceof ExecutionBudgetError)) throw error;
      const checkpoint = analysisFailureContext(error) || base;
      const boundary: ExecutionBoundary = { type: "ExecutionBoundary",
        kind: error.kind, message: error.message, frames: [], pendingStatements: [] };
      return { kind: "done", result: tuple(boundary, checkpoint) };
    }
  };

  const isDoneValue = (value: Any): boolean =>
    isExecutionBoundary(value) || isThrownValue(value) || isReturnValue(value) ||
    isBreakValue(value) || isContinueValue(value);

  // Expand one evaluated phase result into the frontier. Forks keep their own
  // condition and base for the final honest join; single leaves classify under
  // the phase that produced them. Test values decide the branch here so the
  // exit side never masquerades as another body entry.
  const expand = (evaluated: BranchResult, phase: Phase): Frontier => {
    const value = evaluated[0];
    if (isForkedCompletion(value)) {
      const forked = value as ForkedCompletion;
      return { kind: "fork", condition: forked.condition, base: forked.base,
        consequent: expand(forked.consequent, phase), alternate: expand(forked.alternate, phase) };
    }
    if (phase === "test") {
      if (isDoneValue(value)) return { kind: "done", result: evaluated };
      // An omitted test is true: enter the body directly instead of deciding
      // an Undefined test value (which would correctly be false).
      if (!ast.test) return { kind: "active", phase: "body", context: evaluated[1] };
      return branchTest(value, evaluated[1]);
    }
    if (phase === "body") {
      if (isBreakValue(value)) {
        return { kind: "done", result: tuple(Undefined, setEnvironment(evaluated[1], outer)) };
      }
      // Continue advances to the per-iteration copy and update; only return,
      // throw and stops finish the loop from the body.
      if (isContinueValue(value)) return { kind: "active", phase: "copy", context: evaluated[1] };
    }
    if (isDoneValue(value)) return { kind: "done", result: evaluated };
    const next: Phase = phase === "init" ? "copy0" : phase === "copy0" ? "test" :
      phase === "body" ? "copy" : phase === "copy" ? "update" : "test";
    return { kind: "active", phase: next, context: evaluated[1] };
  };

  const evaluatePhase = (phase: Phase, current: TExecutionContext): BranchResult => {
    if (phase === "init") return ast.init ? evaluate(ast.init, current) : tuple(Undefined, current);
    if (phase === "copy0" || phase === "copy") return copyIterationEnvironment(current);
    if (phase === "test") return ast.test ? evaluate(ast.test, current) : tuple(Undefined, current);
    if (phase === "update") return ast.update ? evaluate(ast.update, current) : tuple(Undefined, current);
    const remaining = current.value.loopBudget ? current.value.loopBudget.remaining : maximumForIterations;
    if (remaining <= 0) {
      return tuple(budgetBoundary("For loop exceeded its per-path iteration budget"), current);
    }
    if (++sharedSteps > maximumForSteps) {
      return tuple(budgetBoundary("For loop exceeded its shared evaluation step budget"), current);
    }
    const budgeted = ExecutionContext({ ...current.value, loopBudget: { remaining: remaining - 1 } });
    return evaluate(ast.body, budgeted);
  };

  // Advance the leftmost active leaf one phase and splice the expansion back
  // in place, preserving every recorded fork. Ordinary paths stay iterative;
  // only fork nesting consumes host recursion here.
  const advanceOne = (frontier: Frontier): [Frontier, boolean] => {
    if (frontier.kind === "done") return [frontier, false];
    if (frontier.kind === "active") return [expand(evaluatePhase(frontier.phase, frontier.context), frontier.phase), true];
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
    throw new Error("For loop frontier still holds an active leaf after its budgets were exhausted");
  };

  // Restore the caller's per-path loop budget on every leaf, including stops:
  // nested loops must not consume or donate outer iterations. Guest scope and
  // environment restoration stays with the outer mapCompletions below, which
  // stops skip so unfinished contexts survive intact.
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

  const entered = ExecutionContext({ ...initial.value, loopBudget: { remaining: maximumForIterations } });
  let frontier: Frontier = { kind: "active", phase: "init", context: entered };
  for (;;) {
    const [next, advanced] = advanceOne(frontier);
    frontier = next;
    if (!advanced) break;
  }
  const driven = collapse(frontier);
  // For declaration initializers the init phase evaluates in the loop scope
  // prepared above; expression initializers run in the outer scope. Either way
  // the init value is discarded and normal leaves start the loop, while abrupt
  // or stopped leaves finish with the outer scope restored below.
  return mapCompletions(restoreLoopBudget(driven), (value, after) =>
    tuple(value, setEnvironment(after, outer)));
}
