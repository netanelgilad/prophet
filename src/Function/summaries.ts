import { Any, ESNumber, TESNumber, FunctionBinding, isESNumber, isFunction } from "../types";
import { ExecutionContext, TExecutionContext } from "../execution-context/ExecutionContext";
import { evaluateThrowableIterator } from "../evaluate";
import { getProperties } from "../execution-context/Heap";
import { functionDefinition, FunctionDefinition } from "./definition";
import { getSymbolicArrayShape, symbolicNumberArray, symbolicArrayRegion,
  readSymbolicIndex, sliceSymbolicArray } from "../array/symbolic";
import { slice } from "../array/slice";
import { compareNumbers, isFiniteNumber, notNaN, Fact } from "../symbolic";

type Candidate = "finite" | "notNaN" | "lower" | "upper";
export type InferredSummary = {
  facts: Candidate[];
  proof: { baseExecutions: number; stepExecutions: number; recursiveCalls: number };
  applications: number;
};
type CacheEntry = { template: TESNumber; summary: InferredSummary };
const cache = new WeakMap<object, CacheEntry[]>();

export function getInferredSummaries(fn: object): InferredSummary[] {
  return (cache.get(fn) || []).map(entry => ({
    facts: entry.summary.facts.slice(), proof: { ...entry.summary.proof },
    applications: entry.summary.applications
  }));
}

function unsupported(message: string): never {
  throw new Error(`Cannot verify recursive array summary: ${message}`);
}

// Inference is deliberately restricted to pure functions over one dense array.
// This is an eligibility check, not recognition of a particular algorithm. The
// actual body determines which candidate facts survive the proof below.
function eligible(definition: FunctionDefinition, fn: Any, context: TExecutionContext): boolean {
  let recursive = false;
  const scan = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (node.type === "Identifier" && context.value.scope[node.name] === fn) recursive = true;
    Object.keys(node).forEach(key => {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(scan);
      else scan(child);
    });
  };
  definition.statements.forEach(scan);
  return recursive;
}

function validateDefinition(definition: FunctionDefinition, fn: Any, context: TExecutionContext): void {
  if (definition.params.length !== 1 || definition.params[0].type !== "Identifier") {
    unsupported("one identifier parameter is required");
  }
  const parameter = (definition.params[0] as { name: string }).name;
  const locals = new Set([parameter]);
  const lexical = new Set<string>();
  const constants = new Set<string>();
  const allowed = new Set([
    "BlockStatement", "IfStatement", "ReturnStatement", "VariableDeclaration",
    "VariableDeclarator", "ExpressionStatement", "EmptyStatement", "Identifier", "Literal",
    "MemberExpression", "CallExpression", "BinaryExpression", "LogicalExpression",
    "ConditionalExpression", "UnaryExpression", "AssignmentExpression", "UpdateExpression"
  ]);
  const collect = (node: any, blockDepth = 0): void => {
    if (!node || typeof node !== "object") return;
    if (typeof node.type === "string" && !allowed.has(node.type)) {
      unsupported(`syntax ${node.type} is outside the pure summary subset`);
    }
    if (node.type === "VariableDeclaration" && node.kind !== "var") {
      if (blockDepth !== 0) unsupported("block-scoped declarations need lexical-environment support");
      node.declarations.forEach((declaration: any) => {
        lexical.add(declaration.id.name);
        if (node.kind === "const") constants.add(declaration.id.name);
      });
    }
    if (node.type === "VariableDeclarator") {
      if (node.id.type !== "Identifier") unsupported("destructured declarations are unsupported");
      if (locals.has(node.id.name)) unsupported("shadowed or repeated local declarations are unsupported");
      locals.add(node.id.name);
    }
    Object.keys(node).forEach(key => {
      const child = node[key];
      const depth = blockDepth + (node.type === "BlockStatement" ? 1 : 0);
      if (Array.isArray(child)) child.forEach(item => collect(item, depth));
      else collect(child, depth);
    });
  };
  definition.statements.forEach(statement => collect(statement));
  const initialized = new Set(Array.from(locals).filter(name => !lexical.has(name)));
  const inspect = (node: any, parent?: any, parentKey?: string): void => {
    if (!node || typeof node !== "object") return;
    if (node.type === "VariableDeclarator") {
      inspect(node.init);
      initialized.add(node.id.name);
      return;
    }
    if (node.type === "Identifier") {
      if (lexical.has(node.name) && !initialized.has(node.name)) {
        unsupported(`lexical binding ${node.name} is read before initialization`);
      }
      if (!locals.has(node.name)) {
        const recursiveCallee = context.value.scope[node.name] === fn && parent &&
          parent.type === "CallExpression" && parentKey === "callee";
        if (!recursiveCallee) unsupported(`captured binding ${node.name} is not a verified dependency`);
      }
    }
    if (node.type === "MemberExpression") {
      const name = node.computed
        ? node.property.type === "Literal" ? String(node.property.value) : undefined
        : node.property.name;
      const index = name !== undefined && /^(0|[1-9][0-9]*)$/.test(name) && Number(name) < 0xffffffff;
      const sliceCall = name === "slice" && parent &&
        parent.type === "CallExpression" && parentKey === "callee";
      if (name !== "length" && !index && !sliceCall) {
        unsupported("property dependencies beyond length, literal indices, and slice calls are unsupported");
      }
    }
    if (node.type === "AssignmentExpression" || node.type === "UpdateExpression") {
      const target = node.left || node.argument;
      if (target.type !== "Identifier" || !locals.has(target.name)) {
        unsupported("writes outside local bindings are unsupported");
      }
      if (constants.has(target.name)) unsupported("writes to const bindings are invalid");
    }
    Object.keys(node).forEach(key => {
      if (node.type === "MemberExpression" && key === "property" && !node.computed) return;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(item => inspect(item, node, key));
      else inspect(child, node, key);
    });
  };
  definition.statements.forEach(statement => inspect(statement));
}

