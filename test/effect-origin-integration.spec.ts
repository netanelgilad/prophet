import { mkdtempSync, realpathSync, writeFileSync } from "fs";
import { removeSync } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { createCommonJSLoader, evaluateCommonJS, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { invoke } from "../src/ASTResolvers";
import { runFile } from "../src/cli/runtime";
import { encodeGraph } from "../src/cli/graph";
import { createHostFunction, effectPaths, HostCall } from "../src/effects";
import { ExecutionContext, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { BranchResult } from "../src/execution-context/branches";
import { getProperties } from "../src/execution-context/Heap";
import { ESObject } from "../src/Object";
import { Any, isThrownValue, Undefined, WithProperties } from "../src/types";

type Activation = { target: Any; sourceFile?: string; parent?: Activation };
type Origin = { sourceFile?: string; activation?: Activation };
function origin(call: HostCall): Origin {
  const result = (call as HostCall & { origin: Origin }).origin;
  expect(result).toBeDefined();
  return result;
}
const observe = createHostFunction("fixture.observe", (_call, context) => [Undefined, context]);
function initial(extra: { [name: string]: Any } = {}) {
  return ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, observe, ...extra }) });
}
function observations(context: TExecutionContext): HostCall[] {
  return effectPaths(context.value.effects, context.value.knowledge)[0].events
    .filter(event => event.kind === "call" && event.call.operation === "fixture.observe").map(event => event.call);
}
function named(context: TExecutionContext, name: string): HostCall {
  const found = observations(context).filter(call => (call.args[0] as { value: string }).value === name);
  expect(found).toHaveLength(1);
  return found[0];
}
function frames(frame: Activation | undefined): Activation[] {
  const result: Activation[] = [];
  while (frame) { result.push(frame); frame = frame.parent; }
  return result;
}
function leaves(result: BranchResult): BranchResult[] {
  return isForkedCompletion(result[0]) ? leaves(result[0].consequent).concat(leaves(result[0].alternate)) : [result];
}

test("nested CommonJS initialization and cached imports retain actual dynamic module ancestry", () => {
  const loader = createCommonJSLoader({
    "/app/entry.cjs": `observe('entry-before'); const dep = require('./dep.cjs');
      const cached = require('./dep.cjs'); dep.run(); observe('entry-after');
      module.exports = { run: dep.run, utility: dep.utility, cached: dep === cached };`,
    "/app/dep.cjs": `observe('dep-init'); const utility = require('./utility.cjs');
      function run() { utility(); } module.exports = { run, utility };`,
    "/app/utility.cjs": `observe('utility-init'); module.exports = function utility() { observe('utility-call'); };`
  });
  const [value, context] = loader.load("/app/entry.cjs", initial());
  expect(isThrownValue(value)).toBe(false);
  const exports = getProperties(value as WithProperties, context);
  expect(exports.cached).toMatchObject({ value: true });
  const entry = origin(named(context, "entry-before")).activation!;
  expect(origin(named(context, "entry-after")).activation).toBe(entry);
  expect(entry.parent).toBeUndefined();
  expect(origin(named(context, "dep-init")).activation!.parent).toBe(entry);
  expect(frames(origin(named(context, "utility-init")).activation).map(frame => frame.sourceFile))
    .toEqual(["/app/utility.cjs", "/app/dep.cjs", "/app/entry.cjs"]);
  const called = frames(origin(named(context, "utility-call")).activation);
  expect(called.map(frame => frame.target)).toEqual([exports.utility, exports.run, entry.target]);
  expect(called.map(frame => frame.sourceFile)).toEqual(["/app/utility.cjs", "/app/dep.cjs", "/app/entry.cjs"]);
  expect((context.value as any).activation).toBeUndefined();
});

