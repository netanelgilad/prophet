import { spawnSync } from "child_process";
import { createCommonJSLoader, createConsoleModel, evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { effectPaths } from "../src/effects";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { ESObject, isESObject } from "../src/Object";
import { ESString, TESString } from "../src/string/String";
import { resolveBoolean } from "../src/symbolic";
import { Any, isThrownValue, TESBoolean, Undefined } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

function run(source: string, inputs: { [name: string]: Any } = {}) {
  const model = createConsoleModel();
  const initial = setVariablesInScope(nodeInitialExecutionContext, { console: model.module, ...inputs });
  const [completion, context] = evaluateCode(source, initial);
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  return { model, initial, context };
}

// Native output is captured from a child process's actual stdout. It never
// replaces console.log or its stream.write implementation with a test stub.
function native(source: string): { stdout: string; observation: boolean | string | number } {
  assertPinnedNode();
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ["--no-global-search-paths", "-e", `${source}\nprocess.stderr.write(JSON.stringify(observation));`],
    { encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
  return { stdout: child.stdout, observation: JSON.parse(child.stderr) };
}

test("console.log records successful stdout writes in order, appends newlines, and returns undefined", () => {
  const source = `
    const first = console.log("ready");
    const second = console.log();
    const third = console.log("literal %s %d %%\\nsecond line");
    const observation = first === undefined && second === undefined && third === undefined;
  `;
  const concrete = native(source);
  expect(concrete).toEqual({ stdout: "ready\n\nliteral %s %d %%\nsecond line\n", observation: true });
  const { model, initial, context } = run(source);
  expect(context.value.scope.observation).toMatchObject({ value: concrete.observation });
  const output = model.inspectOutput(context);
  expect(output).toHaveLength(1);
  expect(output[0].chunks.map(chunk => chunk.value)).toEqual(["ready\n", "\n", "literal %s %d %%\nsecond line\n"]);
  expect(output[0].chunks.map(chunk => chunk.value).join("")).toBe(concrete.stdout);
  expect(model.inspectOutput(initial)[0].chunks).toEqual([]);
  const events = effectPaths(context.value.effects!)[0].events;
  expect(events.map(event => event.call.operation + ":" + event.kind)).toEqual([
    "console.log:call", "console.stdout.write:call", "console.stdout.write:return", "console.log:return",
    "console.log:call", "console.stdout.write:call", "console.stdout.write:return", "console.log:return",
    "console.log:call", "console.stdout.write:call", "console.stdout.write:return", "console.log:return"
  ]);
  expect(events.filter(event => event.kind === "return" && event.call.operation === "console.log")
    .every(event => event.kind === "return" && event.value === Undefined)).toBe(true);
});

test("detached log and Function.prototype.call preserve Node's bound console receiver", () => {
  const source = `
    const log = console.log;
    const first = log("detached");
    const second = log.call(null, "null receiver");
    const third = log.call({ log: 1 }, "object receiver");
    const observation = first === undefined && second === undefined && third === undefined;
  `;
  const concrete = native(source);
  const { model, context } = run(source);
  expect(concrete).toEqual({ stdout: "detached\nnull receiver\nobject receiver\n", observation: true });
  expect(context.value.scope.observation).toMatchObject({ value: true });
  expect(model.inspectOutput(context)[0].chunks.map(chunk => chunk.value).join("")).toBe(concrete.stdout);
});

test("single-string logging does not invoke user changes to String conversion or concatenation methods", () => {
  const source = `
    String.prototype.toString = function() { throw "must not convert"; };
    String.prototype.valueOf = function() { throw "must not convert"; };
    String.prototype.concat = function() { throw "must not concatenate by method"; };
    const observation = console.log("single string") === undefined;
  `;
  const concrete = native(source);
  const { model, context } = run(source);
  expect(concrete).toEqual({ stdout: "single string\n", observation: true });
  expect(model.inspectOutput(context)[0].chunks[0]).toMatchObject({ value: concrete.stdout });
});

test("stdout encodes UTF-16 strings as UTF-8, replacing lone surrogates and preserving valid pairs", () => {
  const source = 'const observation = console.log("\\ud800\\udc00\\ud800x\\udc00") === undefined;';
  const concrete = native(source);
  expect(concrete).toEqual({ stdout: "𐀀�x�\n", observation: true });
  const { model, context } = run(source);
  expect(model.inspectOutput(context)[0].chunks[0]).toMatchObject({ value: concrete.stdout });
});

test("a thrown argument expression retains earlier output and never enters the outer log", () => {
  const source = `
    function message() { console.log("argument effect"); throw "stop"; }
    let caught = false;
    try { console.log(message()); } catch (error) { caught = error === "stop"; }
    console.log("after catch");
    const observation = caught;
  `;
  const concrete = native(source);
  const { model, context } = run(source);
  expect(concrete).toEqual({ stdout: "argument effect\nafter catch\n", observation: true });
  expect(context.value.scope.observation).toMatchObject({ value: true });
  expect(model.inspectOutput(context)[0].chunks.map(chunk => chunk.value).join("")).toBe(concrete.stdout);
  expect(effectPaths(context.value.effects!)[0].events.filter(event =>
    event.kind === "call" && event.call.operation === "console.log")).toHaveLength(2);
});

test("conditional output remains absent on its other path and keeps ordering with later writes", () => {
  const selected = ESBoolean();
  const { model, initial, context } = run(`
    console.log("start");
    if (selected) console.log("selected");
    console.log("end");
  `, { selected });
  const paths = model.inspectOutput(context);
  expect(paths).toHaveLength(2);
  for (const path of paths) {
    const chosen = resolveBoolean(selected, path.knowledge);
    expect(chosen).not.toBeUndefined();
    expect(path.chunks.map(chunk => chunk.value)).toEqual(chosen ?
      ["start\n", "selected\n", "end\n"] : ["start\n", "end\n"]);
  }
  expect(model.inspectOutput(initial)[0].chunks).toEqual([]);
});

test("Math.random branching retains alternative output histories and one shared trailing write", () => {
  // No symbolic input is injected: the existing Math.random model supplies a
  // fresh unknown in [0, 1). Console still has its declared healthy-stdout
  // boundary. This is the VM regression for the first CLI example, not a CLI.
  const { context } = run(`
    if (Math.random() < 0.5) {
      console.log("left");
    } else {
      console.log("right");
    }
    console.log("done");
  `);

  // Inspect the actual graph before deriving path views. The final log is a
  // shared continuation after a choice, not concatenated alternative output.
  let trace = context.value.effects!;
  while (trace.kind === "event") trace = trace.previous;
  expect(trace.kind).toBe("choice");
  if (trace.kind !== "choice") throw new Error("Expected conditional output history");
  const condition = trace.condition;
  expect(resolveBoolean(condition, context.value.knowledge)).toBeUndefined();

  const paths = effectPaths(context.value.effects!, context.value.knowledge);
  expect(paths).toHaveLength(2);
  const writes = paths.map(path => path.events.filter(event =>
    event.kind === "return" && event.call.operation === "console.stdout.write"));
  paths.forEach((path, index) => {
    const chosen = resolveBoolean(condition, path.knowledge);
    expect(chosen).not.toBeUndefined();
    expect(writes[index].map(event => (event.call.args[0] as TESString).value))
      .toEqual([chosen ? "left\n" : "right\n", "done\n"]);
  });
  // Both path views refer to the same trailing output event in the graph.
  expect(writes[0][1]).toBe(writes[1][1]);
});

test("two fresh random draws keep four output alternatives rather than correlating independent choices", () => {
  const { model, context } = run(`
    const first = Math.random() < 0.5;
    const second = Math.random() < 0.5;
    if (first) console.log("left"); else console.log("right");
    if (second) console.log("up"); else console.log("down");
    console.log("done");
  `);
  const first = context.value.scope.first as TESBoolean;
  const second = context.value.scope.second as TESBoolean;
  expect(resolveBoolean(first, context.value.knowledge)).toBeUndefined();
  expect(resolveBoolean(second, context.value.knowledge)).toBeUndefined();
  const paths = model.inspectOutput(context);
  expect(paths).toHaveLength(4);
  const decisions = new Set<string>();
  for (const path of paths) {
    const left = resolveBoolean(first, path.knowledge);
    const up = resolveBoolean(second, path.knowledge);
    expect(left).not.toBeUndefined();
    expect(up).not.toBeUndefined();
    decisions.add(`${left}:${up}`);
    expect(path.chunks.map(chunk => chunk.value)).toEqual([
      left ? "left\n" : "right\n", up ? "up\n" : "down\n", "done\n"
    ]);
  }
  expect(decisions).toEqual(new Set(["false:false", "false:true", "true:false", "true:true"]));
});

test("finite string choices keep their path conditions through stdout encoding", () => {
  const selected = ESBoolean();
  const { model, context } = run('console.log(selected ? "accepted" : "\\ud800");', { selected });
  const paths = model.inspectOutput(context);
  expect(paths).toHaveLength(2);
  for (const path of paths) {
    const chosen = resolveBoolean(selected, path.knowledge);
    expect(chosen).not.toBeUndefined();
    expect(path.chunks).toHaveLength(1);
    expect(path.chunks[0]).toMatchObject({ value: chosen ? "accepted\n" : "�\n" });
  }
});

test("a shared template and a console effect preserve a symbolic function's port choice", () => {
  const source = `
    function announce(port) { console.log(\`port=\${port}\`); return port > 0; }
    const port = selected ? 8080 : 3000;
    const observation = announce(port);
    const uncertain = port === 8080;
  `;
  for (const selected of [false, true]) {
    expect(native(`const selected = ${selected};\n${source}`)).toEqual({
      stdout: `port=${selected ? 8080 : 3000}\n`, observation: true
    });
  }
  const selected = ESBoolean();
  const { model, context } = run(source, { selected });
  expect(context.value.scope.observation).toMatchObject({ value: true });
  expect(context.value.scope.uncertain).toMatchObject({ value: undefined });
  const paths = model.inspectOutput(context);
  expect(paths).toHaveLength(2);
  for (const path of paths) {
    const chosen = resolveBoolean(selected, path.knowledge);
    expect(chosen).not.toBeUndefined();
    expect(path.chunks).toMatchObject([{ value: `port=${chosen ? 8080 : 3000}\n` }]);
  }
});

test("unknown strings produce unknown encoded output, without pretending encoding preserves the input", () => {
  const message = ESString();
  const { model, context } = run("const observation = console.log(message) === undefined;", { message });
  expect(context.value.scope.observation).toMatchObject({ value: true });
  const paths = model.inspectOutput(context);
  expect(paths).toHaveLength(1);
  expect(paths[0].chunks).toHaveLength(1);
  expect(paths[0].chunks[0]).toMatchObject({ type: "string", value: undefined });
  expect(paths[0].chunks[0]).not.toBe(message);
  const call = effectPaths(context.value.effects!)[0].events[0];
  expect(call.call.args[0]).toBe(message);
});

test("console environments share the trace without claiming each other's stdout writes", () => {
  const first = createConsoleModel();
  const second = createConsoleModel();
  const [completion, context] = evaluateCode('first.log("one"); second.log("two"); first.log("three");',
    setVariablesInScope(nodeInitialExecutionContext, { first: first.module, second: second.module }));
  expect(isThrownValue(completion)).toBe(false);
  expect(first.inspectOutput(context)[0].chunks.map(chunk => chunk.value)).toEqual(["one\n", "three\n"]);
  expect(second.inspectOutput(context)[0].chunks.map(chunk => chunk.value)).toEqual(["two\n"]);
});

test("the global and node:console import share a host identity when supplied from the same model", () => {
  const source = `
    const imported = require("node:console");
    const observation = imported === console && imported.log("module output") === undefined;
    module.exports = { observation: observation };
  `;
  const concrete = native(source);
  expect(concrete).toEqual({ stdout: "module output\n", observation: true });
  const model = createConsoleModel();
  const filename = "/app/console.cjs";
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, console: model.module }, "unmodeled") });
  const [loaded, context] = createCommonJSLoader({ [filename]: source },
    { builtins: { console: model.module } }).load(filename, initial);
  expect(isThrownValue(loaded)).toBe(false);
  if (!isESObject(loaded)) throw new Error("Expected module exports");
  expect(getProperties(loaded, context).observation).toMatchObject({ value: true });
  expect(model.inspectOutput(context)[0].chunks[0]).toMatchObject({ value: concrete.stdout });
});

