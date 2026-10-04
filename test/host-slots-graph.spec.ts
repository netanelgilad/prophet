import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { encodeGraph, EncodedGraph, EncodedValue, GraphNode } from "../src/cli/graph";
import { setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { createEventEmitterModel } from "../src/node/events";
import { ESObject, TESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { choiceOf, resolveBoolean } from "../src/symbolic";
import { isThrownValue, Undefined } from "../src/types";

function node(graph: EncodedGraph, value: EncodedValue): GraphNode {
  if (value === null || typeof value !== "object" || !("ref" in value)) throw new Error("Expected graph reference");
  const found = graph.nodes.find(entry => entry.id === value.ref);
  if (!found) throw new Error("Missing referenced graph node");
  return found;
}

function fields(graph: EncodedGraph, value: EncodedValue): { [name: string]: EncodedValue } {
  const record = node(graph, value);
  if (record.kind !== "record" && record.kind !== "execution-context") throw new Error("Expected graph record");
  const result: { [name: string]: EncodedValue } = Object.create(null);
  record.entries.forEach(([name, entry]) => { result[name] = entry; });
  return result;
}

function properties(graph: EncodedGraph, context: EncodedValue, target: EncodedValue) {
  const heap = node(graph, fields(graph, context).heap);
  if (heap.kind !== "map") throw new Error("Expected heap map");
  const entry = heap.entries.find(([key]) => JSON.stringify(key) === JSON.stringify(target));
  return fields(graph, entry ? fields(graph, entry[1]).properties : fields(graph, target).properties);
}

function execute(source: string, context: TExecutionContext) {
  const [completion, after] = evaluateCode(source, context);
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  return after;
}

test("host slot graph links an emitter to its persistent listeners and their lexical definitions", () => {
  const model = createEventEmitterModel();
  const emitter = ESObject();
  const otherState = ESObject();
  emitter.hostSlots = Object.freeze({ "host.other": otherState });
  const before = model.attach(emitter, setVariablesInScope(nodeInitialExecutionContext, { emitter }));
  const after = execute(`
    let message = "before";
    function listener() { return message; }
    emitter.on("ready", listener);
    message = "after";
  `, before);
  expect(emitter.hostSlots).toBeDefined();
  const state = emitter.hostSlots!["node.events"] as TESObject;
  expect(emitter.hostSlots!["host.other"]).toBe(otherState);
  expect(Object.isFrozen(emitter.hostSlots)).toBe(true);
  expect(getProperties(state, before)["event:ready"]).toBeUndefined();
  expect(state.properties).toEqual({});

  const graph: EncodedGraph = JSON.parse(JSON.stringify(encodeGraph({
    emitter, before, after, listener: after.value.scope.listener
  })));
  const slot = fields(graph, fields(graph, graph.roots.emitter).hostSlots)["node.events"];
  expect(properties(graph, graph.roots.before, slot)["event:ready"]).toBeUndefined();
  const listeners = properties(graph, graph.roots.after, slot)["event:ready"];
  const entry = fields(graph, fields(graph, listeners).properties)["0"];
  expect(fields(graph, fields(graph, entry).properties).listener).toEqual(graph.roots.listener);
  const definition = node(graph, graph.roots.listener).definition;
  expect(definition).toBeDefined();
  const environment = fields(graph, definition!).environment;
  const environments = node(graph, fields(graph, graph.roots.after).environments);
  if (environments.kind !== "map") throw new Error("Expected lexical environment map");
  expect(environments.entries.some(([key]) => JSON.stringify(key) === JSON.stringify(environment))).toBe(true);
});

test("host slot metadata is separate from equally named guest properties", () => {
  const model = createEventEmitterModel();
  const emitter = ESObject({ hostSlots: ESString("guest") });
  const before = model.attach(emitter, setVariablesInScope(nodeInitialExecutionContext, { emitter }));
  const slots = emitter.hostSlots;
  expect(slots).toBeDefined();
  const after = execute(`
    const observed = emitter.hostSlots;
    emitter.hostSlots = "changed";
  `, before);
  expect(after.value.scope.observed).toMatchObject({ type: "string", value: "guest" });
  expect(getProperties(emitter, after).hostSlots).toMatchObject({ type: "string", value: "changed" });
  expect(getProperties(emitter, before).hostSlots).toMatchObject({ type: "string", value: "guest" });
  expect(emitter.hostSlots).toBe(slots);
  expect(Object.prototype.hasOwnProperty.call(getProperties(emitter, after), "node.events")).toBe(false);

  const plain = ESObject();
  const plainContext = model.attach(plain, setVariablesInScope(nodeInitialExecutionContext, { plain }));
  expect(getProperties(plain, plainContext).hostSlots).toBeUndefined();
  expect(() => evaluateCode("plain.hostSlots;", plainContext)).toThrow(/Unmodeled host property/);
});

test("conditional listener registration retains its guard through JSON without changing earlier state", () => {
  const model = createEventEmitterModel();
  const emitter = ESObject();
  const selected = ESBoolean();
  const before = model.attach(emitter, setVariablesInScope(nodeInitialExecutionContext, { emitter, selected }));
  const after = execute(`
    function listener() {}
    if (selected) emitter.on("ready", listener);
    const correct = emitter.listenerCount("ready") === (selected ? 1 : 0);
  `, before);
  expect(after.value.scope.correct).toMatchObject({ type: "boolean", value: true });
  expect(resolveBoolean(selected, after.value.knowledge)).toBeUndefined();
  expect(emitter.hostSlots).toBeDefined();
  const state = emitter.hostSlots!["node.events"] as TESObject;
  const pending = getProperties(state, after)["event:ready"];
  const choice = choiceOf(pending)!;
  expect(choice).toBeDefined();
  expect(choice.condition).toBe(selected);
  expect(choice.alternate).toBe(Undefined);
  expect(getProperties(state, before)["event:ready"]).toBeUndefined();

  const graph: EncodedGraph = JSON.parse(JSON.stringify(encodeGraph({ emitter, before, after, selected })));
  const slot = fields(graph, fields(graph, graph.roots.emitter).hostSlots)["node.events"];
  const registered = properties(graph, graph.roots.after, slot)["event:ready"];
  const expression = fields(graph, fields(graph, registered).expression);
  expect(expression.condition).toEqual(graph.roots.selected);
  expect(fields(graph, expression.alternate).type).toBe("undefined");
  expect(properties(graph, graph.roots.before, slot)["event:ready"]).toBeUndefined();
});

test("published identity metadata neither initializes an earlier context nor authorizes another emitter model", () => {
  const model = createEventEmitterModel();
  const emitter = ESObject();
  const before = setVariablesInScope(nodeInitialExecutionContext, { emitter });
  const attached = model.attach(emitter, before);
  expect(emitter.hostSlots).toBeDefined();
  const state = emitter.hostSlots!["node.events"] as TESObject;
  expect(getProperties(state, before).initialized).toBeUndefined();
  expect(getProperties(state, attached).initialized).toMatchObject({ type: "boolean", value: true });
  expect(() => model.emit(emitter, "ready", [], before)).toThrow(/initialized emitter/);
  expect(() => createEventEmitterModel().emit(emitter, "ready", [], attached)).toThrow(/initialized emitter/);
  expect(model.emit(emitter, "ready", [], attached)[0]).toMatchObject({ type: "boolean", value: false });
});

test("another emitter model cannot replace an existing host-state association", () => {
  const model = createEventEmitterModel();
  const emitter = ESObject();
  const attached = model.attach(emitter, nodeInitialExecutionContext);
  const slots = emitter.hostSlots;
  expect(() => createEventEmitterModel().attach(emitter, attached)).toThrow(/reinitializing an EventEmitter/);
  expect(emitter.hostSlots).toBe(slots);
  expect(model.emit(emitter, "ready", [], attached)[0]).toMatchObject({ type: "boolean", value: false });
});