function summaryValue(array: Any, candidates: Candidate[]): TESNumber {
  const result = ESNumber();
  const collection = symbolicArrayRegion(array)!;
  result.knowledge = candidates.map((candidate): Fact =>
    candidate === "finite" || candidate === "notNaN"
      ? { kind: candidate, subject: result }
      : { kind: "every-element-order", collection, bound: result, direction: candidate });
  return result;
}

function proves(candidate: Candidate, result: TESNumber, witnesses: TESNumber[], context: TExecutionContext): boolean {
  const knowledge = context.value.knowledge || [];
  if (candidate === "finite") return isFiniteNumber(result, knowledge);
  if (candidate === "notNaN") return notNaN(result, knowledge);
  return witnesses.every(witness => compareNumbers(result, witness,
    candidate === "lower" ? "<=" : ">=", knowledge).value === true);
}

function infer(fn: Any, template: TESNumber, caller: TExecutionContext): InferredSummary {
  const proof = { baseExecutions: 0, stepExecutions: 0, recursiveCalls: 0 };
  const execute = (input: Any, candidates: Candidate[], base: boolean) => {
    const inputShape = getSymbolicArrayShape(input)!;
    const context = ExecutionContext({
      ...caller.value, knowledge: [], heap: new Map(),
      evaluationBudget: { remaining: 10000 },
      validateRead: (object: Any, _name: string, current: TExecutionContext) => {
        if (!getSymbolicArrayShape(object, current)) {
          unsupported("property reads require a verified symbolic array receiver");
        }
      },
      interceptCall: (callee: Any, args: Any[], current: TExecutionContext, receiver?: Any) => {
        if (callee === fn) {
          if (base) unsupported("the singleton case recurses instead of terminating");
          if (args.length !== 1) unsupported("recursive arguments do not match the input contract");
          const child = getSymbolicArrayShape(args[0], current);
          if (!child || child.sequence !== inputShape.sequence ||
              child.offset <= inputShape.offset || child.minimumLength < 1) {
            unsupported("recursive calls must receive a nonempty proper suffix of the input snapshot");
          }
          const parentLength = getProperties(input as any, current).length as TESNumber;
          const childLength = getProperties(args[0] as any, current).length as TESNumber;
          if (compareNumbers(childLength, parentLength, "<", current.value.knowledge).value !== true) {
            unsupported("strict length descent could not be established");
          }
          proof.recursiveCalls++;
          return [summaryValue(args[0], candidates), current] as [Any, TExecutionContext];
        }
        const binding = callee as FunctionBinding;
        if (binding.function && binding.function.implementation === slice && receiver &&
            getSymbolicArrayShape(receiver, current)) return undefined;
        unsupported("a call has no verified pure semantics");
      }
    });
    const result = evaluateThrowableIterator((fn as FunctionBinding).function.implementation(
      caller.value.global, [input], context));
    if (!isESNumber(result[0])) unsupported("all paths must return a number");
    if (result[1].value.heap && result[1].value.heap.size !== 0) {
      unsupported("the function changed object state");
    }
    const before = caller.value.scope, after = result[1].value.scope;
    if (Object.keys(after).length !== Object.keys(before).length ||
        Object.keys(before).some(name => before[name] !== after[name])) {
      unsupported("the function changed a captured binding");
    }
    return result as [TESNumber, TExecutionContext];
  };

  const singleton = symbolicNumberArray({ element: template, minimumLength: 1, maximumLength: 1 });
  proof.baseExecutions++;
  const base = execute(singleton, [], true);
  const head = readSymbolicIndex(singleton, 0, base[1]) as TESNumber;
  let candidates: Candidate[] = ["finite", "notNaN", "lower", "upper"];
  candidates = candidates.filter(candidate => proves(candidate, base[0], [head], base[1]));

  // Start with facts discovered from real singleton execution, not a promised
  // meaning for a named function. Remove unproved hypotheses and recheck using
  // only those that remain. Nothing enters the cache before this stabilizes.
  for (let iteration = 0; iteration <= 4; iteration++) {
    const input = symbolicNumberArray({ element: template, minimumLength: 2 });
    proof.stepExecutions++;
    const step = execute(input, candidates, false);
    const first = readSymbolicIndex(input, 0, step[1]) as TESNumber;
    const suffix = sliceSymbolicArray(input, 1, step[1]);
    const witness = ESNumber();
    witness.knowledge = [
      { kind: "finite", subject: witness },
      { kind: "member", collection: symbolicArrayRegion(suffix)!, element: witness }
    ];
    const retained = candidates.filter(candidate => proves(candidate, step[0], [first, witness], step[1]));
    if (retained.length === candidates.length) return { facts: retained, proof, applications: 0 };
    candidates = retained;
  }
  return unsupported("candidate refinement did not stabilize");
}

export function summarizeCall(fn: Any, args: Any[], context: TExecutionContext): [Any, TExecutionContext] | undefined {
  const definition = functionDefinition(fn);
  if (!definition || !args.some(arg => !!getSymbolicArrayShape(arg, context)) ||
      !eligible(definition, fn, context)) return undefined;
  validateDefinition(definition, fn, context);
  if (args.length !== 1) unsupported("one array argument is required");
  const shape = getSymbolicArrayShape(args[0], context);
  if (!shape || shape.minimumLength < 1) unsupported("the input must be known nonempty");
  if (!isFiniteNumber(shape.sequence.element)) unsupported("the input element contract must exclude NaN and infinity");
  const method = getProperties(args[0] as any, context).slice;
  if (!isFunction(method) || method.implementation !== slice) {
    unsupported("the input does not have the trusted slice implementation");
  }
  const entries = cache.get(fn) || [];
  let entry = entries.find(item => item.template === shape.sequence.element);
  if (!entry) {
    entry = { template: shape.sequence.element, summary: infer(fn, shape.sequence.element, context) };
    cache.set(fn, entries.concat(entry));
  }
  entry.summary.applications++;
  return [summaryValue(args[0], entry.summary.facts), context];
}