test("log metadata and nonconstructibility match the bound native function", () => {
  const source = `
    let rejected = false;
    try { new console.log("must not write"); } catch (error) { rejected = error.name === "TypeError"; }
    const observation = console.log.name === "log" && console.log.length === 0 && rejected;
  `;
  const concrete = native(source);
  const { model, context } = run(source);
  expect(concrete).toEqual({ stdout: "", observation: true });
  expect(context.value.scope.observation).toMatchObject({ value: true });
  expect(model.inspectOutput(context)[0].chunks).toEqual([]);
});

test("borrowed object formatting cannot invent a tag for a partial console host model", () => {
  const source = 'const observation = Object.prototype.toString.call(console);';
  expect(native(source)).toEqual({ stdout: "", observation: "[object console]" });
  expect(() => run(source)).toThrow("Unmodeled host Symbol.toStringTag read: Node console API");

  const logSource = 'const observation = Object.prototype.toString.call(console.log);';
  expect(native(logSource)).toEqual({ stdout: "", observation: "[object Function]" });
  expect(() => run(logSource)).toThrow("Unmodeled host Symbol.toStringTag read: Node console.log function API");
});

test("a conditional receiver cannot bypass partial-host reflection guards", () => {
  const source = 'const observation = Object.prototype.toString.call(selected ? {} : console);';
  expect(() => run(source, { selected: ESBoolean() }))
    .toThrow("Unmodeled host Symbol.toStringTag read: Node console API");
  const ordinary = run(source, { selected: ESBoolean(true) });
  expect(ordinary.context.value.scope.observation).toMatchObject({ value: "[object Object]" });

  const opaque = Object.assign(ESObject(), { unknownProperties: "A partially modeled host API" });
  expect(() => run('Object.prototype.toString.call(opaque);', { opaque }))
    .toThrow("Unmodeled host Symbol.toStringTag read: A partially modeled host API");
});

