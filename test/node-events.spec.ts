import { createCommonJSLoader, evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ExecutionContext, setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { createEventEmitterModel } from "../src/node/events";
import { ESObject, isESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { resolveBoolean } from "../src/symbolic";
import { Any, isESBoolean, isThrownValue } from "../src/types";
import { assertPinnedNode, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

function load(source: string, inputs: { [name: string]: Any } = {}) {
  const model = createEventEmitterModel();
  const filename = "/app/events.cjs";
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...inputs }) });
  const [value, context] = createCommonJSLoader({ [filename]: source },
    { builtins: { events: model.module } }).load(filename, initial);
  expect(isThrownValue(value)).toBe(false);
  expect(isForkedCompletion(value)).toBe(false);
  return { value, context };
}

// The same complete module is loaded by the actual pinned Node release and by
// Prophet. No listener or EventEmitter implementation is substituted in Node.
function compare(source: string) {
  withModuleFixture(source, filename => {
    expect(nodeModuleObservation(filename)).toEqual({
      kind: "return", value: { type: "boolean", value: true }
    });
  });
  expect(load(source).value).toMatchObject({ type: "boolean", value: true });
}

function symbolic(source: string, inputs: { [name: string]: Any } = { selected: ESBoolean() }) {
  const { value, context } = load(source, inputs);
  if (!isESObject(value)) throw new Error("Expected object exports");
  const values = getProperties(value, context);
  for (const name of Object.keys(values)) {
    const proof = values[name];
    if (!isESBoolean(proof)) throw new Error(`Expected boolean observation ${name}`);
    expect(resolveBoolean(proof, context.value.knowledge)).toBe(name === "uncertain" ? undefined : true);
  }
  return context;
}

