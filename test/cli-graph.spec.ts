import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { encodeGraph, EncodedValue, GraphNode } from "../src/cli/graph";
import { createHostFunction, effectPaths } from "../src/effects";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { functionDefinition } from "../src/Function/definition";
import { ESObject } from "../src/Object";
import { Undefined } from "../src/types";

function reference(value: EncodedValue): string {
  if (value === null || typeof value !== "object" || !("ref" in value)) throw new Error("Expected graph reference");
  return value.ref;
}

function fields(node: GraphNode): { [name: string]: EncodedValue } {
  if (node.kind !== "record" && node.kind !== "execution-context" && node.kind !== "array") {
    throw new Error("Expected graph data entries");
  }
  const result: { [name: string]: EncodedValue } = Object.create(null);
  node.entries.forEach(([name, value]) => { result[name] = value; });
  return result;
}

test("graph references preserve cycles, shared identities, map keys and distinct empty identities", () => {
  const shared: { [name: string]: unknown } = { label: "shared" };
  shared.self = shared;
  const distinct = {};
  const graph = encodeGraph({ shared, alias: shared, map: new Map([[shared, distinct]]), distinct });

  expect(graph.roots.alias).toEqual(graph.roots.shared);
  expect(graph.roots.distinct).not.toEqual(graph.roots.shared);
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  expect(fields(byId.get(reference(graph.roots.shared))!).self).toEqual(graph.roots.shared);
  const map = byId.get(reference(graph.roots.map))!;
  expect(map.kind).toBe("map");
  if (map.kind !== "map") throw new Error("Expected map");
  expect(map.entries).toEqual([[graph.roots.shared, graph.roots.distinct]]);
  expect(encodeGraph({ shared, alias: shared, map: new Map([[shared, distinct]]), distinct })).toEqual(graph);
});

test("JSON-safe scalar tags distinguish undefined, NaN, infinities and negative zero", () => {
  const graph = encodeGraph({ missing: undefined, nan: NaN, positive: Infinity, negative: -Infinity,
    negativeZero: -0, zero: 0, nothing: null, yes: true, text: "value" });

  expect(JSON.parse(JSON.stringify(graph))).toEqual(graph);
  expect(graph.roots).toEqual({ missing: { primitive: "undefined" }, nan: { primitive: "NaN" },
    positive: { primitive: "Infinity" }, negative: { primitive: "-Infinity" },
    negativeZero: { primitive: "-0" }, zero: 0, nothing: null, yes: true, text: "value" });
  expect(graph.nodes).toEqual([]);
});

test("opaque native functions retain shared identity and enumerable data without exposing source", () => {
  function implementation() { throw new Error("this function must never be executed"); }
  Object.assign(implementation, { self: implementation });
  const graph = encodeGraph({ first: implementation, second: implementation });
  expect(graph.roots.first).toEqual(graph.roots.second);
  expect(graph.nodes).toEqual([{ id: reference(graph.roots.first), kind: "opaque-function",
    name: "implementation", entries: [["self", graph.roots.first]] }]);
});

test("array nodes preserve holes, explicit undefined, named properties and unusual property names", () => {
  const array: any[] = [];
  array.length = 4;
  array[1] = undefined;
  array[3] = "last";
  Object.defineProperty(array, "label", { value: "named", enumerable: true });
  Object.defineProperty(array, "__proto__", { value: array, enumerable: true });
  const graph = encodeGraph({ array });
  const node = graph.nodes.find(item => item.id === reference(graph.roots.array))!;

  expect(node.kind).toBe("array");
  if (node.kind !== "array") throw new Error("Expected array");
  expect(node.length).toBe(4);
  expect(node.entries).toEqual([["1", { primitive: "undefined" }], ["3", "last"],
    ["label", "named"], ["__proto__", graph.roots.array]]);
});