test("escaped closures use their invocation parent rather than a completed factory or module", () => {
  const loader = createCommonJSLoader({
    "/app/creator.cjs": `module.exports = function factory() {
      observe('factory'); return function escaped() { observe('escaped'); };
    };`,
    "/app/entry.cjs": `const factory = require('./creator.cjs'); const callback = factory();
      function invokeLater() { observe('invoker'); callback(); } invokeLater();
      module.exports = { callback, invokeLater };`
  });
  const [value, context] = loader.load("/app/entry.cjs", initial());
  const exports = getProperties(value as WithProperties, context);
  const factory = origin(named(context, "factory")).activation!;
  const invoker = origin(named(context, "invoker")).activation!;
  const escaped = origin(named(context, "escaped"));
  expect(escaped.sourceFile).toBe("/app/creator.cjs");
  expect(escaped.activation!.target).toBe(exports.callback);
  expect(escaped.activation!.parent).toBe(invoker);
  expect(invoker.target).toBe(exports.invokeLater);
  expect(frames(escaped.activation)).not.toContain(factory);
  expect(Object.isFrozen(escaped.activation)).toBe(true);
});

test("aliases, call/bind adapters and constructors add only the actual interpreted target", () => {
  const [value, context] = evaluateCommonJS(`
    function target(label) { observe(label); }
    const alias = target; alias('alias'); target.call(null, 'call');
    const bound = target.bind(null, 'bound'); bound();
    function Constructor() { observe('constructor'); }
    const object = new Constructor(); module.exports = { target, bound, Constructor, object };
  `, "/app/adapters.cjs", initial());
  const exports = getProperties(value as WithProperties, context);
  const entered = ["alias", "call", "bound", "constructor"].map(name => origin(named(context, name)).activation!);
  for (const frame of entered.slice(0, 3)) expect(frame.target).toBe(exports.target);
  expect(entered[3].target).toBe(exports.Constructor);
  expect(new Set(entered).size).toBe(4);
  for (const frame of entered) {
    expect(frame.sourceFile).toBe("/app/adapters.cjs");
    expect(frame.parent).toBe(entered[0].parent);
    expect(frame.parent!.parent).toBeUndefined();
    expect(frame.target).not.toBe(exports.bound);
  }
  expect((context.value as any).activation).toBeUndefined();
});

for (const throws of [false, true]) test(`synchronous host callback preserves its host's entry origin when returning/throwing (${throws})`, () => {
  const relay = createHostFunction("fixture.relay", (call, context) => invoke(call.args[0], [], context));
  const [value, context] = evaluateCommonJS(`
    observe('before');
    function callback() { observe('callback'); ${throws ? "throw 'callback failure';" : "return 'ok';"} }
    try { relay(callback); } catch (error) { observe('caught'); }
    observe('after'); module.exports = callback;
  `, "/app/relay.cjs", initial({ relay }));
  expect(isThrownValue(value)).toBe(false);
  const before = origin(named(context, "before")), callback = origin(named(context, "callback"));
  expect(callback.activation!.target).toBe(value);
  expect(callback.activation!.parent).toBe(before.activation);
  expect(origin(named(context, "after")).activation).toBe(before.activation);
  const events = effectPaths(context.value.effects)[0].events.filter(event => event.call.operation === "fixture.relay");
  expect(events.map(event => event.kind)).toEqual(["call", throws ? "throw" : "return"]);
  expect(events[0].call).toBe(events[1].call);
  expect(origin(events[0].call).activation).toBe(before.activation);
  expect(origin(events[1].call)).toBe(origin(events[0].call));
  expect(Object.isFrozen(origin(events[0].call))).toBe(true);
  if (throws) expect(origin(named(context, "caught")).activation).toBe(before.activation);
});

test("eval and generated functions keep unknown direct source despite a known enclosing activation", () => {
  const [value, context] = evaluateCommonJS(`
    observe('before'); eval("observe('direct')"); const indirect = eval; indirect("observe('indirect')");
    const generated = Function("observe('generated')"); generated();
    const escaped = eval("(function() { observe('escaped'); })"); escaped();
    try { eval("throw 'failure'"); } catch (error) { observe('caught'); }
    observe('after'); module.exports = { generated, escaped };
  `, "/app/generated.cjs", initial());
  const exports = getProperties(value as WithProperties, context);
  const parent = origin(named(context, "before")).activation!;
  for (const label of ["direct", "indirect"]) {
    const entered = origin(named(context, label));
    expect(entered.sourceFile).toBeUndefined();
    expect(entered.activation).toBe(parent);
    expect(entered.activation!.sourceFile).toBe("/app/generated.cjs");
  }
  for (const label of ["generated", "escaped"]) {
    const entered = origin(named(context, label));
    expect(entered.sourceFile).toBeUndefined();
    expect(entered.activation!.sourceFile).toBeUndefined();
    expect(entered.activation!.target).toBe(exports[label]);
    expect(entered.activation!.parent).toBe(parent);
  }
  for (const label of ["caught", "after"]) {
    expect(origin(named(context, label)).sourceFile).toBe("/app/generated.cjs");
    expect(origin(named(context, label)).activation).toBe(parent);
  }
});

