import { Any, ESNumber, TESNumber, FunctionBinding, WithProperties, isESNumber } from "../types";
import { ExecutionContext, TExecutionContext, Environment, resolveBinding } from "../execution-context/ExecutionContext";
import { evaluateThrowableIterator } from "../evaluate";
import { getProperties } from "../execution-context/Heap";
import { functionDefinition, FunctionDefinition } from "./definition";
import { getSymbolicArrayShape, symbolicNumberArray, symbolicArrayRegion,
  readSymbolicIndex, sliceSymbolicArray } from "../array/symbolic";
import { getArrayPrototype } from "../array/Array";
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
function walkReferences(
  definition: FunctionDefinition,
  visit: (node: any, local: boolean, parent?: any, parentKey?: string) => void
): void {
  const variables = new Set<string>();
  definition.params.forEach(parameter => {
    if (parameter.type === "Identifier") variables.add(parameter.name);
  });
  const collectVariables = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression") return;
    if (node.type === "VariableDeclaration" && node.kind === "var") {
      node.declarations.forEach((declaration: any) => {
        if (declaration.id.type === "Identifier") variables.add(declaration.id.name);
      });
    }
    Object.keys(node).forEach(key => {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(collectVariables);
      else collectVariables(child);
    });
  };
  definition.statements.forEach(collectVariables);
  const lexicalNames = (statements: any[]): Set<string> => {
    const names = new Set<string>();
    statements.forEach(statement => {
      if (statement.type === "VariableDeclaration" && statement.kind !== "var") {
        statement.declarations.forEach((declaration: any) => {
          if (declaration.id.type === "Identifier") names.add(declaration.id.name);
        });
      }
      if (statement.type === "FunctionDeclaration" && statement.id) names.add(statement.id.name);
    });
    return names;
  };
  const walk = (node: any, scopes: Array<Set<string>>, parent?: any, parentKey?: string): void => {
    if (!node || typeof node !== "object") return;
    if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression") return;
    if (node.type === "BlockStatement") {
      const blockScopes = scopes.concat(lexicalNames(node.body));
      node.body.forEach((statement: any) => walk(statement, blockScopes, node, "body"));
      return;
    }
    if (node.type === "VariableDeclarator") {
      walk(node.init, scopes, node, "init");
      return;
    }
    if (node.type === "Identifier") {
      visit(node, scopes.some(scope => scope.has(node.name)), parent, parentKey);
      return;
    }
    Object.keys(node).forEach(key => {
      if (node.type === "MemberExpression" && key === "property" && !node.computed) return;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(item => walk(item, scopes, node, key));
      else walk(child, scopes, node, key);
    });
  };
  const scopes = [variables, lexicalNames(definition.statements)];
  definition.statements.forEach(statement => walk(statement, scopes));
}

function isRecursiveReference(
  definition: FunctionDefinition, fn: Any, context: TExecutionContext,
  node: any, local: boolean, parent?: any, parentKey?: string
): boolean {
  if (local || !parent || parent.type !== "CallExpression" || parentKey !== "callee") return false;
  const resolved = resolveBinding(context, node.name, definition.environment);
  return !!resolved && resolved.binding.initialized === true && resolved.binding.value === fn;
}

function eligible(definition: FunctionDefinition, fn: Any, context: TExecutionContext): boolean {
  let recursive = false;
  walkReferences(definition, (node, local) => {
    if (local) return;
    const resolved = resolveBinding(context, node.name, definition.environment);
    if (resolved && resolved.binding.initialized === true && resolved.binding.value === fn) recursive = true;
  });
  return recursive;
}

function validateDefinition(definition: FunctionDefinition, fn: Any, context: TExecutionContext): void {
  if (definition.params.length !== 1 || definition.params[0].type !== "Identifier") {
    unsupported("one identifier parameter is required");
  }
  const allowed = new Set([
    "BlockStatement", "IfStatement", "ReturnStatement", "VariableDeclaration",
    "VariableDeclarator", "ExpressionStatement", "EmptyStatement", "Identifier", "Literal",
    "MemberExpression", "CallExpression", "BinaryExpression", "LogicalExpression",
    "ConditionalExpression", "UnaryExpression", "AssignmentExpression", "UpdateExpression"
  ]);
  const inspect = (node: any, parent?: any, parentKey?: string): void => {
    if (!node || typeof node !== "object") return;
    if (typeof node.type === "string" && !allowed.has(node.type)) {
      unsupported(`syntax ${node.type} is outside the pure summary subset`);
    }
    if (node.type === "VariableDeclarator") {
      if (node.id.type !== "Identifier") unsupported("destructured declarations are unsupported");
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
      if (target.type !== "Identifier") {
        unsupported("writes outside local bindings are unsupported");
      }
    }
    Object.keys(node).forEach(key => {
      if (node.type === "MemberExpression" && key === "property" && !node.computed) return;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(item => inspect(item, node, key));
      else inspect(child, node, key);
    });
  };
  definition.statements.forEach(statement => inspect(statement));
  // Validate every reference before a cache lookup, including references on
  // paths that the current input will not execute. Otherwise a cached proof
  // could silently acquire a new mutable dependency.
  walkReferences(definition, (node, local, parent, key) => {
    const writing = parent && (parent.type === "UpdateExpression" ||
      (parent.type === "AssignmentExpression" && key === "left"));
    if (!local && writing) unsupported("writes outside local bindings are unsupported");
    if (!local && !isRecursiveReference(definition, fn, context, node, local, parent, key)) {
      unsupported(`captured binding ${node.name} is not a verified dependency`);
    }
  });
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
      validateBinding: (environment: Environment, name: string,
        current: TExecutionContext, access: "read" | "write") => {
        if (!caller.value.environments.has(environment)) return;
        const binding = current.value.environments.get(environment)!.get(name);
        if (access === "read" && binding && binding.initialized === true && binding.value === fn) return;
        unsupported(`captured binding ${name} is not a verified ${access} dependency`);
      },
      validateRead: (object: Any, name: string, current: TExecutionContext) => {
        // The sole inherited dependency is the guarded intrinsic slice field.
        if (object === getArrayPrototype() && name === "slice") return;
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
        if (callee === getArrayPrototype().properties.slice && receiver &&
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
    if (result[1].value.effects !== context.value.effects) {
      unsupported("the function performed an external effect");
    }
    // Restoring the caller's environment pointer must not hide writes to a
    // captured record. Fresh activation/block records are local proof state;
    // every record that existed before execution must remain unchanged.
    caller.value.environments.forEach((before, environment) => {
      const after = result[1].value.environments.get(environment);
      if (!after || after.size !== before.size) unsupported("the function changed a captured binding");
      before.forEach((binding, name) => {
        const observed = after!.get(name);
        if (!observed || observed.value !== binding.value ||
            observed.initialized !== binding.initialized ||
            observed.mutable !== binding.mutable || observed.kind !== binding.kind) {
          unsupported("the function changed a captured binding");
        }
      });
    });
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
  const input = args[0] as WithProperties;
  const properties = getProperties(input, context);
  const prototype = getArrayPrototype();
  const method = Object.prototype.hasOwnProperty.call(properties, "slice") ? properties.slice :
    input.prototype === prototype ? getProperties(prototype, context).slice : undefined;
  if (input.propertyAccess || input.unknownProperties || input.unmodeledPrototype ||
      (input.unmodeledPropertyReads || []).includes("slice") || method !== prototype.properties.slice) {
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