test("accessors are never invoked and unsupported symbols or object prototypes fail explicitly", () => {
  let reads = 0;
  const value = Object.defineProperty({}, "getter", {
    enumerable: true, get() { reads++; return "must not run"; }
  });
  expect(() => encodeGraph({ value })).toThrow("accessor");
  expect(reads).toBe(0);
  expect(() => encodeGraph({ value: Symbol("unsupported") })).toThrow("symbol");
  expect(() => encodeGraph({ value: { [Symbol("key")]: 1 } })).toThrow("symbol");
  expect(() => encodeGraph({ value: new Date(0) })).toThrow("prototype");
  expect(() => encodeGraph({ value: new Set([1]) })).toThrow("prototype");
});

test("interpreted closures retain definitions and lexical scope as graph metadata without native source", () => {
  const [, context] = evaluateCode(`
    function outer() {
      let retained = 4;
      return function inner() { return retained; };
    }
    const exported = outer();
  `, nodeInitialExecutionContext);
  const closure = context.value.scope.exported;
  const definition = functionDefinition(closure)!;
  expect(definition).toBeDefined();
  const graph = encodeGraph({ closure, lexicalEnvironment: definition.environment });
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const node = byId.get(reference(graph.roots.closure))!;
  expect(node.definition).toBeDefined();
  const definitionNode = byId.get(reference(node.definition!))!;
  expect(fields(definitionNode).environment).toEqual(graph.roots.lexicalEnvironment);
  expect(graph.nodes.some(item => item.kind === "opaque-function")).toBe(true);
  expect(JSON.stringify(graph)).not.toContain("function* (");
});

test("execution contexts retain semantic state and omit compatibility views and executable hooks", () => {
  const retained = ESObject({});
  const context = ExecutionContext({
    global: retained, thisValue: retained, scope: { retained },
    stderr: "legacy display", evaluationBudget: { remaining: 7 },
    interceptCall() { throw new Error("not executable in JSON"); },
    validateRead() { throw new Error("not executable in JSON"); }
  });
  const graph = encodeGraph({ context });
  const node = graph.nodes.find(item => item.id === reference(graph.roots.context))!;
  expect(node.kind).toBe("execution-context");
  const state = fields(node);
  expect(state.global).toEqual(state.thisValue);
  expect(state.environment).toBeDefined();
  expect(state.environments).toBeDefined();
  for (const omitted of ["scope", "stderr", "evaluationBudget", "interceptCall", "validateRead"]) {
    expect(Object.prototype.hasOwnProperty.call(state, omitted)).toBe(false);
  }
  expect(JSON.stringify(graph)).not.toContain("legacy display");
});

test("effect DAG serialization preserves shared prefixes and historical heap snapshots", () => {
  const observe = createHostFunction("observe", (_call, context) => [Undefined, context]);
  const [, context] = evaluateCode(`
    const item = { value: 0 };
    observe(item);
    if (Math.random() < 0.5) { item.value = 1; observe(item); }
    else { item.value = 2; observe(item); }
    observe(item);
  `, setVariablesInScope(nodeInitialExecutionContext, { observe }));
  const events = effectPaths(context.value.effects)[0].events;
  const graph = encodeGraph({ context, history: context.value.effects,
    before: events[0].heap, after: events[events.length - 1].heap });
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const state = fields(byId.get(reference(graph.roots.context))!);
  expect(state.effects).toEqual(graph.roots.history);
  expect(graph.roots.before).not.toEqual(graph.roots.after);
  expect(state.heap).toEqual(graph.roots.after);
  const lastTrace = fields(byId.get(reference(graph.roots.history))!);
  const lastEvent = fields(byId.get(reference(lastTrace.event))!);
  expect(lastEvent.heap).toEqual(graph.roots.after);
  const callTrace = fields(byId.get(reference(lastTrace.previous))!);
  const callEvent = fields(byId.get(reference(callTrace.event))!);
  expect(lastEvent.call).toEqual(callEvent.call);
  const choice = fields(byId.get(reference(callTrace.previous))!);
  expect(choice.kind).toBe("choice");
  const sharedPrefix = (branch: EncodedValue) => {
    const returned = fields(byId.get(reference(branch))!);
    const called = fields(byId.get(reference(returned.previous))!);
    return called.previous;
  };
  expect(sharedPrefix(choice.consequent)).toEqual(sharedPrefix(choice.alternate));
});