for (const maxEvents of [0, 1]) test(`actual startup-queue/HTTP callbacks do not resurrect registration ancestry (events=${maxEvents})`, () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "prophet-origin-events-")));
  try {
    writeFileSync(join(directory, "entry.cjs"), `require('./dependency.cjs').install(); console.log('entry');`);
    writeFileSync(join(directory, "dependency.cjs"), `exports.install = function install() {
      console.log('register');
      require('http').createServer(function request(req, res) { console.log('request'); res.end(); }).listen(8080, function ready() { console.log('ready'); });
    };`);
    const result = runFile({ script: "entry.cjs", args: [], runtime: "node@24.21.0", maxEvents, maxSteps: 100000 }, directory);
    expect(result.status).toBe("evaluated");
    const histories: string[][] = [];
    for (const [, context] of leaves([result.completion!, result.current])) {
      for (const path of effectPaths(context.value.effects, context.value.knowledge)) {
        const logs = path.events.filter(event => event.kind === "call" && event.call.operation === "console.log");
        histories.push(logs.map(event => (event.call.args[0] as { value: string }).value));
        for (const event of logs) {
          const label = (event.call.args[0] as { value: string }).value;
          const entered = origin(event.call);
          expect(entered.sourceFile).toBe(join(directory, label === "entry" ? "entry.cjs" : "dependency.cjs"));
          expect(entered.activation!.sourceFile).toBe(entered.sourceFile);
          if (label === "register") {
            expect(frames(entered.activation).map(frame => frame.sourceFile))
              .toEqual([join(directory, "dependency.cjs"), join(directory, "entry.cjs")]);
          } else expect(entered.activation!.parent).toBeUndefined();
        }
      }
    }
    expect(histories.some(history => history.includes("ready"))).toBe(true);
    expect(histories.some(history => history.includes("request"))).toBe(maxEvents === 1);
    expect(histories.some(history => history.includes("ready") && !history.includes("request"))).toBe(true);
    expect((result.initial.value as any).activation).toBeUndefined();
    expect((result.current.value as any).activation).toBeUndefined();
  } finally { removeSync(directory); }
});

test("graph transport shares target and parent identities across repeated interpreted activations", () => {
  const [value, context] = evaluateCommonJS(`
    function repeated(label) { observe(label); }
    repeated('first'); repeated('second'); module.exports = repeated;
  `, "/app/graph.cjs", initial());
  const first = named(context, "first"), second = named(context, "second");
  const firstFrame = origin(first).activation!, secondFrame = origin(second).activation!;
  expect(firstFrame).not.toBe(secondFrame);
  expect(firstFrame.target).toBe(value); expect(secondFrame.target).toBe(value);
  expect(firstFrame.parent).toBe(secondFrame.parent);
  const graph = encodeGraph({ first, second, target: value, current: context });
  const record = (encoded: any) => {
    const node = graph.nodes.find(item => item.id === encoded.ref)!;
    expect(node).toBeDefined();
    return new Map((node as any).entries);
  };
  const encodedFrame = (call: any) => record(record(call).get("origin")).get("activation");
  const one = encodedFrame(graph.roots.first), two = encodedFrame(graph.roots.second);
  expect(one).not.toEqual(two);
  expect(record(one).get("target")).toEqual(graph.roots.target);
  expect(record(two).get("target")).toEqual(graph.roots.target);
  expect(record(one).get("parent")).toEqual(record(two).get("parent"));
  expect(record(record(one).get("parent")).get("sourceFile")).toBe("/app/graph.cjs");
  expect(Object.keys(graph).sort()).toEqual(["nodes", "roots"]);
});