function observe(value: Any, source: string, context: TExecutionContext) {
  const [completion, observed] = evaluateCode(`var observation = (${source});`,
    setVariablesInScope(context, { loaded: value }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  return { value: observed.value.scope.observation, context: observed };
}

test("Node EventEmitter aliases, method aliases, and chainable return values agree", () => {
  compare(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    function listener() {}
    const added = emitter.on("event", listener);
    const removed = emitter.off("event", listener);
    const once = emitter.once("event", listener);
    module.exports = EventEmitter === require("events") && EventEmitter === EventEmitter.EventEmitter &&
      emitter.on === emitter.addListener && emitter.off === emitter.removeListener &&
      added === emitter && removed === emitter && once === emitter && emitter.listenerCount("event") === 1;
  `);
});

test("listeners run synchronously in insertion order with the emitter receiver and all arguments", () => {
  compare(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let trace = "";
    let rightReceiver = true;
    emitter.on("event", function(first, second, third) {
      rightReceiver = rightReceiver && this === emitter;
      trace = trace + first + second + third;
      return "ignored";
    });
    emitter.addListener("event", function() { trace = trace + ":second"; });
    const emitted = emitter.emit("event", "one", ":two", ":three");
    trace = trace + ":after";
    module.exports = emitted === true && rightReceiver && trace === "one:two:three:second:after";
  `);
});

test("an event with no listeners returns false and each emitter has independent registrations", () => {
  compare(`
    const EventEmitter = require("node:events");
    const first = new EventEmitter();
    const second = new EventEmitter();
    let calls = 0;
    first.on("event", function() { calls = calls + 1; });
    const missing = second.emit("event");
    const found = first.emit("event");
    module.exports = missing === false && found === true && calls === 1 &&
      first.listenerCount("event") === 1 && second.listenerCount("event") === 0;
  `);
});

test("event names are data even when named like JavaScript object properties", () => {
  compare(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let calls = 0;
    emitter.on("__proto__", function() { calls = calls + 1; });
    emitter.on("constructor", function() { calls = calls + 10; });
    emitter.emit("__proto__");
    emitter.emit("constructor");
    module.exports = calls === 11 && emitter.listenerCount("toString") === 0;
  `);
});

test("duplicate listeners run repeatedly and removal deletes only the latest matching registration", () => {
  compare(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let trace = "";
    function first() { trace = trace + "a"; }
    function second() { trace = trace + "b"; }
    emitter.on("event", first);
    emitter.on("event", second);
    emitter.on("event", first);
    emitter.emit("event");
    emitter.removeListener("event", first);
    emitter.emit("event");
    module.exports = trace === "abaab" && emitter.listenerCount("event") === 2;
  `);
});

test("removing an absent listener changes no registration", () => {
  compare(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    function absent() {}
    const returned = emitter.removeListener("missing", absent);
    emitter.on("event", function() {});
    emitter.removeListener("event", absent);
    module.exports = returned === emitter && emitter.listenerCount("event") === 1;
  `);
});

test("removal during emission affects the next emission but leaves the current listener snapshot intact", () => {
  compare(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let trace = "";
    function second() { trace = trace + "b"; }
    emitter.on("event", function() { trace = trace + "a"; emitter.off("event", second); });
    emitter.on("event", second);
    emitter.emit("event");
    emitter.emit("event");
    module.exports = trace === "aba" && emitter.listenerCount("event") === 1;
  `);
});

test("registration during emission starts on the next emission", () => {
  compare(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let trace = "";
    function later() { trace = trace + "b"; }
    emitter.on("event", function() { trace = trace + "a"; emitter.on("event", later); });
    emitter.emit("event");
    emitter.emit("event");
    module.exports = trace === "aab" && emitter.listenerCount("event") === 3;
  `);
});

test("once removes itself before invoking the listener and ignores its return value", () => {
  compare(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let calls = 0;
    let removedBeforeCall = false;
    let correct = false;
    emitter.once("event", function(value) {
      calls = calls + 1;
      removedBeforeCall = emitter.listenerCount("event") === 0;
      correct = this === emitter && value === 17;
      return false;
    });
    const first = emitter.emit("event", 17);
    const second = emitter.emit("event", 19);
    module.exports = calls === 1 && removedBeforeCall && correct && first === true && second === false;
  `);
});

test("a once listener cannot invoke itself again by recursively emitting", () => {
  compare(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let trace = "";
    emitter.once("event", function() { trace = trace + "a"; emitter.emit("event"); });
    emitter.on("event", function() { trace = trace + "b"; });
    emitter.emit("event");
    module.exports = trace === "abb" && emitter.listenerCount("event") === 1;
  `);
});

test("a once wrapper present in two nested snapshots still runs only once", () => {
  compare(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let trace = "";
    let nested = false;
    emitter.on("event", function() {
      trace = trace + "a";
      if (!nested) { nested = true; emitter.emit("event"); }
    });
    emitter.once("event", function() { trace = trace + "b"; });
    emitter.emit("event");
    module.exports = trace === "aab" && emitter.listenerCount("event") === 1;
  `);
});

test("removeListener recognizes the original function supplied to once", () => {
  compare(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let calls = 0;
    function listener() { calls = calls + 1; }
    emitter.on("event", listener);
    emitter.once("event", listener);
    emitter.removeListener("event", listener);
    emitter.emit("event");
    emitter.emit("event");
    module.exports = calls === 2 && emitter.listenerCount("event") === 1;
  `);
});

test("removeListener also recognizes a normal callback's current listener property", () => {
  compare(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let calls = 0;
    function original() {}
    function replacement() {}
    function wrapper() { calls = calls + 1; }
    wrapper.listener = original;
    emitter.on("event", wrapper);
    wrapper.listener = replacement;
    emitter.removeListener("event", original);
    emitter.emit("event");
    emitter.removeListener("event", replacement);
    module.exports = calls === 1 && emitter.emit("event") === false;
  `);
});

test("removeListener follows normal prototype lookup for a callback's listener alias", () => {
  compare(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    function original() {}
    function wrapper() {}
    Function.prototype.listener = original;
    emitter.on("event", wrapper);
    emitter.removeListener("event", original);
    module.exports = emitter.emit("event") === false;
  `);
});

test("a single ordinary listener's custom apply behavior remains an explicit compatibility gap", () => {
  const source = `
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let trace = "";
    function listener() { trace = "listener"; }
    listener.apply = function(receiver, args) {
      trace = receiver === emitter && args[0] === 7 ? "override" : "wrong arguments";
      return false;
    };
    emitter.on("event", listener);
    module.exports = emitter.emit("event", 7) === true && trace === "override";
  `;
  withModuleFixture(source, filename => {
    expect(nodeModuleObservation(filename)).toEqual({
      kind: "return", value: { type: "boolean", value: true }
    });
  });
  expect(() => load(source)).toThrow(/not yet supported|not supported/);
});

test("a single once wrapper observes an overridden Function.prototype.apply and reports that analysis gap", () => {
  const source = `
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    const originalApply = Function.prototype.apply;
    let trace = "";
    emitter.once("event", function() { trace = "listener"; });
    Function.prototype.apply = function(receiver, args) {
      trace = receiver === emitter && args[0] === 7 ? "override" : "wrong arguments";
    };
    const emitted = emitter.emit("event", 7);
    Function.prototype.apply = originalApply;
    module.exports = emitted === true && trace === "override" && emitter.listenerCount("event") === 1;
  `;
  withModuleFixture(source, filename => {
    expect(nodeModuleObservation(filename)).toEqual({
      kind: "return", value: { type: "boolean", value: true }
    });
  });
  expect(() => load(source)).toThrow(/not yet supported|not supported/);
});

test("multiple ordinary listeners use direct invocation even when a callback has its own apply override", () => {
  compare(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let trace = "";
    function first(value) { trace = trace + (this === emitter && value === 7 ? "a" : "wrong arguments"); }
    first.apply = function() { trace = "override"; };
    emitter.on("event", first);
    emitter.on("event", function() { trace = trace + "b"; });
    module.exports = emitter.emit("event", 7) === true && trace === "ab";
  `);
});

test("a single once listener ignores an apply override on its original callback", () => {
  compare(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let trace = "";
    function listener(value) { trace = this === emitter && value === 7 ? "listener" : "wrong arguments"; }
    listener.apply = function() { trace = "override"; };
    emitter.once("event", listener);
    module.exports = emitter.emit("event", 7) === true && trace === "listener" &&
      emitter.listenerCount("event") === 0;
  `);
});

test("throwing listeners stop dispatch and preserve their earlier writes and once removal", () => {
  compare(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let trace = "";
    let caught = false;
    emitter.once("event", function() { trace = trace + "a"; throw "listener failure"; });
    emitter.on("event", function() { trace = trace + "b"; });
    try { emitter.emit("event"); } catch (error) { caught = error === "listener failure"; }
    const afterThrow = trace;
    emitter.emit("event");
    module.exports = caught && afterThrow === "a" && trace === "ab" && emitter.listenerCount("event") === 1;
  `);
});

test("an unhandled error event throws the supplied Error object by identity", () => {
  compare(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    const problem = new Error("problem");
    let caught = false;
    try { emitter.emit("error", problem); } catch (error) { caught = error === problem; }
    module.exports = caught;
  `);
});

test("an error listener receives the error normally and makes emit return true", () => {
  compare(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    const problem = new Error("problem");
    let caught = false;
    emitter.on("error", function(error) { caught = error === problem && this === emitter; });
    module.exports = emitter.emit("error", problem) === true && caught;
  `);
});

test("unhandled primitive error payloads remain a formatting gap instead of a fabricated Error", () => {
  const source = `
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let caught = false;
    try { emitter.emit("error", 17); }
    catch (error) { caught = error.name === "Error" && error.code === "ERR_UNHANDLED_ERROR" && error.context === 17; }
    module.exports = caught;
  `;
  withModuleFixture(source, filename => {
    expect(nodeModuleObservation(filename)).toEqual({
      kind: "return", value: { type: "boolean", value: true }
    });
  });
  expect(() => load(source)).toThrow(/not yet supported|not supported/);
});

for (const method of ["on", "addListener", "once", "removeListener", "off"]) {
  test(`${method} rejects a nonfunction listener with Node's catchable argument error`, () => {
    compare(`
      const EventEmitter = require("node:events");
      const emitter = new EventEmitter();
      let caught = false;
      try { emitter.${method}("event", 17); }
      catch (error) { caught = error.name === "TypeError" && error.code === "ERR_INVALID_ARG_TYPE"; }
      module.exports = caught && emitter.listenerCount("event") === 0;
    `);
  });
}

test("conditional registration preserves correlation between the condition, callback effects, and emit result", () => {
  symbolic(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let calls = 0;
    if (selected) emitter.on("event", function() { calls = calls + 1; });
    const emitted = emitter.emit("event");
    module.exports = {
      countCorrect: selected ? calls === 1 : calls === 0,
      resultCorrect: selected ? emitted === true : emitted === false,
      listenersCorrect: selected ? emitter.listenerCount("event") === 1 : emitter.listenerCount("event") === 0,
      uncertain: calls === 1
    };
  `);
});

test("conditional removal preserves the unremoved branch", () => {
  symbolic(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let calls = 0;
    function listener() { calls = calls + 1; }
    emitter.on("event", listener);
    if (selected) emitter.off("event", listener);
    const emitted = emitter.emit("event");
    module.exports = {
      countCorrect: selected ? calls === 0 : calls === 1,
      resultCorrect: selected ? emitted === false : emitted === true,
      uncertain: calls === 1
    };
  `);
});

test("finite symbolic event names register and emit on their corresponding branches", () => {
  symbolic(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    const event = selected ? "first" : "second";
    let calls = 0;
    emitter.on(event, function() { calls = calls + 1; });
    const emitted = emitter.emit(event);
    module.exports = {
      invoked: calls === 1 && emitted === true,
      otherAbsent: emitter.emit(selected ? "second" : "first") === false,
      uncertain: emitter.listenerCount("first") === 1
    };
  `);
});

test("finite symbolic listeners retain identity for removal", () => {
  symbolic(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let calls = 0;
    function first() { calls = calls + 1; }
    function second() { calls = calls + 10; }
    const listener = selected ? first : second;
    emitter.on("event", listener);
    emitter.emit("event");
    emitter.off("event", listener);
    module.exports = {
      countCorrect: selected ? calls === 1 : calls === 10,
      removed: emitter.emit("event") === false,
      uncertain: calls === 1
    };
  `);
});

test("finite symbolic emitter receivers keep their registrations separate", () => {
  symbolic(`
    const EventEmitter = require("node:events");
    const first = new EventEmitter();
    const second = new EventEmitter();
    const emitter = selected ? first : second;
    let calls = 0;
    emitter.on("event", function() { calls = calls + 1; });
    const emitted = emitter.emit("event");
    module.exports = {
      called: emitted === true && calls === 1,
      otherEmpty: selected ? second.emit("event") === false : first.emit("event") === false,
      uncertain: first.listenerCount("event") === 1
    };
  `);
});

test("a once listener already fired on one symbolic branch fires only on the remaining branch", () => {
  symbolic(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let calls = 0;
    emitter.once("event", function() { calls = calls + 1; });
    if (selected) emitter.emit("event");
    const second = emitter.emit("event");
    module.exports = {
      once: calls === 1 && emitter.listenerCount("event") === 0,
      resultCorrect: selected ? second === false : second === true,
      uncertain: second
    };
  `);
});

test("conditional callback throws preserve dispatch order and the caller's catch behavior", () => {
  symbolic(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let calls = 0;
    let caught = false;
    emitter.on("event", function() { calls = calls + 1; if (selected) throw "failure"; });
    emitter.on("event", function() { calls = calls + 10; });
    try { emitter.emit("event"); } catch (error) { caught = error === "failure"; }
    module.exports = {
      countCorrect: selected ? calls === 1 : calls === 11,
      caughtCorrect: selected ? caught === true : caught === false,
      uncertain: caught
    };
  `);
});

test("conditional error handling keeps both normal return and uncaught-event behavior", () => {
  symbolic(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    const problem = new Error("problem");
    let handled = false;
    let caught = false;
    if (selected) emitter.on("error", function(error) { handled = error === problem; });
    try { emitter.emit("error", problem); } catch (error) { caught = error === problem; }
    module.exports = {
      handledCorrect: selected ? handled === true : handled === false,
      caughtCorrect: selected ? caught === false : caught === true,
      uncertain: caught
    };
  `);
});

test("advancing one execution state does not mutate registrations or once state in previous snapshots", () => {
  const { value, context } = load(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    let calls = 0;
    emitter.once("event", function() { calls = calls + 1; });
    module.exports = { emitter: emitter, read: function() { return calls; } };
  `);
  const first = observe(value, 'loaded.emitter.emit("event")', context);
  expect(first.value).toMatchObject({ value: true });
  expect(observe(value, "loaded.read()", first.context).value).toMatchObject({ value: 1 });
  expect(observe(value, 'loaded.emitter.listenerCount("event")', first.context).value).toMatchObject({ value: 0 });
  expect(observe(value, "loaded.read()", context).value).toMatchObject({ value: 0 });
  expect(observe(value, 'loaded.emitter.listenerCount("event")', context).value).toMatchObject({ value: 1 });
  const second = observe(value, 'loaded.emitter.emit("event")', context);
  expect(second.value).toMatchObject({ value: true });
  expect(observe(value, "loaded.read()", second.context).value).toMatchObject({ value: 1 });
});

test("an unconstrained symbolic event name reports an analysis gap instead of dropping the event", () => {
  expect(() => load(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    emitter.on(event, function() {});
    module.exports = true;
  `, { event: ESString() })).toThrow(/not yet supported|not supported/);
});

for (const event of ["newListener", "removeListener"]) {
  test(`${event} lifecycle listeners remain an explicit compatibility gap`, () => {
    expect(() => load(`
      const EventEmitter = require("node:events");
      const emitter = new EventEmitter();
      emitter.on("${event}", function() {});
      module.exports = true;
    `)).toThrow(/not yet supported|not supported/);
  });
}

test("captureRejections options remain an explicit compatibility gap", () => {
  expect(() => load(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter({ captureRejections: true });
    module.exports = true;
  `)).toThrow(/not yet supported|not supported/);
});

test("explicit undefined construction options retain Node's default behavior", () => {
  compare(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter(undefined);
    module.exports = emitter.emit("missing") === false;
  `);
});

test("exceeding the default listener warning threshold remains an explicit external-effect gap", () => {
  expect(() => load(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    function listener() {}
    ${Array(11).fill('emitter.on("event", listener);').join("\n")}
    module.exports = true;
  `)).toThrow(/not yet supported|not supported/);
});

test("listenerCount's optional matching-listener argument remains an explicit compatibility gap", () => {
  expect(() => load(`
    const EventEmitter = require("node:events");
    const emitter = new EventEmitter();
    function listener() {}
    emitter.on("event", listener);
    module.exports = emitter.listenerCount("event", listener);
  `)).toThrow(/not yet supported|not supported/);
});