test("ordinary object formatting still reports modeled receiver tags", () => {
  const source = `
    const format = Object.prototype.toString;
    const observation = format.call({}) === "[object Object]"
      && format.call([]) === "[object Array]" && format.call(function() {}) === "[object Function]"
      && format.call("text") === "[object String]" && format.call(3) === "[object Number]"
      && format.call(false) === "[object Boolean]" && format.call(null) === "[object Null]"
      && format.call(undefined) === "[object Undefined]" && format.call(new Error()) === "[object Error]";
  `;
  expect(native(source)).toEqual({ stdout: "", observation: true });
  expect(run(source).context.value.scope.observation).toMatchObject({ value: true });
});

test("inherited partial-host tags remain unsupported through ordinary construction and prototype choices", () => {
  for (const prototype of ["console", "selected ? {} : console"]) {
    const source = `
      function Factory() {}
      Factory.prototype = ${prototype};
      const observation = Object.prototype.toString.call(new Factory());
    `;
    expect(native(`const selected = false;\n${source}`))
      .toEqual({ stdout: "", observation: "[object console]" });
    expect(() => run(source, { selected: ESBoolean() }))
      .toThrow("Unmodeled host Symbol.toStringTag read: Node console API");
    if (prototype !== "console") {
      expect(run(source, { selected: ESBoolean(true) }).context.value.scope.observation)
        .toMatchObject({ value: "[object Object]" });
    }
  }
});

for (const source of [
  'console.log(1);', 'console.log(undefined);', 'console.log(null);',
  'console.log({ message: "object inspection" });', 'console.log("%s", "formatting");',
  'console.warn("stderr");', 'console.group();', 'new console.Console({});',
  'console._stdout;', 'console._stdout = {};',
  'console.log.name = "replacement";', 'console.log.length = 1;',
  'console.log.caller;', 'console.log.arguments;',
  'Object.prototype.hasOwnProperty.call(console.log, "prototype");',
  'console.log = function() {};'
]) {
  test(`unmodeled console forms remain explicit analysis gaps: ${source}`, () => {
    const model = createConsoleModel();
    const initial = setVariablesInScope(nodeInitialExecutionContext, { console: model.module });
    expect(() => evaluateCode(source, initial)).toThrow(/[Cc]onsole|Unmodeled (?:host )?property/);
  });
}
